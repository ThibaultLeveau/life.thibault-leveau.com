import { useId, useState } from "react";
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
  if (!points.length)
    return <Empty title={title}>Aucune donnée sur cette période.</Empty>;
  const min = Math.min(...points.map((p) => p.value));
  const max = Math.max(...points.map((p) => p.value));
  const spread = max - min || Math.max(1, max * 0.05);
  const low = min - spread * 0.1;
  const high = max + spread * 0.1;
  const x = (i: number) => 50 + (i / Math.max(1, points.length - 1)) * 560;
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
          {number(change)} {unit} entre le premier et le dernier relevé
        </p>
      )}
      <svg viewBox="0 0 640 215" role="img" aria-labelledby={id}>
        <title id={id}>
          {title} : {points.length} relevés, de {number(first.value)} à{" "}
          {number(last.value)} {unit}. Valeurs détaillées dans le tableau.
        </title>
        {[min, max]
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((v) => (
            <g key={v}>
              <line
                x1="50"
                x2="610"
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
        <text x="50" y="205">
          {first.label}
        </text>
        <text x="610" y="205" textAnchor="end">
          {last.label}
        </text>
      </svg>
      <details>
        <summary>Voir les valeurs</summary>
        <div className="sport-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
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
      stats?.sessions.map((s) => [s.baseline_id ?? s.id, s.name] as const) ??
        [],
    ).entries(),
  );
  const selectedWorkout = comparable.some(([id]) => id === workout)
    ? workout
    : comparable[0]?.[0];
  const field = measureFields.find(([key]) => key === measurement)!;
  const performance = availableExercises.find(
    ([id]) => id === selectedExercise,
  )?.[1];
  return (
    <>
      <div className="sport-filters">
        <label>
          Du
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
          Au
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
              <span>Entraînements</span>
              <strong>{stats.completed_sessions}</strong>
            </div>
            <div>
              <span>Séries validées</span>
              <strong>{stats.total_sets}</strong>
            </div>
            <div>
              <span>Volume soulevé</span>
              <strong>
                {number(stats.total_volume_kg)} <small>kg</small>
              </strong>
            </div>
            <div>
              <span>Distance totale</span>
              <strong>
                {number(stats.total_distance_m / 1000)} <small>km</small>
              </strong>
            </div>
          </div>
          <div className="sport-stats-grid">
            <section>
              <label className="sport-chart-select">
                Mensuration
                <select
                  value={measurement}
                  onChange={(e) => setMeasurement(e.target.value as MeasureKey)}
                >
                  {measureFields.map(([key, label, unit]) => (
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
                Performance par exercice
                <select
                  value={selectedExercise ?? ""}
                  onChange={(e) => setExercise(e.target.value)}
                >
                  <option value="" disabled>
                    Choisir un exercice
                  </option>
                  {availableExercises.map(([id, m]) => (
                    <option value={id} key={id}>
                      {m.name} · {kinds.find((k) => k.id === m.kind)?.name}
                    </option>
                  ))}
                </select>
              </label>
              <Chart
                title={performance?.name ?? "Performance en séance"}
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
            Séances comparables
            <select
              value={selectedWorkout ?? ""}
              onChange={(e) => setWorkout(e.target.value)}
            >
              <option value="" disabled>
                Choisir une séance
              </option>
              {comparable.map(([id, name], i) => (
                <option value={id} key={id}>
                  {name} · référence {i + 1}
                </option>
              ))}
            </select>
          </label>
          <Chart
            title="Score de séance"
            unit="points"
            points={stats.sessions
              .filter((s) => (s.baseline_id ?? s.id) === selectedWorkout)
              .map((s) => ({ label: day(s.started_at), value: s.score! }))}
          />
          <details className="sport-score-explained">
            <summary>Comment est calculé le score ?</summary>
            <p>
              La première session terminée d’une séance vaut 100. Les suivantes
              comparent la performance de chaque exercice à cette référence,
              puis font la moyenne des rapports, avec le même poids pour chaque
              exercice. 110 représente une hausse moyenne de 10 % selon ces
              mesures.
            </p>
            <p>
              Seules les sessions d’une même séance, avec les mêmes exercices,
              types, ordre et nombres de séries, partagent une référence. Les
              objectifs peuvent évoluer. Les entraînements abandonnés ne
              comptent pas.
            </p>
            <ul>
              {kinds.map((k) => (
                <li key={k.id}>
                  <strong>{k.name} :</strong> {k.metric}.
                </li>
              ))}
            </ul>
            <p>
              Le « + 1 » permet de comparer une charge ou une assistance nulle.
              Le score suit des mesures : il ne juge ni la technique, ni la
              difficulté ressentie, ni la santé. Pour le cardio, la vitesse peut
              augmenter sur une distance plus courte ; consultez aussi la
              distance. Les dates des entraînements sont regroupées en UTC.
            </p>
          </details>
        </>
      )}
    </>
  );
}
