import { api } from "../../platform/api";
import type { Page, Task, ViewSettings } from "./types";
import { localDate } from "./types";

export async function allTasks(
  workspaceId: string,
  view: ViewSettings,
  archived = false,
  signal?: AbortSignal,
  today = localDate(),
) {
  const params = new URLSearchParams({
    workspace_id: workspaceId,
    limit: "200",
    sort: view.sort,
    today,
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
