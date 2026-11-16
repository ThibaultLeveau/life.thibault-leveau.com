import { useState } from "react";
import { Icon } from "../../../shared/ui/Icon";
import { evaluation, integrationApi, trackingApi } from "../api";
import { addDays, dateLabel, number } from "../dates";
import { tr } from "../i18n";
import type { DynamicSource, Metric, Tracker } from "../types";
import { LoadState, Score, useResource } from "./common";
import { SourcePicker } from "./SourcePicker";
export function StatisticsView({
  today,
  timezone,
  trackers,
  revision,
}: {
  today: string;
  timezone: string;
  trackers: Tracker[];
  revision: number;
}) {
  const [since, setSince] = useState(addDays(today, -29)),
    [until, setUntil] = useState(today),
    [tracker, setTracker] = useState(""),
    [explore, setExplore] = useState(false);
  const [activity, setActivity] = useState<{
    source: DynamicSource;
    metric: Metric;
  } | null>(null);
  const [activityRevision, refreshActivity] = useState(0);
  const result = useResource(
    (signal) => trackingApi.statistics(since, until, tracker, signal),
    [since, until, tracker, revision],
  );
  const activityResult = useResource(
    (signal) =>
      activity
        ? integrationApi.evaluate(
            evaluation(activity.source, since, until, timezone),
            signal,
          )
        : Promise.resolve(null),
    [activity, since, until, timezone, activityRevision, revision],
  );
  return (
    <>
      <div className="tracking-stat-filters">
        <label>
          {tr("since")}
          <input
            type="date"
            value={since}
            min="2000-01-01"
            max={until}
            onChange={(e) => {
              if (e.target.value) setSince(e.target.value);
            }}
          />
        </label>
        <label>
          {tr("until")}
          <input
            type="date"
            value={until}
            min={since}
            max={today}
            onChange={(e) => {
              if (e.target.value) setUntil(e.target.value);
            }}
          />
        </label>
        <label>
          {tr("trackers")}
          <select value={tracker} onChange={(e) => setTracker(e.target.value)}>
            <option value="">{tr("all_trackers")}</option>
            {trackers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <LoadState {...result} />
      {result.data && (
        <>
          <div className="tracking-stats-summary">
            <div>
              <span>{tr("completion_rate")}</span>
              <strong>
                {result.data.completion_rate === null
                  ? "—"
                  : `${number(result.data.completion_rate)}%`}
              </strong>
            </div>
            <div>
              <span>{tr("average_score")}</span>
              <Score value={result.data.average_score} large />
            </div>
            <div>
              <span>{tr("scheduled_streak")}</span>
              <strong>
                {tr("days_count", { count: result.data.achievements.streak })}
              </strong>
            </div>
          </div>
          <section className="tracking-trends">
            <h2>{tr("trends")}</h2>
            {!tracker ? (
              <p className="muted">{tr("select_tracker_trends")}</p>
            ) : !result.data.trends.length ? (
              <p className="muted">{tr("no_trend")}</p>
            ) : (
              result.data.trends.map((t) => {
                const points = t.points.filter(
                    (p) =>
                      typeof p.value === "number" ||
                      typeof p.value === "boolean",
                  ),
                  signed = points.some((p) => Number(p.value) < 0),
                  max = Math.max(
                    1,
                    ...points.map((p) => Math.abs(Number(p.value))),
                  );
                return (
                  <div className="tracking-trend" key={t.field_id}>
                    <h3>{points.at(-1)?.label}</h3>
                    <div
                      className="tracking-trend-chart"
                      role="img"
                      aria-label={points
                        .map(
                          (p) => `${dateLabel(p.date)} : ${p.value} ${p.unit}`,
                        )
                        .join("; ")}
                    >
                      {points.slice(-31).map((p, i) => (
                        <div
                          className="tracking-trend-column"
                          key={`${p.date}:${i}`}
                        >
                          <span>
                            {typeof p.value === "boolean"
                              ? tr(p.value ? "yes" : "no")
                              : number(Number(p.value))}
                          </span>
                          <div
                            className={`tracking-trend-track ${signed ? "is-signed" : ""}`}
                          >
                            <i
                              style={{
                                height: `${Math.max(1, (Math.abs(Number(p.value)) / max) * (signed ? 50 : 100))}%`,
                                ...(signed
                                  ? {
                                      top: Number(p.value) < 0 ? "50%" : "auto",
                                      bottom:
                                        Number(p.value) >= 0 ? "50%" : "auto",
                                      background:
                                        Number(p.value) < 0
                                          ? "var(--tracking-red)"
                                          : undefined,
                                    }
                                  : {}),
                              }}
                            />
                          </div>
                          <small>
                            {dateLabel(p.date, {
                              day: "numeric",
                              month: "short",
                            })}
                          </small>
                        </div>
                      ))}
                    </div>
                    <details>
                      <summary>{tr("data_to_track")}</summary>
                      <table>
                        <thead>
                          <tr>
                            <th>{tr("period")}</th>
                            <th>{tr("recorded_value")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {points.map((p, i) => (
                            <tr key={`${p.date}:${i}`}>
                              <td>{dateLabel(p.date)}</td>
                              <td>
                                {typeof p.value === "boolean"
                                  ? tr(p.value ? "yes" : "no")
                                  : number(Number(p.value))}{" "}
                                {p.unit}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  </div>
                );
              })
            )}
          </section>
        </>
      )}
      <section className="tracking-activity">
        <span className="tracking-source-symbol">
          <Icon name="grid" size={24} />
        </span>
        <div>
          <h2>{tr("activity")}</h2>
          <p className="muted">{tr("activity_hint")}</p>
        </div>
        <button className="secondary-button" onClick={() => setExplore(true)}>
          {tr("explore_activity")}
          <Icon name="arrow" size={16} />
        </button>
      </section>
      {activity && (
        <section className="tracking-activity-result" aria-live="polite">
          <h3>{activity.metric.label}</h3>
          <p className="muted">
            {dateLabel(since)} — {dateLabel(until)}
          </p>
          <LoadState {...activityResult} />
          {activityResult.data && (
            <>
              <strong className="tracking-activity-value">
                {activityResult.data.result.state === "ok"
                  ? `${number(activityResult.data.result.value!)} ${activity.metric.unit}`
                  : tr(
                      activityResult.data.result.state === "missing"
                        ? "no_measurement"
                        : "not_available",
                    )}
              </strong>
              {activityResult.data.result.message && (
                <p>{activityResult.data.result.message}</p>
              )}
            </>
          )}
          <button
            className="text-button"
            onClick={() => refreshActivity((n) => n + 1)}
          >
            {tr("refresh_activity")}
          </button>
        </section>
      )}
      {explore && (
        <SourcePicker
          initial={activity?.source ?? null}
          frequency="monthly"
          timezone={timezone}
          range={[since, until]}
          onClose={() => setExplore(false)}
          onSelect={(source, metric) => {
            setActivity({ source, metric });
            setExplore(false);
          }}
        />
      )}
    </>
  );
}
