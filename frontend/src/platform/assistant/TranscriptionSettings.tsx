import { useState } from "react";
import { tr } from "../../shared/i18n";
import { ErrorMessage } from "../../shared/ui/Dialog";
import type { SettingsPanelProps } from "../applications/definition";
import { useSettingsDraft } from "../applications/useSettingsDraft";
import { useApiAction, useApiResource } from "../useApiResource";
import { assistantApi } from "./api";
import type { AssistantSettings, TranscriptionSettings } from "./types";
export function TranscriptionSettingsPanel({
  chatSettings,
  ...props
}: SettingsPanelProps & { chatSettings?: AssistantSettings }) {
  const resource = useApiResource(assistantApi.transcriptionSettings, []);
  return (
    <div className="assistant-transcription-settings">
      <h4>{tr("assistant_dictation_settings")}</h4>
      <p className="muted">{tr("assistant_dictation_settings_help")}</p>
      {resource.loading && <p role="status">{tr("settings_loading")}</p>}
      <ErrorMessage message={resource.error} />
      {resource.error && (
        <button className="secondary-button" onClick={resource.reload}>
          {tr("try_again")}
        </button>
      )}
      {resource.data && (
        <TranscriptionForm
          initial={resource.data}
          chatSettings={chatSettings}
          {...props}
        />
      )}
    </div>
  );
}
function customProvider(value: TranscriptionSettings) {
  return (
    (value.custom_provider === undefined
      ? value.provider
      : value.custom_provider) ?? "openai"
  );
}
function customModel(value: TranscriptionSettings) {
  return (
    (value.custom_model ?? value.model) ||
    (customProvider(value) === "openai" ? "gpt-transcribe" : "")
  );
}
function hasCustomToken(value: TranscriptionSettings) {
  return (
    value.custom_configured ?? (!value.use_chat_provider && value.configured)
  );
}
function TranscriptionForm({
  initial,
  chatSettings,
  ...draft
}: SettingsPanelProps & {
  initial: TranscriptionSettings;
  chatSettings?: AssistantSettings;
}) {
  const [saved, setSaved] = useState(initial);
  const [useChat, setUseChat] = useState(initial.use_chat_provider);
  const [provider, setProvider] = useState(customProvider(initial));
  const [model, setModel] = useState(customModel(initial));
  const [token, setToken] = useState("");
  const [notice, setNotice] = useState("");
  const action = useApiAction();
  const configured =
    saved.use_chat_provider && chatSettings
      ? chatSettings.configured && chatSettings.provider !== "anthropic"
      : saved.configured;
  const dirty =
    useChat !== saved.use_chat_provider ||
    (!useChat &&
      (provider !== customProvider(saved) ||
        model !== customModel(saved) ||
        !!token));
  useSettingsDraft(draft, dirty, action.busy);
  function save(remove = false) {
    setNotice("");
    void action.run(
      () =>
        assistantApi.saveTranscriptionSettings({
          use_chat_provider: useChat,
          ...(!useChat
            ? {
                provider,
                model: model.trim(),
                ...(remove
                  ? { api_token: null }
                  : token.trim()
                    ? { api_token: token.trim() }
                    : {}),
              }
            : {}),
        }),
      (value) => {
        setSaved(value);
        setUseChat(value.use_chat_provider);
        setProvider(customProvider(value));
        setModel(customModel(value));
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
        <label className="assistant-check">
          <input
            type="checkbox"
            checked={useChat}
            onChange={(event) => {
              setUseChat(event.target.checked);
              setToken("");
            }}
          />
          <span>{tr("assistant_dictation_use_chat")}</span>
        </label>
        {useChat ? (
          <p className="muted small-text">
            {tr("assistant_dictation_chat_help")}
          </p>
        ) : (
          <>
            <div className="assistant-settings-pair">
              <label>
                {tr("assistant_dictation_provider")}
                <select
                  value={provider}
                  onChange={(event) => {
                    const next = event.target.value as "openai" | "gemini";
                    setProvider(next);
                    setModel(next === "openai" ? "gpt-transcribe" : "");
                    setToken("");
                  }}
                >
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Google Gemini</option>
                </select>
              </label>
              <label>
                {tr("assistant_dictation_model")}
                <input
                  value={model}
                  maxLength={120}
                  required
                  onChange={(event) => setModel(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            </div>
            <label>
              {tr("assistant_dictation_token")}
              <input
                type="password"
                value={token}
                maxLength={4096}
                autoComplete="new-password"
                onChange={(event) => setToken(event.target.value)}
                placeholder={
                  hasCustomToken(saved) && customProvider(saved) === provider
                    ? "••••••••••••"
                    : ""
                }
              />
            </label>
            <p className="muted small-text">
              {tr("assistant_token_encrypted")}
            </p>
          </>
        )}
        <p className="muted small-text">
          {configured
            ? tr("assistant_dictation_configured")
            : tr("assistant_dictation_unconfigured")}
        </p>
        <div className="assistant-actions">
          <button
            className="primary-button"
            disabled={!dirty || (!useChat && !model.trim())}
          >
            {tr("assistant_dictation_save")}
          </button>
          {!useChat && hasCustomToken(saved) && (
            <button
              type="button"
              className="text-button"
              disabled={dirty}
              onClick={() => {
                if (window.confirm(tr("assistant_token_delete_confirm")))
                  save(true);
              }}
            >
              {tr("assistant_dictation_delete_token")}
            </button>
          )}
        </div>
      </fieldset>
      <ErrorMessage message={action.error} />
      {notice && (
        <p role="status" className="assistant-success">
          {notice}
        </p>
      )}
    </form>
  );
}
