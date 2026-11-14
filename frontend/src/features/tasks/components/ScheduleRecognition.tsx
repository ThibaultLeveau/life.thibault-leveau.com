import { relativeDate } from "../dates";
import type { useScheduleRecognition } from "../scheduling";
import { localDate } from "../types";
import { Icon } from "./Icon";

export function ScheduleRecognition({
  recognition,
}: {
  recognition: ReturnType<typeof useScheduleRecognition>;
}) {
  const { suggestion, pending, error, ignored, dismiss, restore } = recognition;
  return (
    <div className="schedule-recognition" aria-live="polite" aria-atomic="true">
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
                ` · dès le ${new Date(`${suggestion.due_date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`}
            </span>
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Garder ces mots dans le titre"
            title="Garder ces mots dans le titre"
            onClick={dismiss}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
      {!suggestion && (
        <span className="schedule-hint">
          {error
            ? "Analyse indisponible. Réessayez ou gardez le texte."
            : pending
              ? "Lecture de la date…"
              : ignored
                ? "Ces mots resteront dans le titre."
                : "Essayez « demain » ou « tous les lundis »."}
          {(ignored || error) && (
            <button
              type="button"
              className="text-button"
              onClick={ignored ? restore : dismiss}
            >
              {ignored ? "Reconnaître la date" : "Garder le texte"}
            </button>
          )}
        </span>
      )}
    </div>
  );
}
