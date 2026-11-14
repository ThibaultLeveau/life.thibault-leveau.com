import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { api } from "../api";
import { relativeDate } from "../dates";
import type {
  AgendaPage,
  AgendaSettings,
  Label,
  Section,
  Status,
  Task,
  Workspace,
} from "../types";
import { ErrorMessage } from "./Dialog";
import { Icon } from "./Icon";
import { TaskContents } from "./TaskContents";
import { TaskEditor } from "./TaskEditor";
import { MoveDialog } from "./MoveDialog";

type SpaceData = { sections: Section[]; statuses: Status[]; labels: Label[] };
const periods = [
  ["today", "Aujourd’hui"],
  ["tomorrow", "Demain"],
  ["week", "Semaine"],
  ["custom", "Personnalisé"],
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
    setPage(null);
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
    const next = { ...settings, ...patch };
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
      if (mounted.current)
        setError(`Réglages non enregistrés : ${(error as Error).message}`);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function complete(task: Task) {
    setBusy(true);
    setError("");
    try {
      await api(
        `/tasks/${task.id}/${task.completed_at ? "reopen" : "complete"}`,
        "POST",
        {
          expected_version: task.version,
        },
      );
      setNotice(task.completed_at ? "Tâche rouverte." : "Tâche terminée.");
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
    setNotice("Tâche enregistrée.");
    setReload((value) => value + 1);
  }
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
          <h1>À venir</h1>
          <p className="workspace-description">
            Vos échéances, tous espaces réunis.
          </p>
        </div>
        <Icon name="calendar" size={28} />
      </div>
      {settings && (
        <>
          <div
            className="agenda-periods view-switch"
            aria-label="Période des tâches"
          >
            {periods.map(([period, label]) => (
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
                  Nombre de jours
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
                  Appliquer
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
              Inclure les retards
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
              Afficher les tâches terminées
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
          Réessayer
        </button>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status">Chargement des échéances…</p>
      ) : (
        page && (
          <>
            <div className="task-summary" role="status">
              <span>
                {page.items.length} tâche{page.items.length !== 1 ? "s" : ""}
              </span>
              <span>
                {new Date(`${page.start_date}T12:00:00`).toLocaleDateString(
                  "fr-FR",
                  { day: "numeric", month: "long", year: "numeric" },
                )}
                {page.end_date !== page.start_date && (
                  <>
                    {" "}
                    —{" "}
                    {new Date(`${page.end_date}T12:00:00`).toLocaleDateString(
                      "fr-FR",
                      { day: "numeric", month: "long", year: "numeric" },
                    )}
                  </>
                )}
              </span>
            </div>
            {!page.items.length && (
              <div className="empty-filter">
                <Icon name="check" size={24} />
                <p>Aucune tâche à cette échéance.</p>
              </div>
            )}
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
                      ? "En retard"
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
                        busy={busy}
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
                            {space?.name}
                            {section && ` / ${section.name}`}
                          </button>
                        }
                      />
                    </article>
                  );
                })}
              </section>
            ))}
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
