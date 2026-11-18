import { useMemo, useState } from "react";
import { AssistantSettingsPanel } from "../../platform/assistant/AssistantSettings";
import type { AssistantSettings as ProviderSettings } from "../../platform/assistant/types";
import type { SettingsPanelProps } from "../../platform/applications/definition";
import { useSettingsDraft } from "../../platform/applications/useSettingsDraft";
import { useApiResource, useApiAction } from "../../platform/useApiResource";
import { ErrorMessage } from "../../shared/ui/Dialog";
import { tr } from "./i18n";
import { assistantApi } from "./api";
import { MemoryManager } from "./MemoryManager";
import { TranscriptionSettingsPanel } from "./TranscriptionSettings";
import "./styles.css";

export function Settings(props: SettingsPanelProps) {
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [provider, setProvider] = useState<ProviderSettings>();
  const resource = useApiResource(assistantApi.settings, []);
  const action = useApiAction();
  const guards = useMemo(
    () =>
      Object.fromEntries(
        ["provider", "voice", "memory"].map((key) => [
          key,
          {
            onDirty: (value: boolean) =>
              setDirty((previous) => ({ ...previous, [key]: value })),
            onBusy: (value: boolean) =>
              setBusy((previous) => ({ ...previous, [key]: value })),
          },
        ]),
      ) as Record<string, SettingsPanelProps>,
    [],
  );
  useSettingsDraft(
    props,
    Object.values(dirty).some(Boolean),
    action.busy || Object.values(busy).some(Boolean),
  );
  return (
    <div className="settings-panels">
      <AssistantSettingsPanel {...guards.provider} onSaved={setProvider} />
      <section className="settings-card settings-form">
        <TranscriptionSettingsPanel
          {...guards.voice}
          chatSettings={provider ?? resource.data}
        />
      </section>
      <section className="settings-card" id="assistant-memory">
        <h3>{tr("assistant_memory")}</h3>
        <ErrorMessage message={resource.error || action.error} />
        {resource.error && (
          <button className="secondary-button" onClick={resource.reload}>
            {tr("try_again")}
          </button>
        )}
        {resource.data && (
          <label className="assistant-memory-toggle">
            <input
              type="checkbox"
              checked={resource.data.memory_enabled}
              disabled={action.busy}
              onChange={(event) =>
                void action.run(
                  () =>
                    assistantApi.saveSettings({
                      memory_enabled: event.target.checked,
                    }),
                  resource.reload,
                )
              }
            />
            {tr("assistant_memory_enabled")}
          </label>
        )}
        <MemoryManager {...guards.memory} />
      </section>
    </div>
  );
}
