import { ProgressionBadge } from "../../platform/progression/ProgressionBadge";
import { tr } from "./i18n";
import { tr as common } from "../../shared/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "../../platform/auth/SessionProvider";
import { ApplicationFooter } from "../../platform/auth/ApplicationFooter";
import {
  ApplicationSidebar,
  ApplicationTopbar,
} from "../../shared/ui/ApplicationNavigation";
import { useLocalToday } from "./dates";
import { AgendaView } from "./components/AgendaView";
import { TaskActions } from "./components/TaskActions";
import {
  defaultView,
  type Schedule,
  type Task,
  type ViewSettings,
  type Workspace,
} from "./types";
import { Dialog } from "../../shared/ui/Dialog";
import { Icon } from "../../shared/ui/Icon";
import { MoveDialog } from "./components/MoveDialog";
import { TaskEditor } from "./components/TaskEditor";
import { TaskViews } from "./components/TaskViews";
import {
  TaskDragProvider,
  WorkspaceDropLink,
  type Destination,
} from "./components/TaskDragProvider";
import { WorkspaceDialog } from "./components/WorkspaceDialog";
import {
  WorkspaceSettings,
  type SettingsTab,
} from "./components/WorkspaceSettings";
import { workspaceTree } from "./workspaceTree";
import { TaskSyncProvider, SyncFeedback, useTaskSync } from "./useTaskSync";
import { workspaceTasks } from "./optimistic";
import "./styles.css";
import { TaskFilterDisclosure } from "./components/TaskFilterDisclosure";
import { TaskNavigationMore } from "./components/TaskNavigationMore";
import { GlobalTasksView } from "./components/GlobalTasksView";
import { useTaskNavigation, type TaskLocation } from "./useTaskNavigation";
import { useTaskCompletion, CompletionNotice } from "./useTaskCompletion";
import { TaskDraftProvider, useTaskDrafts } from "./useTaskDrafts";

export function Page() {
  return (
    <TaskDraftProvider>
      <TaskSyncProvider>
        <TasksPage />
      </TaskSyncProvider>
    </TaskDraftProvider>
  );
}

