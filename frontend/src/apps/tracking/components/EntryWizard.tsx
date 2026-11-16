import { useEffect, useRef, useState } from "react";
import { Dialog, ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
import { trackingApi } from "../api";
import { dateLabel, number } from "../dates";
import { tr } from "../i18n";
import type { Entry, TrackingField, Value } from "../types";
import { LoadState, Score, useAction, useResource } from "./common";

import { SourceLabel } from "./SourcePicker";

function ValueInput({
  field,
  value,
  onChange,
}: {
  field: TrackingField;
  value: Value;
  onChange: (v: Value) => void;
}) {
  if (field.kind === "boolean")
    return (
      <div className="tracking-boolean">
        {[true, false].map((v) => (
          <button
            type="button"
            key={String(v)}
            aria-pressed={value === v}
            onClick={() => onChange(v)}
          >
            <Icon name={v ? "check" : "x"} size={28} />
            {tr(v ? "yes" : "no")}
          </button>
        ))}
      </div>
    );
  if (field.kind === "choice")
    return (
      <div className="tracking-choices">
        {field.options.map((v) => (
          <button
            type="button"
            key={v}
            aria-pressed={value === v}
            onClick={() => onChange(v)}
          >
            {v}
          </button>
        ))}
      </div>
    );
  if (field.kind === "note")
    return (
      <textarea
        aria-label={field.label}
        rows={5}
        maxLength={4000}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value || null)}
      />
    );
  if (field.kind === "duration")
    return (
      <div className="tracking-duration">
        <label>
          {tr("hours")}
          <input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={typeof value === "number" ? Math.floor(value / 60) : ""}
            onChange={(e) =>
              onChange(
                e.target.value === ""
                  ? null
                  : Number(e.target.value) * 60 +
                      (typeof value === "number" ? value % 60 : 0),
              )
            }
          />
        </label>
        <span>:</span>
        <label>
          {tr("minutes")}
          <input
            type="number"
            min={0}
            max={59}
            step={1}
            inputMode="numeric"
            value={typeof value === "number" ? value % 60 : ""}
            onChange={(e) =>
              onChange(
                e.target.value === ""
                  ? null
                  : (typeof value === "number"
                      ? Math.floor(value / 60) * 60
                      : 0) + Number(e.target.value),
              )
            }
          />
        </label>
      </div>
    );
  if (
    field.kind === "scale" &&
    Number.isInteger(field.minimum) &&
    Number.isInteger(field.maximum) &&
    field.maximum - field.minimum <= 10
  )
    return (
      <div className="tracking-scale">
        {Array.from(
          { length: field.maximum - field.minimum + 1 },
          (_, i) => i + field.minimum,
        ).map((v) => (
          <button
            type="button"
            key={v}
            aria-pressed={value === v}
            onClick={() => onChange(v)}
          >
            {v}
          </button>
        ))}
      </div>
    );
  return (
    <div className="tracking-number">
      <input
        aria-label={field.label}
        type="number"
        inputMode="decimal"
        step="any"
        min={field.minimum}
        max={field.maximum}
        value={typeof value === "number" ? value : ""}
        placeholder="—"
        onChange={(e) =>
          onChange(e.target.value === "" ? null : Number(e.target.value))
        }
      />
      {field.unit && <span>{field.unit}</span>}
    </div>
  );
}
function goalText(field: TrackingField) {
  const g = field.goal;
  if (!g) return "";
  const value =
    typeof g.target === "boolean"
      ? tr(g.target ? "yes" : "no")
      : typeof g.target === "number"
        ? number(g.target)
        : g.target;
  return `${tr(g.mode)} ${value}${g.upper !== null ? ` – ${number(g.upper)}` : ""} ${field.unit}`;
}
export function EntryWizard({
  id,
  day,
  onClose,
  onSaved,
}: {
  id: string;
  day: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const resource = useResource(
    (signal) => trackingApi.preview(id, day, signal),
    [id, day],
  );
  const [entry, setEntry] = useState<Entry | null>(null),
    [values, setValues] = useState<Record<string, Value>>({}),
    [step, setStep] = useState(0),
    [dirty, setDirty] = useState(false),
    [refresh, setRefresh] = useState(false),
    [notice, setNotice] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false),
    action = useAction(),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (resource.data) {
      setEntry(resource.data.entry);
      setValues(resource.data.entry?.values ?? {});
    }
  }, [resource.data]);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [step, resource.data]);
  useEffect(() => {
    const block = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", block);
    return () => window.removeEventListener("beforeunload", block);
  }, [dirty]);
  function close() {
    if (action.busy) return;
    if (!dirty || window.confirm(tr("unsaved"))) onClose();
  }
  const item = resource.data,
    field = item?.fields[step];
  function save(complete: boolean, exit: boolean) {
    if (!item) return;
    const manual = Object.fromEntries(
      Object.entries(values).filter(([k]) =>
        item.fields.some((f) => f.id === k && !f.source),
      ),
    );
    void action.run(
      () =>
        trackingApi.saveEntry(
          id,
          day,
          manual,
          entry?.version ?? 0,
          complete,
          refresh,
        ),
      (saved) => {
        setEntry(saved);
        setValues(saved.values);
        setDirty(false);
        setRefresh(false);
        setNotice(tr("saved_step"));
        onSaved();
        if (exit) onClose();
        else setStep((i) => Math.min(i + 1, item.fields.length - 1));
      },
    );
  }
  const sample = field?.source
    ? refresh || !entry
      ? item?.sources[field.id]
      : entry.sources[field.id]
    : null;
  return (
    <Dialog
      title={item?.definition.name ?? tr("entry_title")}
      onClose={close}
      wide
    >
      <div className="tracking-entry">
        <LoadState {...resource} />
        {item && field && (
          <>
            <div className="tracking-entry-top">
              <span>
                {dateLabel(item.period_start)}
                {item.period_end !== item.period_start &&
                  ` — ${dateLabel(item.period_end)}`}
              </span>
              <span>
                {tr("step", { current: step + 1, total: item.fields.length })}
              </span>
            </div>
            <div
              className="tracking-step-progress"
              aria-label={tr("step", {
                current: step + 1,
                total: item.fields.length,
              })}
            >
              {item.fields.map((f, i) => (
                <button
                  key={f.id}
                  type="button"
                  aria-label={`${i + 1}. ${f.label}`}
                  aria-current={i === step ? "step" : undefined}
                  className={
                    values[f.id] !== undefined && values[f.id] !== null
                      ? "has-value"
                      : ""
                  }
                  onClick={() => setStep(i)}
                />
              ))}
            </div>
            <div className="tracking-entry-field">
              <span className="tracking-frequency">
                {tr(field.source ? "automatic_value" : field.kind)}
                {!field.required && ` · ${tr("optional")}`}
              </span>
              <h2 ref={heading} tabIndex={-1}>
                {field.label}
              </h2>
              {field.goal && (
                <p className="tracking-goal-hint">
                  <Icon name="flag" size={16} />
                  {tr("goal_value", { goal: goalText(field) })}
                </p>
              )}
              {field.source ? (
                <div className="tracking-automatic-value">
                  <strong>
                    {sample?.result.state === "ok"
                      ? number(sample.result.value!)
                      : "—"}
                    <small>{sample?.result.unit}</small>
                  </strong>
                  <span>
                    <SourceLabel source={field.source} />
                  </span>
                  {sample?.result.state !== "ok" && (
                    <p role="status">
                      {sample?.result.message || tr("no_measurement")}
                    </p>
                  )}
                  {sample?.result.observed_at && (
                    <small>
                      {tr("source_as_of", {
                        date: new Date(
                          sample.result.observed_at,
                        ).toLocaleString(),
                      })}
                    </small>
                  )}
                  {entry && (
                    <label className="tracking-check">
                      <input
                        type="checkbox"
                        checked={refresh}
                        onChange={(e) => {
                          setRefresh(e.target.checked);
                          setDirty(true);
                        }}
                      />
                      {tr("refresh_sources")}
                    </label>
                  )}
                  {refresh && <p className="muted">{tr("refresh_hint")}</p>}
                </div>
              ) : (
                <>
                  <ValueInput
                    field={field}
                    value={values[field.id] ?? null}
                    onChange={(v) => {
                      setValues((prev) => ({ ...prev, [field.id]: v }));
                      setDirty(true);
                      setNotice("");
                    }}
                  />
                  <div className="tracking-entry-clear">
                    <span>
                      {values[field.id] === undefined ||
                      values[field.id] === null
                        ? tr("not_entered")
                        : ""}
                    </span>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setValues((v) => ({ ...v, [field.id]: null }));
                        setDirty(true);
                      }}
                    >
                      {tr("clear")}
                    </button>
                  </div>
                </>
              )}
            </div>
            <ErrorMessage message={action.error} />
            <p className="tracking-small muted">{tr("complete_hint")}</p>
            <p className="tracking-saved-note" role="status">
              {notice}
            </p>
            <footer className="tracking-entry-footer">
              <div className="tracking-inline">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={step === 0 || action.busy}
                  onClick={() => setStep((i) => i - 1)}
                >
                  {tr("previous")}
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={action.busy}
                  onClick={() => save(false, true)}
                >
                  {tr("save_draft")}
                </button>
              </div>
              <button
                type="button"
                className="primary-button"
                disabled={action.busy}
                onClick={() =>
                  save(
                    step === item.fields.length - 1,
                    step === item.fields.length - 1,
                  )
                }
              >
                {tr(
                  action.busy
                    ? "saving"
                    : step === item.fields.length - 1
                      ? "finish"
                      : "save_step",
                )}
                <Icon
                  name={step === item.fields.length - 1 ? "check" : "arrow"}
                />
              </button>
            </footer>
            {entry && (
              <div className="tracking-entry-meta">
                <Score value={entry.score} />
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setHistoryOpen((v) => !v)}
                >
                  {tr("entry_history")}
                </button>
              </div>
            )}
            {historyOpen && (
              <History id={id} day={day} version={entry?.version ?? 0} />
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
function History({
  id,
  day,
  version,
}: {
  id: string;
  day: string;
  version: number;
}) {
  const [offset, setOffset] = useState(0);
  const history = useResource(
    (signal) => trackingApi.history(id, day, signal, offset),
    [id, day, version, offset],
  );
  return (
    <section className="tracking-history">
      <h3>{tr("entry_history")}</h3>
      <LoadState {...history} />
      {history.data?.map((r) => (
        <div key={r.version}>
          <span>
            {tr("version", { version: r.version })}
            <small>{new Date(r.recorded_at).toLocaleString()}</small>
          </span>
          <Score value={r.snapshot.score} />
          <span>
            {tr(r.snapshot.status === "complete" ? "complete" : "partial")}
          </span>
        </div>
      ))}
      {(offset > 0 || history.data?.length === 30) && (
        <nav className="tracking-inline" aria-label={tr("entry_history")}>
          <button
            type="button"
            className="text-button"
            disabled={!offset || history.loading}
            onClick={() => setOffset((n) => Math.max(0, n - 30))}
          >
            {tr("previous")}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={history.data?.length !== 30 || history.loading}
            onClick={() => setOffset((n) => n + 30)}
          >
            {tr("next")}
          </button>
        </nav>
      )}
    </section>
  );
}
