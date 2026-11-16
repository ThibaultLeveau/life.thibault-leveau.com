import { formatLocale } from "../../../shared/i18n";
import { tr } from "../i18n";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { api } from "../../../platform/api";
import { relativeDate } from "../dates";
import { workspaceTree } from "../workspaceTree";
import type {
  AgendaPage,
  AgendaSettings,
  Label,
  Section,
  Status,
  Task,
  Workspace,
} from "../types";
import { ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
import { TaskContents } from "./TaskContents";
import { TaskEditor } from "./TaskEditor";
import { MoveDialog } from "./MoveDialog";
import { TaskActions } from "./TaskActions";

type SpaceData = { sections: Section[]; statuses: Status[]; labels: Label[] };
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
  writes,
  onWorkspace,
}: {
  workspaces: Workspace[];
  today: string;
  writes: MutableRefObject<Promise<unknown>>;
  onWorkspace: (id: string) => void;
}) {
  const [settings, setSettings] = useState<AgendaSettings | null>(null);
  const [page, setPage] = useState<AgendaPage | null>(null);
  const [spaces, setSpaces] = useState<Record<string, SpaceData>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [undoTask, setUndoTask] = useState<Task | null>(null);
  const [reload, setReload] = useState(0);
  const [editor, setEditor] = useState<Task | null>(null);
  const [moving, setMoving] = useState<Task | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    setLoading(true);
    setError("");
    async function load() {
      await writes.current;
      if (signal.aborted) return;
      const saved = await api<AgendaSettings>(
        "/agenda/view",
        "GET",
        undefined,
        signal,
      );
      const params = new URLSearchParams({ today, limit: "200" });
      const items: Task[] = [];
      let result: AgendaPage;
      do {
        params.set("offset", String(items.length));
        result = await api<AgendaPage>(
          `/agenda/tasks?${params}`,
          "GET",
          undefined,
          signal,
        );
        items.push(...result.items);
        if (!result.items.length) break;
      } while (items.length < result.total);
      const data = await Promise.all(
        workspaces.map(async (space) => {
          const base = `/workspaces/${space.id}`;
          const [sections, statuses, labels] = await Promise.all([
            api<Section[]>(`${base}/sections`, "GET", undefined, signal),
            api<Status[]>(`${base}/statuses`, "GET", undefined, signal),
            api<Label[]>(`${base}/labels`, "GET", undefined, signal),
          ]);
          return [space.id, { sections, statuses, labels }] as const;
        }),
      );
      if (signal.aborted) return;
      setSettings(saved);
      setSpaces(Object.fromEntries(data));
      setPage({ ...result, items });
    }
    void load()
      .catch((error) => {
        if (!signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [today, reload, workspaces, writes]);

  async function change(patch: Partial<AgendaSettings>) {
    if (!settings || busy) return;
    setBusy(true);
    setError("");
    const previous = settings;
    const next = { ...settings, ...patch };
    setSettings(next);
    const pending = writes.current.then(() =>
      api<AgendaSettings>("/agenda/view", "PUT", next),
    );
    writes.current = pending.catch(() => undefined);
    try {
      const saved = await pending;
      if (mounted.current) {
        setSettings(saved);
        setReload((value) => value + 1);
      }
    } catch (error) {
      if (mounted.current) {
        setSettings(previous);
        setError(tr("settings_unsaved", { message: (error as Error).message }));
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function complete(task: Task) {
    setBusy(true);
    setError("");
    try {
      const result = await api<Task>(
        `/tasks/${task.id}/${task.completed_at ? "reopen" : "complete"}`,
        "POST",
        {
          expected_version: task.version,
        },
      );
      setUndoTask(task.completed_at ? null : result);
      setNotice(
        task.completed_at
          ? tr("task_reopened")
          : result.recurrence && !result.completed_at
            ? tr("occurrence_next", {
                date: relativeDate(result.due_date!, today).full,
              })
            : result.recurrence
              ? tr("last_occurrence_completed")
              : tr("task_completed"),
      );
      setReload((value) => value + 1);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function saved() {
    setEditor(null);
    setMoving(null);
    setNotice(tr("task_saved"));
    setUndoTask(null);
    setReload((value) => value + 1);
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
                disabled={busy || loading}
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
                    disabled={busy || loading}
                  />
                </label>
                <button
                  className="secondary-button small-button"
                  disabled={busy || loading}
                >
                  {tr("apply")}
                </button>
              </form>
            )}
            <label className="check-label">
              <input
                type="checkbox"
                checked={settings.include_overdue}
                disabled={busy || loading}
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
                disabled={busy || loading}
                onChange={(event) =>
                  change({ show_completed: event.target.checked })
                }
              />
              {tr("show_completed_tasks")}
            </label>
          </div>
        </>
      )}
      <ErrorMessage message={error} />
      {error && (
        <button
          className="text-button"
          disabled={busy || loading}
          onClick={() => setReload((value) => value + 1)}
        >
          {tr("try_again")}
        </button>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
          {undoTask && (
            <button
              className="text-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await api(`/tasks/${undoTask.id}/undo-complete`, "POST", {
                    expected_version: undoTask.version,
                  });
                  setNotice(
                    tr("completion_undone_the_previous_due_date_is_restored"),
                  );
                  setUndoTask(null);
                  setReload((v) => v + 1);
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {tr("undo_completion")}
            </button>
          )}
        </p>
      )}
      {loading && !page ? (
        <p role="status">{tr("loading_due_dates")}</p>
      ) : (
        page && (
          <>
            <div className="task-summary" role="status">
              <span>
                {loading
                  ? tr("refreshing_due_dates")
                  : tr("task_count", { count: page.items.length })}
              </span>
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
              key={JSON.stringify(settings)}
              tasks={page.items}
              workspaces={workspaces}
              today={today}
              busy={busy || loading}
              onEdit={setEditor}
              onRefresh={(message) => {
                if (message) {
                  setNotice(message);
                  setUndoTask(null);
                }
                setReload((value) => value + 1);
              }}
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
                        key={task.id}
                      >
                        <TaskContents
                          task={task}
                          today={today}
                          labels={data?.labels ?? []}
                          busy={busy || loading}
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
        )
      )}
      {editor && editorSpace && editorData && (
        <TaskEditor
          key={`${editor.id}:${editor.version}`}
          task={editor}
          workspace={editorSpace}
          {...editorData}
          onClose={() => setEditor(null)}
          onSaved={saved}
          onReload={setEditor}
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
