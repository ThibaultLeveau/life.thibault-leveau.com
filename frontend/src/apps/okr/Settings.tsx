import { useCallback, useRef, useState } from "react";
import type { SettingsPanelProps } from "../../platform/applications/definition";
import { useApiResource } from "../../platform/useApiResource";
import { tr as common } from "../../shared/i18n";
import { Settings as SettingsForm } from "./components/Settings";
import { LoadState } from "./components/common";
import { okrApi } from "./api";
import { tr } from "./i18n";

export function Settings(guard: SettingsPanelProps) {
  const resource = useApiResource(okrApi.settings, []);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const onDirty = useCallback(
    (value: boolean) => {
      dirty.current = value;
      guard.onDirty(value);
    },
    [guard.onDirty],
  );
  const onBusy = useCallback(
    (value: boolean) => {
      setBusy(value);
      guard.onBusy(value);
    },
    [guard.onBusy],
  );
  return (
    <>
      <LoadState {...resource} />
      {saved && <p role="status">{tr("settings_saved")}</p>}
      {resource.data && (
        <>
          <SettingsForm
            key={resource.data.version}
            settings={resource.data}
            onDirty={onDirty}
            onBusy={onBusy}
            onSaved={() => {
              setSaved(true);
              resource.reload();
            }}
          />
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              if (
                !dirty.current ||
                window.confirm(common("progression_unsaved"))
              )
                resource.reload();
            }}
          >
            {common("settings_reload")}
          </button>
        </>
      )}
    </>
  );
}
