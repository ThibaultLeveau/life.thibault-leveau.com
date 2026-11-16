import { useEffect, useState } from "react";
import { tr } from "../../shared/i18n";
import { ErrorMessage } from "../../shared/ui/Dialog";
import { Icon } from "../../shared/ui/Icon";
import { useApplications } from "../applications/ApplicationProvider";
import { useApiAction, useApiResource } from "../useApiResource";
import { progressionApi } from "./api";
import type { ProgressionSettings as Settings } from "./types";

function dayInZone(timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
function shiftDay(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export function ProgressionSettings({
  onDirty,
}: {
  onDirty: (dirty: boolean) => void;
}) {
  const result = useApiResource(progressionApi.settings, []);
  return (
    <section className="progression-settings">
      <h2>{tr("progression_calendar")}</h2>
      <p className="progression-muted">{tr("progression_calendar_hint")}</p>
      {result.loading && <p role="status">{tr("progression_loading")}</p>}
      <ErrorMessage message={result.error} />
      {result.error && (
        <button className="secondary-button" onClick={result.reload}>
          {tr("try_again")}
        </button>
      )}
      {result.data && <SettingsForm initial={result.data} onDirty={onDirty} />}
    </section>
  );
}
function SettingsForm({
  initial,
  onDirty,
}: {
  initial: Settings;
  onDirty: (dirty: boolean) => void;
}) {
  const [value, setValue] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [saved, setSaved] = useState(false);
  const { items } = useApplications();
  const action = useApiAction();
  const dirty = JSON.stringify(value) !== JSON.stringify(baseline);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  const today = dayInZone(value.timezone);
  const vacation = value.vacations.find(
    (v) => v.start <= today && today <= v.end,
  );
  function change(update: Partial<Settings>) {
    setValue((v) => ({ ...v, ...update }));
    setSaved(false);
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(
          () => progressionApi.saveSettings(value),
          (result) => {
            setValue(result);
            setBaseline(result);
            setSaved(true);
          },
        );
      }}
    >
      <fieldset disabled={action.busy}>
        <label>
          {tr("progression_timezone")}
          <input
            required
            maxLength={100}
            value={value.timezone}
            onChange={(e) => change({ timezone: e.target.value })}
            list="progression-timezones"
          />
        </label>
        <datalist id="progression-timezones">
          {[
            "Europe/Paris",
            "Europe/London",
            "America/Montreal",
            "America/New_York",
            "Asia/Tokyo",
            "UTC",
          ].map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
        <small className="progression-muted">
          {tr("progression_timezone_hint")}
        </small>
        <h3>{tr("progression_weekends")}</h3>
        <div className="progression-weekends">
          {items?.map((app) => (
            <label key={app.id}>
              <span>{app.name}</span>
              <input
                type="checkbox"
                role="switch"
                aria-label={tr("progression_weekend_for", { name: app.name })}
                checked={value.exclude_weekends[app.id] ?? false}
                onChange={(e) =>
                  change({
                    exclude_weekends: {
                      ...value.exclude_weekends,
                      [app.id]: e.target.checked,
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
        <div className="progression-vacation-heading">
          <div>
            <h3>{tr("progression_vacation")}</h3>
            {vacation && (
              <span className="progression-vacation-active">
                <Icon name="sun" size={15} />
                {tr("progression_vacation_active")}
              </span>
            )}
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              if (vacation)
                change({
                  vacations: value.vacations.flatMap((v) =>
                    v !== vacation
                      ? [v]
                      : v.start < today
                        ? [{ ...v, end: shiftDay(today, -1) }]
                        : [],
                  ),
                });
              else
                change({
                  vacations: [
                    ...value.vacations,
                    { start: today, end: shiftDay(today, 6) },
                  ],
                });
            }}
          >
            {tr(
              vacation
                ? "progression_vacation_stop"
                : "progression_vacation_start_now",
            )}
          </button>
        </div>
        <p className="progression-muted">{tr("progression_vacation_hint")}</p>
        <div className="progression-vacation-list">
          {value.vacations.map((period, index) => (
            <div className="progression-vacation-row" key={index}>
              <label>
                {tr("progression_since")}
                <input
                  type="date"
                  required
                  min="2000-01-01"
                  max={period.end || "2100-12-31"}
                  value={period.start}
                  onChange={(e) =>
                    change({
                      vacations: value.vacations.map((v, i) =>
                        i === index ? { ...v, start: e.target.value } : v,
                      ),
                    })
                  }
                />
              </label>
              <label>
                {tr("progression_until")}
                <input
                  type="date"
                  required
                  min={period.start || "2000-01-01"}
                  max="2100-12-31"
                  value={period.end}
                  onChange={(e) =>
                    change({
                      vacations: value.vacations.map((v, i) =>
                        i === index ? { ...v, end: e.target.value } : v,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="icon-button"
                aria-label={tr("progression_vacation_remove")}
                onClick={() =>
                  change({
                    vacations: value.vacations.filter((_, i) => i !== index),
                  })
                }
              >
                <Icon name="trash" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="text-button"
          disabled={value.vacations.length >= 100}
          onClick={() => {
            const start = shiftDay(value.vacations.at(-1)?.end || today, 1);
            change({
              vacations: [
                ...value.vacations,
                { start, end: shiftDay(start, 6) },
              ],
            });
          }}
        >
          <Icon name="plus" size={16} />
          {tr("progression_vacation_add")}
        </button>
        <ErrorMessage message={action.error} />
        <div className="progression-settings-save">
          <button className="primary-button" disabled={!dirty || action.busy}>
            {tr("progression_save")}
          </button>
          {saved && <p role="status">{tr("progression_saved")}</p>}
        </div>
      </fieldset>
    </form>
  );
}
