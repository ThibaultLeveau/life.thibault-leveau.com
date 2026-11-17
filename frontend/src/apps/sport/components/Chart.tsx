import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { tr } from "../i18n";
import { formatLocale } from "../../../shared/i18n";
import { Empty, number } from "./common";

export type ChartPoint = { label: string; value: number; at: string };
export function Chart({
  title,
  unit,
  points,
  emptyAction,
}: {
  title: string;
  unit: string;
  points: ChartPoint[];
  emptyAction?: ReactNode;
}) {
  const id = useId();
  const svg = useRef<SVGSVGElement>(null);
  const lastTouch = useRef(0);
  const dots = useRef<(SVGGElement | null)[]>([]);
  const [width, setWidth] = useState(640);
  const [selected, setSelected] = useState(0);
  const [showValue, setShowValue] = useState(false);
  const hasPoints = points.length > 0;
  useEffect(() => {
    if (!svg.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(180, entry.contentRect.width)),
    );
    observer.observe(svg.current);
    return () => observer.disconnect();
  }, [hasPoints]);
  useEffect(() => {
    setSelected(0);
    setShowValue(false);
  }, [title, unit]);
  if (!points.length)
    return (
      <Empty title={title} action={emptyAction}>
        {tr("no_data_for_this_period")}
      </Empty>
    );
  const min = Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));
  const spread = max - min || Math.max(1, Math.abs(max) * 0.05);
  const low = min - spread * 0.1,
    high = max + spread * 0.1;
  const first = points[0],
    last = points.at(-1)!;
  const times = points.map((point) => Date.parse(point.at));
  const firstTime = Math.min(...times),
    lastTime = Math.max(...times);
  const x = (index: number) =>
    firstTime === lastTime
      ? (width + 30) / 2
      : 50 +
        ((times[index] - firstTime) / (lastTime - firstTime)) * (width - 70);
  const y = (value: number) => 175 - ((value - low) / (high - low)) * 145;
  const sameDay = first.at.slice(0, 10) === last.at.slice(0, 10);
  const axisLabel = (point: ChartPoint) =>
    new Intl.DateTimeFormat(
      formatLocale(),
      sameDay && point.at.includes("T")
        ? {
            hour: "2-digit",
            minute: "2-digit",
            ...(lastTime - firstTime < 60000 ? { second: "2-digit" } : {}),
          }
        : {
            day: "numeric",
            month: "short",
            ...(point.at.length === 10 ? { timeZone: "UTC" } : {}),
          },
    ).format(new Date(point.at));
  const active = Math.min(selected, points.length - 1);
  const valueLabel = (index: number) =>
    `${points[index].label} : ${number(points[index].value)} ${unit}`;
  function select(index: number, focus = false) {
    setSelected(index);
    setShowValue(true);
    if (focus) dots.current[index]?.focus();
  }
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
          {last.value - first.value > 0 ? "+" : ""}
          {number(last.value - first.value)} {unit}{" "}
          {tr("between_the_first_and_last_records")}
        </p>
      )}
      <p className="muted small-text" id={`${id}-help`}>
        {tr("chart_time_help")}
      </p>
      <svg
        ref={svg}
        viewBox={`0 0 ${width} 215`}
        role="group"
        aria-labelledby={id}
        aria-describedby={`${id}-help`}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse") return;
          const box = event.currentTarget.getBoundingClientRect();
          const px = ((event.clientX - box.left) * width) / box.width,
            py = ((event.clientY - box.top) * 215) / box.height;
          const nearest = points.reduce(
            (best, point, index) =>
              Math.hypot(x(index) - px, y(point.value) - py) <
              Math.hypot(x(best) - px, y(points[best].value) - py)
                ? index
                : best,
            0,
          );
          lastTouch.current = Date.now();
          select(nearest);
        }}
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
          .filter((value, index, values) => values.indexOf(value) === index)
          .map((value) => (
            <g key={value} aria-hidden="true">
              <line
                x1="50"
                x2={width - 20}
                y1={y(value)}
                y2={y(value)}
                className="sport-chart-grid"
              />
              <text x="43" y={y(value) + 4} textAnchor="end">
                {number(value)}
              </text>
            </g>
          ))}
        <polyline
          points={points
            .map((point, index) => `${x(index)},${y(point.value)}`)
            .join(" ")}
          fill="none"
          className="sport-chart-line"
          aria-hidden="true"
        />
        {points.map((point, index) => (
          <g
            key={`${point.at}-${index}`}
            ref={(element) => {
              dots.current[index] = element;
            }}
            role="button"
            tabIndex={index === active ? 0 : -1}
            aria-label={valueLabel(index)}
            aria-pressed={showValue && index === active}
            className="sport-chart-point"
            onFocus={() => select(index)}
            onClick={() => {
              if (Date.now() - lastTouch.current > 500) select(index);
            }}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight" || event.key === "ArrowDown"
                  ? Math.min(points.length - 1, index + 1)
                  : event.key === "ArrowLeft" || event.key === "ArrowUp"
                    ? Math.max(0, index - 1)
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? points.length - 1
                        : null;
              if (next != null) {
                event.preventDefault();
                select(next, true);
              }
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                select(index);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setShowValue(false);
              }
            }}
          >
            <circle
              cx={x(index)}
              cy={y(point.value)}
              r="22"
              className="sport-chart-hit"
            />
            <circle
              cx={x(index)}
              cy={y(point.value)}
              r={showValue && index === active ? 6 : 3.5}
              className="sport-chart-dot"
            >
              <title>{valueLabel(index)}</title>
            </circle>
          </g>
        ))}
        <text
          x={points.length === 1 ? x(0) : 50}
          y="205"
          textAnchor={points.length === 1 ? "middle" : "start"}
          aria-hidden="true"
        >
          {axisLabel(first)}
        </text>
        {points.length > 1 && (
          <text x={width - 20} y="205" textAnchor="end" aria-hidden="true">
            {axisLabel(last)}
          </text>
        )}
      </svg>
      <div className="sport-chart-value" role="status">
        {showValue ? valueLabel(active) : tr("chart_select_point")}
      </div>
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
              {points.map((point, index) => (
                <tr key={`${point.at}-${index}`}>
                  <td>{point.label}</td>
                  <td>{number(point.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
