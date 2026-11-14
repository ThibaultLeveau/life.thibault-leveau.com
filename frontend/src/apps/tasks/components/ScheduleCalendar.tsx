import { useRef, useState, type KeyboardEvent } from "react";
import { relativeDate } from "../dates";
import { dateString, months, plusDays } from "../scheduling";
import { Icon } from "../../../shared/ui/Icon";

export function Calendar({
  value,
  today,
  onChange,
}: {
  value: string | null;
  today: string;
  onChange: (date: string) => void;
}) {
  const initial = value || today;
  const [month, setMonth] = useState(initial.slice(0, 7));
  const [focused, setFocused] = useState(initial);
  const grid = useRef<HTMLDivElement>(null);
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(year, monthNumber - 1, 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, index) =>
    plusDays(dateString(first), index - offset),
  );
  function navigate(delta: number) {
    const date = new Date(year, monthNumber - 1 + delta, 1, 12);
    if (date.getFullYear() < 1900 || date.getFullYear() > 9999) return;
    setMonth(dateString(date).slice(0, 7));
    setFocused(dateString(date));
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, day: string) {
    const increments: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    let next: string;
    if (event.key in increments) next = plusDays(day, increments[event.key]);
    else if (event.key === "Home" || event.key === "End") {
      const weekday = (new Date(`${day}T12:00:00`).getDay() + 6) % 7;
      next = plusDays(day, (event.key === "Home" ? 0 : 6) - weekday);
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      const date = new Date(`${day}T12:00:00`);
      const dayOfMonth = date.getDate();
      date.setDate(1);
      date.setMonth(date.getMonth() + (event.key === "PageUp" ? -1 : 1));
      const last = new Date(date);
      last.setMonth(last.getMonth() + 1, 0);
      date.setDate(Math.min(dayOfMonth, last.getDate()));
      next = dateString(date);
    } else return;
    event.preventDefault();
    if (next < "1900-01-01" || next > "9999-12-31") return;
    setMonth(next.slice(0, 7));
    setFocused(next);
    requestAnimationFrame(() =>
      grid.current
        ?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)
        ?.focus(),
    );
  }
  return (
    <div className="schedule-calendar">
      <div className="calendar-heading">
        <button
          type="button"
          className="icon-button"
          aria-label="Mois précédent"
          onClick={() => navigate(-1)}
        >
          <span className="rotate-180">
            <Icon name="chevron" />
          </span>
        </button>
        <span aria-live="polite">
          {months[monthNumber - 1]} {year}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="Mois suivant"
          onClick={() => navigate(1)}
        >
          <Icon name="chevron" />
        </button>
      </div>
      <div className="calendar-weekdays" aria-hidden="true">
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div
        ref={grid}
        role="grid"
        aria-label={`Calendrier ${months[monthNumber - 1]} ${year}`}
        className="calendar-grid"
      >
        {Array.from({ length: 6 }, (_, week) => (
          <div role="row" key={week}>
            {days.slice(week * 7, week * 7 + 7).map((day) => (
              <div role="gridcell" key={day} aria-selected={day === value}>
                <button
                  type="button"
                  data-date={day}
                  tabIndex={day === focused ? 0 : -1}
                  className={`${day.slice(0, 7) !== month ? "outside-month" : ""} ${day === value ? "selected-day" : ""} ${day === today ? "today-dot" : ""}`}
                  aria-label={relativeDate(day, today).full}
                  aria-current={day === today ? "date" : undefined}
                  onKeyDown={(event) => keyboard(event, day)}
                  onClick={() => onChange(day)}
                >
                  {Number(day.slice(8))}
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
