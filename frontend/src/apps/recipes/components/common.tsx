import { useEffect, useState, type ReactNode } from "react";
import { Dialog, ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon, type IconName } from "../../../shared/ui/Icon";
import { useApiAction, useApiResource } from "../../../platform/useApiResource";
import { recipesApi } from "../api";
import { dateLabel, tr, type MessageKey } from "../i18n";
export interface DraftProps {
  onDirty: (value: boolean) => void;
  onBusy: (value: boolean) => void;
}
export function useDraft(dirty: boolean, busy: boolean, props: DraftProps) {
  useEffect(() => {
    props.onDirty(dirty);
    return () => props.onDirty(false);
  }, [dirty, props.onDirty]);
  useEffect(() => {
    props.onBusy(busy);
    return () => props.onBusy(false);
  }, [busy, props.onBusy]);
}
export function LoadState({
  loading,
  error,
  reload,
}: {
  loading: boolean;
  error: string;
  reload: () => void;
}) {
  return (
    <>
      {loading && (
        <p role="status" className="muted">
          {tr("loading")}
        </p>
      )}
      <ErrorMessage message={error} />
      {error && (
        <button type="button" className="secondary-button" onClick={reload}>
          {tr("retry")}
        </button>
      )}
    </>
  );
}
export function Empty({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="recipes-empty">
      <span>
        <Icon name={icon} size={30} />
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
export function Pager({
  total,
  offset,
  limit,
  onChange,
}: {
  total: number;
  offset: number;
  limit: number;
  onChange: (offset: number) => void;
}) {
  if (total <= limit && offset === 0) return null;
  return (
    <div className="recipes-pager">
      <button
        type="button"
        className="secondary-button"
        disabled={!offset}
        onClick={() => onChange(Math.max(0, offset - limit))}
      >
        {tr("previous")}
      </button>
      <span>
        {tr("pagination", {
          start: Math.min(offset + 1, total),
          end: Math.min(offset + limit, total),
          total,
        })}
      </span>
      <button
        type="button"
        className="secondary-button"
        disabled={offset + limit >= total}
        onClick={() => onChange(offset + limit)}
      >
        {tr("next")}
      </button>
    </div>
  );
}
export function NameDialog({
  title,
  initial = "",
  hint,
  onSave,
  onClose,
  ...draft
}: DraftProps & {
  title: string;
  initial?: string;
  hint?: string;
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const action = useApiAction();
  useDraft(name !== initial, action.busy, draft);
  const close = () => {
    if (!action.busy && (name === initial || window.confirm(tr("unsaved"))))
      onClose();
  };
  return (
    <Dialog title={title} onClose={close}>
      <form
        className="recipes-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(() => onSave(name.trim()), onClose);
        }}
      >
        <fieldset disabled={action.busy}>
          <label>
            {tr("title")}
            <input
              required
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {hint && <p className="muted">{hint}</p>}
          <ErrorMessage message={action.error} />
          <div className="recipes-actions">
            <button className="primary-button" disabled={!name.trim()}>
              {action.busy ? tr("saving") : tr("save")}
            </button>
            <button type="button" className="secondary-button" onClick={close}>
              {tr("cancel")}
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
export function History({
  id,
  type,
  version,
}: {
  id: string;
  type: "recipes" | "lists";
  version: number;
}) {
  const [open, setOpen] = useState(false),
    [offset, setOffset] = useState(0);
  const resource = useApiResource(
    (signal) =>
      open ? recipesApi.history(type, id, offset, signal) : Promise.resolve([]),
    [open, id, offset, version],
  );
  return (
    <details
      className="recipes-history"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>{tr("history")}</summary>
      {open && (
        <>
          <LoadState {...resource} />
          <ol>
            {resource.data?.map((event) => (
              <li key={event.id}>
                <span>{tr(event.kind as MessageKey)}</span>
                <time dateTime={event.occurred_at}>
                  {dateLabel(event.occurred_at)}
                </time>
              </li>
            ))}
          </ol>
          <div className="recipes-actions">
            <button
              disabled={!offset}
              onClick={() => setOffset(Math.max(0, offset - 30))}
            >
              {tr("previous")}
            </button>
            <button
              disabled={(resource.data?.length ?? 0) < 30}
              onClick={() => setOffset(offset + 30)}
            >
              {tr("next")}
            </button>
          </div>
        </>
      )}
    </details>
  );
}
