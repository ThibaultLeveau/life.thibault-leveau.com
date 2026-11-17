import { useEffect, useRef, useState } from "react";
import { Icon } from "../../../shared/ui/Icon";
import { tr } from "../i18n";
import type { TaskLocation } from "../useTaskNavigation";

export function TaskNavigationMore({
  current,
  onNavigate,
}: {
  current: TaskLocation;
  onNavigate: (view: TaskLocation) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const destinations = [
    ["all", "list", "all_tasks"],
    ["undated", "calendar", "no_due_date"],
    ["archives", "archive", "task_archives"],
  ] as const;
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div
      ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        className={`application-nav-item ${destinations.some(([view]) => view === current) ? "is-active" : ""}`}
        aria-label={tr("more_task_views")}
        title={tr("more_task_views")}
        aria-expanded={open}
        aria-controls="task-more-views"
        onClick={() => setOpen(!open)}
      >
        <Icon name="more" />
      </button>
      <div
        id="task-more-views"
        className="application-nav-dropdown"
        hidden={!open}
      >
        {destinations.map(([view, icon, label]) => (
          <button
            key={view}
            className={`application-nav-item ${current === view ? "is-active" : ""}`}
            aria-current={current === view ? "page" : undefined}
            onClick={() => {
              setOpen(false);
              onNavigate(view);
            }}
          >
            <Icon name={icon} />
            <span>{tr(label)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
