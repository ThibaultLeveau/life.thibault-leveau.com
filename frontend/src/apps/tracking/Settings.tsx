import { useState } from "react";
import type { SettingsPanelProps } from "../../platform/applications/definition";
import { useSettingsDraft } from "../../platform/applications/useSettingsDraft";
import { ErrorMessage } from "../../shared/ui/Dialog";
import { trackingApi } from "./api";
import { LoadState, useAction, useResource } from "./components/common";
import { tr } from "./i18n";

export function Settings(guard: SettingsPanelProps) {
  const resource = useResource(trackingApi.settings, []);
  return (
    <>
      <LoadState {...resource} />
      {resource.data && (
        <SettingsForm timezone={resource.data.timezone} {...guard} />
      )}
    </>
  );
}
function SettingsForm({
  timezone,
  ...guard
}: {
  timezone: string;
} & SettingsPanelProps) {
  const [value, setValue] = useState(timezone),
    [saved, setSaved] = useState(false),
    action = useAction();
  const [baseline, setBaseline] = useState(timezone);
  useSettingsDraft(guard, value !== baseline, action.busy);
  return (
    <form
      className="settings-form"
      onSubmit={(e) => {
        e.preventDefault();
        void action.run(
          () => trackingApi.saveSettings(value),
          (result) => {
            setValue(result.timezone);
            setBaseline(result.timezone);
            setSaved(true);
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
            list="tracking-timezones"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
          />
        </label>
        <datalist id="tracking-timezones">
          {[
            "Europe/Paris",
            "Europe/London",
            "Europe/Brussels",
            "America/Montreal",
            "America/New_York",
            "Asia/Tokyo",
            "UTC",
          ].map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
        <p className="muted">{tr("settings_hint")}</p>
        <ErrorMessage message={action.error} />
        <button className="primary-button" disabled={action.busy}>
          {tr(action.busy ? "saving" : "save_settings")}
        </button>
        {saved && <p role="status">{tr("saved")}</p>}
        <p className="muted tracking-small">{tr("data_preserved")}</p>
      </fieldset>
    </form>
  );
}
