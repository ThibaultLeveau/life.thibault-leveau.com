import type { Session } from "./auth/types";

let csrf = "";
export function setApiSession(session: Session | null) {
  csrf = session?.csrf_token ?? "";
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
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
  const requestCsrf = csrf;
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      credentials: "same-origin",
      signal,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError(
      "Connexion interrompue. Vérifiez votre réseau et réessayez.",
      0,
    );
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message =
      response.status === 503
        ? "Le service est momentanément indisponible. Réessayez dans un instant."
        : typeof data.detail === "string"
          ? data.detail
          : Array.isArray(data.detail)
            ? data.detail.map((item: { msg: string }) => item.msg).join(" · ")
            : "L’opération n’a pas pu être enregistrée.";
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
    throw new ApiError(message, response.status);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
