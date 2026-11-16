import { formatLocale } from "../../../shared/i18n";
import { tr } from "../i18n";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "../../../platform/api";
import { relativeDate, useLocalToday } from "../dates";
import {
  newRecurrence,
  parseSchedule,
  plusDays,
  shortRecurrence,
} from "../scheduling";
import type { Recurrence, Schedule, SchedulePreview } from "../types";
import { ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
import { Calendar } from "./ScheduleCalendar";
import { RecurrenceFields } from "./RecurrenceFields";
import { ScheduleHelp } from "./ScheduleHelp";

export function SchedulePicker({
  value,
  onChange,
  disabled = false,
  onEditingChange,
  completed = 0,
}: {
  value: Schedule;
  onChange: (value: Schedule) => void;
  disabled?: boolean;
  onEditingChange?: (open: boolean) => void;
  completed?: number;
}) {
  const today = useLocalToday();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const interpretation = useRef<AbortController | null>(null);
  useEffect(() => () => interpretation.current?.abort(), []);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"date" | "repeat">("date");
  const [draft, setDraft] = useState<Recurrence>(
    () => value.recurrence || newRecurrence(value.due_date || today),
  );
  const [preview, setPreview] = useState<{
    key: string;
    result: SchedulePreview;
  } | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const unchanged = JSON.stringify(draft) === JSON.stringify(value.recurrence);
  const previewAfter =
    unchanged && draft.mode === "completion"
      ? value.due_date || draft.start_date
      : value.recurrence?.start_date === draft.start_date
        ? [draft.start_date, today, value.due_date || today].sort().at(-1)!
        : draft.start_date;
  const remainingCompleted = unchanged ? completed : 0;
  const key = JSON.stringify({ draft, previewAfter, remainingCompleted });
  useEffect(() => {
    if (!open || tab !== "repeat") return;
    setPreviewError("");
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api<SchedulePreview>(
        "/scheduling/preview",
        "POST",
        {
          recurrence: draft,
          after: previewAfter,
          completed: remainingCompleted,
        },
        controller.signal,
      )
        .then((result) => {
          if (!controller.signal.aborted) setPreview({ key, result });
        })
        .catch((error: Error) => {
          if (!controller.signal.aborted) setPreviewError(error.message);
        });
    }, 160);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, tab, key, draft, previewAfter, remainingCompleted]);
  const current = preview?.key === key ? preview.result : null;
  function close() {
    interpretation.current?.abort();
    setBusy(false);
    setOpen(false);
    onEditingChange?.(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  function choose(day: string | null) {
    onChange({ due_date: day, recurrence: day ? value.recurrence : null });
    setError("");
    close();
  }
  async function interpret() {
    if (!text.trim()) return;
    interpretation.current?.abort();
    const controller = new AbortController();
    interpretation.current = controller;
    setBusy(true);
    setError("");
    try {
      const result = await parseSchedule(text, today, controller.signal);
      if (controller.signal.aborted) return;
      if (!result.matched_text || result.title) {
        setError(
          result.diagnostic ||
            tr("date_not_recognized_try_tomorrow_25_12_2026_or_every"),
        );
        return;
      }
      if (result.recurrence) {
        setDraft(result.recurrence);
        setTab("repeat");
      } else choose(result.due_date);
      setText("");
    } catch (error) {
      if (!controller.signal.aborted) setError((error as Error).message);
    } finally {
      if (interpretation.current === controller) setBusy(false);
    }
  }
  return (
    <div className="schedule-picker">
      <span className="schedule-label">{tr("due_date_and_recurrence")}</span>
      <button
        ref={trigger}
        type="button"
        className={`schedule-trigger ${value.due_date ? "has-date" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          if (open) close();
          else {
            setDraft(
              value.recurrence || newRecurrence(value.due_date || today),
            );
            setTab(value.recurrence ? "repeat" : "date");
            setOpen(true);
            onEditingChange?.(true);
          }
        }}
      >
        <Icon name={value.recurrence ? "repeat" : "calendar"} />
        <span>
          {value.due_date
            ? relativeDate(value.due_date, today).label
            : tr("choose_a_date")}
          {value.recurrence && (
            <small>{shortRecurrence(value.recurrence)}</small>
          )}
        </span>
        <Icon name={open ? "up" : "down"} size={15} />
      </button>
      {open && (
        <div
          className="schedule-panel"
          id={id}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
        >
          <div
            className="schedule-tabs"
            role="tablist"
            aria-label={tr("scheduling")}
          >
            {(
              [
                ["date", tr("date"), "calendar"],
                ["repeat", tr("repeat"), "repeat"],
              ] as const
            ).map(([name, label, icon]) => (
              <button
                type="button"
                role="tab"
                key={name}
                id={`${id}-${name}`}
                aria-selected={tab === name}
                aria-controls={`${id}-content`}
                tabIndex={tab === name ? 0 : -1}
                onClick={() => setTab(name)}
                onKeyDown={(event) => {
                  if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
                    event.preventDefault();
                    const next = tab === "date" ? "repeat" : "date";
                    setTab(next);
                    document.getElementById(`${id}-${next}`)?.focus();
                  }
                }}
              >
                <Icon name={icon} size={15} />
                {label}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`${id}-content`}
            aria-labelledby={`${id}-${tab}`}
          >
            <div className="schedule-natural">
              <label>
                {tr("date_or_recurrence")}
                <input
                  value={text}
                  disabled={busy}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={tr("tomorrow_25_12_2026_every_monday")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void interpret();
                    }
                  }}
                />
              </label>
              <button
                type="button"
                className="icon-button"
                aria-label={tr("interpret_date")}
                onClick={interpret}
                disabled={busy || !text.trim()}
              >
                <Icon name="arrow" />
              </button>
            </div>
            <ErrorMessage message={error} />
            <ScheduleHelp
              disabled={busy}
              onChoose={(example) => {
                setText(example);
                setError("");
              }}
            />
            {tab === "date" ? (
              <>
                <div className="date-shortcuts">
                  <button type="button" onClick={() => choose(today)}>
                    {tr("today")}
                  </button>
                  <button
                    type="button"
                    onClick={() => choose(plusDays(today, 1))}
                  >
                    {tr("tomorrow")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const weekday = new Date(`${today}T12:00:00`).getDay();
                      choose(plusDays(today, (8 - weekday) % 7 || 7));
                    }}
                  >
                    {tr("next_monday")}
                  </button>
                </div>
                <Calendar
                  key={value.due_date}
                  value={value.due_date}
                  today={today}
                  onChange={choose}
                />
                {value.recurrence && (
                  <p className="field-help">
                    {tr(
                      "changing_the_date_postpones_only_the_current_occurrence_the_repeat",
                    )}
                  </p>
                )}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => choose(null)}
                >
                  <Icon name="x" size={14} />
                  {tr("no_due_date_or_recurrence")}
                </button>
              </>
            ) : (
              <>
                <RecurrenceFields rule={draft} onChange={setDraft} />
                <div
                  className="schedule-preview"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <strong>{tr("next_occurrences")}</strong>
                  {current ? (
                    <>
                      <p>{current.label}</p>
                      <ol>
                        {current.dates.map((day) => (
                          <li key={day}>
                            <time dateTime={day}>
                              {new Date(`${day}T12:00:00`).toLocaleDateString(
                                formatLocale(),
                                {
                                  weekday: "short",
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                },
                              )}
                            </time>
                          </li>
                        ))}
                      </ol>
                      <small>{current.explanation}</small>
                    </>
                  ) : (
                    <p>{previewError || tr("checking_schedule")}</p>
                  )}
                </div>
                <div className="schedule-panel-actions">
                  {value.recurrence && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        onChange({ ...value, recurrence: null });
                        close();
                      }}
                    >
                      {tr("stop_repeating")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="primary-button"
                    disabled={!current || !!previewError}
                    onClick={() => {
                      onChange({
                        due_date: unchanged
                          ? value.due_date
                          : current!.dates[0],
                        recurrence: draft,
                      });
                      close();
                    }}
                  >
                    {tr("apply_recurrence")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
