import { Icon } from "../../../shared/ui/Icon";
import { tr, dateLabel, quarterLabel } from "../i18n";
import { statuses, type Objective, type Status } from "../types";
import { Progress } from "./common";
export function ObjectiveCard({
  objective: o,
  parent,
  today,
  quarter,
  busy,
  onOpen,
  onMove,
  onDrag,
  onDrop,
  up,
  down,
}: {
  objective: Objective;
  parent?: Objective;
  today: string;
  quarter?: string;
  busy: boolean;
  onOpen: () => void;
  onMove: (status: Status, position?: number) => void;
  onDrag?: (id: string) => void;
  onDrop?: () => void;
  up?: number;
  down?: number;
}) {
  return (
    <article
      className={`okr-card ${o.status === "done" ? "is-done" : ""}`}
      onDragOver={
        onDrop
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
            }
          : undefined
      }
      onDrop={
        onDrop
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onDrop();
            }
          : undefined
      }
    >
      <div className="okr-card-meta">
        <span className={`okr-domain is-${o.domain}`}>{tr(o.domain)}</span>
        <span>{tr(o.horizon)}</span>
        {onDrag && !o.archived_at && (
          <button
            className="icon-button okr-grip"
            draggable={!busy}
            aria-label={tr("drag", { title: o.title })}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", o.id);
              onDrag(o.id);
            }}
          >
            <Icon name="grip" />
          </button>
        )}
      </div>
      <h3>
        <button
          className="okr-title-button"
          onClick={onOpen}
          aria-label={tr("card_open", { title: o.title })}
        >
          {o.title}
        </button>
      </h3>
      {parent && (
        <p className="okr-parent">
          <Icon name="arrow" size={14} />
          {parent.title}
        </p>
      )}
      {o.first_action && o.status !== "done" && (
        <p className="okr-next-step">{o.first_action}</p>
      )}
      {o.key_results.length ? (
        <Progress value={o.progress} />
      ) : (
        <p className="okr-small muted">{tr("no_results")}</p>
      )}
      <div className="okr-card-foot">
        {o.due_date && (
          <span
            className={
              o.due_date < today && o.status !== "done" ? "okr-late" : ""
            }
          >
            <Icon name="calendar" size={14} />
            {tr("due", { date: dateLabel(o.due_date) })}
          </span>
        )}
        {quarter &&
          o.status !== "done" &&
          o.planned_quarter &&
          o.planned_quarter < quarter && (
            <span>
              {tr("carryover", { quarter: quarterLabel(o.planned_quarter) })}
            </span>
          )}
      </div>
      {!o.archived_at && (
        <div className="okr-card-controls">
          <select
            aria-label={tr("move", { title: o.title })}
            value={o.status}
            disabled={busy}
            onChange={(e) => onMove(e.target.value as Status)}
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {tr(s)}
              </option>
            ))}
          </select>
          {onDrag && (
            <>
              <button
                disabled={busy || up === undefined}
                className="icon-button"
                aria-label={tr("move_up", { title: o.title })}
                onClick={() => onMove(o.status, up)}
              >
                <Icon name="up" />
              </button>
              <button
                disabled={busy || down === undefined}
                className="icon-button"
                aria-label={tr("move_down", { title: o.title })}
                onClick={() => onMove(o.status, down)}
              >
                <Icon name="down" />
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}
