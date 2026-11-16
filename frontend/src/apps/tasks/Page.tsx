import { tr } from "./i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "../../platform/auth/SessionProvider";
import { ApplicationFooter } from "../../platform/auth/ApplicationFooter";
import {
  ApplicationSidebar,
  ApplicationTopbar,
} from "../../shared/ui/ApplicationNavigation";
import { relativeDate, useLocalToday } from "./dates";
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
import { TaskViews, type Destination } from "./components/TaskViews";
import { WorkspaceDialog } from "./components/WorkspaceDialog";
import {
  WorkspaceSettings,
  type SettingsTab,
} from "./components/WorkspaceSettings";
import { workspaceTree } from "./workspaceTree";
import { TaskSyncProvider, SyncFeedback, useTaskSync } from "./useTaskSync";
import { workspaceTasks } from "./optimistic";
import "./styles.css";

export function Page() {
  return (
    <TaskSyncProvider>
      <TasksPage />
    </TaskSyncProvider>
  );
}

function TasksPage() {
  const sync = useTaskSync();
  const today = useLocalToday();
  const [agenda, setAgenda] = useState(
    !new URLSearchParams(window.location.search).has("space"),
  );
  const { session } = useSession();
  const [workspaceId, setWorkspaceId] = useState(
    new URLSearchParams(window.location.search).get("space") ?? "",
  );
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
    !data || (!agenda && !!workspaceId && !data.views[workspaceId]);
  const spacesLoading = !data;
  const [notice, setNotice] = useState("");
  const [undoTask, setUndoTask] = useState<Task | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showDisplay, setShowDisplay] = useState(false);
  const [createSpace, setCreateSpace] = useState(false);
  const [manageSpaces, setManageSpaces] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [editor, setEditor] = useState<Task | "new" | null>(null);
  const [moving, setMoving] = useState<Task | null>(null);
  const focusSearch = useRef(false);
  useEffect(() => {
    if (!sync.recovery) return;
    setAgenda(false);
    setWorkspaceId(sync.recovery.workspace_id);
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
    if (data && !workspaces.some((space) => space.id === workspaceId))
      setWorkspaceId(workspaces[0]?.id ?? "");
  }, [data, workspaceId]);
  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      agenda
        ? "/tasks?view=agenda"
        : `/tasks?space=${encodeURIComponent(workspaceId)}`,
    );
  }, [agenda, workspaceId]);
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
    if (agenda || !workspaceId || loading || search === view.search) return;
    const timer = setTimeout(() => changeView({ search }), 300);
    return () => clearTimeout(timer);
  }, [search, workspaceId, loading, changeView, agenda, view.search]);
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
                  : tr("one_step_forward_task_completed"),
          );
        },
      },
    );
  }
  async function move(task: Task, destination: Destination) {
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
    view.due !== "all" ||
    !view.show_completed;
  return (
    <div className="ui-scope tasks-shell">
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
            beforeSessionChange={sync.idle}
          />
        }
      >
        <button
          className="application-nav-item"
          disabled={!workspace || loading}
          onClick={() => {
            setAgenda(false);
            setEditor("new");
            setSidebarOpen(false);
          }}
        >
          <Icon name="plus" />
          {tr("add_a_task")}
        </button>
        <button
          className="application-nav-item sidebar-search"
          onClick={searchTasks}
        >
          <Icon name="search" />
          {tr("search")}
          <kbd>⌘ K</kbd>
        </button>
        <button
          className={`application-nav-item workspace-link agenda-link ${agenda ? "is-active" : ""}`}
          aria-current={agenda ? "page" : undefined}
          onClick={() => {
            setAgenda(true);
            setSidebarOpen(false);
            setNotice("");
          }}
        >
          <Icon name="calendar" size={18} />
          <span>{tr("upcoming")}</span>
        </button>
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
            <button
              key={space.id}
              style={{ paddingInlineStart: 12 + Math.min(depth, 6) * 16 }}
              title={path}
              aria-label={depth ? `# ${path}` : undefined}
              className={`application-nav-item workspace-link ${!agenda && workspaceId === space.id ? "is-active" : ""}`}
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
          name={tr("tasks")}
          current={
            agenda
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
          {notice && (
            <p className="notice" role="status">
              <Icon name="check" size={14} />
              {notice}
              {undoTask && (
                <button
                  className="text-button"
                  onClick={() =>
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
                    )
                  }
                >
                  {tr("undo_completion")}
                </button>
              )}
              <button
                className="icon-button"
                onClick={() => setNotice("")}
                aria-label={tr("close_message")}
              >
                <Icon name="x" size={12} />
              </button>
            </p>
          )}
          {agenda ? (
            spacesLoading ? (
              <p role="status">{tr("loading_workspaces")}</p>
            ) : (
              <AgendaView
                key={session.user_id}
                workspaces={workspaces}
                today={today}
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
                    <span>{tr("show")}</span>
                  </button>
                </div>
              </div>
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
                  {tr("completed_count", {
                    count: visibleTasks.filter((task) => task.completed_at)
                      .length,
                  })}
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
              {hasFilters && tasks.length === 0 && (
                <p className="empty-filter">
                  {tr("no_tasks_match_these_filters")}
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
            setWorkspaceId(space.id);
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
          onArchived={() => {
            setSettingsTab(null);
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
    </div>
  );
}
