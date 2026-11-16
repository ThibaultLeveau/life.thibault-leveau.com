import { useEffect, useRef, type ReactNode } from "react";
import { tr } from "../i18n";
import { Icon, type IconName } from "./Icon";
import "../styles/navigation.css";

interface NavigationState {
  mainId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApplicationSidebar({
  name,
  icon,
  label,
  mainId,
  open,
  onOpenChange,
  children,
  footer,
}: NavigationState & {
  name: string;
  icon: IconName;
  label: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const sidebarRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open || !matchMedia("(max-width: 800px)").matches) return;
    const sidebar = sidebarRef.current;
    const main = document.getElementById(mainId);
    if (!sidebar || !main) return;
    const overflow = document.body.style.overflow;
    const inert = main.inert;
    document.body.style.overflow = "hidden";
    main.inert = true;
    sidebar.setAttribute("role", "dialog");
    sidebar.setAttribute("aria-modal", "true");
    sidebar.querySelector<HTMLButtonElement>(".application-nav-close")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
      }
      if (event.key !== "Tab") return;
      const items = Array.from(
        sidebar.querySelectorAll<HTMLElement>(
          "button:not(:disabled), a[href], select:not(:disabled)",
        ),
      ).filter((item) => item.getClientRects().length);
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        items.at(-1)?.focus();
      } else if (!event.shiftKey && (index === items.length - 1 || index < 0)) {
        event.preventDefault();
        items[0]?.focus();
      }
    };
    const resize = () => {
      if (innerWidth > 800) onOpenChange(false);
    };
    window.addEventListener("keydown", keyboard);
    window.addEventListener("resize", resize);
    return () => {
      document.body.style.overflow = overflow;
      main.inert = inert;
      sidebar.removeAttribute("role");
      sidebar.removeAttribute("aria-modal");
      window.removeEventListener("keydown", keyboard);
      window.removeEventListener("resize", resize);
      if (
        !document.querySelector("dialog[open]") &&
        (sidebar.contains(document.activeElement) ||
          document.activeElement === document.body)
      )
        document
          .getElementById(`${mainId}-menu`)
          ?.focus({ preventScroll: true });
    };
  }, [open, onOpenChange, mainId]);

  return (
    <>
      <a
        className="application-skip"
        href={`#${mainId}`}
        onClick={(event) => {
          event.preventDefault();
          document.getElementById(mainId)?.focus();
        }}
      >
        {tr("skip_to_content")}
      </a>
      {open && (
        <div
          className="application-nav-scrim"
          aria-hidden="true"
          onClick={() => onOpenChange(false)}
        />
      )}
      <aside
        ref={sidebarRef}
        id={`${mainId}-navigation`}
        aria-label={label}
        className={`application-sidebar ${open ? "is-open" : ""}`}
      >
        <div className="application-sidebar-top">
          <a className="app-brand" href="/" aria-label={tr("lifeos_home")}>
            <span className="app-brand-icon">
              <Icon name="grid" />
            </span>
            LifeOS<span className="brand-period">.</span>
          </a>
          <button
            className="icon-button application-nav-mobile application-nav-close"
            aria-label={tr("close_navigation")}
            onClick={() => onOpenChange(false)}
          >
            <Icon name="x" />
          </button>
        </div>
        <div className="application-sidebar-label">
          <Icon name={icon} />
          {name}
        </div>
        <div className="application-sidebar-links">{children}</div>
        {footer}
      </aside>
    </>
  );
}

export function ApplicationTopbar({
  name,
  current,
  mainId,
  open,
  onOpenChange,
}: NavigationState & {
  name: string;
  current: string;
}) {
  return (
    <header className="application-topbar">
      <button
        id={`${mainId}-menu`}
        className="icon-button application-nav-mobile"
        aria-label={tr("open_navigation")}
        aria-expanded={open}
        aria-controls={`${mainId}-navigation`}
        onClick={() => onOpenChange(true)}
      >
        <Icon name="menu" />
      </button>
      <nav className="application-breadcrumb" aria-label={tr("breadcrumb")}>
        <a href="/">LifeOS</a>
        <span aria-hidden="true">/</span>
        <span>{name}</span>
        <span aria-hidden="true">/</span>
        <strong aria-current="page" title={current}>
          {current}
        </strong>
      </nav>
    </header>
  );
}
