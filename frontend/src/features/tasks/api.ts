import type { Page, Session, Task, ViewSettings } from "./types";
import { localDate } from "./types";

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
    if (response.status === 401 && path !== "/auth/session")
      window.dispatchEvent(new Event("life-session-expired"));
    throw new ApiError(message, response.status);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export async function allTasks(
  workspaceId: string,
  view: ViewSettings,
  archived = false,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    workspace_id: workspaceId,
    limit: "200",
    sort: view.sort,
    today: localDate(),
    archived: String(archived),
  });
  if (!archived) {
    params.set("search", view.search);
    params.set("due", view.due);
    if (!view.show_completed) params.set("completed", "false");
    if (view.status_id) params.set("status_id", view.status_id);
    if (view.priority) params.set("priority", String(view.priority));
    if (view.label_id) params.set("label_id", view.label_id);
  }
  const items: Task[] = [];
  let total = 0;
  do {
    params.set("offset", String(items.length));
    const page = await api<Page<Task>>(
      `/tasks?${params}`,
      "GET",
      undefined,
      signal,
    );
    items.push(...page.items);
    total = page.total;
    if (!page.items.length) break;
  } while (items.length < total);
  return { items, total };
}
