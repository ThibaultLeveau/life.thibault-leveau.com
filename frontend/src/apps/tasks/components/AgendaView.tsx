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
import { TaskActions } from "./TaskActions";

import { useTaskSync } from "../useTaskSync";
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
}: {
  workspaces: Workspace[];
  today: string;
  onWorkspace: (id: string) => void;
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
  const [notice, setNotice] = useState("");
  const [undoTask, setUndoTask] = useState<Task | null>(null);
  const [editor, setEditor] = useState<Task | null>(null);
  const [moving, setMoving] = useState<Task | null>(null);
  function change(patch: Partial<AgendaSettings>) {
    sync.mutate("/agenda/view", "PUT", { ...settings, ...patch });
  }
  function complete(task: Task) {
    setUndoTask(null);
    sync.mutate(
      `/tasks/${task.id}/${task.completed_at ? "reopen" : "complete"}`,
      "POST",
      { expected_version: task.version },
      {
        success: (result) => {
          const saved = result as Task;
          setUndoTask(task.completed_at ? null : saved);
          setNotice(
            task.completed_at
              ? tr("task_reopened")
              : saved.recurrence && !saved.completed_at
                ? tr("occurrence_next", {
                    date: relativeDate(saved.due_date!, today).full,
                  })
                : saved.recurrence
                  ? tr("last_occurrence_completed")
                  : tr("task_completed"),
          );
        },
      },
    );
  }
  function saved() {
    setEditor(null);
    setMoving(null);
    setUndoTask(null);
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
        <Icon name="calendar" size={28} />
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
      {notice && (
        <p className="notice" role="status">
          {notice}
          {undoTask && (
            <button
              className="text-button"
              onClick={() => {
                sync.mutate(
                  `/tasks/${undoTask.id}/undo-complete`,
                  "POST",
                  { expected_version: undoTask.version },
                  {
                    message: tr(
                      "completion_undone_the_previous_due_date_is_restored",
                    ),
                    success: () => {
                      setUndoTask(null);
                      setNotice("");
                    },
                  },
                );
              }}
            >
              {tr("undo_completion")}
            </button>
          )}
        </p>
      )}
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
                  {key !== "overdue" && (
                    <span className="agenda-full-date">
                      {relativeDate(key, today).full}
                    </span>
                  )}
                </div>
                {tasks.map((task) => {
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
                        onComplete={() => complete(task)}
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
