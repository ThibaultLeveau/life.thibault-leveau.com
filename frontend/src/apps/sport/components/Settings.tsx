import { documentationPath } from "../../../shared/i18n";
import { tr } from "../i18n";
import { useState } from "react";
import { ErrorMessage } from "../../../shared/ui/Dialog";
import { sportApi } from "../api";
import { LoadState, useAction, useResource } from "./common";
function SettingsForm({ initial }: { initial: number }) {
  const [rest, setRest] = useState(initial);
  const [saved, setSaved] = useState(false);
  const action = useAction();
  return (
    <form
      className="stack-form sport-settings"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        void action.run(
          () => sportApi.write("/settings", { rest_seconds: rest }),
          () => setSaved(true),
        );
      }}
    >
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
            setRest(Number(e.target.value));
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
    </form>
  );
}
export function Settings() {
  const resource = useResource(sportApi.settings, []);
  return (
    <>
      <LoadState {...resource} />
      {resource.data && <SettingsForm initial={resource.data.rest_seconds} />}
    </>
  );
}
