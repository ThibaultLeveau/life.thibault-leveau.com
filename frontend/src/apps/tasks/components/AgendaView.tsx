import { formatLocale } from "../../../shared/i18n";
import { tr } from "../i18n";
import { useEffect, useState } from "react";
import { relativeDate } from "../dates";
import { workspaceTree } from "../workspaceTree";
import type { AgendaSettings, Task, Workspace } from "../types";
import { Icon } from "../../../shared/ui/Icon";
import { TaskContents } from "./TaskContents";
import { TaskEditor } from "./TaskEditor";
import { MoveDialog } from "./MoveDialog";
import { TaskActions, SelectTaskGroup } from "./TaskActions";

import { useTaskSync } from "../useTaskSync";
import { useTaskCompletion, CompletionNotice } from "../useTaskCompletion";
import { agendaTasks } from "../optimistic";
const periods = () =>
  [
    ["today", tr("today")],
    ["tomorrow", tr("tomorrow")],
    ["week", tr("week")],
    ["custom", tr("custom")],
  ] as const;

export function AgendaView({
  workspaces,
  today,
  onWorkspace,
  onCreate,
}: {
  workspaces: Workspace[];
  today: string;
  onWorkspace: (id: string) => void;
  onCreate: () => void;
}) {
  const sync = useTaskSync();
  const data = sync.data!;
  const settings = data.agenda;
  const page = agendaTasks(data, today, sync.flashes);
  const neededSpaces = [...new Set(page.items.map((task) => task.workspace_id))]
    .sort()
    .join(",");
  useEffect(() => {
    for (const id of neededSpaces.split(",").filter(Boolean))
      void sync.ensureSpace(id);
  }, [neededSpaces]);

  const spaces = Object.fromEntries(
    workspaces.map((space) => [
      space.id,
      {
        sections: data.sections.filter(
          (item) => item.workspace_id === space.id,
        ),
        statuses: data.statuses.filter(
          (item) => item.workspace_id === space.id,
        ),
        labels: data.labels.filter((item) => item.workspace_id === space.id),
      },
    ]),
  );
  const completion = useTaskCompletion(today);
  const [search, setSearch] = useState(settings.search);
  useEffect(() => {
    setSearch(settings.search);
  }, [settings.search]);
  useEffect(() => {
    if (search === settings.search) return;
    const timer = setTimeout(() => change({ search }), 300);
    return () => clearTimeout(timer);
  }, [search, settings]);
  useEffect(() => {
    if (settings.workspace_id) void sync.ensureSpace(settings.workspace_id);
  }, [settings.workspace_id]);
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [editor, setEditor] = useState<Task | null>(null);
  const [moving, setMoving] = useState<Task | null>(null);
  function change(patch: Partial<AgendaSettings>) {
    sync.mutate("/agenda/view", "PUT", { ...settings, ...patch });
  }
  function saved() {
    setEditor(null);
    setMoving(null);
    completion.clear();
  }
  const spacePaths = new Map(
    workspaceTree(workspaces).map(({ space, path }) => [space.id, path]),
  );
  const groups = new Map<string, Task[]>();
  for (const task of page?.items ?? []) {
    const key = task.due_date! < today ? "overdue" : task.due_date!;
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }
  const editorSpace = workspaces.find(
    (space) => space.id === editor?.workspace_id,
  );
  const editorData = editorSpace ? spaces[editorSpace.id] : undefined;
  return (
    <div className="agenda-view">
      <div className="workspace-heading">
        <div>
          <h1>{tr("upcoming")}</h1>
          <p className="workspace-description">
            {tr("your_due_dates_across_all_workspaces")}
          </p>
        </div>
        <button className="primary-button" onClick={onCreate}>
          <Icon name="plus" />
          {tr("new_task")}
        </button>
      </div>
      {settings && (
        <>
          <div
            className="agenda-periods view-switch"
            aria-label={tr("task_period")}
          >
            {periods().map(([period, label]) => (
              <button
                key={period}
                aria-pressed={settings.period === period}
                onClick={() => change({ period })}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="global-task-filters agenda-filters">
            <label>
              {tr("search_tasks")}
              <input
                value={search}
                maxLength={500}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label>
              {tr("workspace")}
              <select
                value={settings.workspace_id ?? ""}
                onChange={(event) =>
                  change({
                    workspace_id: event.target.value || null,
                    label_id: null,
                  })
                }
              >
                <option value="">{tr("all_workspaces")}</option>
                {workspaceTree(workspaces).map(({ space, path }) => (
                  <option key={space.id} value={space.id}>
                    {path}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("priority")}
              <select
                value={settings.priority ?? ""}
                onChange={(event) =>
                  change({
                    priority: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
              >
                <option value="">{tr("all_priorities")}</option>
                {[1, 2, 3, 4].map((value) => (
                  <option key={value} value={value}>
                    P{value}
                  </option>
                ))}
              </select>
            </label>
            {settings.workspace_id && (
              <label>
                {tr("label")}
                <select
                  value={settings.label_id ?? ""}
                  onChange={(event) =>
                    change({ label_id: event.target.value || null })
                  }
                >
                  <option value="">{tr("all_labels")}</option>
                  {data.labels
                    .filter(
                      (label) => label.workspace_id === settings.workspace_id,
                    )
                    .map((label) => (
                      <option key={label.id} value={label.id}>
                        {label.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {(settings.search ||
              settings.workspace_id ||
              settings.priority ||
              settings.label_id) && (
              <button
                className="text-button"
                onClick={() => {
                  setSearch("");
                  change({
                    search: "",
                    workspace_id: null,
                    priority: null,
                    label_id: null,
                  });
                }}
              >
                {tr("clear_filters")}
              </button>
            )}
          </div>
          <div className="agenda-options">
            {settings.period === "custom" && (
              <form
                key={settings.custom_days}
                className="agenda-horizon"
                onSubmit={(event) => {
                  event.preventDefault();
                  void change({
                    custom_days: Number(
                      new FormData(event.currentTarget).get("days"),
                    ),
                  });
                }}
              >
                <label>
                  {tr("number_of_days")}
                  <input
                    name="days"
                    type="number"
                    min={1}
                    max={90}
                    required
                    defaultValue={settings.custom_days}
                  />
                </label>
                <button className="secondary-button small-button">
                  {tr("apply")}
                </button>
              </form>
            )}
            <label className="check-label">
              <input
                type="checkbox"
                checked={settings.include_overdue}
                onChange={(event) =>
                  change({ include_overdue: event.target.checked })
                }
              />
              {tr("include_overdue_tasks")}
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={settings.show_completed}
                onChange={(event) =>
                  change({ show_completed: event.target.checked })
                }
              />
              {tr("show_completed_tasks")}
            </label>
          </div>
        </>
      )}
      <CompletionNotice completion={completion} />
      {page && (
        <>
          <div className="task-summary" role="status">
            <span>{tr("task_count", { count: page.items.length })}</span>
            <span>
              {new Date(`${page.start_date}T12:00:00`).toLocaleDateString(
                formatLocale(),
                { day: "numeric", month: "long", year: "numeric" },
              )}
              {page.end_date !== page.start_date && (
                <>
                  {" "}
                  —{" "}
                  {new Date(`${page.end_date}T12:00:00`).toLocaleDateString(
                    formatLocale(),
                    { day: "numeric", month: "long", year: "numeric" },
                  )}
                </>
              )}
            </span>
          </div>
          {!page.items.length && (
            <div className="empty-filter">
              <Icon name="check" size={24} />
              <p>{tr("no_tasks_due_on_this_date")}</p>
            </div>
          )}
          <TaskActions
            tasks={page.items}
            workspaces={workspaces}
            today={today}
            busy={false}
            onEdit={setEditor}
          >
            {[...groups].map(([key, tasks]) => (
              <section
                className="task-section"
                key={key}
                aria-labelledby={`agenda-${key}`}
              >
                <div className="section-heading">
                  <h2
                    id={`agenda-${key}`}
                    className={key === "overdue" ? "agenda-overdue" : ""}
                  >
                    {key === "overdue"
                      ? tr("overdue")
                      : relativeDate(key, today).label}
                  </h2>
                  <span className="section-count">{tasks.length}</span>
                  <SelectTaskGroup tasks={tasks} />
                  {key !== "overdue" && (
                    <span className="agenda-full-date">
                      {relativeDate(key, today).full}
                    </span>
                  )}
                </div>
                {tasks.slice(0, limits[key] ?? 100).map((task) => {
                  const space = workspaces.find(
                    (space) => space.id === task.workspace_id,
                  );
                  const data = spaces[task.workspace_id];
                  const section = data?.sections.find(
                    (section) => section.id === task.section_id,
                  );
                  return (
                    <article
                      className={`task-row agenda-task ${task.completed_at ? "is-completed" : ""}`}
                      data-task-id={task.id}
                      key={sync.keyFor(task.id)}
                    >
                      <TaskContents
                        task={task}
                        today={today}
                        labels={data?.labels ?? []}
                        busy={false}
                        onOpen={() => setEditor(task)}
                        onComplete={() => completion.complete(task)}
                        context={
                          <button
                            className="agenda-task-context"
                            onClick={() => onWorkspace(task.workspace_id)}
                          >
                            <span
                              className="color-dot"
                              style={{ background: space?.color }}
                            />
                            {spacePaths.get(task.workspace_id) ?? space?.name}
                            {section && ` / ${section.name}`}
                          </button>
                        }
                      />
                    </article>
                  );
                })}
                {tasks.length > (limits[key] ?? 100) && (
                  <button
                    className="text-button task-load-more"
                    onClick={() =>
                      setLimits((previous) => ({
                        ...previous,
                        [key]: (previous[key] ?? 100) + 100,
                      }))
                    }
                  >
                    {tr("show_more_tasks", {
                      count: Math.min(100, tasks.length - (limits[key] ?? 100)),
                    })}
                  </button>
                )}
              </section>
            ))}
          </TaskActions>
        </>
      )}
      {editor && editorSpace && editorData && (
        <TaskEditor
          key={`${editor.id}:${editor.version}`}
          task={editor}
          workspace={editorSpace}
          {...editorData}
          onClose={() => setEditor(null)}
          onSaved={saved}
          onMove={(task) => {
            setEditor(null);
            setMoving(task);
          }}
        />
      )}
      {moving && (
        <MoveDialog
          task={moving}
          workspaces={workspaces}
          onClose={() => setMoving(null)}
          onSaved={saved}
        />
      )}
    </div>
  );
}
