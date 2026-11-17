import { useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "../../../shared/ui/Icon";
import { tr } from "../i18n";

export function TaskFilterDisclosure({
  children,
  active = 0,
  label = tr("search_and_filter"),
  alwaysOpen = false,
}: {
  children: ReactNode;
  active?: number;
  label?: string;
  alwaysOpen?: boolean;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  return (
    <div
      className="task-filter-disclosure"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      {!alwaysOpen && (
        <button
          ref={trigger}
          className={`toolbar-button ${active ? "is-selected" : ""}`}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            setOpen(!open);
            if (!open)
              requestAnimationFrame(() =>
                panel.current
                  ?.querySelector<HTMLInputElement>("input")
                  ?.focus(),
              );
          }}
        >
          <Icon name="search" size={16} />
          <span>{label}</span>
          {active > 0 && <span className="count-badge">{active}</span>}
        </button>
      )}
      <div
        id={panelId}
        ref={panel}
        hidden={!alwaysOpen && !open}
        className="task-filter-panel"
      >
        {children}
      </div>
    </div>
  );
}
