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
import { api } from "../api";
import type { Task, Workspace } from "../types";
import { useTaskSelection } from "../useTaskSelection";
import { BulkTaskDialog, type BulkAction } from "./BulkTaskDialog";
import { ErrorMessage } from "./Dialog";
import { Icon } from "./Icon";
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
  onRefresh,
}: {
  tasks: Task[];
  workspaces: Workspace[];
  today: string;
  busy: boolean;
  children: ReactNode;
  onEdit: (task: Task) => void;
  onRefresh: (message?: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const [dialog, setDialog] = useState<{
    action: BulkAction;
    tasks: Task[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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
      if ([...previous].every((id) => visible.has(id))) return previous;
      return new Set([...previous].filter((id) => visible.has(id)));
    });
    setMenu(null);
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
  const disabled = busy || saving || !!dialog || !!menu;
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
      if (busy || saving || dialog) return;
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
    [busy, saving, dialog],
  );
  const context = useMemo(
    () => ({
      selected,
      selecting,
      busy: busy || saving,
      menuId: menu?.task.id,
      toggle,
      openMenu,
    }),
    [selected, selecting, busy, saving, menu?.task.id, toggle, openMenu],
  );
  const selectedTasks = tasks.filter((task) => selected.has(task.id));
  async function duplicate(task: Task) {
    setSaving(true);
    setError("");
    try {
      await api(`/tasks/${task.id}/duplicate`, "POST", {
        expected_version: task.version,
      });
      onRefresh("Tâche dupliquée.");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <TaskActionContext.Provider value={context}>
      <div className={`task-actions ${selecting ? "is-selecting" : ""}`}>
        <ErrorMessage message={error} />
        {error && (
          <button
            className="text-button"
            onClick={() => {
              setError("");
              onRefresh();
            }}
          >
            Recharger les tâches
          </button>
        )}
        <div className="selection-entry">
          <button
            className="text-button"
            disabled={busy || saving || !tasks.length}
            aria-pressed={selecting}
            onClick={() => {
              if (selecting) clear();
              else setSelecting(true);
            }}
          >
            <Icon name="select" size={16} />
            {selecting ? "Quitter la sélection" : "Sélectionner"}
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
            const task = tasks.find(
              (task) => task.id === card?.dataset.taskId,
            );
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
            aria-label="Actions de la sélection"
            data-selection-toolbar
          >
            <span className="selection-count" role="status">
              {selectedTasks.length} sélectionnée
              {selectedTasks.length > 1 ? "s" : ""}
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
                Replanifier
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
                Déplacer
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
                Supprimer
              </button>
            </div>
            <button
              className="selection-clear"
              disabled={saving || !!dialog}
              onClick={clear}
              aria-label="Tout désélectionner"
            >
              <Icon name="x" />
              <span>Tout désélectionner</span>
            </button>
            {selectedTasks.length > 500 && (
              <p role="alert">
                Sélectionnez au maximum 500 tâches par opération.
              </p>
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
            onRefresh={onRefresh}
            onSaved={(message) => {
              setDialog(null);
              clear();
              onRefresh(message);
            }}
          />
        )}
      </div>
    </TaskActionContext.Provider>
  );
}
