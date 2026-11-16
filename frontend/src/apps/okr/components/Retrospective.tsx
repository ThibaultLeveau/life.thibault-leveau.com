import { useState } from "react";
import { useApiResource } from "../../../platform/useApiResource";
import { Icon } from "../../../shared/ui/Icon";
import { okrApi } from "../api";
import { dateLabel, number, quarterLabel, tr } from "../i18n";
import { Empty, LoadState } from "./common";
export function Retrospective({
  currentQuarter,
  revision,
}: {
  currentQuarter: string;
  revision: number;
}) {
  const [quarter, setQuarter] = useState(currentQuarter),
    [offset, setOffset] = useState(0);
  const result = useApiResource(
    (signal) => okrApi.achievements(quarter, offset, signal),
    [quarter, offset, revision],
  );
  const quarters = Array.from(
    new Set([currentQuarter, quarter, ...(result.data?.quarters ?? [])]),
  )
    .sort()
    .reverse();
  return (
    <>
      <div className="okr-toolbar">
        <label>
          {tr("quarter_select")}
          <select
            value={quarter}
            onChange={(e) => {
              setQuarter(e.target.value);
              setOffset(0);
            }}
          >
            {quarters.map((q) => (
              <option value={q} key={q}>
                {quarterLabel(q)}
              </option>
            ))}
          </select>
        </label>
        {result.data && (
          <p className="muted">
            {tr("achievements_count", { count: result.data.total })}
          </p>
        )}
      </div>
      <LoadState {...result} />
      {result.data &&
        (result.data.items.length ? (
          <>
            <div className="okr-achievements">
              {result.data.items.map((event) => (
                <article className="okr-achievement" key={event.id}>
                  <div className="okr-achievement-marker">
                    <Icon name="check" size={20} />
                  </div>
                  <div>
                    <div className="okr-card-meta">
                      <span
                        className={`okr-domain is-${event.snapshot.domain}`}
                      >
                        {tr(event.snapshot.domain)}
                      </span>
                      <span>{tr(event.snapshot.horizon)}</span>
                      <time dateTime={event.occurred_at}>
                        {dateLabel(event.occurred_at)}
                      </time>
                    </div>
                    <h2>{event.snapshot.title}</h2>
                    {event.snapshot.outcome && <p>{event.snapshot.outcome}</p>}
                    <ul>
                      {event.snapshot.key_results.map((k) => (
                        <li key={k.id}>
                          <Icon name="check" size={16} />
                          <span>{k.title}</span>
                          <strong>
                            {number(k.current)} / {number(k.target)} {k.unit}
                          </strong>
                        </li>
                      ))}
                    </ul>
                    {event.reopened && (
                      <span className="okr-reopened">{tr("reopened")}</span>
                    )}
                    <p className="muted okr-small">{tr("snapshot_hint")}</p>
                  </div>
                </article>
              ))}
            </div>
            <div className="okr-inline">
              <button
                className="secondary-button"
                disabled={!offset}
                onClick={() => setOffset(offset - 30)}
              >
                {tr("previous")}
              </button>
              <button
                className="secondary-button"
                disabled={offset + 30 >= result.data.total}
                onClick={() => setOffset(offset + 30)}
              >
                {tr("next")}
              </button>
            </div>
          </>
        ) : (
          <Empty title={tr("empty_achievements")}>
            {tr("empty_achievements_body")}
          </Empty>
        ))}
    </>
  );
}
