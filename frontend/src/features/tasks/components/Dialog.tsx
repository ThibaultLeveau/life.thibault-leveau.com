import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";

export function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const element = ref.current!;
    element.showModal();
    element
      .querySelector<HTMLElement>(
        'input:not([type="color"]):not([type="checkbox"]), select, textarea',
      )
      ?.focus();
    return () => {
      element.close();
      if (
        previous?.isConnected &&
        previous.getClientRects().length &&
        getComputedStyle(previous).visibility === "visible"
      )
        previous.focus({ preventScroll: true });
      else
        document
          .getElementById("tasks-content")
          ?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`task-dialog ${wide ? "dialog-wide" : ""}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="dialog-header">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" aria-label="Fermer" onClick={onClose}>
          <Icon name="x" />
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <p role="alert" className="form-error">
      {message}
    </p>
  ) : null;
}
