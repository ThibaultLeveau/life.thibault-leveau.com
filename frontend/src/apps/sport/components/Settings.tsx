import { documentationPath } from "../../../shared/i18n";
import { tr } from "../i18n";
import { useState } from "react";
import { ErrorMessage } from "../../../shared/ui/Dialog";
import { sportApi } from "../api";
import type { SettingsPanelProps } from "../../../platform/applications/definition";
import { useSettingsDraft } from "../../../platform/applications/useSettingsDraft";
import type { SportSettings } from "../types";
import {
  ConflictPanel,
  useAction,
  LoadState,
  useResource,
  useFormValidation,
} from "./common";

function SettingsForm({ settings, ...guard }: { settings: SportSettings } & SettingsPanelProps) {
  const [base, setBase] = useState(settings);
  const [rest, setRest] = useState(String(settings.rest_seconds));
  const [saved, setSaved] = useState(false);
  const action = useAction();
  const validation = useFormValidation(action.failure);
  useSettingsDraft(guard, rest !== String(base.rest_seconds), action.busy);
  const describe = (value: SportSettings) => [
    {
      label: tr("rest_time_between_sets_seconds"),
      value: String(value.rest_seconds),
    },
  ];
  function load(value: SportSettings) {
    setBase(value);
    setRest(String(value.rest_seconds));
    action.clear();
  }
  return (
    <form
      ref={validation.form}
      noValidate
      className="settings-form sport-settings"
      aria-busy={action.busy}
      onSubmit={(event) => {
        event.preventDefault();
        if (!validation.validate()) return;
        setSaved(false);
        void action.run(
          () =>
            sportApi.write<SportSettings>("/settings", {
              rest_seconds: Number(rest),
              expected_version: base.version,
            }),
          (value) => {
            load(value);
            setSaved(true);
          },
        );
      }}
    >
      <h2>{tr("your_training_rhythm")}</h2>
      <label>
        {tr("rest_time_between_sets_seconds")}
        <input
          {...validation.attrs("rest_seconds")}
          type="number"
          inputMode="numeric"
          required
          min={0}
          max={3600}
          step={1}
          value={rest}
          readOnly={action.busy}
          onChange={(event) => {
            setRest(event.target.value);
            setSaved(false);
          }}
        />
      </label>
      {validation.error("rest_seconds")}
      <div
        className="sport-presets"
        role="group"
        aria-label={tr("rest_presets")}
      >
        {[0, 60, 90, 120].map((seconds) => (
          <button
            type="button"
            key={seconds}
            className="secondary-button"
            aria-pressed={rest === String(seconds)}
            disabled={action.busy}
            onClick={() => {
              setRest(String(seconds));
              setSaved(false);
            }}
          >
            {seconds ? `${seconds} s` : tr("no_rest")}
          </button>
        ))}
      </div>
      <p className="muted">{tr("rest_zero_help")}</p>
      <p className="muted">
        {tr("the_countdown_starts_when_you_complete_a_set_and_resumes")}
      </p>
      <button className="primary-button" aria-disabled={action.busy}>
        {action.busy ? tr("saving") : tr("save_settings")}
      </button>
      <ErrorMessage message={action.error} />
      <ConflictPanel
        failure={action.failure}
        draft={[{ label: tr("rest_time_between_sets_seconds"), value: rest }]}
        load={sportApi.settings}
        describe={describe}
        onReload={load}
        onKeep={(value) => {
                setBase(value);
          action.clear();
        }}
      />
      {saved && (
        <p role="status" className="sport-success">
          {tr("settings_saved")}
        </p>
      )}
      <a className="text-button" href={documentationPath("sport")}>
        {tr("sport_application_guide")}
      </a>
    </form>
  );
}

export function Settings(guard: SettingsPanelProps) {
  const resource = useResource(sportApi.settings, []);
  return <><LoadState {...resource} />{resource.data && <SettingsForm settings={resource.data} {...guard} />}</>;
}
