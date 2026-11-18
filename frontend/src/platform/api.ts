import { errorMessage, tr } from "../shared/i18n";
import i18next from "i18next";
import type { Session } from "./auth/types";

let csrf = "";
let epoch = 0;
const streams = new Set<AbortController>();
function invalidate() {
  epoch += 1;
  streams.forEach((controller) => controller.abort());
}
i18next.on("languageChanged", invalidate);
export function setApiSession(session: Session | null) {
  const token = session?.csrf_token ?? "";
  if (token !== csrf) invalidate();
  csrf = token;
}
export interface ApiFieldError {
  loc?: (string | number)[];
  msg: string;
  type?: string;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields: ApiFieldError[] = [],
  ) {
    super(message);
  }
}
async function responseFor(
  path: string,
  method: string,
  body?: unknown,
  signal?: AbortSignal,
  streaming = false,
) {
  const requestEpoch = epoch,
    requestCsrf = csrf;
  const ensureCurrent = () => {
    if (requestEpoch !== epoch || signal?.aborted)
      throw new DOMException("Obsolete response", "AbortError");
  };
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      credentials: "same-origin",
      signal,
      headers: {
        "Accept-Language": i18next.language,
        ...(streaming ? { Accept: "text/event-stream" } : {}),
        ...(body instanceof Blob
          ? { "Content-Type": body.type || "application/octet-stream" }
          : body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      body:
        body === undefined
          ? undefined
          : body instanceof Blob
            ? body
            : JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    ensureCurrent();
    throw new ApiError(
      tr("connection_interrupted_check_your_network_and_try_again"),
      0,
    );
  }
  ensureCurrent();
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    ensureCurrent();
    const message =
      response.status === 503
        ? tr("the_service_is_temporarily_unavailable_try_again_shortly")
        : typeof data.detail === "string"
          ? data.detail
          : Array.isArray(data.detail)
            ? data.detail.map((item: { msg: string }) => item.msg).join(" · ")
            : tr("the_operation_could_not_be_saved");
    if (
      response.status === 401 &&
      (path !== "/auth/session" || method === "DELETE") &&
      requestCsrf === csrf
    )
      window.dispatchEvent(new Event("life-session-expired"));
    const disabled = response.headers.get("X-Life-Application-Disabled");
    if (disabled && requestCsrf === csrf)
      window.dispatchEvent(
        new CustomEvent("life-application-disabled", { detail: disabled }),
      );
    throw new ApiError(
      errorMessage(message),
      response.status,
      Array.isArray(data.detail) ? data.detail : [],
    );
  }
  return { response, ensureCurrent };
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const { response, ensureCurrent } = await responseFor(
    path,
    method,
    body,
    signal,
  );
  const result = response.status === 204 ? undefined : await response.json();
  ensureCurrent();
  if (!["GET", "HEAD", "OPTIONS"].includes(method))
    window.dispatchEvent(new Event("life-data-changed"));
  return result as T;
}

/** Same session, CSRF and stale-response rules as JSON requests, including each streamed event. */
export async function apiStream<T>(
  path: string,
  body: unknown,
  receive: (event: T) => void,
  signal?: AbortSignal,
): Promise<void> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  streams.add(controller);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const { response, ensureCurrent } = await responseFor(
      path,
      "POST",
      body,
      controller.signal,
      true,
    );
    if (
      !response.body ||
      !response.headers.get("content-type")?.includes("text/event-stream")
    )
      throw new ApiError(tr("assistant_stream_lost"), 0);
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const dispatch = (block: string) => {
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n");
      if (!data || data === "[DONE]") return;
      ensureCurrent();
      receive(JSON.parse(data) as T);
    };
    for (;;) {
      const { value, done } = await reader.read();
      ensureCurrent();
      buffer += decoder.decode(value, { stream: !done });
      let separator: RegExpExecArray | null;
      while ((separator = /\r?\n\r?\n/.exec(buffer))) {
        dispatch(buffer.slice(0, separator.index));
        buffer = buffer.slice(separator.index + separator[0].length);
      }
      if (buffer.length > 2_000_000)
        throw new ApiError(tr("assistant_stream_lost"), 0);
      if (done) {
        if (buffer.trim()) dispatch(buffer);
        break;
      }
    }
    window.dispatchEvent(new Event("life-data-changed"));
  } finally {
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
    streams.delete(controller);
    signal?.removeEventListener("abort", abort);
  }
}
