import type { ReactNode } from "react";
import { ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
import { tr, number } from "../i18n";

export function LoadState({
  loading,
  error,
  reload,
}: {
  loading: boolean;
  error: string;
  reload: () => void;
}) {
  return (
    <>
      {loading && (
        <p role="status" className="muted">
          {tr("loading")}
        </p>
      )}
      {error && (
        <div className="okr-error">
          <ErrorMessage message={error} />
          <button className="secondary-button" onClick={reload}>
            {tr("retry")}
          </button>
        </div>
      )}
    </>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="okr-empty">
      <span className="okr-empty-icon">
        <Icon name="flag" size={28} />
      </span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function Progress({
  value,
  label = tr("progress"),
}: {
  value: number;
  label?: string;
}) {
  return (
    <div className="okr-progress">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${value}%` }} />
      </div>
      <span>{number(value)}%</span>
    </div>
  );
}
