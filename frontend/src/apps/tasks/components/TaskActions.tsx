import { tr } from "../i18n";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTaskSync } from "../useTaskSync";
import type { Task, Workspace } from "../types";
import { useTaskSelection } from "../useTaskSelection";
import { BulkTaskDialog, type BulkAction } from "./BulkTaskDialog";
import { Icon } from "../../../shared/ui/Icon";
import { TaskMenu, type MenuAnchor } from "./TaskMenu";

const TaskActionContext = createContext<{
  selected: Set<string>;
  selecting: boolean;
  busy: boolean;
  menuId?: string;
  toggle: (id: string) => void;
  openMenu: (task: Task, event: MouseEvent<HTMLElement>) => void;
} | null>(null);
export const useTaskActions = () => useContext(TaskActionContext);

export function TaskActions({
  tasks,
  workspaces,
  today,
  busy,
  children,
  onEdit,
}: {
  tasks: Task[];
  workspaces: Workspace[];
  today: string;
  busy: boolean;
  children: ReactNode;
  onEdit: (task: Task) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const [dialog, setDialog] = useState<{
    action: BulkAction;
    tasks: Task[];
  } | null>(null);
  const sync = useTaskSync();
  const closeMenu = useCallback(() => setMenu(null), []);
  const choose = useCallback((ids: Set<string>) => {
    setSelected(ids);
    setSelecting(ids.size > 0);
  }, []);
  const clear = useCallback(() => {
    setSelected(new Set());
    setSelecting(false);
  }, []);
  useEffect(() => {
    const visible = new Set(tasks.map((task) => task.id));
    setSelected((previous) => {
      const ids = [...previous]
        .map(sync.canonicalId)
        .filter((id) => visible.has(id));
      if (ids.length === previous.size && ids.every((id) => previous.has(id)))
        return previous;
      return new Set(ids);
    });
    setMenu((previous) => {
      if (!previous) return null;
      const current = tasks.find(
        (task) => task.id === sync.canonicalId(previous.task.id),
      );
      return current ? { ...previous, task: current } : null;
    });
  }, [tasks]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !document.querySelector("dialog[open]") &&
        !menu
      )
        clear();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [menu, clear]);
  const disabled = busy || !!dialog || !!menu;
  const { box, suppressClick } = useTaskSelection(
    root,
    disabled,
    selected,
    choose,
  );
  const toggle = useCallback((id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelecting(true);
  }, []);
  const openMenu = useCallback(
    (task: Task, event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      if (busy || dialog) return;
      const trigger =
        (event.target as HTMLElement)
          .closest<HTMLElement>("[data-task-id]")
          ?.querySelector<HTMLElement>(".task-more") ?? event.currentTarget;
      const bounds = trigger.getBoundingClientRect();
      setMenu({
        task,
        trigger,
        x:
          event.type === "contextmenu" && event.clientX
            ? event.clientX
            : bounds.right - 216,
        y:
          event.type === "contextmenu" && event.clientY
            ? event.clientY
            : bounds.bottom + 5,
      });
    },
    [busy, dialog],
  );
  const context = useMemo(
    () => ({
      selected,
      selecting,
      busy: busy,
      menuId: menu?.task.id,
      toggle,
      openMenu,
    }),
    [selected, selecting, busy, menu?.task.id, toggle, openMenu],
  );
  const selectedTasks = tasks.filter((task) => selected.has(task.id));
  function duplicate(task: Task) {
    sync.mutate(
      `/tasks/${task.id}/duplicate`,
      "POST",
      { expected_version: task.version },
      { message: tr("task_duplicated") },
    );
  }

  return (
    <TaskActionContext.Provider value={context}>
      <div className={`task-actions ${selecting ? "is-selecting" : ""}`}>
        <div className="selection-entry">
          <button
            className="text-button"
            disabled={busy || !tasks.length}
            aria-pressed={selecting}
            onClick={() => {
              if (selecting) clear();
              else setSelecting(true);
            }}
          >
            <Icon name="select" size={16} />
            {selecting ? tr("exit_selection") : tr("select")}
          </button>
        </div>
        <div
          ref={root}
          className={`task-selection-surface ${box ? "is-marquee" : ""}`}
          onKeyDown={(event) => {
            if (
              event.key === "ContextMenu" ||
              (event.shiftKey && event.key === "F10")
            ) {
              const button = (event.target as HTMLElement)
                .closest("[data-task-id]")
                ?.querySelector<HTMLButtonElement>(".task-more");
              if (button) {
                event.preventDefault();
                button.click();
              }
            }
          }}
          onContextMenu={(event) => {
            const card = (event.target as HTMLElement).closest<HTMLElement>(
              "[data-task-id]",
            );
            const task = tasks.find((task) => task.id === card?.dataset.taskId);
            if (task) {
              event.preventDefault();
              if (performance.now() >= suppressClick.current)
                openMenu(task, event);
            }
          }}
          onClickCapture={(event) => {
            const target = event.target as HTMLElement;
            const id =
              target.closest<HTMLElement>("[data-task-id]")?.dataset.taskId;
            if (!id) return;
            if (performance.now() < suppressClick.current) {
              suppressClick.current = 0;
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            if (
              (selecting || event.ctrlKey || event.metaKey) &&
              !target.closest(".task-more, .task-select")
            ) {
              event.preventDefault();
              event.stopPropagation();
              toggle(id);
            }
          }}
        >
          {children}
        </div>
        {selecting && (
          <div
            className="task-selection-bar"
            role="region"
            aria-label={tr("selection_actions")}
            data-selection-toolbar
          >
            <span className="selection-count" role="status">
              {tr("selected_count", { count: selectedTasks.length })}
            </span>
            <div className="selection-buttons">
              <button
                disabled={
                  disabled ||
                  !selectedTasks.length ||
                  selectedTasks.length > 500
                }
                onClick={() =>
                  setDialog({ action: "reschedule", tasks: selectedTasks })
                }
              >
                <Icon name="calendar" />
                {tr("reschedule")}
              </button>
              <button
                disabled={
                  disabled ||
                  !selectedTasks.length ||
                  selectedTasks.length > 500
                }
                onClick={() =>
                  setDialog({ action: "move", tasks: selectedTasks })
                }
              >
                <Icon name="folder" />
                {tr("move")}
              </button>
              <button
                className="danger-text"
                disabled={
                  disabled ||
                  !selectedTasks.length ||
                  selectedTasks.length > 500
                }
                onClick={() =>
                  setDialog({ action: "archive", tasks: selectedTasks })
                }
              >
                <Icon name="trash" />
                {tr("delete")}
              </button>
            </div>
            <button
              className="selection-clear"
              disabled={!!dialog}
              onClick={clear}
              aria-label={tr("deselect_all")}
            >
              <Icon name="x" />
              <span>{tr("deselect_all")}</span>
            </button>
            {selectedTasks.length > 500 && (
              <p role="alert">{tr("select_up_to_500_tasks_per_operation")}</p>
            )}
          </div>
        )}
        {box &&
          createPortal(
            <div
              className="task-selection-box"
              style={box}
              aria-hidden="true"
            />,
            document.body,
          )}
        {menu && (
          <TaskMenu
            anchor={menu}
            onClose={closeMenu}
            onAction={(action) => {
              const task = menu.task;
              closeMenu();
              if (action === "edit") onEdit(task);
              else if (action === "duplicate") void duplicate(task);
              else if (action === "select") toggle(task.id);
              else setDialog({ action: "archive", tasks: [task] });
            }}
          />
        )}
        {dialog && (
          <BulkTaskDialog
            {...dialog}
            workspaces={workspaces}
            today={today}
            onClose={() => setDialog(null)}
            onSaved={() => {
              setDialog(null);
              clear();
            }}
          />
        )}
      </div>
    </TaskActionContext.Provider>
  );
}
