import { formatLocale } from "../../../shared/i18n";
import { tr } from "../i18n";
import { relativeDate } from "../dates";
import type { useScheduleRecognition } from "../scheduling";
import { localDate } from "../types";
import { Icon } from "../../../shared/ui/Icon";
import { ScheduleHelp } from "./ScheduleHelp";

export function ScheduleRecognition({
  recognition,
}: {
  recognition: ReturnType<typeof useScheduleRecognition>;
}) {
  const { suggestion, pending, error, diagnostic, ignored, dismiss, restore } =
    recognition;
  return (
    <div className="schedule-recognition">
      <div aria-live="polite" aria-atomic="true">
        {suggestion && (
          <div className="schedule-detected">
            <Icon
              name={suggestion.recurrence ? "repeat" : "calendar"}
              size={15}
            />
            <span>
              <mark>{suggestion.matched_text}</mark>
              <span className="detected-result">
                {suggestion.recurrence
                  ? suggestion.label
                  : relativeDate(suggestion.due_date!, localDate()).label}
                {suggestion.recurrence &&
                  tr("starting_date", {
                    date: new Date(
                      `${suggestion.due_date}T12:00:00`,
                    ).toLocaleDateString(formatLocale(), {
                      day: "numeric",
                      month: "short",
                    }),
                  })}
              </span>
              {suggestion.recurrence && (
                <span
                  className="detected-dates"
                  aria-label={tr("next_scheduled_dates")}
                >
                  {suggestion.dates.slice(0, 3).map((day) => (
                    <time key={day} dateTime={day}>
                      {new Date(`${day}T12:00:00`).toLocaleDateString(
                        formatLocale(),
                        {
                          day: "numeric",
                          month: "short",
                        },
                      )}
                    </time>
                  ))}
                </span>
              )}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label={tr("keep_these_words_in_the_title")}
              title={tr("keep_these_words_in_the_title")}
              onClick={() => dismiss()}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        )}
        {!suggestion && (
          <span className="schedule-hint">
            {error
              ? tr("parsing_unavailable_try_again_or_keep_the_text")
              : diagnostic
                ? diagnostic
                : pending
                  ? tr("reading_date")
                  : ignored
                    ? tr("these_words_will_stay_in_the_title")
                    : tr("try_tomorrow_or_every_monday")}
            {(ignored || error || diagnostic) && (
              <button
                type="button"
                className="text-button"
                onClick={() => (ignored ? restore() : dismiss())}
              >
                {ignored ? tr("recognize_date") : tr("keep_text")}
              </button>
            )}
          </span>
        )}
      </div>
      <ScheduleHelp />
    </div>
  );
}
