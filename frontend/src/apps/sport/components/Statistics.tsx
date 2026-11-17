import { useEffect, useState } from "react";
import { tr } from "../i18n";
import { ScoreExplanation } from "./ScoreExplanation";
import { sportApi } from "../api";
import { useSportSettings } from "../preferences";
import { queryString, useSportQuery, type SportNavigate } from "../navigation";
import {
  measureFields,
  type KindDefinition,
  type MeasureKey,
  type Metric,
} from "../types";
import { day, LoadState, moment, number, useResource } from "./common";
import { CompactOptions } from "./compact";
import { Chart } from "./Chart";

type MetricKey =
  | "value"
  | "volume_kg"
  | "reps"
  | "distance_m"
  | "duration_seconds";
function startDate(today: string, mode: string) {
  const date = new Date(`${today}T00:00:00Z`);
  if (mode === "year") return `${date.getUTCFullYear()}-01-01`;
  if (mode === "quarter") {
    const target = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 3, 1),
    );
    const last = new Date(
      Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
    ).getUTCDate();
    target.setUTCDate(Math.min(date.getUTCDate(), last));
    return target.toISOString().slice(0, 10);
  }
  date.setUTCDate(date.getUTCDate() - (mode === "month" ? 29 : 365));
  return date.toISOString().slice(0, 10);
}
function validPeriod(since: string, until: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(since) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(until) ||
    until === "9999-12-31"
  )
    return false;
  const distance = (Date.parse(until) - Date.parse(since)) / 86400000;
  return Number.isFinite(distance) && distance >= 0 && distance <= 3660;
}
const metricOptions = (metric: Metric | undefined) =>
  metric
    ? [
        {
          key: "value" as const,
          label: tr("performance_metric"),
          unit: metric.unit,
        },
        ...(["weight_reps"].includes(metric.kind)
          ? [
              {
                key: "volume_kg" as const,
                label: tr("weight_lifted"),
                unit: "kg",
              },
            ]
          : []),
        ...(metric.kind.includes("reps")
          ? [
              {
                key: "reps" as const,
                label: tr("repetitions_metric"),
                unit: tr("repetitions_unit"),
              },
            ]
          : []),
        ...(metric.kind.includes("distance")
          ? [
              {
                key: "distance_m" as const,
                label: tr("distance_metric"),
                unit: "m",
              },
            ]
          : []),
        ...(metric.kind.includes("duration")
          ? [
              {
                key: "duration_seconds" as const,
                label: tr("duration_metric"),
                unit: "s",
              },
            ]
          : []),
      ]
    : [];

