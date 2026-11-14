import { useCallback, useEffect, useRef, useState } from "react";
import { allTasks } from "./api";
import { api } from "../../platform/api";
import { useSession } from "../../platform/auth/SessionProvider";
import { AccountMenu } from "../../platform/auth/AccountMenu";
import { relativeDate, useLocalToday } from "./dates";
import { AgendaView } from "./components/AgendaView";
import { TaskActions } from "./components/TaskActions";
import {
  defaultView,
  type Label,
  type Section,
  type Schedule,
  type Status,
  type Task,
  type ViewSettings,
  type Workspace,
} from "./types";
import { Dialog, ErrorMessage } from "../../shared/ui/Dialog";
import { Icon } from "../../shared/ui/Icon";
import { MoveDialog } from "./components/MoveDialog";
import { TaskEditor } from "./components/TaskEditor";
import { TaskViews, type Destination } from "./components/TaskViews";
import { WorkspaceDialog } from "./components/WorkspaceDialog";
import {
  WorkspaceSettings,
  type SettingsTab,
} from "./components/WorkspaceSettings";
import { workspaceTree } from "./workspaceTree";
import "./styles.css";

export function Page() {
  const today = useLocalToday();
  const [agenda, setAgenda] = useState(
    !new URLSearchParams(window.location.search).has("space"),
  );
  const { session } = useSession();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [archivedSpaces, setArchivedSpaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState(
    new URLSearchParams(window.location.search).get("space") ?? "",
  );
  const [sections, setSections] = useState<Section[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<ViewSettings>(defaultView);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [spacesLoading, setSpacesLoading] = useState(true);
  const sessionEpoch = useRef(0);
  const [taskLoading, setTaskLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [undoTask, setUndoTask] = useState<Task | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showDisplay, setShowDisplay] = useState(false);
  const [createSpace, setCreateSpace] = useState(false);
  const [manageSpaces, setManageSpaces] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [editor, setEditor] = useState<Task | "new" | null>(null);
  const [moving, setMoving] = useState<Task | null>(null);
  const [reloadTasks, setReloadTasks] = useState(0);
  const focusSearch = useRef(false);
  const selectedRef = useRef(workspaceId);
  const viewRef = useRef(view);
  const viewWrites = useRef<Promise<unknown>>(Promise.resolve());
  selectedRef.current = workspaceId;
  const spaceTree = workspaceTree(workspaces);
  const archivedTree = workspaceTree([...workspaces, ...archivedSpaces]).filter(
    ({ space }) => space.archived_at,
  );
  const workspace = workspaces.find((space) => space.id === workspaceId);

  useEffect(() => {
    if (!sidebarOpen || !matchMedia("(max-width: 800px)").matches) return;
    const sidebar = sidebarRef.current;
    const main = mainRef.current;
    if (!sidebar || !main) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    main.inert = true;
    sidebar.setAttribute("role", "dialog");
    sidebar.setAttribute("aria-modal", "true");
    sidebar.querySelector<HTMLElement>("button.mobile-only")?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || document.querySelector("dialog[open]")) return;
      const items = Array.from(
        sidebar.querySelectorAll<HTMLElement>(
          "button:not(:disabled), a[href], select",
        ),
      ).filter((item) => item.getClientRects().length);
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        items.at(-1)?.focus();
      } else if (!event.shiftKey && index === items.length - 1) {
        event.preventDefault();
        items[0]?.focus();
      }
    };
    const resize = () => {
      if (innerWidth > 800) setSidebarOpen(false);
    };
    window.addEventListener("keydown", trap);
    window.addEventListener("resize", resize);
    return () => {
      document.body.style.overflow = overflow;
      main.inert = false;
      sidebar.removeAttribute("role");
      sidebar.removeAttribute("aria-modal");
      window.removeEventListener("keydown", trap);
      window.removeEventListener("resize", resize);
      if (!document.querySelector("dialog[open]"))
        previous?.focus({ preventScroll: true });
    };
  }, [sidebarOpen]);

  useEffect(() => {
    document.title = "Tâches · LifeOS";
    return () => {
      sessionEpoch.current += 1;
    };
  }, []);

  const loadWorkspaces = useCallback(async (preferId?: string) => {
    const epoch = sessionEpoch.current;
    const [active, archived] = await Promise.all([
      api<Workspace[]>("/workspaces"),
      api<Workspace[]>("/workspaces?archived=true"),
    ]);
    if (epoch !== sessionEpoch.current) return;
    setWorkspaces(active);
    setArchivedSpaces(archived);
    const selected = preferId ?? selectedRef.current;
    setWorkspaceId(
      active.some((space) => space.id === selected)
        ? selected
        : (active[0]?.id ?? ""),
    );
  }, []);
  useEffect(() => {
    if (!session) return;
    setSpacesLoading(true);
    loadWorkspaces()
      .catch((error) => setError(error.message))
      .finally(() => setSpacesLoading(false));
  }, [session?.user_id, loadWorkspaces]);

  const loadSpace = useCallback(async (id: string, signal?: AbortSignal) => {
    await viewWrites.current;
    const base = `/workspaces/${id}`;
    const [activeSections, archivedSections, statuses, labels, savedView] =
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
    if (selectedRef.current !== id || signal?.aborted) return;
    setSections(
      [...activeSections, ...archivedSections].sort(
        (a, b) => a.position - b.position,
      ),
    );
    setStatuses(statuses);
    setLabels(labels);
    setView(savedView);
    viewRef.current = savedView;
    setSearch(savedView.search);
  }, []);
  useEffect(() => {
    if (!session) return;
    if (agenda) {
      setLoading(false);
      setTaskLoading(false);
      window.history.replaceState(null, "", "/tasks?view=agenda");
      return;
    }
    if (!workspaceId) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setTasks([]);
    setSections([]);
    setStatuses([]);
    setLabels([]);
    window.history.replaceState(
      null,
      "",
      `/tasks?space=${encodeURIComponent(workspaceId)}`,
    );
    loadSpace(workspaceId, controller.signal)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [workspaceId, session?.user_id, loadSpace, agenda]);
  useEffect(() => {
    if (!session || agenda || !workspaceId || loading || !statuses.length)
      return;
    const controller = new AbortController();
    setTaskLoading(true);
    allTasks(workspaceId, view, false, controller.signal, today)
      .then((page) => {
        if (!controller.signal.aborted) setTasks(page.items);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setError(error.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setTaskLoading(false);
      });
    return () => controller.abort();
  }, [
    workspaceId,
    agenda,
    today,
    view,
    reloadTasks,
    loading,
    statuses.length,
    session?.user_id,
  ]);

  const changeView = useCallback(
    (patch: Partial<ViewSettings>) => {
      const id = selectedRef.current;
      if (!id || loading || spacesLoading) return;
      const next = { ...viewRef.current, ...patch };
      viewRef.current = next;
      setView(next);
      viewWrites.current = viewWrites.current
        .then(() => api(`/workspaces/${id}/view`, "PUT", next))
        .catch((error) =>
          setError(`Réglages non enregistrés : ${error.message}`),
        );
    },
    [loading, spacesLoading],
  );
  useEffect(() => {
    if (agenda || !workspaceId || loading || search === viewRef.current.search)
      return;
    const timer = setTimeout(() => changeView({ search }), 300);
    return () => clearTimeout(timer);
  }, [search, workspaceId, loading, changeView, agenda]);
  useEffect(() => {
    if (!agenda && !loading && focusSearch.current) {
      const field = document.getElementById("task-search");
      if (field) {
        field.focus();
        focusSearch.current = false;
      }
    }
  }, [agenda, loading]);
  function searchTasks() {
    focusSearch.current = true;
    setAgenda(false);
    setSidebarOpen(false);
    const field = document.getElementById("task-search");
    if (field) {
      field.focus();
      focusSearch.current = false;
    }
  }
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchTasks();
      }
      if (event.key === "Escape") {
        setSidebarOpen(false);
        setShowFilters(false);
        setShowDisplay(false);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  async function refreshEntities() {
    setTaskLoading(true);
    try {
      await Promise.all([loadWorkspaces(), loadSpace(selectedRef.current)]);
    } finally {
      setReloadTasks((value) => value + 1);
    }
  }
  async function action(
    run: () => Promise<unknown>,
    message: string | (() => string),
  ) {
    setBusy(true);
    setTaskLoading(true);
    setError("");
    setNotice("");
    setUndoTask(null);
    try {
      await run();
      setTaskLoading(true);
      setReloadTasks((value) => value + 1);
      setNotice(typeof message === "function" ? message() : message);
    } catch (error) {
      setError((error as Error).message);
      setTaskLoading(true);
      setReloadTasks((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }
  async function complete(task: Task) {
    let saved: Task;
    await action(
      async () => {
        saved = await api<Task>(
          `/tasks/${task.id}/${task.completed_at ? "reopen" : "complete"}`,
          "POST",
          { expected_version: task.version },
        );
        setUndoTask(task.completed_at ? null : saved);
      },
      () =>
        task.completed_at
          ? "Tâche rouverte."
          : saved.recurrence && !saved.completed_at
            ? `Occurrence terminée. Prochaine : ${relativeDate(saved.due_date!, today).full}.`
            : saved.recurrence
              ? "Dernière occurrence terminée."
              : "Un pas de plus. Tâche terminée.",
    );
  }
  async function move(task: Task, destination: Destination) {
    await action(
      () =>
        api(`/tasks/${task.id}/move`, "POST", {
          ...destination,
          status_id: destination.status_id ?? task.status_id,
          workspace_id: task.workspace_id,
          expected_version: task.version,
        }),
      "Tâche déplacée.",
    );
  }
  async function quickAdd(
    title: string,
    sectionId: string | null,
    statusId: string,
    schedule?: Schedule,
  ) {
    await api("/tasks", "POST", {
      workspace_id: workspaceId,
      title,
      section_id: sectionId,
      status_id: statusId,
      ...(schedule
        ? { due_date: schedule.due_date, recurrence: schedule.recurrence }
        : {}),
    });
    setTaskLoading(true);
    setReloadTasks((value) => value + 1);
    setNotice("Tâche ajoutée.");
  }
  async function orderSpaces(space: Workspace, delta: number) {
    const siblings = workspaces.filter(
      (item) => item.parent_id === space.parent_id,
    );
    const siblingIndex = siblings.findIndex((item) => item.id === space.id);
    const other = siblings[siblingIndex + delta];
    if (!other) return;
    const ids = workspaces.map((item) => item.id);
    const index = ids.indexOf(space.id);
    const otherIndex = ids.indexOf(other.id);
    [ids[index], ids[otherIndex]] = [ids[otherIndex], ids[index]];
    await action(async () => {
      await api("/workspaces/order", "PUT", {
        ids: [...ids, ...archivedSpaces.map((space) => space.id)],
      });
      await loadWorkspaces();
    }, "Ordre des espaces enregistré.");
  }
  function savedTask() {
    setEditor(null);
    setMoving(null);
    setTaskLoading(true);
    setReloadTasks((value) => value + 1);
    setNotice("Tâche enregistrée.");
  }

  const visibleTasks = tasks.filter(
    (task) =>
      !task.section_id ||
      sections.some(
        (section) =>
          section.id === task.section_id &&
          (section.visibility === "both" || section.visibility === view.layout),
      ),
  );
  const hiddenCount = tasks.length - visibleTasks.length;
  const hasFilters =
    !!view.search ||
    !!view.status_id ||
    !!view.priority ||
    !!view.label_id ||
    view.due !== "all" ||
    !view.show_completed;
  return (
    <div
      className={`ui-scope tasks-shell ${sidebarOpen ? "sidebar-open" : ""}`}
    >
      <a href="#tasks-content" className="skip-link">
        Aller aux tâches
      </a>
      {sidebarOpen && (
        <button
          className="mobile-scrim"
          onClick={() => setSidebarOpen(false)}
          aria-label="Fermer la navigation"
        />
      )}
      <aside
        ref={sidebarRef}
        className="task-sidebar"
        aria-label="Navigation des tâches"
      >
        <div className="sidebar-top">
          <a href="/" className="app-brand">
            <span className="app-brand-icon">
              <Icon name="check" size={22} />
            </span>
            LifeOS<span className="brand-period">.</span>
          </a>
          <button
            className="icon-button mobile-only"
            aria-label="Fermer la navigation"
            onClick={() => setSidebarOpen(false)}
          >
            <Icon name="x" />
          </button>
        </div>
        <button
          className="sidebar-add"
          disabled={!workspace || loading}
          onClick={() => {
            setAgenda(false);
            setEditor("new");
            setSidebarOpen(false);
          }}
        >
          <span>
            <Icon name="plus" size={17} />
          </span>
          Ajouter une tâche
        </button>
        <button className="sidebar-search" onClick={searchTasks}>
          <Icon name="search" />
          Rechercher<kbd>⌘ K</kbd>
        </button>
        <button
          className={`workspace-link agenda-link ${agenda ? "is-active" : ""}`}
          aria-current={agenda ? "page" : undefined}
          onClick={() => {
            setAgenda(true);
            setSidebarOpen(false);
            setNotice("");
            setError("");
          }}
        >
          <Icon name="calendar" size={18} />
          <span>À venir</span>
        </button>
        <div className="sidebar-divider" />
        <div className="sidebar-label">
          <span>MES ESPACES</span>
          <button
            className="icon-button"
            aria-label="Gérer et réordonner les espaces"
            onClick={() => {
              setSidebarOpen(false);
              setManageSpaces(true);
            }}
          >
            <Icon name="settings" size={15} />
          </button>
        </div>
        <nav className="workspace-nav" aria-label="Espaces">
          {spaceTree.map(({ space, depth, path }) => (
            <button
              key={space.id}
              style={{ paddingInlineStart: 12 + Math.min(depth, 6) * 16 }}
              title={path}
              aria-label={depth ? `# ${path}` : undefined}
              className={`workspace-link ${!agenda && workspaceId === space.id ? "is-active" : ""}`}
              aria-current={
                !agenda && workspaceId === space.id ? "page" : undefined
              }
              onClick={() => {
                setAgenda(false);
                setWorkspaceId(space.id);
                setSidebarOpen(false);
              }}
            >
              <span className="workspace-symbol" style={{ color: space.color }}>
                #
              </span>
              <span>{space.name}</span>
              {!agenda && workspaceId === space.id && (
                <Icon name="chevron" size={14} />
              )}
            </button>
          ))}
        </nav>
        <button
          className="sidebar-new-space"
          onClick={() => {
            setSidebarOpen(false);
            setCreateSpace(true);
          }}
        >
          <Icon name="plus" size={16} />
          Nouvel espace
        </button>
        <div className="sidebar-bottom">
          <a href="/applications" className="sidebar-subtle">
            <Icon name="grid" size={17} />
            Bibliothèque des applications
          </a>
          <a href="/documentation/" className="sidebar-subtle">
            <Icon name="info" size={17} />
            Guide et documentation
            <Icon name="arrow" size={14} />
          </a>
          <button
            className="sidebar-subtle"
            onClick={() => {
              setSidebarOpen(false);
              setManageSpaces(true);
            }}
          >
            <Icon name="archive" size={17} />
            Archives des espaces
          </button>
          <AccountMenu
            disabled={busy}
            beforeLogout={() => viewWrites.current.then(() => {})}
          />
        </div>
      </aside>
      <main
        ref={mainRef}
        className="tasks-main"
        id="tasks-content"
        tabIndex={-1}
      >
        <header className="task-topbar">
          <div className="task-breadcrumb">
            <button
              className="icon-button mobile-only"
              aria-label="Ouvrir la navigation"
              onClick={() => setSidebarOpen(true)}
            >
              <Icon name="menu" />
            </button>
            <span>{agenda ? "Mes tâches" : "Mes espaces"}</span>
            <Icon name="chevron" size={12} />
            <strong>
              {agenda
                ? "À venir"
                : (spaceTree.find(({ space }) => space.id === workspaceId)
                    ?.path ?? "Bienvenue")}
            </strong>
          </div>
          <span className="topbar-date">
            {new Date().toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </span>
        </header>
        <div className="task-page-content">
          <ErrorMessage message={error} />
          {error && !agenda && statuses.length > 0 && (
            <button
              className="text-button"
              disabled={busy || loading || taskLoading}
              onClick={() => {
                setError("");
                setReloadTasks((value) => value + 1);
              }}
            >
              Réessayer
            </button>
          )}
          {notice && (
            <p className="notice" role="status">
              <Icon name="check" size={14} />
              {notice}
              {undoTask && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    action(
                      () =>
                        api(`/tasks/${undoTask.id}/undo-complete`, "POST", {
                          expected_version: undoTask.version,
                        }),
                      "Résolution annulée. L’échéance précédente est restaurée.",
                    )
                  }
                >
                  Annuler la résolution
                </button>
              )}
              <button
                className="icon-button"
                onClick={() => setNotice("")}
                aria-label="Fermer le message"
              >
                <Icon name="x" size={12} />
              </button>
            </p>
          )}
          {agenda ? (
            spacesLoading ? (
              <p role="status">Chargement des espaces…</p>
            ) : (
              <AgendaView
                key={session.user_id}
                workspaces={workspaces}
                today={today}
                writes={viewWrites}
                onWorkspace={(id) => {
                  setWorkspaceId(id);
                  setAgenda(false);
                }}
              />
            )
          ) : !workspace ? (
            <section className="empty-workspace">
              <span className="empty-symbol">
                <Icon name="folder" size={32} />
              </span>
              <p className="eyebrow">VOTRE PROCHAIN CHAPITRE</p>
              <h1>Faites de la place à vos idées.</h1>
              <p className="muted">
                Créez un espace, organisez vos tâches et avancez une chose à la
                fois.
              </p>
              <button
                className="primary-button"
                onClick={() => {
                  setSidebarOpen(false);
                  setCreateSpace(true);
                }}
              >
                <Icon name="plus" />
                Créer mon premier espace
              </button>
              {spacesLoading && <p role="status">Chargement…</p>}
            </section>
          ) : (
            <>
              <div className="workspace-heading">
                <div>
                  <p className="eyebrow">VOTRE ESPACE, VOTRE RYTHME</p>
                  <h1>
                    <span
                      className="heading-hash"
                      style={{ color: workspace.color }}
                    >
                      #
                    </span>
                    {workspace.name}
                  </h1>
                  <p className="workspace-description">
                    {workspace.description ||
                      "Un peu d’ordre pour garder l’essentiel en vue."}
                  </p>
                </div>
                <button
                  className="icon-button workspace-config"
                  aria-label="Configurer l’espace"
                  disabled={loading}
                  onClick={() => setSettingsTab("space")}
                >
                  <Icon name="more" size={22} />
                </button>
              </div>
              <div className="task-toolbar">
                <div className="view-switch" aria-label="Vue des tâches">
                  <button
                    disabled={loading}
                    aria-pressed={view.layout === "list"}
                    onClick={() => changeView({ layout: "list" })}
                  >
                    <Icon name="list" size={16} />
                    Liste
                  </button>
                  <button
                    disabled={loading}
                    aria-pressed={view.layout === "board"}
                    onClick={() => changeView({ layout: "board" })}
                  >
                    <Icon name="board" size={16} />
                    Tableau
                  </button>
                </div>
                <div className="toolbar-actions">
                  <div className="task-search-field">
                    <Icon name="search" size={16} />
                    <input
                      id="task-search"
                      disabled={loading}
                      aria-label="Rechercher des tâches"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Rechercher…"
                      maxLength={500}
                    />
                  </div>
                  <button
                    className={`toolbar-button ${showFilters || hasFilters ? "is-selected" : ""}`}
                    aria-expanded={showFilters}
                    onClick={() => {
                      setShowFilters((value) => !value);
                      setShowDisplay(false);
                    }}
                  >
                    <Icon name="settings" size={16} />
                    <span>Filtres</span>
                    {hasFilters && <span className="filter-dot" />}
                  </button>
                  <button
                    className="toolbar-button"
                    aria-expanded={showDisplay}
                    onClick={() => {
                      setShowDisplay((value) => !value);
                      setShowFilters(false);
                    }}
                  >
                    <Icon name="more" size={18} />
                    <span>Afficher</span>
                  </button>
                </div>
              </div>
              {showFilters && (
                <div className="filter-panel">
                  <label>
                    Statut
                    <select
                      value={view.status_id ?? ""}
                      onChange={(event) =>
                        changeView({ status_id: event.target.value || null })
                      }
                    >
                      <option value="">Tous les statuts</option>
                      {statuses.map((status) => (
                        <option key={status.id} value={status.id}>
                          {status.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Priorité
                    <select
                      value={view.priority ?? ""}
                      onChange={(event) =>
                        changeView({
                          priority: event.target.value
                            ? Number(event.target.value)
                            : null,
                        })
                      }
                    >
                      <option value="">Toutes les priorités</option>
                      {[1, 2, 3, 4].map((value) => (
                        <option key={value} value={value}>
                          Priorité {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Étiquette
                    <select
                      value={view.label_id ?? ""}
                      onChange={(event) =>
                        changeView({ label_id: event.target.value || null })
                      }
                    >
                      <option value="">Toutes les étiquettes</option>
                      {labels.map((label) => (
                        <option key={label.id} value={label.id}>
                          {label.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Échéance
                    <select
                      value={view.due}
                      onChange={(event) =>
                        changeView({
                          due: event.target.value as ViewSettings["due"],
                        })
                      }
                    >
                      <option value="all">Toutes les dates</option>
                      <option value="overdue">En retard</option>
                      <option value="today">Aujourd’hui</option>
                      <option value="upcoming">À venir</option>
                      <option value="none">Sans échéance</option>
                    </select>
                  </label>
                  <button
                    className="text-button"
                    onClick={() => {
                      setSearch("");
                      changeView({
                        search: "",
                        status_id: null,
                        priority: null,
                        label_id: null,
                        due: "all",
                        show_completed: true,
                      });
                    }}
                  >
                    Effacer les filtres
                  </button>
                </div>
              )}
              {showDisplay && (
                <div className="filter-panel display-panel">
                  <label>
                    Trier par
                    <select
                      value={view.sort}
                      onChange={(event) =>
                        changeView({
                          sort: event.target.value as ViewSettings["sort"],
                        })
                      }
                    >
                      <option value="manual">Ordre manuel</option>
                      <option value="priority">Priorité</option>
                      <option value="due_date">Échéance</option>
                    </select>
                  </label>
                  <label>
                    Densité
                    <select
                      value={view.density}
                      onChange={(event) =>
                        changeView({
                          density: event.target
                            .value as ViewSettings["density"],
                        })
                      }
                    >
                      <option value="comfortable">Confortable</option>
                      <option value="compact">Compacte</option>
                    </select>
                  </label>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={view.show_completed}
                      onChange={(event) =>
                        changeView({ show_completed: event.target.checked })
                      }
                    />
                    Afficher les tâches terminées
                  </label>
                  <button
                    className="text-button"
                    onClick={() => setSettingsTab("sections")}
                  >
                    Configurer les sections et colonnes
                    <Icon name="arrow" size={14} />
                  </button>
                </div>
              )}
              <div className="task-summary">
                <span>
                  {loading || taskLoading
                    ? "Chargement des tâches…"
                    : `${visibleTasks.length} ${hasFilters ? "résultat" : "tâche"}${visibleTasks.length > 1 ? "s" : ""}`}
                  <span className="summary-dot">·</span>
                  {visibleTasks.filter((task) => task.completed_at).length}{" "}
                  terminée
                  {visibleTasks.filter((task) => task.completed_at).length > 1
                    ? "s"
                    : ""}
                </span>
                <button
                  className="text-button"
                  disabled={loading}
                  onClick={() => setEditor("new")}
                >
                  <Icon name="plus" size={15} />
                  Nouvelle tâche
                </button>
              </div>
              {hiddenCount > 0 && !loading && (
                <p className="sort-hint">
                  {hiddenCount} tâche{hiddenCount > 1 ? "s" : ""} dans des
                  sections masquées pour cette vue.{" "}
                  <button
                    className="text-button"
                    onClick={() => setSettingsTab("sections")}
                  >
                    Configurer les sections
                  </button>
                </p>
              )}
              {view.sort !== "manual" && (
                <p className="sort-hint">
                  Le tri automatique est actif.{" "}
                  <button
                    className="text-button"
                    onClick={() => changeView({ sort: "manual" })}
                  >
                    Passer à l’ordre manuel
                  </button>{" "}
                  pour utiliser le glisser-déposer.
                </p>
              )}
              {hasFilters && !taskLoading && tasks.length === 0 && (
                <p className="empty-filter">
                  Aucune tâche ne correspond à ces filtres.
                </p>
              )}
              {loading || !statuses.length ? (
                <div
                  className="task-skeleton"
                  role="status"
                  aria-label="Chargement de l’espace"
                >
                  <span />
                  <span />
                  <span />
                </div>
              ) : (
                <TaskActions
                  key={`${workspaceId}:${JSON.stringify(view)}`}
                  tasks={visibleTasks}
                  workspaces={workspaces}
                  today={today}
                  busy={busy || taskLoading}
                  onEdit={setEditor}
                  onRefresh={(message) => {
                    if (message) {
                      setNotice(message);
                      setUndoTask(null);
                    }
                    void refreshEntities().catch((error) =>
                      setError(error.message),
                    );
                  }}
                >
                  <TaskViews
                    tasks={tasks}
                    today={today}
                    sections={sections.filter(
                      (section) => !section.archived_at,
                    )}
                    statuses={statuses}
                    labels={labels}
                    view={view}
                    busy={busy || taskLoading}
                    onOpen={setEditor}
                    onComplete={complete}
                    onMove={move}
                    onAdd={quickAdd}
                    onConfigure={() => setSettingsTab("sections")}
                  />
                </TaskActions>
              )}
            </>
          )}
        </div>
      </main>
      {createSpace && (
        <WorkspaceDialog
          workspaces={workspaces}
          onClose={() => setCreateSpace(false)}
          onCreated={(space) => {
            setCreateSpace(false);
            setAgenda(false);
            void loadWorkspaces(space.id).catch((error) =>
              setError(error.message),
            );
          }}
        />
      )}
      {workspace && settingsTab && (
        <WorkspaceSettings
          workspace={workspace}
          workspaces={workspaces}
          sections={sections}
          statuses={statuses}
          labels={labels}
          initialTab={settingsTab}
          onClose={() => setSettingsTab(null)}
          onChanged={refreshEntities}
          onArchived={() => {
            setSettingsTab(null);
            void loadWorkspaces().catch((error) => setError(error.message));
          }}
        />
      )}
      {!agenda && !loading && statuses.length > 0 && workspace && editor && (
        <TaskEditor
          key={editor === "new" ? "new" : `${editor.id}:${editor.version}`}
          task={editor === "new" ? undefined : editor}
          workspace={workspace}
          sections={sections.filter((section) => !section.archived_at)}
          statuses={statuses}
          labels={labels}
          onClose={() => setEditor(null)}
          onSaved={savedTask}
          onMove={(task) => {
            setEditor(null);
            setMoving(task);
          }}
          onReload={setEditor}
        />
      )}
      {moving && (
        <MoveDialog
          task={moving}
          workspaces={workspaces}
          onClose={() => setMoving(null)}
          onSaved={savedTask}
        />
      )}
      {manageSpaces && (
        <Dialog title="Mes espaces" onClose={() => setManageSpaces(false)}>
          <div className="dialog-body space-management">
            <h3>Ordre des espaces</h3>
            <p className="muted small-text">
              Les flèches changent l’ordre des espaces ayant le même parent.
            </p>
            {spaceTree.map(({ space, depth, path }) => (
              <div
                className="archive-row"
                key={space.id}
                style={{ paddingInlineStart: Math.min(depth, 6) * 16 }}
                title={path}
              >
                <span>
                  <span
                    className="color-dot"
                    style={{ background: space.color }}
                  />
                  {space.name}
                </span>
                <div>
                  <button
                    className="icon-button"
                    disabled={
                      busy ||
                      workspaces.filter(
                        (item) => item.parent_id === space.parent_id,
                      )[0]?.id === space.id
                    }
                    aria-label={`Monter ${space.name}`}
                    onClick={() => orderSpaces(space, -1)}
                  >
                    <Icon name="up" />
                  </button>
                  <button
                    className="icon-button"
                    disabled={
                      busy ||
                      workspaces
                        .filter((item) => item.parent_id === space.parent_id)
                        .at(-1)?.id === space.id
                    }
                    aria-label={`Descendre ${space.name}`}
                    onClick={() => orderSpaces(space, 1)}
                  >
                    <Icon name="down" />
                  </button>
                </div>
              </div>
            ))}
            <h3>Espaces archivés</h3>
            {!archivedSpaces.length && (
              <p className="muted">Aucun espace archivé.</p>
            )}
            {archivedTree.map(({ space, path }) => (
              <div className="archive-row" key={space.id}>
                <span>
                  {path}
                  {archivedSpaces.some(
                    (item) => item.id === space.parent_id,
                  ) && (
                    <small className="muted">
                      Restaurez d’abord son espace parent.
                    </small>
                  )}
                </span>
                <button
                  className="secondary-button small-button"
                  disabled={
                    busy ||
                    archivedSpaces.some((item) => item.id === space.parent_id)
                  }
                  onClick={() =>
                    action(async () => {
                      await api(`/workspaces/${space.id}`, "PATCH", {
                        archived: false,
                      });
                      await loadWorkspaces();
                    }, "Espace restauré.")
                  }
                >
                  <Icon name="restore" size={14} />
                  Restaurer
                </button>
              </div>
            ))}
            <ErrorMessage message={error} />
          </div>
        </Dialog>
      )}
    </div>
  );
}