function TasksPage() {
  const sync = useTaskSync();
  const drafts = useTaskDrafts();
  const today = useLocalToday();
  const navigation = useTaskNavigation();
  const { view: locationView, space: workspaceId } = navigation.route;
  const agenda = locationView === "agenda";
  const global = locationView !== "agenda" && locationView !== "space";
  const { session } = useSession();
  const completion = useTaskCompletion(today);
  const [chooseWorkspace, setChooseWorkspace] = useState(false);
  function navigate(view: TaskLocation, id = "") {
    if (!navigation.navigate(view, id)) return false;
    sync.dismissNotice();
    setSidebarOpen(false);
    setEditor(null);
    setMoving(null);
    setShowFilters(false);
    setShowDisplay(false);
    completion.clear();
    return true;
  }
  function createTask() {
    setSidebarOpen(false);
    if (locationView === "space" && workspaceId) setEditor("new");
    else setChooseWorkspace(true);
  }
  const data = sync.data;
  const workspaces =
    data?.workspaces.filter((space) => !space.archived_at) ?? [];
  const archivedSpaces =
    data?.workspaces.filter((space) => space.archived_at) ?? [];
  const sections =
    data?.sections
      .filter((section) => section.workspace_id === workspaceId)
      .sort((a, b) => a.position - b.position) ?? [];
  const statuses =
    data?.statuses
      .filter((status) => status.workspace_id === workspaceId)
      .sort((a, b) => a.position - b.position) ?? [];
  const labels =
    data?.labels.filter((label) => label.workspace_id === workspaceId) ?? [];
  // A saved preference never reveals completed tasks before an explicit choice
  // in this page visit. Keep API synchronization (including rollback) in charge.
  const [completedVisibilityChosen, setCompletedVisibilityChosen] = useState(
    new Set<string>(),
  );
  const savedView = data?.views[workspaceId] ?? defaultView;
  const view = {
    ...savedView,
    show_completed:
      completedVisibilityChosen.has(workspaceId) && savedView.show_completed,
  };
  const tasks = data
    ? workspaceTasks(data, workspaceId, view, today, sync.flashes)
    : [];
  const [search, setSearch] = useState("");
  const loading =
    !data ||
    (locationView === "space" && !!workspaceId && !data.views[workspaceId]);
  const spacesLoading = !data;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showDisplay, setShowDisplay] = useState(false);
  const [createSpace, setCreateSpace] = useState(false);
  const [manageSpaces, setManageSpaces] = useState(false);
  const [targetSection, setTargetSection] = useState<string>();
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(() =>
    new URLSearchParams(location.search).get("settings") === "space"
      ? "space"
      : null,
  );
  const [editor, setEditor] = useState<Task | "new" | null>(null);
  const [moving, setMoving] = useState<Task | null>(null);
  const focusSearch = useRef(false);
  useEffect(() => {
    if (!navigation.route.fromHistory) return;
    sync.dismissNotice();
    completion.clear();
    setEditor(null);
    setMoving(null);
    setSettingsTab(null);
    setChooseWorkspace(false);
    setShowFilters(false);
    setShowDisplay(false);
    setSidebarOpen(false);
  }, [navigation.route]);
  useEffect(() => {
    if (!sync.recovery) return;
    navigate("space", sync.recovery.workspace_id);
    setEditor(sync.recovery);
    sync.recoverTask(null);
  }, [sync.recovery]);

  const spaceTree = workspaceTree(workspaces);
  const archivedTree = workspaceTree([...workspaces, ...archivedSpaces]).filter(
    ({ space }) => space.archived_at,
  );
  const workspace = workspaces.find((space) => space.id === workspaceId);

  useEffect(() => {
    if (!agenda && data && workspaceId) void sync.ensureSpace(workspaceId);
  }, [workspaceId, agenda, !!data]);
  useEffect(() => {
    document.title = tr("tasks_lifeos");
  }, []);
  useEffect(() => {
    setSearch(view.search);
  }, [workspaceId, view.search]);
  const changeView = useCallback(
    (patch: Partial<ViewSettings>) => {
      if (!workspaceId || !data) return;
      if (patch.show_completed !== undefined)
        setCompletedVisibilityChosen((previous) =>
          new Set(previous).add(workspaceId),
        );
      sync.mutate(`/workspaces/${workspaceId}/view`, "PUT", {
        ...view,
        ...patch,
      });
    },
    [workspaceId, data, view, sync.mutate],
  );
  useEffect(() => {
    if (
      locationView !== "space" ||
      !workspaceId ||
      loading ||
      search === view.search
    )
      return;
    const timer = setTimeout(() => changeView({ search }), 300);
    return () => clearTimeout(timer);
  }, [search, workspaceId, loading, changeView, agenda, view.search]);
  useEffect(() => {
    if (
      locationView !== "search" ||
      loading ||
      sidebarOpen ||
      !focusSearch.current
    )
      return;
    const frame = requestAnimationFrame(() => {
      const field = document.getElementById("global-task-search");
      if (field) {
        field.focus();
        focusSearch.current = false;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [locationView, loading, sidebarOpen]);
  function searchTasks() {
    if (locationView === "search") setSidebarOpen(false);
    else if (!navigate("search")) return;
    focusSearch.current = true;
    requestAnimationFrame(() => {
      if (!sidebarOpen) document.getElementById("global-task-search")?.focus();
    });
  }
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k" &&
        !document.querySelector('dialog[open], [role="dialog"]')
      ) {
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
  });

  function move(task: Task, destination: Destination) {
    if ("workspace_id" in destination) {
      sync.mutate(
        "/tasks/bulk",
        "POST",
        {
          action: "move",
          tasks: [{ id: task.id, expected_version: task.version }],
          workspace_id: destination.workspace_id,
          section_id: null,
        },
        { message: tr("task_moved") },
      );
      return;
    }
    sync.mutate(
      `/tasks/${task.id}/move`,
      "POST",
      {
        ...destination,
        status_id: destination.status_id ?? task.status_id,
        workspace_id: task.workspace_id,
        expected_version: task.version,
      },
      { message: tr("task_moved") },
    );
  }
  async function quickAdd(
    title: string,
    sectionId: string | null,
    statusId: string,
    schedule?: Schedule,
  ) {
    sync.mutate(
      "/tasks",
      "POST",
      {
        workspace_id: workspaceId,
        title,
        section_id: sectionId,
        status_id: statusId,
        ...(schedule
          ? { due_date: schedule.due_date, recurrence: schedule.recurrence }
          : {}),
      },
      {
        message: tr("task_added"),
        recover: () =>
          sync.recoverTask({
            id: "draft",
            workspace_id: workspaceId,
            title,
            section_id: sectionId,
            status_id: statusId,
            description: "",
            priority: 4,
            label_ids: [],
            due_date: schedule?.due_date ?? null,
            recurrence: schedule?.recurrence ?? null,
            recurrence_completed: 0,
            position: 0,
            version: 0,
            created_at: "",
            updated_at: "",
            completed_at: null,
            archived_at: null,
          }),
      },
    );
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
    sync.mutate(
      "/workspaces/order",
      "PUT",
      { ids: [...ids, ...archivedSpaces.map((space) => space.id)] },
      { message: tr("workspace_order_saved") },
    );
  }
  function savedTask() {
    setEditor(null);
    setMoving(null);
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
    view.due !== "all";
  return (
    <TaskDragProvider
      key={locationView === "space" ? workspaceId : locationView}
      disabled={locationView !== "space" || loading || view.sort !== "manual"}
      onMove={move}
    >
      <ApplicationSidebar
        name={tr("tasks")}
        icon="check"
        label={tr("task_navigation")}
        mainId="tasks-content"
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        footer={
          <ApplicationFooter
            documentation="taches"
            beforeSessionChange={async () => {
              if (!drafts.confirm()) return false;
              await sync.idle();
            }}
          />
        }
      >
        <button
          className="application-nav-item"
          disabled={!workspaces.length}
          onClick={createTask}
        >
          <Icon name="plus" />
          {tr("add_a_task")}
        </button>
        <button
          className={`application-nav-item workspace-link agenda-link ${agenda ? "is-active" : ""}`}
          aria-current={agenda ? "page" : undefined}
          onClick={() => navigate("agenda")}
        >
          <Icon name="calendar" size={18} />
          <span>{tr("upcoming")}</span>
        </button>
        <button
          className={`application-nav-item sidebar-search ${locationView === "search" ? "is-active" : ""}`}
          aria-current={locationView === "search" ? "page" : undefined}
          onClick={searchTasks}
        >
          <Icon name="search" />
          {tr("search")}
          <kbd>⌘ K</kbd>
        </button>
        <TaskNavigationMore current={locationView} onNavigate={navigate} />
        <a
          className="application-nav-item"
          href="/settings?application=tasks"
          onClick={(event) => {
            if (
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            if (!drafts.confirm()) return;
            void sync
              .idle()
              .then(() =>
                window.location.assign("/settings?application=tasks"),
              );
          }}
        >
          <Icon name="settings" />
          {common("settings")}
        </a>
        <div className="sidebar-divider" />
        <div className="sidebar-label">
          <span>{tr("my_workspaces")}</span>
          <button
            className="icon-button"
            aria-label={tr("manage_and_reorder_workspaces")}
            onClick={() => {
              setSidebarOpen(false);
              setManageSpaces(true);
            }}
          >
            <Icon name="settings" size={15} />
          </button>
        </div>
        <nav className="workspace-nav" aria-label={tr("workspaces")}>
          {spaceTree.map(({ space, depth, path }) => (
            <WorkspaceDropLink
              key={space.id}
              workspaceId={space.id}
              style={{ paddingInlineStart: 12 + Math.min(depth, 6) * 16 }}
              title={path}
              aria-label={depth ? `# ${path}` : undefined}
              className={`application-nav-item workspace-link ${locationView === "space" && workspaceId === space.id ? "is-active" : ""}`}
              aria-current={
                locationView === "space" && workspaceId === space.id
                  ? "page"
                  : undefined
              }
              onClick={() => {
                navigate("space", space.id);
              }}
            >
              <span className="workspace-symbol" style={{ color: space.color }}>
                #
              </span>
              <span>{space.name}</span>
              {locationView === "space" && workspaceId === space.id && (
                <Icon name="chevron" size={14} />
              )}
            </WorkspaceDropLink>
          ))}
        </nav>
        <button
          className="application-nav-item"
          disabled={spacesLoading}
          onClick={() => {
            setSidebarOpen(false);
            setCreateSpace(true);
          }}
        >
          <Icon name="plus" size={16} />
          {tr("new_workspace")}
        </button>
        <button
          className="application-nav-item"
          onClick={() => {
            setSidebarOpen(false);
            setManageSpaces(true);
          }}
        >
          <Icon name="archive" size={17} />
          {tr("workspace_archives")}
        </button>
      </ApplicationSidebar>
      <main className="tasks-main" id="tasks-content" tabIndex={-1}>
        <ApplicationTopbar
          status={<ProgressionBadge applicationId="tasks" />}
          name={tr("tasks")}
          current={
            global
              ? tr(
                  locationView === "search"
                    ? "global_search"
                    : locationView === "all"
                      ? "all_tasks"
                      : locationView === "undated"
                        ? "no_due_date"
                        : "task_archives",
                )
              : agenda
                ? tr("upcoming")
                : (spaceTree.find(({ space }) => space.id === workspaceId)
                    ?.path ?? tr("welcome"))
          }
          mainId="tasks-content"
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
        />
        <div className="task-page-content">
          <SyncFeedback />
          <CompletionNotice completion={completion} />
          {global ? (
            data ? (
              <GlobalTasksView
                key={navigation.route.key}
                mode={locationView as "search" | "all" | "undated" | "archives"}
                today={today}
                onWorkspace={(id) => navigate("space", id)}
                onCreate={createTask}
              />
            ) : (
              <p role="status">{tr("loading")}</p>
            )
          ) : agenda ? (
            spacesLoading ? (
              <p role="status">{tr("loading_workspaces")}</p>
            ) : (
              <AgendaView
                key={session.user_id}
                workspaces={workspaces}
                today={today}
                onWorkspace={(id) => navigate("space", id)}
                onCreate={createTask}
              />
            )
          ) : !workspace ? (
            <section className="empty-workspace">
              <span className="empty-symbol">
                <Icon name="folder" size={32} />
              </span>
              <p className="eyebrow">{tr("your_next_chapter")}</p>
              <h1>{tr("make_room_for_your_ideas")}</h1>
              <p className="muted">{tr("create_workspace_introduction")}</p>
              <button
                className="primary-button"
                disabled={spacesLoading}
                onClick={() => {
                  setSidebarOpen(false);
                  setCreateSpace(true);
                }}
              >
                <Icon name="plus" />
                {tr("create_my_first_workspace")}
              </button>
              {spacesLoading && <p role="status">{tr("loading")}</p>}
            </section>
          ) : (
            <>
              {workspace.parent_id && (
                <nav
                  className="parent-workspaces"
                  aria-label={tr("parent_workspaces")}
                >
                  {(() => {
                    const parents: Workspace[] = [];
                    let parent = workspaces.find(
                      (space) => space.id === workspace.parent_id,
                    );
                    while (
                      parent &&
                      !parents.some((item) => item.id === parent!.id)
                    ) {
                      parents.unshift(parent);
                      parent = workspaces.find(
                        (space) => space.id === parent!.parent_id,
                      );
                    }
                    return parents.map((parent) => (
                      <button
                        key={parent.id}
                        className="text-button"
                        onClick={() => navigate("space", parent.id)}
                      >
                        {parent.name}
                        <Icon name="chevron" size={14} />
                      </button>
                    ));
                  })()}
                </nav>
              )}
              <div className="workspace-heading">
                <div>
                  <p className="eyebrow">{tr("your_space_your_pace")}</p>
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
                      tr("a_little_order_to_keep_what_matters_in_sight")}
                  </p>
                </div>
                <button
                  className="icon-button workspace-config"
                  aria-label={tr("configure_workspace")}
                  disabled={loading}
                  onClick={() => setSettingsTab("space")}
                >
                  <Icon name="more" size={22} />
                </button>
              </div>
              <div className="task-toolbar">
                <div className="view-switch" aria-label={tr("task_view")}>
                  <button
                    disabled={loading}
                    aria-pressed={view.layout === "list"}
                    onClick={() => changeView({ layout: "list" })}
                  >
                    <Icon name="list" size={16} />
                    {tr("list")}
                  </button>
                  <button
                    disabled={loading}
                    aria-pressed={view.layout === "board"}
                    onClick={() => changeView({ layout: "board" })}
                  >
                    <Icon name="board" size={16} />
                    {tr("board")}
                  </button>
                </div>
                <div className="toolbar-actions">
                  <TaskFilterDisclosure
                    key={workspaceId}
                    label={tr("filter_workspace")}
                    active={search ? 1 : 0}
                  >
                    <div className="task-search-field">
                      <Icon name="search" size={16} />
                      <input
                        id="task-search"
                        disabled={loading}
                        aria-label={tr("search_tasks")}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={tr("search_placeholder")}
                        maxLength={500}
                      />
                    </div>
                  </TaskFilterDisclosure>
                  <button
                    className={`toolbar-button ${showFilters || hasFilters ? "is-selected" : ""}`}
                    aria-expanded={showFilters}
                    onClick={() => {
                      setShowFilters((value) => !value);
                      setShowDisplay(false);
                    }}
                  >
                    <Icon name="settings" size={16} />
                    <span>{tr("filters")}</span>
                    {hasFilters && (
                      <span className="count-badge">
                        {
                          [
                            view.search,
                            view.status_id,
                            view.priority,
                            view.label_id,
                            view.due !== "all",
                          ].filter(Boolean).length
                        }
                      </span>
                    )}
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
                    <span>{tr("show")}</span>
                  </button>
                </div>
              </div>
              {hasFilters && (
                <div className="active-task-filters">
                  {view.search && (
                    <button
                      onClick={() => {
                        setSearch("");
                        changeView({ search: "" });
                      }}
                    >
                      {tr("search")}: {view.search} ×
                    </button>
                  )}
                  {view.status_id && (
                    <button onClick={() => changeView({ status_id: null })}>
                      {tr("status")}:{" "}
                      {
                        statuses.find((status) => status.id === view.status_id)
                          ?.name
                      }{" "}
                      ×
                    </button>
                  )}
                  {view.priority && (
                    <button onClick={() => changeView({ priority: null })}>
                      P{view.priority} ×
                    </button>
                  )}
                  {view.label_id && (
                    <button onClick={() => changeView({ label_id: null })}>
                      {tr("label")}:{" "}
                      {labels.find((label) => label.id === view.label_id)?.name}{" "}
                      ×
                    </button>
                  )}
                  {view.due !== "all" && (
                    <button onClick={() => changeView({ due: "all" })}>
                      {tr("due_date")} ×
                    </button>
                  )}
                </div>
              )}
              {showFilters && (
                <div className="filter-panel">
                  <label>
                    {tr("status")}
                    <select
                      value={view.status_id ?? ""}
                      onChange={(event) =>
                        changeView({ status_id: event.target.value || null })
                      }
                    >
                      <option value="">{tr("all_statuses")}</option>
                      {statuses.map((status) => (
                        <option key={status.id} value={status.id}>
                          {status.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {tr("priority")}
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
                      <option value="">{tr("all_priorities")}</option>
                      {[1, 2, 3, 4].map((value) => (
                        <option key={value} value={value}>
                          {tr("priority")} {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {tr("label")}
                    <select
                      value={view.label_id ?? ""}
                      onChange={(event) =>
                        changeView({ label_id: event.target.value || null })
                      }
                    >
                      <option value="">{tr("all_labels")}</option>
                      {labels.map((label) => (
                        <option key={label.id} value={label.id}>
                          {label.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {tr("due_date")}
                    <select
                      value={view.due}
                      onChange={(event) =>
                        changeView({
                          due: event.target.value as ViewSettings["due"],
                        })
                      }
                    >
                      <option value="all">{tr("all_dates")}</option>
                      <option value="overdue">{tr("overdue")}</option>
                      <option value="today">{tr("today")}</option>
                      <option value="upcoming">{tr("upcoming")}</option>
                      <option value="none">{tr("no_due_date")}</option>
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
                    {tr("clear_filters")}
                  </button>
                </div>
              )}
              {showDisplay && (
                <div className="filter-panel display-panel">
                  <label>
                    {tr("sort_by")}
                    <select
                      value={view.sort}
                      onChange={(event) =>
                        changeView({
                          sort: event.target.value as ViewSettings["sort"],
                        })
                      }
                    >
                      <option value="manual">{tr("manual_order")}</option>
                      <option value="priority">{tr("priority")}</option>
                      <option value="due_date">{tr("due_date")}</option>
                    </select>
                  </label>
                  <label>
                    {tr("density")}
                    <select
                      value={view.density}
                      onChange={(event) =>
                        changeView({
                          density: event.target
                            .value as ViewSettings["density"],
                        })
                      }
                    >
                      <option value="comfortable">{tr("comfortable")}</option>
                      <option value="compact">{tr("compact")}</option>
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
                    {tr("show_completed_tasks")}
                  </label>
                  <button
                    className="text-button"
                    onClick={() => setSettingsTab("sections")}
                  >
                    {tr("configure_sections_and_columns")}
                    <Icon name="arrow" size={14} />
                  </button>
                </div>
              )}
              <div className="task-summary">
                <span>
                  {loading
                    ? tr("loading_tasks")
                    : tr(hasFilters ? "result_count" : "task_count", {
                        count: visibleTasks.length,
                      })}
                  <span className="summary-dot">·</span>
                  <button
                    className="text-button"
                    onClick={() =>
                      changeView({ show_completed: !view.show_completed })
                    }
                  >
                    {view.show_completed
                      ? tr("visible_completed", {
                          count: visibleTasks.filter(
                            (task) => task.completed_at,
                          ).length,
                        })
                      : tr("completed_hidden")}
                  </button>
                </span>
                <button
                  className="text-button"
                  disabled={loading}
                  onClick={() => setEditor("new")}
                >
                  <Icon name="plus" size={15} />
                  {tr("new_task")}
                </button>
              </div>
              {hiddenCount > 0 && !loading && (
                <p className="sort-hint">
                  {tr("hidden_tasks", { count: hiddenCount })}{" "}
                  <button
                    className="text-button"
                    onClick={() => setSettingsTab("sections")}
                  >
                    {tr("configure_sections")}
                  </button>
                </p>
              )}
              {view.sort !== "manual" && (
                <p className="sort-hint">
                  {tr("automatic_sorting_is_enabled")}{" "}
                  <button
                    className="text-button"
                    onClick={() => changeView({ sort: "manual" })}
                  >
                    {tr("switch_to_manual_order")}
                  </button>{" "}
                  {tr("to_use_drag_and_drop")}
                </p>
              )}
              {!loading && tasks.length === 0 && (
                <p className="empty-filter">
                  {tr(
                    hasFilters
                      ? "no_tasks_match_these_filters"
                      : data?.tasks.some(
                            (task) =>
                              task.workspace_id === workspaceId &&
                              !task.archived_at &&
                              task.completed_at,
                          )
                        ? "completed_hidden"
                        : "empty_task_workspace",
                  )}
                </p>
              )}
              {loading || !statuses.length ? (
                <div
                  className="task-skeleton"
                  role="status"
                  aria-label={tr("loading_workspace")}
                >
                  <span />
                  <span />
                  <span />
                </div>
              ) : (
                <TaskActions
                  key={workspaceId}
                  tasks={visibleTasks}
                  workspaces={workspaces}
                  today={today}
                  busy={false}
                  onEdit={setEditor}
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
                    busy={false}
                    onOpen={setEditor}
                    onComplete={completion.complete}
                    onAdd={quickAdd}
                    onConfigure={(id) => {
                      setTargetSection(id);
                      setSettingsTab("sections");
                    }}
                  />
                </TaskActions>
              )}
            </>
          )}
        </div>
      </main>
      {chooseWorkspace && (
        <Dialog
          title={tr("choose_task_workspace")}
          onClose={() => setChooseWorkspace(false)}
        >
          <div className="dialog-body workspace-chooser">
            {spaceTree.map(({ space, path }) => (
              <button
                className="secondary-button"
                key={space.id}
                onClick={() => {
                  if (navigate("space", space.id)) {
                    setChooseWorkspace(false);
                    setEditor("new");
                  }
                }}
              >
                {path}
              </button>
            ))}
            {!workspaces.length && (
              <button
                className="primary-button"
                onClick={() => {
                  setChooseWorkspace(false);
                  setCreateSpace(true);
                }}
              >
                {tr("create_my_first_workspace")}
              </button>
            )}
          </div>
        </Dialog>
      )}
      {createSpace && (
        <WorkspaceDialog
          workspaces={workspaces}
          onClose={() => setCreateSpace(false)}
          onCreated={(space) => {
            setCreateSpace(false);
            navigate("space", space.id);
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
          targetSection={targetSection}
          onClose={() => {
            setSettingsTab(null);
            setTargetSection(undefined);
          }}
          onArchived={() => {
            setSettingsTab(null);
          }}
        />
      )}
      {locationView === "space" &&
        !loading &&
        statuses.length > 0 &&
        workspace &&
        editor && (
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
        <Dialog
          title={tr("my_workspaces_title")}
          onClose={() => setManageSpaces(false)}
        >
          <div className="dialog-body space-management">
            <h3>{tr("workspace_order")}</h3>
            <p className="muted small-text">
              {tr("the_arrows_reorder_workspaces_that_share_the_same_parent")}
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
                      workspaces.filter(
                        (item) => item.parent_id === space.parent_id,
                      )[0]?.id === space.id
                    }
                    aria-label={tr("move_up", { name: space.name })}
                    onClick={() => orderSpaces(space, -1)}
                  >
                    <Icon name="up" />
                  </button>
                  <button
                    className="icon-button"
                    disabled={
                      workspaces
                        .filter((item) => item.parent_id === space.parent_id)
                        .at(-1)?.id === space.id
                    }
                    aria-label={tr("move_down", { name: space.name })}
                    onClick={() => orderSpaces(space, 1)}
                  >
                    <Icon name="down" />
                  </button>
                </div>
              </div>
            ))}
            <h3>{tr("archived_workspaces")}</h3>
            {!archivedSpaces.length && (
              <p className="muted">{tr("no_archived_workspaces")}</p>
            )}
            {archivedTree.map(({ space, path }) => (
              <div className="archive-row" key={space.id}>
                <span>
                  {path}
                  {archivedSpaces.some(
                    (item) => item.id === space.parent_id,
                  ) && (
                    <small className="muted">
                      {tr("restore_its_parent_workspace_first")}
                    </small>
                  )}
                </span>
                <button
                  className="secondary-button small-button"
                  disabled={archivedSpaces.some(
                    (item) => item.id === space.parent_id,
                  )}
                  onClick={() =>
                    sync.mutate(
                      `/workspaces/${space.id}`,
                      "PATCH",
                      { archived: false },
                      { message: tr("workspace_restored") },
                    )
                  }
                >
                  <Icon name="restore" size={14} />
                  {tr("restore")}
                </button>
              </div>
            ))}
            <SyncFeedback inDialog />
          </div>
        </Dialog>
      )}
    </TaskDragProvider>
  );
}
