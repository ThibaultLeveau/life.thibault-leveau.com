import { useState } from "react";
import { tr } from "../../shared/i18n";
import { ErrorMessage } from "../../shared/ui/Dialog";
import { Icon } from "../../shared/ui/Icon";
import type { SettingsPanelProps } from "../applications/definition";
import { useSettingsDraft } from "../applications/useSettingsDraft";
import { useApiAction, useApiResource } from "../useApiResource";
import { providerApi as assistantApi } from "./api";
import type { AssistantSettings, Provider } from "./types";
import "./settings.css";

export function AssistantSettingsPanel(
  props: SettingsPanelProps & { onSaved?: (value: AssistantSettings) => void },
) {
  const resource = useApiResource(assistantApi.settings, []);
  return (
    <section className="settings-card settings-form" id="assistant-settings">
      <h3>
        <Icon name="sparkles" /> {tr("assistant_settings")}
      </h3>
      <p className="muted">{tr("assistant_settings_description")}</p>
      {resource.loading && <p role="status">{tr("settings_loading")}</p>}
      <ErrorMessage message={resource.error} />
      {resource.error && (
        <button className="secondary-button" onClick={resource.reload}>
          {tr("try_again")}
        </button>
      )}
      {resource.data && (
        <SettingsForm
          initial={resource.data}
          onSaved={props.onSaved ?? (() => {})}
          onDirty={props.onDirty}
          onBusy={props.onBusy}
        />
      )}
    </section>
  );
}
function SettingsForm({
  initial,
  onSaved,
  ...draft
}: SettingsPanelProps & {
  initial: AssistantSettings;
  onSaved: (value: AssistantSettings) => void;
}) {
  const [saved, setSaved] = useState(initial);
  const [provider, setProvider] = useState(initial.provider);
  const [model, setModel] = useState(initial.model);
  const [token, setToken] = useState("");
  const [notice, setNotice] = useState("");
  const action = useApiAction();
  const retainsToken = saved.configured && provider === saved.provider;
  const needsModel =
    !!token.trim() ||
    (provider === saved.provider && model !== saved.model && !!saved.model);
  const dirty = provider !== saved.provider || model !== saved.model || !!token;
  useSettingsDraft(draft, dirty, action.busy);
  function save(apiToken?: string | null) {
    setNotice("");
    void action.run(
      () =>
        assistantApi.saveSettings({
          provider,
          ...(model.trim() ? { model: model.trim() } : {}),
          ...(apiToken !== undefined
            ? { api_token: apiToken }
            : token.trim()
              ? { api_token: token.trim() }
              : {}),
        }),
      (value) => {
        setSaved(value);
        onSaved(value);
        setProvider(value.provider);
        setModel(value.model);
        setToken("");
        setNotice(tr("assistant_saved"));
      },
    );
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <fieldset disabled={action.busy} className="assistant-settings-fields">
        <div className="assistant-settings-pair">
          <label>
            {tr("assistant_provider")}
            <select
              value={provider}
              onChange={(event) => {
                setProvider(event.target.value as Provider);
                setModel("");
                setToken("");
                setNotice("");
              }}
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Google Gemini</option>
            </select>
          </label>
          <label>
            {tr("assistant_model")}
            <input
              value={model}
              maxLength={120}
              required={needsModel}
              onChange={(event) => setModel(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </div>
        <label>
          {retainsToken
            ? tr("assistant_token_replace")
            : tr("assistant_api_token")}
          <input
            type="password"
            value={token}
            maxLength={4096}
            autoComplete="new-password"
            spellCheck={false}
            onChange={(event) => setToken(event.target.value)}
            placeholder={retainsToken ? "••••••••••••" : ""}
            aria-describedby="assistant-token-help"
          />
        </label>
        <p className="muted small-text" id="assistant-token-help">
          {provider !== saved.provider
            ? tr("assistant_token_provider_changed")
            : saved.configured
              ? tr("assistant_token_existing", { hint: saved.token_hint ?? "" })
              : tr("assistant_token_empty")}{" "}
          {tr("assistant_token_encrypted")}
        </p>

        <p className="muted small-text">{tr("assistant_provider_notice")}</p>
        <div className="assistant-actions">
          <button
            className="primary-button"
            disabled={!dirty || (needsModel && !model.trim())}
          >
            {action.busy ? tr("assistant_saving") : tr("assistant_save")}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!saved.configured || dirty}
            onClick={() => {
              setNotice("");
              void action.run(assistantApi.test, () =>
                setNotice(tr("assistant_test_ok")),
              );
            }}
          >
            {tr("assistant_test")}
          </button>
          {saved.configured && (
            <button
              type="button"
              className="text-button"
              disabled={dirty}
              onClick={() => {
                if (window.confirm(tr("assistant_token_delete_confirm")))
                  save(null);
              }}
            >
              {tr("assistant_token_delete")}
            </button>
          )}
        </div>
      </fieldset>
      <ErrorMessage message={action.error} />
      {notice && (
        <p className="assistant-success" role="status">
          <Icon name="check" />
          {notice}
        </p>
      )}
    </form>
  );
}
