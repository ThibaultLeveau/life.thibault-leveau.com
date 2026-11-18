import {
  Component,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { formatLocale, tr } from "../../../shared/i18n";
import { ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon, type IconName } from "../../../shared/ui/Icon";
import {
  SnippetLine,
  SnippetSummary,
  SnippetText,
} from "../../../shared/ui/SnippetSummary";
import { useApplications } from "../../applications/ApplicationProvider";
import type { ApplicationModule } from "../../applications/definition";
import { useApiAction } from "../../useApiResource";
import { assistantApi, synchronizeAssistant } from "../api";
import { hasEntity, record, text } from "../snippets";
import type { Snippet } from "../types";
import { LifeOSSnippet } from "./LifeOSSnippet";
class SnippetBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p className="muted">{tr("assistant_snippet_unknown")}</p>
    ) : (
      this.props.children
    );
  }
}
export function SnippetHost({
  snippet: initial,
  modules,
  onChanged,
  disabled = false,
  beforeChange,
  onBusy,
}: {
  snippet: Snippet;
  modules: ApplicationModule[];
  onChanged: () => void;
  disabled?: boolean;
  beforeChange?: () => boolean;
  onBusy?: (id: string, busy: boolean) => void;
}) {
  const { items } = useApplications();
  const [snippet, setSnippet] = useState(initial);
  const [syncError, setSyncError] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => setSnippet(initial), [initial]);
  const action = useApiAction();
  const card = useRef<HTMLElement>(null);
  const app =
    snippet.application_id === "lifeos"
      ? { name: "LifeOS", icon: "settings", path: "/settings", enabled: true }
      : items?.find((item) => item.id === snippet.application_id);
  useEffect(() => {
    onBusy?.(snippet.id, action.busy);
    return () => onBusy?.(snippet.id, false);
  }, [snippet.id, action.busy, onBusy]);
  const module = modules.find((item) => item.id === snippet.application_id);
  const data = record(snippet.data);
  const readOnly = snippet.phase === "result" && data.read_only === true;
  const targets = Array.isArray(data.targets)
    ? data.targets.map(text).filter(Boolean)
    : [];
  const changes = Array.isArray(data.changes) ? data.changes.map(record) : [];
  if (!app) return <p className="muted">{tr("assistant_snippet_unknown")}</p>;
  async function synchronize() {
    try {
      await synchronizeAssistant();
      if (alive.current) setSyncError(false);
    } catch (error) {
      if (alive.current && (error as Error).name !== "AbortError")
        setSyncError(true);
    }
    if (alive.current) onChanged();
  }
  return (
    <article
      ref={card}
      tabIndex={-1}
      className={`assistant-snippet is-${snippet.phase}`}
    >
      <header>
        <span>
          <Icon name={app.icon as IconName} size={16} />
          {app.name}
        </span>
        <span className="assistant-snippet-phase">
          <Icon
            name={
              readOnly ? "book" : snippet.phase === "result" ? "check" : "edit"
            }
            size={13}
          />
          {tr(
            readOnly
              ? "assistant_snippet_read"
              : snippet.phase === "result"
                ? "assistant_snippet_result"
                : "assistant_snippet_preview",
          )}
        </span>
      </header>
      <h3>
        {text(record(data.labels)[formatLocale() === "en-GB" ? "en" : "fr"]) ||
          text(data.title) ||
          app.name}
      </h3>
      {!app.enabled ? (
        <p className="muted">{tr("assistant_snippet_disabled")}</p>
      ) : snippet.schema_version !== 1 ? (
        <p className="muted">{tr("assistant_snippet_unknown")}</p>
      ) : (
        <>
          {text(data.summary) && <p className="muted">{text(data.summary)}</p>}
          {(data.effect === "archive" || data.effect === "restore") && (
            <p className="muted small-text">
              {tr(
                data.effect === "archive"
                  ? "assistant_effect_archive"
                  : "assistant_effect_restore",
              )}
            </p>
          )}
          {!!targets.length && hasEntity(data.entity) && (
            <p className="muted small-text">
              <SnippetText>
                {tr("assistant_targets", { names: targets.join(" · ") })}
              </SnippetText>
            </p>
          )}
          {!!targets.length && !hasEntity(data.entity) && (
            <SnippetSummary icon={app.icon as IconName}>
              {targets.map((target, index) => (
                <SnippetLine key={index} title={target} />
              ))}
            </SnippetSummary>
          )}
          {(!targets.length || hasEntity(data.entity)) &&
            snippet.application_id === "lifeos" && (
              <LifeOSSnippet snippet={snippet} />
            )}
          {(!targets.length || hasEntity(data.entity)) &&
            module?.AssistantSnippet && (
              <SnippetBoundary>
                <Suspense
                  fallback={<p role="status">{tr("assistant_loading")}</p>}
                >
                  <module.AssistantSnippet snippet={snippet} />
                </Suspense>
              </SnippetBoundary>
            )}
          {!!changes.length && (
            <dl className="assistant-snippet-changes">
              {changes.map((change, index) => (
                <div key={index}>
                  <dt>{text(change.field)}</dt>
                  <dd>
                    <span>
                      <small>{tr("assistant_snippet_before")}</small>
                      {text(change.before) || "—"}
                    </span>
                    <Icon name="arrow" size={14} />
                    <span>
                      <small>{tr("assistant_snippet_after")}</small>
                      {text(change.after) || "—"}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <footer>
            {snippet.phase === "preview" && snippet.operation_id && (
              <button
                className="primary-button"
                disabled={action.busy || disabled}
                onClick={() => {
                  if (
                    snippet.application_id === "lifeos" &&
                    beforeChange?.() === false
                  )
                    return;
                  void action.run(
                    async () => {
                      const result = await assistantApi.confirm(
                        snippet.operation_id!,
                      );
                      if (!alive.current) return;
                      setSnippet(
                        result.snippet ?? { ...snippet, phase: "result" },
                      );
                      card.current?.focus({ preventScroll: true });
                      await synchronize();
                    },
                    () => {},
                  );
                }}
              >
                {action.busy
                  ? tr("assistant_saving")
                  : tr("assistant_snippet_confirm")}
              </button>
            )}
            <a className="text-button" href={app.path}>
              {tr("assistant_snippet_open", { name: app.name })}
              <Icon name="arrow" size={14} />
            </a>
          </footer>
        </>
      )}
      <ErrorMessage message={action.error} />
      {syncError && (
        <div>
          <p role="status" className="muted">
            {tr("assistant_sync_failed")}
          </p>
          <button
            className="text-button"
            disabled={action.busy || disabled}
            onClick={() => {
              if (beforeChange?.() === false) return;
              void action.run(synchronize, () => {});
            }}
          >
            {tr("assistant_sync_retry")}
          </button>
        </div>
      )}
    </article>
  );
}
