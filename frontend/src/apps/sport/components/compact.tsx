import { useEffect, useId, useState, type ReactNode } from "react";
import { Dialog } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
import { tr } from "../i18n";

// Match the common navigation's compact layout, including landscape phones.
export function useSportMobile() {
  const query =
    "(max-width: 800px), (pointer: coarse) and (max-width: 1024px) and (max-height: 500px)";
  const [mobile, setMobile] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const media = matchMedia(query);
    const change = () => setMobile(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return mobile;
}

/** Keep secondary controls mounted, and their values intact, when folded. */
export function CompactOptions({
  children,
  label = tr("filters"),
  count = 0,
}: {
  children: ReactNode;
  label?: string;
  count?: number;
}) {
  const mobile = useSportMobile();
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button
        type="button"
        className="secondary-button sport-options-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <Icon name="settings" size={16} />
        {label}
        {count > 0 && <span className="sport-tag">{count}</span>}
      </button>
      <div id={id} className="sport-options-panel" hidden={mobile && !open}>
        {children}
      </div>
    </>
  );
}

export function CompactActions({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  const mobile = useSportMobile();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!mobile) setOpen(false);
  }, [mobile]);
  if (!mobile) return <>{children}</>;
  return (
    <>
      <button
        type="button"
        className="icon-button"
        aria-label={tr("actions_named", { name })}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Icon name="more" />
      </button>
      {open && (
        <Dialog
          title={tr("actions_named", { name })}
          initialFocus="close"
          onClose={() => setOpen(false)}
        >
          <div
            className="dialog-body sport-compact-actions"
            onChange={(event) => {
              if ((event.target as Element).tagName === "SELECT")
                setOpen(false);
            }}
            onClick={(event) => {
              const button = (event.target as Element).closest("button");
              if (
                button &&
                !button.disabled &&
                button.getAttribute("aria-disabled") !== "true"
              )
                setOpen(false);
            }}
          >
            {children}
          </div>
        </Dialog>
      )}
    </>
  );
}
