import { tr } from "../i18n";
import { useEffect, useId, useRef, useState } from "react";
import { ScoreExplanation } from "./ScoreExplanation";
import { sportApi } from "../api";
import { measureFields, type KindDefinition, type MeasureKey } from "../types";
import { day, Empty, LoadState, localDay, number, useResource } from "./common";

function Chart({
  title,
  unit,
  points,
}: {
  title: string;
  unit: string;
  points: { label: string; value: number }[];
}) {
  const id = useId();
  const svg = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(640);
  const hasPoints = points.length > 0;
  useEffect(() => {
    if (!svg.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(180, entry.contentRect.width));
    });
    observer.observe(svg.current);
    return () => observer.disconnect();
  }, [hasPoints]);
  if (!points.length)
    return <Empty title={title}>{tr("no_data_for_this_period")}</Empty>;
  const min = Math.min(...points.map((p) => p.value));
  const max = Math.max(...points.map((p) => p.value));
  const spread = max - min || Math.max(1, max * 0.05);
  const low = min - spread * 0.1;
  const high = max + spread * 0.1;
  const x = (i: number) =>
    points.length === 1
      ? (width + 30) / 2
      : 50 + (i / (points.length - 1)) * (width - 70);
  const y = (v: number) => 175 - ((v - low) / (high - low)) * 145;
  const last = points.at(-1)!;
  const first = points[0];
  const change = last.value - first.value;
  return (
    <section className="sport-chart">
      <div className="sport-section-heading">
        <h2>{title}</h2>
        <span className="sport-tag">
          {number(last.value)} {unit}
        </span>
      </div>
      {points.length > 1 && (
        <p className="muted">
          {change > 0 ? "+" : ""}
          {number(change)} {unit} {tr("between_the_first_and_last_records")}
        </p>
      )}
      <svg
        ref={svg}
        viewBox={`0 0 ${width} 215`}
        role="img"
        aria-labelledby={id}
      >
        <title id={id}>
          {tr("chart_summary", {
            title,
            count: points.length,
            first: number(first.value),
            last: number(last.value),
            unit,
          })}
        </title>
        {[min, max]
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((v) => (
            <g key={v}>
              <line
                x1="50"
                x2={width - 20}
                y1={y(v)}
                y2={y(v)}
                className="sport-chart-grid"
              />
              <text x="43" y={y(v) + 4} textAnchor="end">
                {number(v)}
              </text>
            </g>
          ))}
        <polyline
          points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")}
          fill="none"
          className="sport-chart-line"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(p.value)}
            r="3.5"
            className="sport-chart-dot"
          >
            <title>
              {p.label} : {number(p.value)} {unit}
            </title>
          </circle>
        ))}
        <text
          x={points.length === 1 ? x(0) : 50}
          y="205"
          textAnchor={points.length === 1 ? "middle" : "start"}
        >
          {first.label}
        </text>
        {points.length > 1 && (
          <text x={width - 20} y="205" textAnchor="end">
            {last.label}
          </text>
        )}
      </svg>
      <details>
        <summary>{tr("view_values")}</summary>
        <div className="sport-table-wrap">
          <table>
            <thead>
              <tr>
                <th>{tr("date")}</th>
                <th>
                  {title} ({unit})
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={i}>
                  <td>{p.label}</td>
                  <td>{number(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
export function Statistics({ kinds }: { kinds: KindDefinition[] }) {
  const [since, setSince] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [until, setUntil] = useState(localDay());
  const [measurement, setMeasurement] = useState<MeasureKey>("weight_kg");
  const [exercise, setExercise] = useState("");
  const [workout, setWorkout] = useState("");
  const resource = useResource(
    (signal) => sportApi.statistics(since, until, signal),
    [since, until],
  );
  const stats = resource.data;
  const availableExercises = Array.from(
    new Map(
      stats?.sessions.flatMap((s) =>
        s.metrics.map((m) => [`${m.exercise_id}|${m.kind}`, m] as const),
      ) ?? [],
    ).entries(),
  );
  const selectedExercise = availableExercises.some(([id]) => id === exercise)
    ? exercise
    : availableExercises[0]?.[0];
  // Separate score references when an edited workout changes exercise order/count/type.
  const comparable = Array.from(
    new Map(
      stats?.sessions
        .filter((s) => s.score != null)
        .map((s) => [s.baseline_id ?? s.id, s.name] as const) ?? [],
    ).entries(),
  );
  const selectedWorkout = comparable.some(([id]) => id === workout)
    ? workout
    : comparable[0]?.[0];
  const field = measureFields().find(([key]) => key === measurement)!;
  const performance = availableExercises.find(
    ([id]) => id === selectedExercise,
  )?.[1];
  return (
    <>
      <div className="sport-filters">
        <label>
          {tr("from")}
          <input
            type="date"
            required
            value={since}
            onChange={(e) => {
              if (e.target.value) setSince(e.target.value);
            }}
          />
        </label>
        <label>
          {tr("period_end")}
          <input
            type="date"
            required
            value={until}
            onChange={(e) => {
              if (e.target.value) setUntil(e.target.value);
            }}
          />
        </label>
      </div>
      <LoadState {...resource} />
      {stats && (
        <>
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
                  onChange={(e) => setMeasurement(e.target.value as MeasureKey)}
                >
                  {measureFields().map(([key, label, unit]) => (
                    <option key={key} value={key}>
                      {label} ({unit})
                    </option>
                  ))}
                </select>
              </label>
              <Chart
                title={field[1]}
                unit={field[2]}
                points={stats.measurements
                  .filter((m) => m[measurement] != null)
                  .map((m) => ({
                    label: day(m.measured_on),
                    value: m[measurement]!,
                  }))}
              />
            </section>
            <section>
              <label className="sport-chart-select">
                {tr("performance_by_exercise")}
                <select
                  value={selectedExercise ?? ""}
                  onChange={(e) => setExercise(e.target.value)}
                >
                  <option value="" disabled>
                    {tr("choose_an_exercise")}
                  </option>
                  {availableExercises.map(([id, m]) => (
                    <option value={id} key={id}>
                      {m.name} · {kinds.find((k) => k.id === m.kind)?.name}
                    </option>
                  ))}
                </select>
              </label>
              <Chart
                title={performance?.name ?? tr("training_performance")}
                unit={performance?.unit ?? ""}
                points={stats.sessions.flatMap((s) =>
                  s.metrics
                    .filter(
                      (m) => `${m.exercise_id}|${m.kind}` === selectedExercise,
                    )
                    .map((m) => ({ label: day(s.started_at), value: m.value })),
                )}
              />
              {performance && (
                <p className="muted small-text">
                  {kinds.find((k) => k.id === performance.kind)?.metric}
                </p>
              )}
            </section>
          </div>
          <label className="sport-chart-select">
            {tr("programs_and_baselines")}
            <select
              value={selectedWorkout ?? ""}
              onChange={(e) => setWorkout(e.target.value)}
            >
              <option value="" disabled>
                {tr("choose_a_program")}
              </option>
              {comparable.map(([id, name], i) => (
                <option value={id} key={id}>
                  {name} {tr("baseline")} {i + 1}
                </option>
              ))}
            </select>
          </label>
          <Chart
            title={tr("training_score")}
            unit="points"
            points={stats.sessions
              .filter(
                (s) =>
                  s.score != null &&
                  (s.baseline_id ?? s.id) === selectedWorkout,
              )
              .map((s) => ({ label: day(s.started_at), value: s.score! }))}
          />
          <ScoreExplanation legacy={stats.sessions.find(
            (s) => (s.baseline_id ?? s.id) === selectedWorkout,
          )?.score_details == null} />
        </>
      )}
    </>
  );
}
