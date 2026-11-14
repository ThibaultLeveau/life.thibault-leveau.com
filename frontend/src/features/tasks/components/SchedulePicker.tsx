import { useEffect, useId, useRef, useState } from "react";
import { api } from "../api";
import { relativeDate, useLocalToday } from "../dates";
import {
  newRecurrence,
  parseSchedule,
  plusDays,
  shortRecurrence,
} from "../scheduling";
import type { Recurrence, Schedule, SchedulePreview } from "../types";
import { ErrorMessage } from "./Dialog";
import { Icon } from "./Icon";
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
            "Date non reconnue. Essayez « demain », « 25/12/2026 » ou « tous les mercredis toutes les trois semaines ».",
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
      <span className="schedule-label">Échéance et récurrence</span>
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
            : "Choisir une date"}
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
            aria-label="Planification"
          >
            {(
              [
                ["date", "Date", "calendar"],
                ["repeat", "Répéter", "repeat"],
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
                Date ou récurrence
                <input
                  value={text}
                  disabled={busy}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Demain, 25/12/2026, tous les lundis…"
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
                aria-label="Interpréter la date"
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
                    Aujourd’hui
                  </button>
                  <button
                    type="button"
                    onClick={() => choose(plusDays(today, 1))}
                  >
                    Demain
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const weekday = new Date(`${today}T12:00:00`).getDay();
                      choose(plusDays(today, (8 - weekday) % 7 || 7));
                    }}
                  >
                    Lundi prochain
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
                    Changer la date reporte seulement l’occurrence en cours. Le
                    calendrier de répétition est conservé.
                  </p>
                )}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => choose(null)}
                >
                  <Icon name="x" size={14} />
                  Sans échéance ni récurrence
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
                  <strong>Prochaines occurrences</strong>
                  {current ? (
                    <>
                      <p>{current.label}</p>
                      <ol>
                        {current.dates.map((day) => (
                          <li key={day}>
                            <time dateTime={day}>
                              {new Date(`${day}T12:00:00`).toLocaleDateString(
                                "fr-FR",
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
                    <p>{previewError || "Vérification du calendrier…"}</p>
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
                      Ne plus répéter
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
                    Appliquer la récurrence
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
