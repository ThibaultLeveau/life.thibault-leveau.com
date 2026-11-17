import { useEffect, useMemo, useState } from "react";
import { tr } from "../i18n";
import { activeTasks } from "../optimistic";
import { useTaskSync } from "../useTaskSync";
import { workspaceTree } from "../workspaceTree";
import type { Task } from "../types";
import { TaskActions } from "./TaskActions";
import { TaskFilterDisclosure } from "./TaskFilterDisclosure";
import { TaskContents } from "./TaskContents";
import { TaskEditor } from "./TaskEditor";
import { MoveDialog } from "./MoveDialog";
import { Icon } from "../../../shared/ui/Icon";
import { useTaskCompletion, CompletionNotice } from "../useTaskCompletion";

export function GlobalTasksView({
  mode,
  today,
  onWorkspace,
  onCreate,
}: {
  mode: "search" | "all" | "undated" | "archives";
  today: string;
  onWorkspace: (id: string) => void;
  onCreate: () => void;
}) {
  const sync = useTaskSync(),
    data = sync.data!;
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const [search, setSearch] = useState((params.get("q") ?? "").slice(0, 500));
  const [scope, setScope] = useState(
    params.get("state") ??
      (mode === "archives" ? "archives" : mode === "search" ? "all" : "open"),
  );
  const [spaceId, setSpaceId] = useState(params.get("workspace") ?? "");
  const [priority, setPriority] = useState(params.get("priority") ?? "");
  const [labelId, setLabelId] = useState(params.get("label") ?? "");
  const [shown, setShown] = useState(100);
  const [editor, setEditor] = useState<Task | null>(null);
  const [moving, setMoving] = useState<Task | null>(null);
  const completion = useTaskCompletion(today);
  const archived = scope === "archives";
  const workspaces = data.workspaces;
  const paths = new Map(
    workspaceTree(workspaces).map((row) => [row.space.id, row.path]),
  );
  const items = activeTasks(data, archived)
    .filter(
      (task) =>
        (!spaceId || task.workspace_id === spaceId) &&
        (!priority || task.priority === Number(priority)) &&
        (!labelId || task.label_ids.includes(labelId)) &&
        (mode !== "undated" || !task.due_date) &&
        (scope !== "open" || !task.completed_at || sync.flashes.has(task.id)) &&
        (scope !== "completed" || !!task.completed_at) &&
        (!search ||
          `${task.title}\n${task.description}`
            .toLocaleLowerCase()
            .includes(search.trim().toLocaleLowerCase())),
    )
    .sort(
      (a, b) =>
        (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
        a.position - b.position ||
        a.id.localeCompare(b.id),
    );
  const visible = items.slice(0, shown);
  const needed = [
    ...new Set(
      [
        ...visible.map((task) => task.workspace_id),
        spaceId,
        editor?.workspace_id,
      ].filter(Boolean),
    ),
  ].join(",");
  useEffect(() => {
    let cancelled = false;
    const ids = needed.split(",").filter(Boolean);
    void (async () => {
      for (let index = 0; index < ids.length && !cancelled; index += 2)
        await Promise.all(
          ids.slice(index, index + 2).map((id) => sync.ensureSpace(id)),
        );
    })();
    return () => {
      cancelled = true;
    };
  }, [needed]);
  useEffect(() => {
    setShown(100);
  }, [search, scope, spaceId, priority, labelId]);
  useEffect(() => {
    const query = new URLSearchParams({ view: mode });
    for (const [key, value] of Object.entries({
      q: search,
      state: scope,
      workspace: spaceId,
      priority,
      label: labelId,
    }))
      if (value) query.set(key, value);
    history.replaceState(history.state, "", `/tasks?${query}`);
  }, [mode, search, scope, spaceId, priority, labelId]);
  const workspace = workspaces.find(
    (space) => space.id === editor?.workspace_id,
  );
  const metadata = workspace
    ? {
        sections: data.sections.filter(
          (section) =>
            section.workspace_id === workspace.id &&
            (!section.archived_at || section.id === editor?.section_id),
        ),
        statuses: data.statuses.filter(
          (status) => status.workspace_id === workspace.id,
        ),
        labels: data.labels.filter(
          (label) => label.workspace_id === workspace.id,
        ),
      }
    : null;
  const title = tr(
    mode === "search"
      ? "global_search"
      : mode === "archives"
        ? "task_archives"
        : mode === "undated"
          ? "no_due_date"
          : "all_tasks",
  );
  function clear() {
    setSearch("");
    setSpaceId("");
    setPriority("");
    setLabelId("");
  }
  return (
    <div className="global-tasks-view">
      <div className="workspace-heading">
        <div>
          <h1>{title}</h1>
          {mode === "search" && (
            <p className="workspace-description">{tr("global_search_hint")}</p>
          )}
        </div>
        {!archived && (
          <button className="primary-button" onClick={onCreate}>
            <Icon name="plus" />
            {tr("new_task")}
          </button>
        )}
      </div>
      <TaskFilterDisclosure
        alwaysOpen={mode === "search"}
        active={[search, spaceId, priority, labelId].filter(Boolean).length}
      >
        <div className="global-task-filters">
          <label className="global-search-field">
            <span className="sr-only">{tr("global_search")}</span>
            <Icon name="search" />
            <input
              id="global-task-search"
              value={search}
              maxLength={500}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={tr("search_everywhere")}
            />
            {search && (
              <button
                className="icon-button"
                aria-label={tr("clear_search")}
                onClick={() => setSearch("")}
              >
                <Icon name="x" />
              </button>
            )}
          </label>
          <label>
            {tr("task_state")}
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value)}
            >
              <option value="open">{tr("open_tasks")}</option>
              <option value="completed">{tr("completed_tasks")}</option>
              <option value="all">{tr("all_states")}</option>
              <option value="archives">{tr("archive_scope")}</option>
            </select>
          </label>
          <label>
            {tr("workspace")}
            <select
              value={spaceId}
              onChange={(event) => {
                setSpaceId(event.target.value);
                setLabelId("");
              }}
            >
              <option value="">{tr("all_workspaces")}</option>
              {workspaceTree(
                workspaces.filter((space) => archived || !space.archived_at),
              ).map(({ space, path }) => (
                <option key={space.id} value={space.id}>
                  {path}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr("priority")}
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            >
              <option value="">{tr("all_priorities")}</option>
              {[1, 2, 3, 4].map((value) => (
                <option key={value} value={value}>
                  P{value}
                </option>
              ))}
            </select>
          </label>
          {spaceId && (
            <label>
              {tr("label")}
              <select
                value={labelId}
                onChange={(event) => setLabelId(event.target.value)}
              >
                <option value="">{tr("all_labels")}</option>
                {data.labels
                  .filter((label) => label.workspace_id === spaceId)
                  .map((label) => (
                    <option key={label.id} value={label.id}>
                      {label.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {(search || spaceId || priority || labelId) && (
            <button className="text-button" onClick={clear}>
              {tr("clear_filters")}
            </button>
          )}
        </div>
      </TaskFilterDisclosure>
      <CompletionNotice completion={completion} />
      <div className="task-summary" role="status">
        {tr("result_count", { count: items.length })}
      </div>
      {!items.length && (
        <p className="empty-filter">
          {tr(
            archived && !search && !spaceId && !priority && !labelId
              ? "empty_task_archives"
              : "no_search_results",
          )}
        </p>
      )}
      <TaskActions
        tasks={items}
        workspaces={workspaces}
        today={today}
        busy={false}
        onEdit={setEditor}
        archived={archived}
      >
        {visible.map((task) => (
          <article
            className={`task-row global-task ${task.completed_at ? "is-completed" : ""}`}
            data-task-id={task.id}
            key={sync.keyFor(task.id)}
          >
            <TaskContents
              task={task}
              today={today}
              labels={data.labels}
              busy={false}
              archived={archived}
              status={data.statuses.find(
                (status) => status.id === task.status_id,
              )}
              onOpen={() => setEditor(task)}
              onComplete={() => completion.complete(task)}
              context={
                <button
                  className="agenda-task-context"
                  onClick={() => onWorkspace(task.workspace_id)}
                >
                  {paths.get(task.workspace_id)}
                  {task.section_id &&
                    ` / ${data.sections.find((section) => section.id === task.section_id)?.name ?? "…"}`}
                </button>
              }
            />
          </article>
        ))}
      </TaskActions>
      {shown < items.length && (
        <div className="task-load-more">
          <p>
            {tr("displayed_tasks", {
              shown: visible.length,
              total: items.length,
            })}
          </p>
          <button
            className="secondary-button"
            onClick={() => setShown((value) => value + 100)}
          >
            {tr("show_more_tasks", {
              count: Math.min(100, items.length - shown),
            })}
          </button>
        </div>
      )}
      {editor && workspace && metadata?.statuses.length ? (
        <TaskEditor
          key={editor.id}
          task={editor}
          workspace={workspace}
          {...metadata}
          onClose={() => setEditor(null)}
          onSaved={() => setEditor(null)}
          onMove={(task) => {
            setEditor(null);
            setMoving(task);
          }}
        />
      ) : null}
      {moving && (
        <MoveDialog
          task={moving}
          workspaces={workspaces.filter((space) => !space.archived_at)}
          onClose={() => setMoving(null)}
          onSaved={() => setMoving(null)}
        />
      )}
    </div>
  );
}
