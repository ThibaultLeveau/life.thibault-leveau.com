import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError } from "../../platform/api";
import { allTasks } from "./api";
import { tr } from "./i18n";
import { Icon } from "../../shared/ui/Icon";
import {
  defaultView,
  localDate,
  type AgendaSettings,
  type Label,
  type Section,
  type Status,
  type Task,
  type TaskDraft,
  type ViewSettings,
  type Workspace,
} from "./types";
import {
  optimistic,
  agendaTasks,
  replaceTask,
  type TaskCommand,
  type TaskData,
} from "./optimistic";

async function readSpaceOnce(space: Workspace, signal?: AbortSignal) {
  const base = `/workspaces/${space.id}`;
  const [sections, archivedSections, statuses, labels, view] =
    await Promise.all([
      api<Section[]>(`${base}/sections`, "GET", undefined, signal),
      api<Section[]>(
        `${base}/sections?archived=true`,
        "GET",
        undefined,
        signal,
      ),
      api<Status[]>(`${base}/statuses`, "GET", undefined, signal),
      api<Label[]>(`${base}/labels`, "GET", undefined, signal),
      api<ViewSettings>(`${base}/view`, "GET", undefined, signal),
    ]);
  return {
    id: space.id,
    sections: [...sections, ...archivedSections],
    statuses,
    labels,
    view,
  };
}

async function readSpace(space: Workspace, signal?: AbortSignal) {
  try {
    return await readSpaceOnce(space, signal);
  } catch (error) {
    if (error instanceof ApiError && error.status === 0 && !signal?.aborted)
      return readSpaceOnce(space, signal);
    throw error;
  }
}

async function readDataOnce(
  signal?: AbortSignal,
  knownSpaces: string[] = [],
): Promise<TaskData> {
  const [active, archived, tasks, archives, agenda] = await Promise.all([
    api<Workspace[]>("/workspaces", "GET", undefined, signal),
    api<Workspace[]>("/workspaces?archived=true", "GET", undefined, signal),
    // Keep completed records available for explicit display and the agenda.
    allTasks("", { ...defaultView, show_completed: true }, false, signal),
    allTasks("", defaultView, true, signal),
    api<AgendaSettings>("/agenda/view", "GET", undefined, signal),
  ]);
  const selected = new URLSearchParams(window.location.search).get("space");
  const initial: TaskData = {
    workspaces: [...active, ...archived],
    tasks: [...tasks.items, ...archives.items],
    archivedIds: archives.items.map((task) => task.id),
    agenda,
    sections: [],
    statuses: [],
    labels: [],
    views: {},
  };
  const needed = new Set([
    ...knownSpaces,
    ...(selected
      ? [selected]
      : agendaTasks(initial, localDate()).items.map(
          (task) => task.workspace_id,
        )),
  ]);
  const spaces = [...active, ...archived].filter((space) =>
    needed.has(space.id),
  );
  const details: Awaited<ReturnType<typeof readSpace>>[] = [];
  // Bound metadata reads and only load spaces visited by the current page.
  for (let offset = 0; offset < spaces.length; offset += 2)
    details.push(
      ...(await Promise.all(
        spaces
          .slice(offset, offset + 2)
          .map((space) => readSpace(space, signal)),
      )),
    );
  return {
    workspaces: [...active, ...archived],
    tasks: [...tasks.items, ...archives.items],
    archivedIds: archives.items.map((task) => task.id),
    agenda,
    sections: details.flatMap((d) => d.sections),
    statuses: details.flatMap((d) => d.statuses),
    labels: details.flatMap((d) => d.labels),
    views: Object.fromEntries(details.map((d) => [d.id, d.view])),
  };
}
async function readData(signal?: AbortSignal, knownSpaces: string[] = []) {
  try {
    return await readDataOnce(signal, knownSpaces);
  } catch (error) {
    // A network switch can interrupt a safe read. Never retry writes automatically.
    if (error instanceof ApiError && error.status === 0 && !signal?.aborted)
      return readDataOnce(signal, knownSpaces);
    throw error;
  }
}

