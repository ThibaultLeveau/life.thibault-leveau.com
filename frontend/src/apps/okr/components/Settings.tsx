import { useEffect, useState } from "react";
import { useApiAction } from "../../../platform/useApiResource";
import { ErrorMessage } from "../../../shared/ui/Dialog";
import { okrApi } from "../api";
import { tr } from "../i18n";
import type { Settings as Preferences } from "../types";
export function Settings({
  settings,
  onDirty,
  onBusy,
  onSaved,
}: {
  settings: Preferences;
  onDirty: (v: boolean) => void;
  onBusy: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [timezone, setTimezone] = useState(settings.timezone);
  const action = useApiAction();
  useEffect(() => {
    onBusy(action.busy);
    return () => onBusy(false);
  }, [onBusy, action.busy]);
  useEffect(() => {
    onDirty(timezone !== settings.timezone);
    return () => onDirty(false);
  }, [timezone, settings.timezone, onDirty]);
  return (
    <form
      className="settings-form"
      onSubmit={(e) => {
        e.preventDefault();
        void action.run(
          () => okrApi.saveSettings(settings, timezone),
          () => {
            onDirty(false);
            onSaved();
          },
        );
      }}
    >
      <fieldset disabled={action.busy}>
        <label>
          {tr("timezone")}
          <input
            required
            maxLength={100}
            value={timezone}
            onChange={(e) => {
              setTimezone(e.target.value);
            }}
          />
        </label>
        <p className="muted">{tr("timezone_hint")}</p>
        <ErrorMessage message={action.error} />
        <button type="submit" className="primary-button">
          {tr("save")}
        </button>
      </fieldset>
    </form>
  );
}
