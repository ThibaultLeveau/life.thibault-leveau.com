import { tr } from "../i18n";
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Task } from "../types";
import { actionIcon, actionLabel, type TaskAction } from "../taskCommands";
import { Icon } from "../../../shared/ui/Icon";

export interface MenuAnchor {
  task: Task;
  x: number;
  y: number;
  trigger: HTMLElement;
}

export function TaskMenu({
  anchor,
  onClose,
  onAction,
  tasks,
  selected,
  archived = false,
}: {
  anchor: MenuAnchor;
  onClose: () => void;
  onAction: (action: TaskAction) => void;
  tasks: Task[];
  selected: boolean;
  archived?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const actions: TaskAction[] = archived
    ? ["restore", "select"]
    : [
        ...(tasks.some((t) => !t.completed_at) ? ["complete" as const] : []),
        ...(tasks.some((t) => t.completed_at) ? ["reopen" as const] : []),
        ...(tasks.length === 1 ? ["edit" as const] : []),
        "reschedule",
        "move",
        "priority",
        "status",
        "labels",
        "duplicate",
        "select",
        "archive",
      ];
  useLayoutEffect(() => {
    const menu = ref.current!;
    const viewport = window.visualViewport;
    const position = () => {
      const left = viewport?.offsetLeft ?? 0,
        top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? innerWidth,
        height = viewport?.height ?? innerHeight;
      menu.style.maxHeight = `${height - 16}px`;
      menu.style.left = `${Math.max(left + 8, Math.min(anchor.x, left + width - menu.offsetWidth - 8))}px`;
      menu.style.top = `${Math.max(top + 8, Math.min(anchor.y, top + height - menu.offsetHeight - 8))}px`;
    };
    position();
    menu
      .querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!menu.contains(event.target as Node)) onClose();
    };
    const scrollIntent = (event: Event) => {
      if (!menu.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("wheel", scrollIntent, { passive: true });
    document.addEventListener("touchmove", scrollIntent, { passive: true });
    window.addEventListener("resize", position);
    viewport?.addEventListener("resize", position);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("wheel", scrollIntent);
      document.removeEventListener("touchmove", scrollIntent);
      window.removeEventListener("resize", position);
      viewport?.removeEventListener("resize", position);
      if (anchor.trigger.isConnected)
        anchor.trigger.focus({ preventScroll: true });
    };
  }, [anchor.trigger, anchor.x, anchor.y, onClose]);
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={
        tasks.length > 1
          ? tr("selected_count", { count: tasks.length })
          : tr("actions_for", { name: anchor.task.title })
      }
      className="task-context-menu"
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        const items = Array.from(
          ref.current!.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ),
        );
        const index = items.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (["Escape", "Tab"].includes(event.key)) {
          if (event.key === "Escape") event.preventDefault();
          onClose();
        } else if (
          ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
        ) {
          event.preventDefault();
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : (index +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    items.length) %
                  items.length;
          items[next].focus();
        }
      }}
    >
      <div className="task-menu-caption">
        {tasks.length > 1
          ? tr("selected_count", { count: tasks.length })
          : anchor.task.title}
      </div>
      {tasks.length > 500 && (
        <p role="alert">{tr("select_up_to_500_tasks_per_operation")}</p>
      )}
      {actions.map((action) => (
        <button
          key={action}
          role="menuitem"
          disabled={tasks.length > 500 && action !== "select"}
          className={action === "archive" ? "danger-text" : undefined}
          onClick={() => onAction(action)}
        >
          <Icon name={actionIcon[action]} />
          {action === "select" && selected
            ? tr(tasks.length > 1 ? "deselect_all" : "deselect")
            : actionLabel(action)}
        </button>
      ))}
    </div>,
    document.body,
  );
}
