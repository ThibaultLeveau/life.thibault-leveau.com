import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Task } from "../types";
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
}: {
  anchor: MenuAnchor;
  onClose: () => void;
  onAction: (action: "edit" | "duplicate" | "archive" | "select") => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const menu = ref.current!;
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    menu.style.left = `${Math.max(left + 8, Math.min(anchor.x, left + (viewport?.width ?? innerWidth) - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(top + 8, Math.min(anchor.y, top + (viewport?.height ?? innerHeight) - menu.offsetHeight - 8))}px`;
    const origin = anchor.trigger.getBoundingClientRect();
    menu
      .querySelector<HTMLButtonElement>("button")
      ?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!menu.contains(event.target as Node)) onClose();
    };
    const scroll = (event: Event) => {
      if (menu.contains(event.target as Node)) return;
      // A scroll already completed before the click can dispatch its event later.
      const current = anchor.trigger.getBoundingClientRect();
      if (current.top !== origin.top || current.left !== origin.left)
        onClose();
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", scroll, true);
      if (anchor.trigger.isConnected)
        anchor.trigger.focus({ preventScroll: true });
    };
  }, [anchor, onClose]);
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={`Actions : ${anchor.task.title}`}
      className="task-context-menu"
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        const items = Array.from(
          ref.current!.querySelectorAll<HTMLButtonElement>("button"),
        );
        const index = items.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (["Escape", "Tab"].includes(event.key)) {
          event.preventDefault();
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
      <button role="menuitem" onClick={() => onAction("edit")}>
        <Icon name="edit" />
        Modifier
      </button>
      <button role="menuitem" onClick={() => onAction("duplicate")}>
        <Icon name="copy" />
        Dupliquer
      </button>
      <button role="menuitem" onClick={() => onAction("select")}>
        <Icon name="select" />
        Sélectionner
      </button>
      <div role="separator" />
      <button
        role="menuitem"
        className="danger-text"
        onClick={() => onAction("archive")}
      >
        <Icon name="trash" />
        Supprimer
      </button>
    </div>,
    document.body,
  );
}
