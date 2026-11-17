import { documentationPath } from "../../../shared/i18n";
import { tr } from "../i18n";
import type { SettingsPanelProps } from "../../../platform/applications/definition";
import { useSettingsDraft } from "../../../platform/applications/useSettingsDraft";
import { useState } from "react";
import { ErrorMessage } from "../../../shared/ui/Dialog";
import { sportApi } from "../api";
import { LoadState, useAction, useResource } from "./common";
function SettingsForm({
  initial,
  ...guard
}: { initial: number } & SettingsPanelProps) {
  const [rest, setRest] = useState(String(initial));
  const [baseline, setBaseline] = useState(String(initial));
  const [saved, setSaved] = useState(false);
  const action = useAction();
  useSettingsDraft(guard, rest !== baseline, action.busy);
  return (
    <form
      className="settings-form"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        void action.run(
          () =>
            sportApi.write<{ rest_seconds: number }>("/settings", {
              rest_seconds: Number(rest),
            }),
          (result) => {
            setRest(String(result.rest_seconds));
            setBaseline(String(result.rest_seconds));
            setSaved(true);
          },
        );
      }}
    >
      <fieldset disabled={action.busy}>
        <h2>{tr("your_training_rhythm")}</h2>
        <label>
          {tr("rest_time_between_sets_seconds")}
          <input
            type="number"
            inputMode="numeric"
            required
            min={0}
            max={3600}
            step={1}
            value={rest}
            onChange={(e) => {
              setRest(e.target.value);
              setSaved(false);
            }}
          />
        </label>
        <p className="muted">
          {tr("the_countdown_starts_when_you_complete_a_set_and_resumes")}
        </p>
        <button className="primary-button" disabled={action.busy}>
          {tr("save_settings")}
        </button>
        <ErrorMessage message={action.error} />
        {saved && <p role="status">{tr("settings_saved")}</p>}
        <a className="text-button" href={documentationPath("sport")}>
          {tr("sport_application_guide")}
        </a>
      </fieldset>
    </form>
  );
}
export function Settings(guard: SettingsPanelProps) {
  const resource = useResource(sportApi.settings, []);
  return (
    <>
      <LoadState {...resource} />
      {resource.data && (
        <SettingsForm initial={resource.data.rest_seconds} {...guard} />
      )}
    </>
  );
}
