import { useEffect, useRef, useState, type RefObject } from "react";
import { tr } from "../../../shared/i18n";
import { Icon } from "../../../shared/ui/Icon";
import type { AssistantSettings } from "../types";
import { Dialog, ErrorMessage } from "../../../shared/ui/Dialog";
import { DraftSources } from "./Sources";
import type { SourceDraft } from "../useSourceDraft";
import type { useDictation } from "../useDictation";
export function Composer({
  settings,
  value,
  onChange,
  field,
  loading,
  archived,
  running,
  busy,
  onSend,
  onStop,
  showLatest,
  onLatest,
  sources,
  dictation,
  onUrlDirty,
}: {
  settings?: AssistantSettings;
  value: string;
  onChange: (value: string) => void;
  field: RefObject<HTMLTextAreaElement | null>;
  loading: boolean;
  archived: boolean;
  running: boolean;
  busy: boolean;
  onSend: () => void;
  onStop: () => void;
  showLatest: boolean;
  onLatest: () => void;
  sources: SourceDraft;
  dictation: ReturnType<typeof useDictation>;
  onUrlDirty: (dirty: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState("");
  const locked = loading || archived || busy;
  const sourceLocked = locked || dictation.active;
  useEffect(() => {
    onUrlDirty(urlOpen && !!url.trim());
    return () => onUrlDirty(false);
  }, [urlOpen, url, onUrlDirty]);
  function closeUrl(check = true) {
    if (check && url.trim() && !window.confirm(tr("assistant_unsaved"))) return;
    setUrlOpen(false);
    setUrl("");
  }

  useEffect(() => {
    if (field.current) {
      field.current.style.height = "auto";
      field.current.style.height = `${Math.min(field.current.scrollHeight, 180)}px`;
    }
  }, [value, field]);
  return (
    <div className="assistant-composer-area">
      {showLatest && (
        <button
          className="assistant-latest secondary-button"
          onClick={onLatest}
        >
          <Icon name="down" size={15} />
          {tr("assistant_latest")}
        </button>
      )}
      {settings && !settings.configured ? (
        <div className="assistant-setup">
          <Icon name="sparkles" />
          <div>
            <p>{tr("assistant_configuration_needed")}</p>
            <a href="/settings#assistant-settings">
              {tr("assistant_configure")}
              <Icon name="arrow" size={15} />
            </a>
          </div>
        </div>
      ) : (
        <form
          className="assistant-composer"
          onDragOver={(event) => {
            if (!sourceLocked && event.dataTransfer.types.includes("Files"))
              event.preventDefault();
          }}
          onDrop={(event) => {
            if (event.dataTransfer.files.length) {
              event.preventDefault();
              if (!sourceLocked)
                sources.addFiles(Array.from(event.dataTransfer.files));
            }
          }}
          onSubmit={(event) => {
            event.preventDefault();
            onSend();
          }}
        >
          <DraftSources draft={sources} disabled={locked} />
          <input
            type="file"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            ref={input}
            accept={sources.limits.data?.accepted_extensions.join(",")}
            onChange={(event) => {
              sources.addFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <label className="sr-only" htmlFor="assistant-message">
            {tr("assistant_composer")}
          </label>
          <textarea
            id="assistant-message"
            ref={field}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onPaste={(event) => {
              const images = Array.from(event.clipboardData.files).filter(
                (file) => file.type.startsWith("image/"),
              );
              if (images.length && !sourceLocked) {
                event.preventDefault();
                sources.addFiles(images);
              }
            }}
            rows={1}
            maxLength={12000}
            placeholder={tr("assistant_placeholder")}
            disabled={loading || archived || busy}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                onSend();
              }
            }}
          />
          <div className="assistant-composer-bottom">
            <div className="assistant-composer-tools">
              <button
                type="button"
                className="icon-button"
                disabled={sourceLocked || !sources.limits.data}
                aria-label={tr("assistant_attach")}
                onClick={() => input.current?.click()}
              >
                <Icon name="paperclip" />
              </button>
              <button
                type="button"
                className="icon-button"
                disabled={sourceLocked || !sources.limits.data}
                aria-label={tr("assistant_add_url")}
                onClick={() => setUrlOpen(true)}
              >
                <Icon name="link" />
              </button>
              {!dictation.active && (
                <button
                  type="button"
                  className="icon-button"
                  disabled={locked || sources.busy || !dictation.supported}
                  aria-label={tr("assistant_dictation_start")}
                  title={
                    !dictation.supported
                      ? tr("assistant_dictation_unsupported")
                      : tr("assistant_dictation_start")
                  }
                  onClick={() => void dictation.start()}
                >
                  <Icon name="microphone" />
                </button>
              )}
            </div>
            <span className="assistant-model-label">
              <Icon name="sparkles" size={14} /> LifeOS{" "}
              <span className="assistant-composer-model">
                · {settings?.model}
              </span>
            </span>
            {running ? (
              <button
                type="button"
                className="assistant-send"
                aria-label={tr("assistant_stop")}
                onClick={onStop}
              >
                <Icon name="stop" size={18} />
              </button>
            ) : (
              <button
                className="assistant-send"
                disabled={
                  busy ||
                  (!value.trim() && !sources.items.length) ||
                  !sources.ready ||
                  dictation.active ||
                  !settings?.configured ||
                  loading ||
                  archived
                }
                aria-label={tr("assistant_send")}
              >
                <Icon name="up" size={21} />
              </button>
            )}
          </div>
          {dictation.active && (
            <div className="assistant-dictation" role="status">
              <span>
                {dictation.state === "permission"
                  ? tr("assistant_dictation_waiting")
                  : dictation.state === "recording"
                    ? tr("assistant_dictation_recording", {
                        seconds: dictation.seconds,
                      })
                    : tr("assistant_dictation_transcribing")}
              </span>
              {dictation.state === "recording" && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={dictation.stop}
                >
                  {tr("assistant_dictation_stop")}
                </button>
              )}
              <button
                type="button"
                className="text-button"
                onClick={dictation.cancel}
              >
                {tr("assistant_cancel")}
              </button>
            </div>
          )}
          <ErrorMessage message={dictation.error} />
          {dictation.retryAvailable && (
            <div className="assistant-actions">
              <button
                type="button"
                className="text-button"
                onClick={dictation.retry}
              >
                {tr("assistant_dictation_retry")}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={dictation.cancel}
              >
                {tr("assistant_cancel")}
              </button>
            </div>
          )}
          {!dictation.supported && (
            <p className="muted small-text">
              {tr("assistant_dictation_unsupported")}
            </p>
          )}
          {sources.limits.error && (
            <div>
              <ErrorMessage message={sources.limits.error} />
              <button
                type="button"
                className="text-button"
                onClick={sources.limits.reload}
              >
                {tr("try_again")}
              </button>
            </div>
          )}
        </form>
      )}
      {urlOpen && (
        <Dialog title={tr("assistant_add_url")} onClose={() => closeUrl()}>
          <form
            className="settings-form"
            onSubmit={(event) => {
              event.preventDefault();
              sources.addUrl(url.trim());
              closeUrl(false);
            }}
          >
            <label>
              {tr("assistant_url")}
              <input
                type="url"
                value={url}
                required
                maxLength={2048}
                placeholder="https://example.com/article"
                onChange={(event) => setUrl(event.target.value)}
              />
            </label>
            <p className="muted">{tr("assistant_url_help")}</p>
            <div className="assistant-actions">
              <button className="primary-button" disabled={!url.trim()}>
                {tr("assistant_url_read")}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => closeUrl()}
              >
                {tr("assistant_cancel")}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      <p className="assistant-disclaimer">{tr("assistant_footnote")}</p>
    </div>
  );
}
