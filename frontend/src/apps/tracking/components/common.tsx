import type { CSSProperties, ReactNode } from "react";
import { ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
import { tr } from "../i18n";
import { dateLabel, number } from "../dates";
import type { Occurrence } from "../types";
export {
  useApiResource as useResource,
  useApiAction as useAction,
} from "../../../platform/useApiResource";
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
        <div className="tracking-loading" role="status">
          <span />
          {tr("loading")}
        </div>
      )}
      <ErrorMessage message={error} />
      {error && (
        <button className="secondary-button" onClick={reload}>
          {tr("retry")}
        </button>
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
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="tracking-empty">
      <span className="tracking-empty-icon">
        <Icon name="calendar" size={28} />
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function scoreStyle(score: number | null): CSSProperties {
  const n = score ?? 0;
  return {
    "--tracking-score":
      score === null
        ? "var(--ui-muted)"
        : n <= 5
          ? `color-mix(in oklab, var(--tracking-red) ${100 - n * 20}%, var(--tracking-amber))`
          : `color-mix(in oklab, var(--tracking-amber) ${100 - (n - 5) * 20}%, var(--tracking-green))`,
  } as CSSProperties;
}
export function Score({
  value,
  large = false,
}: {
  value: number | null;
  large?: boolean;
}) {
  return (
    <span
      className={`tracking-score ${large ? "is-large" : ""}`}
      style={scoreStyle(value)}
    >
      <strong>{value === null ? "—" : number(value)}</strong>
      <span>/10</span>
    </span>
  );
}
export function OccurrenceCard({
  item,
  onOpen,
}: {
  item: Occurrence;
  onOpen: () => void;
}) {
  const entry = item.entry,
    done = entry?.status === "complete",
    expected = item.fields.filter((f) => f.required).length;
  return (
    <article className={`tracking-occurrence ${done ? "is-complete" : ""}`}>
      <div className="tracking-occurrence-heading">
        <span className="tracking-frequency">
          {tr(item.definition.frequency)}
        </span>
        {done && (
          <span className="tracking-complete-label">
            <Icon name="check" size={14} />
            {tr("done")}
          </span>
        )}
      </div>
      <h3>{item.definition.name}</h3>
      <p className="muted tracking-period">
        {dateLabel(item.period_start)}
        {item.period_end !== item.period_start && (
          <> — {dateLabel(item.period_end)}</>
        )}
      </p>
      <div className="tracking-occurrence-result">
        <Score value={entry?.score ?? null} />
        <span className="muted">
          {tr("fields_count", { filled: entry?.filled ?? 0, total: expected })}
        </span>
      </div>
      <div className="tracking-progress">
        <span
          style={{
            width: `${expected ? (100 * (entry?.filled ?? 0)) / expected : done ? 100 : 0}%`,
          }}
        />
      </div>
      <button
        className={done ? "secondary-button" : "primary-button"}
        onClick={onOpen}
      >
        {tr(done ? "review" : entry ? "resume" : "start")}
        <Icon name="arrow" size={16} />
      </button>
    </article>
  );
}
