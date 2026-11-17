import { tr } from "../shared/i18n";
import i18next from "i18next";
import type { Session } from "./auth/types";

let csrf = "";
let epoch = 0;
i18next.on("languageChanged", () => {
  epoch += 1;
});
export function setApiSession(session: Session | null) {
  const token = session?.csrf_token ?? "";
  if (token !== csrf) epoch += 1;
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

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const requestEpoch = epoch;
  const requestCsrf = csrf;
  const requestLanguage = i18next.language;
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
        "Accept-Language": requestLanguage,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
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
      message,
      response.status,
      Array.isArray(data.detail) ? data.detail : [],
    );
  }
  const result = response.status === 204 ? undefined : await response.json();
  ensureCurrent();
  if (!["GET", "HEAD", "OPTIONS"].includes(method))
    window.dispatchEvent(new Event("life-data-changed"));
  return result as T;
}
