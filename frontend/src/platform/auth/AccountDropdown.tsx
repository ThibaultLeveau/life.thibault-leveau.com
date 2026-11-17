import { useEffect, useId, useRef, useState } from "react";
import { tr } from "../../shared/i18n";
import { Icon } from "../../shared/ui/Icon";

export function AccountDropdown({
  username,
  disabled,
  onLogout,
}: {
  username: string;
  disabled: boolean;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div
      className="account-dropdown"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && ["Escape", "Tab"].includes(event.key)) {
          if (event.key === "Escape") event.preventDefault();
          trigger.current?.focus();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="account-dropdown-trigger"
        ref={trigger}
        id={`${id}-trigger`}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span>{username}</span>
        <Icon name="down" size={16} />
      </button>
      {open && (
        <div
          className="account-dropdown-panel"
          role="menu"
          id={id}
          aria-labelledby={`${id}-trigger`}
          ref={menu}
          onKeyDown={(event) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const items = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                '[role="menuitem"]:not(:disabled):not([aria-disabled="true"])',
              ),
            );
            if (!items.length) return;
            const index = items.indexOf(document.activeElement as HTMLElement);
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
          }}
        >
          <a
            role="menuitem"
            tabIndex={-1}
            href="/settings"
            aria-disabled={disabled || undefined}
            onClick={(event) => {
              if (disabled) event.preventDefault();
            }}
          >
            <Icon name="settings" /> {tr("settings")}
          </a>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            aria-disabled={disabled || undefined}
            onClick={() => {
              if (!disabled) onLogout();
            }}
          >
            <Icon name="logout" /> {tr("sign_out")}
          </button>
        </div>
      )}
    </div>
  );
}