export function Statistics({
  kinds,
  navigate,
}: {
  kinds: KindDefinition[];
  navigate: SportNavigate;
}) {
  const { settings } = useSportSettings();
  const today = settings.server_today;
  const [query, update] = useSportQuery({
    stat_since: startDate(today, "default"),
    stat_until: today,
    stat_period: "custom",
    stat_measure: "weight_kg",
    stat_exercise: "",
    stat_baseline: "",
    stat_metric: "value",
    stat_occurrence: "0",
  });
  const [since, setSince] = useState(query.stat_since),
    [until, setUntil] = useState(query.stat_until);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    setSince(query.stat_since);
    setUntil(query.stat_until);
    setSubmitted(false);
  }, [query.stat_since, query.stat_until]);
  const validQuery = validPeriod(query.stat_since, query.stat_until);
  const period = {
    since: validQuery ? query.stat_since : startDate(today, "default"),
    until: validQuery ? query.stat_until : today,
  };
  const invalid = !validPeriod(since, until);
  const resource = useResource(
    (signal) => sportApi.statistics(period.since, period.until, signal),
    [period.since, period.until],
  );
  const stats = resource.data;
  const available = Array.from(
    new Map(
      stats?.sessions.flatMap((session) =>
        session.metrics.map(
          (metric) => [`${metric.exercise_id}|${metric.kind}`, metric] as const,
        ),
      ) ?? [],
    ).entries(),
  );
  const selected =
    available.find(([id]) => id === query.stat_exercise) ?? available[0];
  const metric = selected?.[1];
  const metrics = metricOptions(metric);
  const selectedMetric =
    metrics.find((option) => option.key === query.stat_metric) ?? metrics[0];
  const metricKey: MetricKey = selectedMetric?.key ?? "value";
  const comparable = stats?.baselines ?? [];
  const baseline =
    comparable.find((item) => item.id === query.stat_baseline) ?? comparable[0];
  const exerciseData = useResource(
    (signal) =>
      query.stat_exercise && selected
        ? sportApi
            .statistics(
              period.since,
              period.until,
              signal,
              queryString({ exercise_id: selected[1].exercise_id }),
            )
            .then((data) => ({ key: selected[0], data }))
        : Promise.resolve(null),
    [period.since, period.until, query.stat_exercise, selected?.[0]],
  );
  const scoreData = useResource(
    (signal) =>
      query.stat_baseline && baseline
        ? sportApi
            .statistics(
              period.since,
              period.until,
              signal,
              queryString({ baseline_id: baseline.id }),
            )
            .then((data) => ({ key: baseline.id, data }))
        : Promise.resolve(null),
    [period.since, period.until, query.stat_baseline, baseline?.id],
  );
  const sessions =
    exerciseData.data && exerciseData.data.key === selected?.[0]
      ? exerciseData.data.data.sessions
      : (stats?.sessions ?? []);
  const sameExercise = (value: Metric) =>
    `${value.exercise_id}|${value.kind}` === selected?.[0];
  const occurrences = Math.max(
    1,
    ...sessions.map((session) => session.metrics.filter(sameExercise).length),
  );
  const occurrence = Math.min(
    Math.max(0, Number(query.stat_occurrence) || 0),
    occurrences - 1,
  );
  const field =
    measureFields().find(([key]) => key === query.stat_measure) ??
    measureFields()[0];
  const measurement = field[0] as MeasureKey;
  const performancePoints = sessions.flatMap((session) => {
    const value = session.metrics.filter(sameExercise)[occurrence];
    return value
      ? [
          {
            at: session.started_at,
            label: moment(session.started_at),
            value: value[metricKey],
          },
        ]
      : [];
  });
  const chartAction = (
    <button className="secondary-button" onClick={() => navigate("workouts")}>
      {tr("choose_a_program")}
    </button>
  );
  function preset(mode: string) {
    update({
      stat_since: startDate(today, mode),
      stat_until: today,
      stat_period: mode,
    });
  }
  return (
    <>
      <div
        className="sport-presets sport-desktop-only"
        role="group"
        aria-label={tr("statistics_period")}
      >
        {(["month", "quarter", "year"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className="secondary-button"
            aria-pressed={query.stat_period === mode}
            onClick={() => preset(mode)}
          >
            {tr(
              mode === "month"
                ? "last_30_days"
                : mode === "quarter"
                  ? "last_3_months"
                  : "this_year",
            )}
          </button>
        ))}
      </div>
      <div className="sport-stat-period-controls">
        <label className="sport-mobile-only sport-chart-select">
          <span className="sr-only">{tr("statistics_period")}</span>
          <select
            aria-label={tr("statistics_period")}
            value={
              ["month", "quarter", "year"].includes(query.stat_period)
                ? query.stat_period
                : "custom"
            }
            onChange={(event) => {
              if (event.target.value !== "custom") preset(event.target.value);
            }}
          >
            <option value="custom" disabled>
              {tr("period_short")}
            </option>
            <option value="month">{tr("last_30_days")}</option>
            <option value="quarter">{tr("last_3_months")}</option>
            <option value="year">{tr("this_year")}</option>
          </select>
        </label>
        <CompactOptions label={tr("dates_short")}>
          <form
            className="sport-filters sport-period-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              setSubmitted(true);
              if (!invalid)
                update({
                  stat_since: since,
                  stat_until: until,
                  stat_period: "custom",
                });
            }}
          >
            <label>
              {tr("from")}
              <input
                type="date"
                required
                value={since}
                aria-invalid={invalid}
                aria-describedby={invalid ? "sport-period-error" : undefined}
                onChange={(event) => setSince(event.target.value)}
              />
            </label>
            <label>
              {tr("period_end")}
              <input
                type="date"
                required
                value={until}
                aria-invalid={invalid}
                aria-describedby={invalid ? "sport-period-error" : undefined}
                onChange={(event) => setUntil(event.target.value)}
              />
            </label>
            <button className="secondary-button">{tr("apply_period")}</button>
          </form>
        </CompactOptions>
      </div>
      {(invalid || !validQuery) && (
        <p
          id="sport-period-error"
          className="form-error"
          role={submitted ? "alert" : undefined}
        >
          {tr("invalid_period")}
        </p>
      )}
      <LoadState {...resource} />
      {stats && (
        <>
          <p className="muted sport-period-caption">
            {tr("displayed_period", {
              since: day(stats.since),
              until: day(stats.until),
            })}
          </p>
          <div className="sport-summary">
            <div>
              <span>{tr("training_sessions")}</span>
              <strong>{stats.completed_sessions}</strong>
            </div>
            <div>
              <span>{tr("completed_sets")}</span>
              <strong>{stats.total_sets}</strong>
            </div>
            <div>
              <span>{tr("weight_lifted")}</span>
              <strong>
                {number(stats.total_volume_kg)} <small>kg</small>
              </strong>
            </div>
            <div>
              <span>{tr("total_distance")}</span>
              <strong>
                {number(stats.total_distance_m / 1000)} <small>km</small>
              </strong>
            </div>
          </div>
          <div className="sport-stats-grid">
            <section>
              <label className="sport-chart-select">
                {tr("body_measurement")}
                <select
                  value={measurement}
                  onChange={(event) =>
                    update({ stat_measure: event.target.value })
                  }
                >
                  {measureFields().map(([key, label, unit]) => (
                    <option value={key} key={key}>
                      {label} ({unit})
                    </option>
                  ))}
                </select>
              </label>
              <Chart
                title={field[1]}
                unit={field[2]}
                points={stats.measurements
                  .filter((value) => value[measurement] != null)
                  .map((value) => ({
                    at: value.measured_on,
                    label: day(value.measured_on),
                    value: value[measurement]!,
                  }))}
                emptyAction={
                  <div className="sport-inline">
                    <button
                      className="primary-button"
                      onClick={() =>
                        navigate("measurements", { measure_new: "1" })
                      }
                    >
                      {tr("new_record")}
                    </button>
                    <button
                      className="text-button"
                      onClick={() => preset("default")}
                    >
                      {tr("expand_period")}
                    </button>
                  </div>
                }
              />
            </section>
            <section>
              <label className="sport-chart-select">
                {tr("performance_by_exercise")}
                <select
                  value={selected?.[0] ?? ""}
                  onChange={(event) =>
                    update({
                      stat_exercise: event.target.value,
                      stat_occurrence: "0",
                      stat_metric: "value",
                    })
                  }
                >
                  <option value="" disabled>
                    {tr("choose_an_exercise")}
                  </option>
                  {available.map(([id, value]) => (
                    <option value={id} key={id}>
                      {value.name} ·{" "}
                      {kinds.find((kind) => kind.id === value.kind)?.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedMetric && (
                <label className="sport-chart-select">
                  {tr("chart_metric")}
                  <select
                    value={metricKey}
                    onChange={(event) =>
                      update({ stat_metric: event.target.value })
                    }
                  >
                    {metrics.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label} ({option.unit})
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {occurrences > 1 && (
                <label className="sport-chart-select">
                  {tr("exercise_occurrence")}
                  <select
                    value={occurrence}
                    onChange={(event) =>
                      update({ stat_occurrence: event.target.value })
                    }
                  >
                    {Array.from({ length: occurrences }, (_, index) => (
                      <option key={index} value={index}>
                        {tr("occurrence_number", { number: index + 1 })}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <LoadState {...exerciseData} />
              <Chart
                title={metric?.name ?? tr("training_performance")}
                unit={selectedMetric?.unit ?? ""}
                points={performancePoints}
                emptyAction={chartAction}
              />
              {metric && (
                <p className="muted small-text">
                  {metricKey === "value"
                    ? kinds.find((kind) => kind.id === metric.kind)?.metric
                    : tr("metric_per_occurrence")}
                </p>
              )}
              {occurrences > 1 && (
                <p className="muted small-text">{tr("occurrence_help")}</p>
              )}
            </section>
          </div>
          <label className="sport-chart-select">
            {tr("programs_and_baselines")}
            <select
              value={baseline?.id ?? ""}
              onChange={(event) =>
                update({ stat_baseline: event.target.value })
              }
            >
              <option value="" disabled>
                {tr("choose_a_program")}
              </option>
              {comparable.map((value) => (
                <option key={value.id} value={value.id}>
                  {tr("baseline_description", {
                    name: value.name,
                    date: day(value.started_at),
                    count: value.exercise_count,
                  })}
                </option>
              ))}
            </select>
          </label>
          <LoadState {...scoreData} />
          <Chart
            title={tr("training_score")}
            unit="points"
            points={(scoreData.data && scoreData.data.key === baseline?.id
              ? scoreData.data.data.sessions
              : stats.sessions
            )
              .filter(
                (session) =>
                  session.score != null &&
                  (session.baseline_id ?? session.id) === baseline?.id,
              )
              .map((session) => ({
                at: session.started_at,
                label: moment(session.started_at),
                value: session.score!,
              }))}
            emptyAction={chartAction}
          />
          <ScoreExplanation
            legacy={
              stats.sessions.find(
                (session) =>
                  (session.baseline_id ?? session.id) === baseline?.id,
              )?.score_details == null
            }
          />
        </>
      )}
    </>
  );
}
