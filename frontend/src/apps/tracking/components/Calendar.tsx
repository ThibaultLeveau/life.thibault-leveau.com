import { useEffect, useRef, useState } from "react";
import { Icon } from "../../../shared/ui/Icon";
import { trackingApi } from "../api";
import { addDays, dateLabel, iso, number, parse, windowFor } from "../dates";
import { tr } from "../i18n";
import type { Day, Tracker } from "../types";
import { LoadState, Score, scoreStyle, useResource } from "./common";

const weekdays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
function monthDays(month: string, days: Day[]) {
  const [start, end] = windowFor(month, "monthly"),
    offset = (parse(start).getUTCDay() + 6) % 7,
    map = new Map(days.map((d) => [d.date, d]));
  return Array.from(
    { length: Math.ceil((offset + parse(end).getUTCDate()) / 7) * 7 },
    (_, i) => {
      const date = addDays(start, i - offset);
      return date >= start && date <= end
        ? (map.get(date) ?? {
            date,
            state: "rest" as const,
            score: null,
            completed: 0,
            expected: 0,
            filled: 0,
            fields: 0,
          })
        : null;
    },
  );
}
export function CalendarView({
  today,
  trackers,
  revision,
  onOpen,
}: {
  today: string;
  trackers: Tracker[];
  revision: number;
  onOpen: (id: string, day: string) => void;
}) {
  const [month, setMonth] = useState(today.slice(0, 7) + "-01"),
    [selected, setSelected] = useState(today),
    [mode, setMode] = useState<"monthly" | "yearly">("monthly"),
    [filter, setFilter] = useState("");
  const [since, until] = windowFor(month, mode);
  const resource = useResource(
    (signal) => trackingApi.calendar(since, until, filter, signal),
    [since, until, filter, revision],
  );
  const focusDay = useRef(false),
    grid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusDay.current) {
      grid.current
        ?.querySelector<HTMLButtonElement>(`[data-day="${selected}"]`)
        ?.focus();
      focusDay.current = false;
    }
  }, [selected, resource.data]);
  const selectedDay = resource.data?.days.find((d) => d.date === selected);
  function navigate(n: number) {
    const d = parse(month);
    d.setUTCMonth(d.getUTCMonth() + (mode === "yearly" ? 12 : 1) * n);
    if (d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2100) return;
    const next = iso(d);
    setMonth(next);
    setSelected(next);
  }
  function select(date: string) {
    setSelected(date);
  }
  function key(event: React.KeyboardEvent<HTMLButtonElement>, date: string) {
    let next = date;
    const weekday = (parse(date).getUTCDay() + 6) % 7;
    if (event.key === "ArrowLeft") next = addDays(date, -1);
    else if (event.key === "ArrowRight") next = addDays(date, 1);
    else if (event.key === "ArrowUp") next = addDays(date, -7);
    else if (event.key === "ArrowDown") next = addDays(date, 7);
    else if (event.key === "Home") next = addDays(date, -weekday);
    else if (event.key === "End") next = addDays(date, 6 - weekday);
    else return;
    event.preventDefault();
    focusDay.current = true;
    setSelected(next);
    if (next.slice(0, 7) !== month.slice(0, 7))
      setMonth(next.slice(0, 7) + "-01");
  }
  return (
    <section className="tracking-calendar-view">
      <div className="tracking-calendar-toolbar">
        <div className="tracking-calendar-title">
          <button
            className="icon-button"
            aria-label={tr(
              mode === "monthly" ? "previous_month" : "previous_year",
            )}
            onClick={() => navigate(-1)}
          >
            <span className="tracking-chevron-back">
              <Icon name="chevron" />
            </span>
          </button>
          <h2>
            {mode === "monthly"
              ? dateLabel(month, { month: "long", year: "numeric" })
              : month.slice(0, 4)}
          </h2>
          <button
            className="icon-button"
            aria-label={tr(mode === "monthly" ? "next_month" : "next_year")}
            onClick={() => navigate(1)}
          >
            <Icon name="chevron" />
          </button>
        </div>
        <div className="tracking-inline">
          <button
            className="text-button"
            onClick={() => {
              setMonth(today.slice(0, 7) + "-01");
              setSelected(today);
            }}
          >
            {tr("today")}
          </button>
          <div className="tracking-segmented">
            <button
              aria-pressed={mode === "monthly"}
              onClick={() => setMode("monthly")}
            >
              {tr("month_view")}
            </button>
            <button
              aria-pressed={mode === "yearly"}
              onClick={() => setMode("yearly")}
            >
              {tr("year_view")}
            </button>
          </div>
        </div>
      </div>
      <label className="tracking-calendar-filter">
        {tr("trackers")}
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">{tr("all_trackers")}</option>
          {trackers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.archived_at ? ` · ${tr("archives")}` : ""}
            </option>
          ))}
        </select>
      </label>
      <LoadState {...resource} />
      {resource.data && (
        <>
          {mode === "yearly" ? (
            <div className="tracking-year">
              {Array.from(
                { length: 12 },
                (_, i) =>
                  `${month.slice(0, 4)}-${String(i + 1).padStart(2, "0")}-01`,
              ).map((m) => {
                const days = monthDays(m, resource.data!.days),
                  scores = days.flatMap((d) =>
                    d?.score === null || !d ? [] : [d.score],
                  );
                return (
                  <button
                    className="tracking-mini-month"
                    key={m}
                    aria-label={tr("open_month", {
                      month: dateLabel(m, { month: "long", year: "numeric" }),
                    })}
                    onClick={() => {
                      setMonth(m);
                      setSelected(m);
                      setMode("monthly");
                    }}
                  >
                    <span className="tracking-mini-heading">
                      <strong>{dateLabel(m, { month: "long" })}</strong>
                      <Score
                        value={
                          scores.length
                            ? scores.reduce((a, b) => a + b, 0) / scores.length
                            : null
                        }
                      />
                    </span>
                    <span className="tracking-mini-grid" aria-hidden="true">
                      {days.map((d, i) => (
                        <span
                          key={i}
                          className={d ? `state-${d.state}` : "is-blank"}
                          style={scoreStyle(d?.score ?? null)}
                        >
                          {d?.state === "complete" ? "✓" : ""}
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="tracking-calendar-columns">
              <div className="tracking-month">
                <div className="tracking-weekday-labels">
                  {weekdays.map((d) => (
                    <span key={d} aria-label={tr(d)}>
                      {tr(d).slice(0, 2)}
                    </span>
                  ))}
                </div>
                <div
                  ref={grid}
                  className="tracking-month-grid"
                  role="group"
                  aria-label={dateLabel(month, {
                    month: "long",
                    year: "numeric",
                  })}
                >
                  {monthDays(month, resource.data.days).map((d, i) =>
                    d ? (
                      <button
                        key={d.date}
                        data-day={d.date}
                        tabIndex={d.date === selected ? 0 : -1}
                        className={`tracking-day state-${d.state} ${d.date === selected ? "is-selected" : ""} ${d.date === today ? "is-today" : ""}`}
                        style={scoreStyle(d.score)}
                        aria-pressed={d.date === selected}
                        aria-label={tr("select_day", {
                          date: dateLabel(d.date, {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          }),
                          state: tr(d.state),
                          score:
                            d.score === null ? "—" : `${number(d.score)}/10`,
                        })}
                        onKeyDown={(e) => key(e, d.date)}
                        onClick={() => select(d.date)}
                      >
                        <span className="tracking-day-head">
                          <span>{parse(d.date).getUTCDate()}</span>
                          {d.state === "complete" ? (
                            <Icon name="check" size={12} />
                          ) : d.state === "partial" ? (
                            <span className="tracking-partial-dot" />
                          ) : null}
                        </span>
                        <span
                          className={`tracking-day-value ${d.score !== null && number(d.score).length > 3 ? "is-precise" : ""}`}
                        >
                          {d.score !== null ? (
                            <>
                              <strong>{number(d.score)}</strong>
                              <small>/10</small>
                            </>
                          ) : (
                            <span>
                              {d.state === "missing"
                                ? "—"
                                : d.state === "rest"
                                  ? "·"
                                  : ""}
                            </span>
                          )}
                        </span>
                        <span className="tracking-day-completion">
                          {d.expected && d.state !== "future"
                            ? `${d.completed}/${d.expected}`
                            : ""}
                        </span>
                      </button>
                    ) : (
                      <span className="tracking-day-blank" key={`empty-${i}`} />
                    ),
                  )}
                </div>
                <div className="tracking-calendar-legend">
                  <div className="tracking-gradient-legend">
                    <span>{tr("legend_low")}</span>
                    <span className="tracking-gradient" />
                    <span>{tr("legend_high")}</span>
                  </div>
                  <div className="tracking-status-legend">
                    <span>
                      <Icon name="check" size={13} />
                      {tr("legend_complete")}
                    </span>
                    <span>
                      <i className="tracking-partial-dot" />
                      {tr("legend_partial")}
                    </span>
                    <span>
                      <i className="tracking-missing-dot" />
                      {tr("legend_missing")}
                    </span>
                  </div>
                </div>
              </div>
              <DayDetail
                day={selected}
                summary={selectedDay}
                filter={filter}
                revision={revision}
                onOpen={onOpen}
              />
            </div>
          )}
          {resource.data.periods.length > 0 && (
            <section className="tracking-long-periods">
              <div className="tracking-section-heading">
                <div>
                  <h2>{tr("long_periods")}</h2>
                  <p className="muted">{tr("long_periods_hint")}</p>
                </div>
              </div>
              <div className="tracking-period-list">
                {resource.data.periods.map((p) => (
                  <button
                    key={`${p.tracker_id}:${p.period_start}`}
                    disabled={p.period_start > today}
                    onClick={() =>
                      onOpen(
                        p.tracker_id,
                        p.period_start < p.definition.start_date
                          ? p.definition.start_date
                          : p.period_start > today
                            ? today
                            : p.period_start,
                      )
                    }
                  >
                    <span>
                      <strong>{p.definition.name}</strong>
                      <small>
                        {tr(p.definition.frequency)} ·{" "}
                        {dateLabel(p.period_start)} — {dateLabel(p.period_end)}
                      </small>
                    </span>
                    <Score value={p.entry?.score ?? null} />
                    <span className="tracking-period-state">
                      {tr(
                        p.period_start > today
                          ? "future"
                          : p.entry?.status === "complete"
                            ? "complete"
                            : p.period_end >= today
                              ? "provisional"
                              : "missing",
                      )}
                    </span>
                    <Icon name="chevron" size={16} />
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </section>
  );
}
function DayDetail({
  day,
  summary,
  filter,
  revision,
  onOpen,
}: {
  day: string;
  summary?: Day;
  filter: string;
  revision: number;
  onOpen: (id: string, day: string) => void;
}) {
  const result = useResource(
    (signal) => trackingApi.current(day, signal, true),
    [day, revision],
  );
  const items = result.data?.filter(
    (o) =>
      o.definition.frequency === "daily" &&
      (!filter || o.tracker_id === filter),
  );
  return (
    <aside className="tracking-day-detail" aria-label={tr("day_detail")}>
      <span className="tracking-frequency">
        {dateLabel(day, { weekday: "long" })}
      </span>
      <h2>{dateLabel(day)}</h2>
      {summary && (
        <>
          <div className={`tracking-day-state state-${summary.state}`}>
            {summary.state === "complete" && <Icon name="check" size={14} />}{" "}
            {tr(summary.state)}
          </div>
          <div className="tracking-detail-score">
            <Score large value={summary.score} />
            <span>
              {tr(
                summary.state === "partial" ? "score_partial" : "score_label",
              )}
            </span>
          </div>
          <div className="tracking-detail-completion">
            <span>
              {tr("fields_count", {
                filled: summary.filled,
                total: summary.fields,
              })}
            </span>
            <span>
              {summary.fields
                ? Math.round((100 * summary.filled) / summary.fields)
                : summary.state === "complete"
                  ? 100
                  : 0}
              %
            </span>
          </div>
          <div className="tracking-progress">
            <span
              style={{
                width: `${summary.fields ? (100 * summary.filled) / summary.fields : summary.state === "complete" ? 100 : 0}%`,
              }}
            />
          </div>
        </>
      )}
      <LoadState {...result} />
      <div className="tracking-detail-trackers">
        {items?.map((o) => (
          <button key={o.tracker_id} onClick={() => onOpen(o.tracker_id, day)}>
            <span
              className={
                o.entry?.status === "complete"
                  ? "tracking-done-mark"
                  : "tracking-empty-mark"
              }
            >
              {o.entry?.status === "complete" ? (
                <Icon name="check" size={14} />
              ) : (
                <Icon name="edit" size={13} />
              )}
            </span>
            <span>
              {o.definition.name}
              <small>
                {tr(
                  o.entry?.status === "complete"
                    ? "review"
                    : o.entry
                      ? "resume"
                      : "start",
                )}
              </small>
            </span>
            <Score value={o.entry?.score ?? null} />
          </button>
        ))}
      </div>
      {items?.length === 0 && <p className="muted">{tr("day_empty")}</p>}
    </aside>
  );
}