interface Pending extends TaskCommand {
  message?: string;
  success?: (result: unknown) => void;
  recover?: () => void;
}
interface Failure {
  id: string;
  message: string;
  recover?: () => void;
}
interface Sync {
  data: TaskData | null;
  pending: number;
  flashes: Set<string>;
  failures: Failure[];
  notice: string;
  dismissNotice: () => void;
  undoArchive: () => void;
  canUndoArchive: boolean;
  recovery: TaskDraft | null;
  recoverTask: (task: Task | null, changes?: Partial<Task>) => void;
  dismiss: (id: string) => void;
  refresh: () => Promise<void>;
  idle: () => Promise<void>;
  ensureSpace: (id: string) => Promise<void>;
  canonicalId: (id: string) => string;
  keyFor: (id: string) => string;
  mutate: (
    path: string,
    method: string,
    body?: Record<string, unknown>,
    options?: {
      message?: string;
      success?: (result: unknown) => void;
      recover?: () => void;
    },
  ) => void;
}
const Context = createContext<Sync | null>(null);
export function useTaskSync() {
  const sync = useContext(Context);
  if (!sync) throw new Error("Task synchronization requires the Tasks page");
  return sync;
}
export function TaskSyncProvider({ children }: { children: ReactNode }) {
  const base = useRef<TaskData | null>(null);
  const pending = useRef<Pending[]>([]);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const loadingSpaces = useRef(new Map<string, Promise<void>>());
  const aliases = useRef(new Map<string, string>());
  const clientIds = useRef(new Map<string, string>());
  const completions = useRef(new Map<string, Task>());
  const versions = useRef(new Map<string, number>());
  const controller = useRef(new AbortController());
  const revision = useRef(0);
  const reconciling = useRef(false);
  const reads = useRef(0);
  const [data, setData] = useState<TaskData | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [notice, setNotice] = useState("");
  const [archived, setArchived] = useState<Task[]>([]);
  const [recovery, setRecovery] = useState<TaskDraft | null>(null);
  const [flashes, setFlashes] = useState(new Set<string>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  function resolve(value: unknown, field = ""): unknown {
    if (typeof value === "string")
      return /^(id|ids|.*_id|.*_ids)$/.test(field)
        ? (aliases.current.get(value) ?? value)
        : value;
    if (Array.isArray(value)) return value.map((item) => resolve(item, field));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [
          /^(status_ids|label_ids)$/.test(field)
            ? (aliases.current.get(k) ?? k)
            : k,
          resolve(v, /^(status_ids|label_ids)$/.test(field) ? "ids" : k),
        ]),
      );
    return value;
  }
  function resolved(job: Pending): Pending {
    const url = new URL(job.path, window.location.origin);
    url.pathname = url.pathname
      .split("/")
      .map((part) => aliases.current.get(part) ?? part)
      .join("/");
    for (const [key, value] of url.searchParams)
      url.searchParams.set(key, resolve(value, key) as string);
    return {
      ...job,
      path: url.pathname + url.search,
      body: resolve(job.body) as Record<string, unknown>,
    };
  }
  function publish() {
    if (!controller.current.signal.aborted && base.current) {
      setPendingCount(pending.current.length + Number(reconciling.current));
      setData(
        pending.current.reduce(
          (value, job) => optimistic(value, resolved(job)),
          base.current,
        ),
      );
    }
  }
  function fail(job: Pending, error: unknown) {
    if (
      controller.current.signal.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
    )
      return;
    const title =
      typeof job.body.title === "string"
        ? job.body.title
        : base.current?.tasks.find((t) => job.path.includes(t.id))?.title;
    const uncertain =
      error instanceof ApiError && (error.status === 0 || error.status >= 500);
    const message = `${(error as Error).message}${uncertain ? ` ${tr("check_before_resubmitting")}` : ""}`;
    setFailures((previous) => [
      ...previous,
      {
        id: job.temporaryId,
        message: `${title ? `${title} — ` : ""}${job.path.endsWith("/view") ? tr("settings_unsaved", { message }) : message}`,
        recover: job.recover,
      },
    ]);
  }
  function acceptSnapshot(next: TaskData) {
    const previous = base.current;
    if (previous) {
      const retained = new Set(
        next.workspaces
          .filter(
            (space) =>
              !space.archived_at &&
              !next.views[space.id] &&
              previous.views[space.id],
          )
          .map((space) => space.id),
      );
      for (const id of retained) next.views[id] = previous.views[id];
      next.sections.push(
        ...previous.sections.filter((item) => retained.has(item.workspace_id)),
      );
      next.statuses.push(
        ...previous.statuses.filter((item) => retained.has(item.workspace_id)),
      );
      next.labels.push(
        ...previous.labels.filter((item) => retained.has(item.workspace_id)),
      );
    }
    base.current = next;
  }
  async function ensureSpace(id: string) {
    if (base.current?.views[id]) return;
    if (loadingSpaces.current.has(id)) return loadingSpaces.current.get(id);
    const space = base.current?.workspaces.find((space) => space.id === id);
    if (!space) return;
    const signal = controller.current.signal;
    const load = readSpace(space, signal)
      .then((details) => {
        if (signal.aborted || !base.current || base.current.views[id]) return;
        base.current = {
          ...base.current,
          sections: [
            ...base.current.sections.filter((item) => item.workspace_id !== id),
            ...details.sections,
          ],
          statuses: [
            ...base.current.statuses.filter((item) => item.workspace_id !== id),
            ...details.statuses,
          ],
          labels: [
            ...base.current.labels.filter((item) => item.workspace_id !== id),
            ...details.labels,
          ],
          views: { ...base.current.views, [id]: details.view },
        };
        publish();
      })
      .catch((error) =>
        fail(
          {
            path: "",
            method: "GET",
            body: {},
            temporaryId: crypto.randomUUID(),
            at: "",
          },
          error,
        ),
      )
      .finally(() => loadingSpaces.current.delete(id));
    loadingSpaces.current.set(id, load);
    return load;
  }
  async function idle() {
    let tail: Promise<void>;
    do {
      tail = writes.current;
      await tail;
    } while (tail !== writes.current && !controller.current.signal.aborted);
  }
  async function refresh() {
    const signal = controller.current.signal;
    const reading = ++reads.current;
    await idle();
    if (signal.aborted) return;
    const stamp = revision.current;
    try {
      const next = await readData(
        signal,
        Object.keys(base.current?.views ?? {}),
      );
      if (
        reading === reads.current &&
        stamp === revision.current &&
        !signal.aborted
      ) {
        acceptSnapshot(next);
        publish();
      }
    } catch (error) {
      fail(
        {
          path: "",
          method: "GET",
          body: {},
          temporaryId: crypto.randomUUID(),
          at: "",
        },
        error,
      );
    }
  }
  useEffect(() => {
    controller.current = new AbortController();
    const stop = () => {
      controller.current.abort();
      pending.current = [];
      for (const timer of timers.current) clearTimeout(timer);
    };
    const disabled = (event: Event) => {
      if ((event as CustomEvent<string>).detail === "tasks") stop();
    };
    // Stop synchronously: React may unmount after the next queued promise runs.
    window.addEventListener("life-session-expired", stop);
    window.addEventListener("life-application-disabled", disabled);
    void refresh();
    return () => {
      stop();
      window.removeEventListener("life-session-expired", stop);
      window.removeEventListener("life-application-disabled", disabled);
    };
  }, []);
  // Private intentions never survive a session, language change or application unmount.
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (pending.current.length || reconciling.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
  function mutate(
    path: string,
    method: string,
    body: Record<string, unknown> = {},
    options: Parameters<Sync["mutate"]>[3] = {},
  ) {
    if (!base.current || controller.current.signal.aborted) return;
    const job: Pending = {
      path,
      method,
      body,
      ...options,
      temporaryId: crypto.randomUUID(),
      at: new Date().toISOString(),
      undo: path.endsWith("/undo-complete")
        ? completions.current.get(path.split("/")[2])
        : undefined,
    };
    const signal = controller.current.signal;
    revision.current += 1;
    pending.current.push(job);
    if (path.endsWith("/complete") || body?.action === "complete") {
      const ids = path.endsWith("/complete")
        ? [path.split("/")[2]]
        : (body?.tasks as { id: string }[]).map((task) => task.id);
      setFlashes((previous) => new Set([...previous, ...ids]));
      const timer = setTimeout(() => {
        setFlashes(
          (previous) =>
            new Set([...previous].filter((id) => !ids.includes(id))),
        );
        timers.current.delete(timer);
      }, 420);
      timers.current.add(timer);
    } else if (path.endsWith("/reopen") || path.endsWith("/undo-complete")) {
      const id = path.split("/")[2];
      setFlashes(
        (previous) =>
          new Set(
            [...previous].filter(
              (item) => (aliases.current.get(item) ?? item) !== id,
            ),
          ),
      );
    }
    publish();
    writes.current = writes.current.then(async () => {
      if (signal.aborted || !pending.current.includes(job) || !base.current)
        return;
      const current = resolved(job);
      const taskId = current.path.split("/")[2];
      const payload = { ...current.body };
      const beforeTask = base.current.tasks.find((task) => task.id === taskId);
      const version = (id: string, expected: number) => {
        const acknowledged = versions.current.get(id);
        return acknowledged &&
          acknowledged > expected &&
          base.current?.tasks.find((t) => t.id === id)?.version === acknowledged
          ? acknowledged
          : expected;
      };
      if ("expected_version" in payload)
        payload.expected_version = version(
          taskId,
          payload.expected_version as number,
        );
      if (Array.isArray(payload.tasks))
        payload.tasks = (
          payload.tasks as { id: string; expected_version: number }[]
        ).map((t) => ({
          ...t,
          expected_version: version(t.id, t.expected_version),
        }));
      try {
        const result = await api<unknown>(
          current.path,
          current.method,
          payload,
          signal,
        );
        if (signal.aborted) return;
        if (current.path.endsWith("/complete") && beforeTask)
          completions.current.set(taskId, beforeTask);
        base.current = optimistic(base.current, current);
        if (result && typeof result === "object") {
          const items = Array.isArray(result) ? result : [result];
          for (const [index, item] of items.entries()) {
            if ("version" in item && "title" in item) {
              const task = item as Task;
              const temporary =
                payload.action === "duplicate"
                  ? `${job.temporaryId}:${index}`
                  : job.temporaryId;
              base.current.tasks = base.current.tasks.filter(
                (t) => t.id !== temporary,
              );
              base.current = replaceTask(base.current, task);
              versions.current.set(task.id, task.version);
              if (
                current.path === "/tasks" ||
                current.path.endsWith("/duplicate") ||
                payload.action === "duplicate"
              ) {
                aliases.current.set(temporary, task.id);
                clientIds.current.set(task.id, temporary);
              }
            } else if ("id" in item) {
              const parts = current.path.split("/");
              const kind = (parts[3] ?? "workspaces") as
                | "workspaces"
                | "sections"
                | "statuses"
                | "labels";
              const rows = base.current[kind] as { id: string }[];
              if (rows) {
                base.current = {
                  ...base.current,
                  [kind]: [
                    ...rows.filter(
                      (row) => row.id !== job.temporaryId && row.id !== item.id,
                    ),
                    item,
                  ],
                };
                aliases.current.set(job.temporaryId, item.id);
                if (current.method === "POST")
                  clientIds.current.set(item.id, job.temporaryId);
              }
            }
          }
        }
        pending.current = pending.current.filter((item) => item !== job);
        reconciling.current = true;
        publish();
        // Moves and metadata changes can touch other tasks' positions/versions.
        if (
          current.path.includes("/move") ||
          payload.action === "move" ||
          (current.path.startsWith("/workspaces") &&
            !current.path.endsWith("/view"))
        ) {
          const before = base.current;
          try {
            const next = await readData(
              signal,
              Object.keys(base.current?.views ?? {}),
            );
            for (const task of next.tasks) {
              const old = before.tasks.find((t) => t.id === task.id);
              if (old && task.version !== old.version) {
                const content = (t: Task) =>
                  JSON.stringify({
                    ...t,
                    position: 0,
                    version: 0,
                    updated_at: "",
                  });
                if (content(task) === content(old))
                  versions.current.set(task.id, task.version);
              }
            }
            acceptSnapshot(next);
          } catch (error) {
            fail(
              { ...job, temporaryId: crypto.randomUUID(), recover: undefined },
              error,
            );
          }
        }
        if (
          current.path.startsWith("/tasks/") &&
          (payload.action === "archive" || payload.archived === true)
        )
          setArchived((Array.isArray(result) ? result : [result]) as Task[]);
        if (
          current.path.startsWith("/tasks/") &&
          (payload.action === "restore" || payload.archived === false)
        )
          setArchived([]);
        if (job.message) setNotice(job.message);
        job.success?.(result);
      } catch (error) {
        fail(job, error);
        const affected = new Set([
          ...(current.path.startsWith("/tasks/") && taskId !== "bulk"
            ? [taskId]
            : []),
          job.temporaryId,
          ...((payload.tasks as { id: string }[] | undefined) ?? []).map(
            (_, index) => `${job.temporaryId}:${index}`,
          ),
          ...((payload.tasks as { id: string }[] | undefined) ?? []).map(
            (t) => t.id,
          ),
        ]);
        // Dependent intentions cannot safely continue after a rejected/uncertain write.
        pending.current = pending.current.filter((later) => {
          if (later === job) return true;
          const references = JSON.stringify([later.path, later.body]);
          if (![...affected].some((id) => id && references.includes(id)))
            return true;
          fail(later, new Error(tr("dependent_action_cancelled")));
          affected.add(later.temporaryId);
          return false;
        });
        pending.current = pending.current.filter((item) => item !== job);
        reconciling.current = true;
        publish();
        for (const id of affected) versions.current.delete(id);
        if (!(error instanceof ApiError && [401, 403].includes(error.status))) {
          try {
            acceptSnapshot(
              await readData(signal, Object.keys(base.current?.views ?? {})),
            );
          } catch {
            /* Keep the last acknowledged snapshot and the visible error. */
          }
        }
      } finally {
        reconciling.current = false;
        pending.current = pending.current.filter((item) => item !== job);
        publish();
      }
    });
  }
  return (
    <Context.Provider
      value={{
        data,
        pending: pendingCount,
        flashes: new Set(
          [...flashes].map((id) => aliases.current.get(id) ?? id),
        ),
        failures,
        notice,
        dismissNotice: () => {
          setNotice("");
          setArchived([]);
        },
        canUndoArchive: archived.length > 0,
        undoArchive: () =>
          mutate(
            "/tasks/bulk",
            "POST",
            {
              action: "restore",
              tasks: archived.map((t) => ({
                id: t.id,
                expected_version: t.version,
              })),
            },
            { message: tr("restored_selection") },
          ),
        recovery,
        recoverTask: (task, changes) => {
          const saved = base.current?.tasks.find(
            (item) => item.id === task?.id,
          );
          setRecovery(
            task
              ? saved
                ? {
                    ...saved,
                    ...(changes ?? task),
                    version: saved.version,
                    recoveryBase: saved,
                  }
                : task
              : null,
          );
        },
        dismiss: (id) =>
          setFailures((previous) => previous.filter((f) => f.id !== id)),
        refresh,
        ensureSpace,
        canonicalId: (id) => aliases.current.get(id) ?? id,
        keyFor: (id) => clientIds.current.get(id) ?? id,
        mutate,
        idle,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function SyncFeedback({ inDialog = false }: { inDialog?: boolean }) {
  const sync = useTaskSync();
  return (
    <div className="task-sync-feedback">
      <p
        className={inDialog ? "task-sync-dialog-status" : "task-sync-status"}
        role="status"
        data-pending={sync.pending}
      >
        {(sync.pending > 0 || sync.notice) && (
          <span>
            {sync.pending
              ? tr("sync_pending", { count: sync.pending })
              : sync.notice}
          </span>
        )}
        {!inDialog && !sync.pending && sync.notice && (
          <button
            className="icon-button"
            aria-label={tr("close_message")}
            onClick={sync.dismissNotice}
          >
            <Icon name="x" size={14} />
          </button>
        )}
        {sync.canUndoArchive && (
          <button className="text-button" onClick={sync.undoArchive}>
            {tr("undo_archive")}
          </button>
        )}
      </p>
      {sync.failures.map((failure) => (
        <div className="task-sync-error" key={failure.id}>
          <p role="alert">{failure.message}</p>
          {failure.recover && (
            <button
              className="text-button"
              onClick={() => {
                failure.recover?.();
                sync.dismiss(failure.id);
              }}
            >
              {tr("resume_input")}
            </button>
          )}
          <button
            className="text-button"
            onClick={() => {
              void sync.refresh();
              sync.dismiss(failure.id);
            }}
          >
            {tr("reload_tasks")}
          </button>
        </div>
      ))}
    </div>
  );
}
