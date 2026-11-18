import { useState } from "react";
import { formatLocale, tr } from "../../../shared/i18n";
import { ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
import { assistantApi } from "../api";
import type { AssistantSource } from "../types";
import type { SourceDraft } from "../useSourceDraft";
function size(bytes: number) {
  return `${new Intl.NumberFormat(formatLocale(), { maximumFractionDigits: 1 }).format(bytes / 1024)} ${tr("assistant_source_kb")}`;
}
export function DraftSources({
  draft,
  disabled,
}: {
  draft: SourceDraft;
  disabled: boolean;
}) {
  return (
    <>
      {!!draft.items.length && (
        <ul className="assistant-sources" aria-label={tr("assistant_sources")}>
          {draft.items.map((item) => (
            <li className="assistant-source" key={item.key}>
              <Icon name={item.url ? "link" : "paperclip"} />
              <div>
                <span className="assistant-source-name">
                  {item.source?.name ?? item.name}
                </span>
                <small>
                  {item.source
                    ? size(item.source.size_bytes)
                    : item.file
                      ? size(item.file.size)
                      : tr("assistant_source_web")}
                </small>
                {(item.status === "loading" || item.status === "ready") && (
                  <small role="status">
                    {tr(
                      item.status === "loading"
                        ? "assistant_source_preparing"
                        : "assistant_source_ready",
                    )}
                  </small>
                )}
                {item.error && <ErrorMessage message={item.error} />}
              </div>
              {item.status === "error" && (
                <button
                  type="button"
                  className="icon-button"
                  disabled={disabled}
                  aria-label={tr("assistant_source_retry", { name: item.name })}
                  onClick={() => void draft.retry(item)}
                >
                  <Icon name="restore" />
                </button>
              )}
              <button
                type="button"
                className="icon-button"
                disabled={disabled}
                aria-label={tr("assistant_source_remove", { name: item.name })}
                onClick={() => void draft.remove(item.key)}
              >
                <Icon name="x" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <ErrorMessage message={draft.error} />
    </>
  );
}
export function MessageSources({
  sources,
  busy,
  onChanged,
  onBusy,
}: {
  sources: AssistantSource[];
  busy: boolean;
  onChanged: () => void;
  onBusy: (id: string, busy: boolean) => void;
}) {
  const [error, setError] = useState("");
  async function remove(source: AssistantSource) {
    if (
      !window.confirm(
        tr("assistant_source_delete_confirm", { name: source.name }),
      )
    )
      return;
    onBusy(source.id, true);
    setError("");
    try {
      await assistantApi.removeSource(source.id);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      onBusy(source.id, false);
    }
  }
  return (
    <>
      <ul
        className="assistant-sources assistant-message-sources"
        aria-label={tr("assistant_sources")}
      >
        {sources.map((source) => (
          <li className="assistant-source" key={source.id}>
            <Icon name={source.kind === "web" ? "link" : "paperclip"} />
            <div>
              <span className="assistant-source-name">{source.name}</span>
              <small>
                {source.removed_at
                  ? tr("assistant_source_removed")
                  : size(source.size_bytes)}
                {source.page_count
                  ? ` · ${tr("assistant_source_pages", { count: source.page_count })}`
                  : ""}
              </small>
              {source.url && (
                <small className="assistant-source-url">{source.url}</small>
              )}
            </div>
            {!source.removed_at && (
              <>
                <a
                  className="icon-button"
                  href={assistantApi.sourceContent(source.id)}
                  download={source.name}
                  aria-label={tr("assistant_source_download", {
                    name: source.name,
                  })}
                >
                  <Icon name="download" />
                </a>
                <button
                  type="button"
                  className="icon-button"
                  disabled={busy}
                  aria-label={tr("assistant_source_delete", {
                    name: source.name,
                  })}
                  onClick={() => void remove(source)}
                >
                  <Icon name="trash" />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <ErrorMessage message={error} />
    </>
  );
}
