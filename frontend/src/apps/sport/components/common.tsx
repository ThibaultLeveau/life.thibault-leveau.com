import { formatLocale } from "../../../shared/i18n";
import { tr } from "../i18n";
import {
  useCallback,
  useId,
  useEffect,
  useRef,
  useState,
  type DependencyList,
  type ReactNode,
} from "react";
import { useApiResource } from "../../../platform/useApiResource";
import { ApiError } from "../../../platform/api";
import { ErrorMessage } from "../../../shared/ui/Dialog";
import type { KindDefinition, Values } from "../types";

export function useResource<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  dependencies: DependencyList,
  options: { keepPrevious?: boolean } = { keepPrevious: true },
) {
  return useApiResource(loader, dependencies, options);
}
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [failure, setFailure] = useState<Error | null>(null);
  const alive = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function run<T>(
    operation: () => Promise<T>,
    accept: (result: T) => void,
  ) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setFailure(null);
    try {
      const value = await operation();
      if (alive.current) accept(value);
    } catch (e) {
      if (alive.current && (e as Error).name !== "AbortError") {
        setError((e as Error).message);
        setFailure(e as Error);
      }
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return {
    busy,
    error,
    failure,
    run,
    clear: () => {
      setError("");
      setFailure(null);
    },
  };
}
export function LoadState({
  loading,
  error,
  reload,
  data,
}: {
  data?: unknown;
  loading: boolean;
  error: string;
  reload: () => void;
}) {
  return (
    <>
      {loading && (
        <p
          role="status"
          className={data === undefined ? "sport-empty" : "sport-refreshing"}
        >
          {tr("loading")}
        </p>
      )}
      <ErrorMessage message={error} />
      {error && (
        <button className="secondary-button" onClick={reload}>
          {tr("try_again")}
        </button>
      )}
    </>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="sport-empty">
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function ValuesFields({
  kind,
  value,
  onChange,
  required = false,
  compact = false,
  readOnly = false,
  validation,
  prefix = "",
}: {
  kind: KindDefinition;
  value: Values;
  onChange: (v: Values) => void;
  required?: boolean;
  compact?: boolean;
  readOnly?: boolean;
  validation?: ReturnType<typeof useFormValidation>;
  prefix?: string;
}) {
  return (
    <div className="sport-value-fields">
      {kind.fields.map((field) => (
        <label key={field.key}>
          {compact ? field.unit : `${field.label} (${field.unit})`}
          <input
            aria-label={compact ? `${field.label} (${field.unit})` : undefined}
            {...(validation?.attrs(`${prefix}${field.key}`) ?? {
              name: `${prefix}${field.key}`,
            })}
            readOnly={readOnly}
            type="number"
            inputMode={field.key === "reps" ? "numeric" : "decimal"}
            min={field.minimum}
            max={field.maximum}
            step={field.key === "reps" ? 1 : "any"}
            required={required}
            value={value[field.key] ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                [field.key]:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
          {validation?.error(`${prefix}${field.key}`)}
        </label>
      ))}
    </div>
  );
}
export const number = (n: number) =>
  new Intl.NumberFormat(formatLocale(), { maximumFractionDigits: 2 }).format(n);
export function valuesText(kind: KindDefinition, values: Values) {
  return kind.fields
    .filter((f) => values[f.key] != null)
    .map((f) => `${number(values[f.key]!)} ${f.unit}`)
    .join(" · ");
}
export function localDay() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function day(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(
    formatLocale(),
    { day: "numeric", month: "short", year: "numeric" },
  );
}
export function moment(value: string) {
  return new Date(value).toLocaleString(formatLocale(), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    year: "numeric",
  });
}

export type RegisterGuard = (guard: (() => boolean) | null) => void;
export function useDraftGuard(
  dirty: boolean,
  busy: boolean,
  registerGuard: RegisterGuard,
) {
  const current = useRef({ dirty, busy });
  current.current = { dirty, busy };
  const canLeave = useCallback(
    () =>
      !current.current.busy &&
      (!current.current.dirty || window.confirm(tr("discard_draft"))),
    [],
  );
  useEffect(() => {
    registerGuard(canLeave);
    const unload = (event: BeforeUnloadEvent) => {
      if (current.current.dirty || current.current.busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      registerGuard(null);
      window.removeEventListener("beforeunload", unload);
    };
  }, [canLeave, registerGuard]);
  return canLeave;
}

export function useDebounced<T>(value: T, delay = 250) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

export function Pagination({
  offset,
  limit,
  total,
  onChange,
}: {
  offset: number;
  limit: number;
  total: number;
  onChange: (offset: number) => void;
}) {
  if (total <= limit && !offset) return null;
  return (
    <div className="sport-pagination">
      <button
        type="button"
        className="secondary-button"
        aria-disabled={offset === 0}
        onClick={() => {
          if (offset > 0) onChange(Math.max(0, offset - limit));
        }}
      >
        {tr("previous")}
      </button>
      <span role="status">
        {tr("page_range", {
          first: Math.min(offset + 1, total),
          last: Math.min(offset + limit, total),
          total,
        })}
      </span>
      <button
        type="button"
        className="secondary-button"
        aria-disabled={offset + limit >= total}
        onClick={() => {
          if (offset + limit < total) onChange(offset + limit);
        }}
      >
        {tr("next")}
      </button>
    </div>
  );
}

function focusField(element?: HTMLElement | null) {
  for (
    let parent = element?.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  element?.focus();
}

export function useFormValidation(failure: Error | null) {
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  const [local, setLocal] = useState<Record<string, string>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const server =
    failure instanceof ApiError
      ? Object.fromEntries(
          failure.fields.map((field) => [
            field.loc?.filter((part) => part !== "body").join(".") ?? "",
            field.type === "value_error"
              ? field.msg.replace(/^Value error, /, "")
              : tr("field_invalid"),
          ]),
        )
      : {};
  const errors = { ...server, ...local };
  useEffect(() => {
    setDismissed(new Set());
    const first =
      failure instanceof ApiError
        ? failure.fields[0]?.loc?.filter((part) => part !== "body").join(".")
        : null;
    if (typeof first === "string")
      focusField(
        form.current?.querySelector<HTMLElement>(
          `[name="${CSS.escape(first)}"]`,
        ),
      );
  }, [failure]);
  const message = (name: string) => (dismissed.has(name) ? "" : errors[name]);
  return {
    form,
    attrs: (name: string) => ({
      name,
      "aria-invalid": !!message(name),
      "aria-describedby": message(name) ? `${id}-${name}` : undefined,
      onInput: () => setDismissed((previous) => new Set([...previous, name])),
    }),
    error: (name: string) =>
      message(name) ? (
        <p className="form-field-error" id={`${id}-${name}`}>
          {message(name)}
        </p>
      ) : null,
    validate: () => {
      const next: Record<string, string> = {};
      let first: HTMLElement | undefined;
      for (const element of Array.from(form.current?.elements ?? [])) {
        if (
          !(
            element instanceof HTMLInputElement ||
            element instanceof HTMLSelectElement ||
            element instanceof HTMLTextAreaElement
          ) ||
          !element.willValidate
        )
          continue;
        const empty = element.required && !element.value.trim();
        if (empty || !element.validity.valid) {
          first ??= element;
          next[element.name] = tr(empty ? "field_required" : "field_invalid");
        }
      }
      setLocal(next);
      setDismissed(new Set());
      focusField(first);
      return !first;
    },
  };
}

export type ComparisonField = { label: string; value: string };
export function ConflictPanel<T>({
  failure,
  draft,
  load,
  describe,
  onReload,
  onKeep,
  onCopy,
}: {
  failure: Error | null;
  draft: ComparisonField[];
  load: () => Promise<T>;
  describe: (item: T) => ComparisonField[];
  onReload: (item: T) => void;
  onKeep: (item: T) => void;
  onCopy?: () => void;
}) {
  const [latest, setLatest] = useState<T>();
  const action = useAction();
  if (!(failure instanceof ApiError) || failure.status !== 409) return null;
  return (
    <section className="sport-conflict" aria-label={tr("resolve_conflict")}>
      <p>{tr("conflict_help")}</p>
      <button
        type="button"
        className="secondary-button"
        disabled={action.busy}
        onClick={() => void action.run(load, setLatest)}
      >
        {tr("compare_saved")}
      </button>
      <ErrorMessage message={action.error} />
      {latest && (
        <>
          <div className="sport-comparison">
            <div>
              <h3>{tr("your_draft")}</h3>
              <dl>
                {draft.map((field) => (
                  <div key={field.label}>
                    <dt>{field.label}</dt>
                    <dd>{field.value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <h3>{tr("saved_version")}</h3>
              <dl>
                {describe(latest).map((field) => (
                  <div
                    key={field.label}
                    className={
                      draft.find((d) => d.label === field.label)?.value !==
                      field.value
                        ? "is-different"
                        : undefined
                    }
                  >
                    <dt>{field.label}</dt>
                    <dd>{field.value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <p>{tr("conflict_replace_help")}</p>
          <div className="sport-inline">
            <button
              type="button"
              className="secondary-button"
              onClick={() => onReload(latest)}
            >
              {tr("use_saved_version")}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => onKeep(latest)}
            >
              {tr("keep_my_draft")}
            </button>
            {onCopy && (
              <button type="button" className="text-button" onClick={onCopy}>
                {tr("save_draft_copy")}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export function UndoNotice({
  message,
  busy,
  onUndo,
  onDismiss,
}: {
  message: string;
  busy: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const undo = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    undo.current?.focus({ preventScroll: true });
  }, [message]);
  return (
    <div className="sport-notice">
      <span role="status">{message}</span>
      <button
        ref={undo}
        type="button"
        className="text-button"
        disabled={busy}
        onClick={onUndo}
      >
        {tr("undo_action")}
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={tr("dismiss_notice")}
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}
