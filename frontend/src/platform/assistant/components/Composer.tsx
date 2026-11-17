import { useEffect, type RefObject } from "react";
import { tr } from "../../../shared/i18n";
import { Icon } from "../../../shared/ui/Icon";
import type { AssistantSettings } from "../types";
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
}) {
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
          onSubmit={(event) => {
            event.preventDefault();
            onSend();
          }}
        >
          <label className="sr-only" htmlFor="assistant-message">
            {tr("assistant_composer")}
          </label>
          <textarea
            id="assistant-message"
            ref={field}
            value={value}
            onChange={(event) => onChange(event.target.value)}
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
            <span>
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
                  !value.trim() ||
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
        </form>
      )}
      <p className="assistant-disclaimer">{tr("assistant_footnote")}</p>
    </div>
  );
}
