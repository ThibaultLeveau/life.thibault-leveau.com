import { plusDays } from "./scheduling";
import type {
  AgendaSettings,
  Label,
  Section,
  Status,
  Task,
  ViewSettings,
  Workspace,
} from "./types";

/** Transient rendering of acknowledged data plus pending user intentions. */
export interface TaskData {
  workspaces: Workspace[];
  sections: Section[];
  statuses: Status[];
  labels: Label[];
  tasks: Task[];
  archivedIds: string[];
  views: Record<string, ViewSettings>;
  agenda: AgendaSettings;
}
export interface TaskCommand {
  path: string;
  method: string;
  body: Record<string, unknown>;
  temporaryId: string;
  at: string;
  undo?: Task;
}
const replace = <T extends { id: string }>(items: T[], item: T) =>
  items.some((old) => old.id === item.id)
    ? items.map((old) => (old.id === item.id ? item : old))
    : [...items, item];
export function replaceTask(data: TaskData, task: Task): TaskData {
  return { ...data, tasks: replace(data.tasks, task) };
}
function statusFor(data: TaskData, workspace: string, completed: boolean) {
  return data.statuses
    .filter((s) => s.workspace_id === workspace)
    .sort((a, b) => a.position - b.position)
    .find((s) => s.is_completed === completed)?.id;
}
function patchTask(
  data: TaskData,
  task: Task,
  body: Record<string, unknown>,
  at: string,
): Task {
  const patched = { ...task, ...body } as Task;
  if ("archived" in body) patched.archived_at = body.archived ? at : null;
  if (body.status_id && body.status_id !== task.status_id) {
    const status = data.statuses.find((s) => s.id === body.status_id);
    if (status)
      patched.completed_at = status.is_completed
        ? (task.completed_at ?? at)
        : null;
  }
  return patched;
}
function move(
  data: TaskData,
  task: Task,
  body: Record<string, unknown>,
  at: string,
) {
  const target = patchTask(data, task, body, at);
  const ordered = data.tasks
    .filter((t) => t.workspace_id === target.workspace_id && t.id !== task.id)
    .sort((a, b) => a.position - b.position);
  const index = ordered.findIndex((t) => t.id === body.before_id);
  ordered.splice(index < 0 ? ordered.length : index, 0, target);
  const positions = new Map(
    ordered.map((t, i) => [t.id, { ...t, position: i }]),
  );
  return { ...data, tasks: data.tasks.map((t) => positions.get(t.id) ?? t) };
}
export function optimistic(data: TaskData, command: TaskCommand): TaskData {
  const { path, method, body, temporaryId, at } = command;
  const parts = path.split("?")[0].split("/").filter(Boolean);
  if (parts[0] === "agenda")
    return { ...data, agenda: { ...data.agenda, ...body } };
  if (parts[0] === "tasks") {
    if (parts[1] === "bulk") {
      for (const [index, { id }] of (
        body.tasks as { id: string }[]
      ).entries()) {
        const task = data.tasks.find((t) => t.id === id);
        if (!task) continue;
        let fields: Record<string, unknown> = {};
        let action = "";
        switch (body.action) {
          case "move":
            action = "move";
            fields = {
              workspace_id: body.workspace_id,
              section_id: body.section_id,
              status_id:
                body.workspace_id === task.workspace_id
                  ? task.status_id
                  : (statusFor(
                      data,
                      body.workspace_id as string,
                      !!task.completed_at,
                    ) ?? task.status_id),
            };
            break;
          case "complete":
          case "reopen":
          case "duplicate":
            action = body.action;
            break;
          case "archive":
          case "restore":
            fields = { archived: body.action === "archive" };
            break;
          case "reschedule":
            fields = { due_date: body.due_date };
            break;
          case "priority":
            fields = { priority: body.priority };
            break;
          case "status":
            fields = {
              status_id: (body.status_ids as Record<string, string>)[
                task.workspace_id
              ],
            };
            break;
          case "labels": {
            const labels =
              (body.label_ids as Record<string, string[]>)[task.workspace_id] ??
              [];
            fields = {
              label_ids:
                body.operation === "add"
                  ? [...new Set([...task.label_ids, ...labels])]
                  : task.label_ids.filter((id) => !labels.includes(id)),
            };
            break;
          }
        }
        data = optimistic(data, {
          ...command,
          path: `/tasks/${id}${action ? `/${action}` : ""}`,
          body: fields,
          temporaryId: `${temporaryId}:${body.action === "duplicate" ? index : id}`,
        });
      }
      return data;
    }
    const task = data.tasks.find((t) => t.id === parts[1]);
    if (parts.length === 1 || parts[2] === "duplicate") {
      const workspaceId = (body.workspace_id ?? task?.workspace_id) as string;
      const draft: Task = {
        id: temporaryId,
        workspace_id: workspaceId,
        section_id: null,
        status_id: statusFor(data, workspaceId, false) ?? "",
        title: "",
        description: "",
        priority: 4,
        due_date: null,
        recurrence: null,
        recurrence_completed: 0,
        label_ids: [],
        version: 0,
        created_at: at,
        updated_at: at,
        completed_at: null,
        archived_at: null,
        position:
          Math.max(
            -1,
            ...data.tasks
              .filter((t) => t.workspace_id === workspaceId)
              .map((t) => t.position),
          ) + 1,
      };
      if (task)
        Object.assign(draft, task, {
          id: temporaryId,
          version: 0,
          completed_at: null,
          recurrence_completed: 0,
          status_id: task.completed_at
            ? statusFor(data, workspaceId, false)
            : task.status_id,
          position: draft.position,
        });
      return replaceTask(data, patchTask(data, draft, body, at));
    }
    if (!task) return data;
    if (parts[2] === "move") return move(data, task, body, at);
    if (parts[2] === "undo-complete" && command.undo) {
      const before = command.undo;
      return replaceTask(data, {
        ...task,
        due_date: before.due_date,
        recurrence_completed: before.recurrence_completed,
        status_id: before.status_id,
        completed_at: before.completed_at,
      });
    }
    if (["complete", "reopen", "undo-complete"].includes(parts[2])) {
      const completed = parts[2] === "complete";
      return replaceTask(data, {
        ...task,
        completed_at: completed ? (task.completed_at ?? at) : null,
        status_id:
          statusFor(data, task.workspace_id, completed) ?? task.status_id,
      });
    }
    return replaceTask(data, patchTask(data, task, body, at));
  }
  if (parts[0] !== "workspaces") return data;
  if (parts[2] === "view")
    return {
      ...data,
      views: { ...data.views, [parts[1]]: body as unknown as ViewSettings },
    };
  const kind = (parts[2] ?? "workspaces") as
    | "workspaces"
    | "sections"
    | "statuses"
    | "labels";
  const id = kind === "workspaces" ? parts[1] : parts[3];
  if (id === "order") {
    const ids = body.ids as string[];
    return {
      ...data,
      [kind]: data[kind]
        .map((item) =>
          ids.includes(item.id)
            ? { ...item, position: ids.indexOf(item.id) }
            : item,
        )
        .sort(
          (a, b) =>
            ("position" in a ? a.position : 0) -
            ("position" in b ? b.position : 0),
        ),
    };
  }
  if (method === "DELETE") {
    const replacement = new URLSearchParams(path.split("?")[1]).get(
      "replacement_id",
    );
    return {
      ...data,
      [kind]: data[kind].filter((item) => item.id !== id),
      tasks: data.tasks.map((task) =>
        kind === "statuses" && task.status_id === id && replacement
          ? { ...task, status_id: replacement }
          : kind === "labels"
            ? {
                ...task,
                label_ids: task.label_ids.filter((label) => label !== id),
              }
            : task,
      ),
    };
  }
  const item = data[kind].find((item) => item.id === id);
  const next = {
    id: temporaryId,
    workspace_id: parts[1],
    parent_id: null,
    name: "",
    description: "",
    color: "#748b79",
    visibility: "both",
    is_completed: false,
    archived_at: null,
    created_at: at,
    position: data[kind].length,
    ...item,
    ...body,
    ...("archived" in body ? { archived_at: body.archived ? at : null } : {}),
  };
  return {
    ...data,
    [kind]: replace(
      data[kind] as (Workspace | Section | Status | Label)[],
      next,
    ),
  };
}
export function activeTasks(data: TaskData, archived = false) {
  return data.tasks.filter((task) => {
    const space = data.workspaces.find((s) => s.id === task.workspace_id);
    const section = data.sections.find((s) => s.id === task.section_id);
    return (
      !!(
        task.archived_at ||
        space?.archived_at ||
        section?.archived_at ||
        (task.section_id && !section && data.archivedIds.includes(task.id))
      ) === archived
    );
  });
}
export function workspaceTasks(
  data: TaskData,
  id: string,
  view: ViewSettings,
  today: string,
  flashes = new Set<string>(),
) {
  const search = view.search.toLocaleLowerCase();
  return activeTasks(data)
    .filter(
      (t) =>
        t.workspace_id === id &&
        (view.show_completed || !t.completed_at || flashes.has(t.id)) &&
        (!view.status_id || t.status_id === view.status_id) &&
        (!view.priority || t.priority === view.priority) &&
        (!view.label_id || t.label_ids.includes(view.label_id)) &&
        (!search ||
          `${t.title}\n${t.description}`
            .toLocaleLowerCase()
            .includes(search)) &&
        (view.due === "all" ||
          (view.due === "none"
            ? !t.due_date
            : t.due_date &&
              (view.due === "today"
                ? t.due_date === today
                : view.due === "overdue"
                  ? t.due_date < today && !t.completed_at
                  : t.due_date > today))),
    )
    .sort(
      (a, b) =>
        (view.sort === "priority"
          ? a.priority - b.priority
          : view.sort === "due_date"
            ? (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")
            : 0) ||
        a.position - b.position ||
        a.id.localeCompare(b.id),
    );
}
export function agendaTasks(
  data: TaskData,
  today: string,
  flashes = new Set<string>(),
) {
  const settings = data.agenda;
  const start = plusDays(today, settings.period === "tomorrow" ? 1 : 0);
  const end = plusDays(
    start,
    settings.period === "week"
      ? 6
      : settings.period === "custom"
        ? settings.custom_days - 1
        : 0,
  );
  const items = activeTasks(data)
    .filter(
      (t) =>
        t.due_date &&
        (settings.show_completed || !t.completed_at || flashes.has(t.id)) &&
        (!settings.workspace_id || t.workspace_id === settings.workspace_id) &&
        (!settings.priority || t.priority === settings.priority) &&
        (!settings.label_id || t.label_ids.includes(settings.label_id)) &&
        (!settings.search ||
          `${t.title}\n${t.description}`
            .toLocaleLowerCase()
            .includes(settings.search.trim().toLocaleLowerCase())) &&
        ((t.due_date >= start && t.due_date <= end) ||
          (settings.include_overdue && t.due_date < today && !t.completed_at)),
    )
    .sort(
      (a, b) =>
        a.due_date!.localeCompare(b.due_date!) ||
        a.position - b.position ||
        a.id.localeCompare(b.id),
    );
  return { items, start_date: start, end_date: end };
}
