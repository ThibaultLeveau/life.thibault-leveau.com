import { useEffect, useState } from "react";
import { ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
import { trackingApi } from "../api";
import { localDay } from "../dates";
import { tr } from "../i18n";
import type { Goal, Tracker, TrackerInput, TrackingField } from "../types";
import { useAction } from "./common";
import { SourceLabel, SourcePicker } from "./SourcePicker";
const weekdays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
const kinds = [
  "number",
  "boolean",
  "duration",
  "scale",
  "choice",
  "note",
] as const;
const makeField = (): TrackingField => ({
  id: crypto.randomUUID(),
  label: "",
  kind: "number",
  unit: "",
  required: true,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  minimum: 0,
  maximum: 1000000000,
  options: [],
  goal: null,
  weight: 1,
  source: null,
});
export function TrackerEditor({
  existing,
  timezone,
  onClose,
  onSaved,
  onDirty,
}: {
  existing?: Tracker;
  timezone: string;
  onClose: () => void;
  onSaved: () => void;
  onDirty: (v: boolean) => void;
}) {
  const [draft, setDraft] = useState<TrackerInput>(() =>
    existing
      ? {
          name: existing.name,
          description: existing.description,
          frequency: existing.frequency,
          timezone: existing.timezone,
          start_date: existing.start_date,
          color: existing.color,
          fields: existing.fields,
        }
      : {
          name: "",
          description: "",
          frequency: "daily",
          timezone,
          start_date: localDay(timezone),
          color: "#b84f39",
          fields: [makeField()],
        },
  );
  const [selected, setSelected] = useState(0),
    [sourceOpen, setSourceOpen] = useState(false),
    [error, setError] = useState("");
  const action = useAction(),
    field = draft.fields[selected];
  useEffect(() => () => onDirty(false), []);
  function openSource() {
    try {
      localDay(draft.timezone);
      setSourceOpen(true);
      setError("");
    } catch {
      setError(tr("timezone_invalid"));
    }
  }
  function patch(value: Partial<TrackerInput>) {
    setDraft((d) => ({ ...d, ...value }));
    onDirty(true);
  }
  function change(value: Partial<TrackingField>) {
    patch({
      fields: draft.fields.map((f, i) =>
        i === selected ? { ...f, ...value } : f,
      ),
    });
  }
  function kind(value: TrackingField["kind"]) {
    change({
      kind: value,
      id: field.kind === value ? field.id : crypto.randomUUID(),
      goal: null,
      source: null,
      options: value === "choice" ? [tr("yes"), tr("no")] : [],
      required: value !== "note",
      minimum: 0,
      maximum: value === "scale" ? 10 : 1000000000,
      unit: value === "duration" ? "min" : "",
    });
  }
  function goal(value: Partial<Goal>) {
    change({ goal: { ...field.goal!, ...value } });
  }
  function save() {
    setError("");
    if (
      !draft.name.trim() ||
      draft.fields.some((f) => !f.label.trim() || !f.weekdays.length)
    ) {
      setError(tr("error_name"));
      return;
    }
    void action.run(
      () => trackingApi.saveTracker(draft, existing?.id, existing?.version),
      () => {
        onDirty(false);
        onSaved();
      },
    );
  }
  return (
    <form
      className="tracking-editor"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="tracking-editor-basics">
        <label>
          {tr("name")}
          <input
            required
            maxLength={120}
            placeholder={tr("name_placeholder")}
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </label>
        <label>
          {tr("description")}
          <textarea
            rows={2}
            maxLength={1000}
            value={draft.description}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </label>
        <div className="tracking-form-grid">
          <label>
            {tr("frequency")}
            <select
              value={draft.frequency}
              disabled={!!existing}
              onChange={(e) =>
                patch({
                  frequency: e.target.value as TrackerInput["frequency"],
                })
              }
            >
              {(["daily", "weekly", "monthly", "yearly"] as const).map((v) => (
                <option value={v} key={v}>
                  {tr(v)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr("start_date")}
            <input
              type="date"
              min="2000-01-01"
              max="2100-12-31"
              required
              disabled={!!existing}
              value={draft.start_date}
              onChange={(e) => patch({ start_date: e.target.value })}
            />
          </label>
          <label>
            {tr("timezone")}
            <input
              required
              disabled={!!existing}
              maxLength={100}
              value={draft.timezone}
              onChange={(e) => patch({ timezone: e.target.value })}
            />
          </label>
        </div>
        {existing && (
          <p className="muted tracking-small">{tr("schedule_fixed")}</p>
        )}
      </div>
      <div className="tracking-section-heading">
        <div>
          <h2>{tr("data_to_track")}</h2>
          <p className="muted">{tr("field_help")}</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={draft.fields.length >= 30}
          onClick={() => {
            patch({ fields: [...draft.fields, makeField()] });
            setSelected(draft.fields.length);
          }}
        >
          <Icon name="plus" />
          {tr("add_field")}
        </button>
      </div>
      <div className="tracking-field-builder">
        <div className="tracking-field-list" aria-label={tr("data_to_track")}>
          {draft.fields.map((f, index) => (
            <button
              type="button"
              key={f.id}
              className={selected === index ? "is-active" : ""}
              aria-pressed={selected === index}
              onClick={() => setSelected(index)}
            >
              <span className="tracking-order">{index + 1}</span>
              <span>
                {f.label || tr("new_field")}
                <small>
                  {tr(f.kind)}
                  {f.source ? ` · ${tr("automatic")}` : ""}
                </small>
              </span>
              <Icon name="chevron" size={14} />
            </button>
          ))}
        </div>
        <section className="tracking-field-editor" key={selected}>
          <div className="tracking-section-heading">
            <h3>
              {tr("step", {
                current: selected + 1,
                total: draft.fields.length,
              })}
            </h3>
            <button
              type="button"
              className="icon-button"
              disabled={draft.fields.length === 1}
              aria-label={tr("remove_field")}
              onClick={() => {
                patch({
                  fields: draft.fields.filter((_, i) => i !== selected),
                });
                setSelected(Math.max(0, selected - 1));
              }}
            >
              <Icon name="trash" />
            </button>
          </div>
          <label>
            {tr("field_label")}
            <input
              required
              value={field.label}
              maxLength={120}
              placeholder={tr("field_placeholder")}
              onChange={(e) => change({ label: e.target.value })}
            />
          </label>
          <fieldset className="tracking-fieldset">
            <legend>{tr("data_source")}</legend>
            <div className="tracking-segmented">
              <button
                type="button"
                aria-pressed={!field.source}
                onClick={() => change({ source: null })}
              >
                {tr("manual")}
              </button>
              <button
                type="button"
                aria-pressed={!!field.source}
                onClick={openSource}
              >
                <Icon name="grid" size={16} />
                {tr("automatic")}
              </button>
            </div>
            {field.source && (
              <div className="tracking-source-chip">
                <span>
                  <SourceLabel source={field.source} />
                </span>
                <button
                  type="button"
                  className="text-button"
                  onClick={openSource}
                >
                  {tr("change_source")}
                </button>
              </div>
            )}
          </fieldset>
          {!field.source && (
            <fieldset className="tracking-fieldset">
              <legend>{tr("kind")}</legend>
              <div className="tracking-kinds">
                {kinds.map((k) => (
                  <button
                    type="button"
                    key={k}
                    aria-pressed={k === field.kind}
                    onClick={() => kind(k)}
                  >
                    {tr(k)}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {field.kind === "choice" && (
            <label>
              {tr("choices")}
              <textarea
                rows={3}
                value={field.options.join("\n")}
                onChange={(e) =>
                  change({ options: e.target.value.split("\n") })
                }
              />
            </label>
          )}
          {["number", "duration", "scale"].includes(field.kind) && (
            <div className="tracking-form-grid">
              <label>
                {tr("unit")}
                <input
                  maxLength={20}
                  readOnly={!!field.source || field.kind === "duration"}
                  value={field.unit}
                  onChange={(e) =>
                    change({
                      unit: e.target.value,
                      id: existing?.fields.some((f) => f.id === field.id)
                        ? crypto.randomUUID()
                        : field.id,
                    })
                  }
                />
              </label>
              <label>
                {tr("minimum")}
                <input
                  type="number"
                  step="any"
                  value={field.minimum}
                  onChange={(e) => change({ minimum: Number(e.target.value) })}
                />
              </label>
              <label>
                {tr("maximum")}
                <input
                  type="number"
                  step="any"
                  value={field.maximum}
                  onChange={(e) => change({ maximum: Number(e.target.value) })}
                />
              </label>
            </div>
          )}
          {draft.frequency === "daily" && (
            <fieldset className="tracking-fieldset">
              <legend>{tr("scheduled_days")}</legend>
              <div className="tracking-weekdays">
                {weekdays.map((d, i) => (
                  <label key={d}>
                    <input
                      type="checkbox"
                      aria-label={tr(d)}
                      checked={field.weekdays.includes(i)}
                      onChange={(e) =>
                        change({
                          weekdays: e.target.checked
                            ? [...field.weekdays, i].sort()
                            : field.weekdays.filter((n) => n !== i),
                        })
                      }
                    />
                    <span>{tr(d).slice(0, 2)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <label className="tracking-check">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => change({ required: e.target.checked })}
            />
            {tr("required")}
          </label>
          {field.kind !== "note" && (
            <div className="tracking-goal-editor">
              <label className="tracking-check">
                <input
                  type="checkbox"
                  checked={!!field.goal}
                  onChange={(e) =>
                    change({
                      goal: e.target.checked
                        ? {
                            mode:
                              field.kind === "boolean" ||
                              field.kind === "choice"
                                ? "equals"
                                : "at_least",
                            target:
                              field.kind === "boolean"
                                ? true
                                : field.kind === "choice"
                                  ? field.options[0]
                                  : field.kind === "scale"
                                    ? 8
                                    : 10,
                            upper: null,
                            tolerance: 10,
                          }
                        : null,
                    })
                  }
                />
                {tr("goal")}
              </label>
              {field.goal && (
                <>
                  <div className="tracking-form-grid">
                    {!["boolean", "choice"].includes(field.kind) && (
                      <label>
                        {tr("goal_mode")}
                        <select
                          value={field.goal.mode}
                          onChange={(e) =>
                            goal({
                              mode: e.target.value as Goal["mode"],
                              upper:
                                e.target.value === "between"
                                  ? Number(field.goal!.target) + 1
                                  : null,
                            })
                          }
                        >
                          {(
                            [
                              "at_least",
                              "at_most",
                              "between",
                              "equals",
                            ] as const
                          ).map((m) => (
                            <option key={m} value={m}>
                              {tr(m)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label>
                      {tr("target")}
                      {field.unit && ` (${field.unit})`}
                      {field.kind === "boolean" ? (
                        <select
                          value={String(field.goal.target)}
                          onChange={(e) =>
                            goal({ target: e.target.value === "true" })
                          }
                        >
                          <option value="true">{tr("yes")}</option>
                          <option value="false">{tr("no")}</option>
                        </select>
                      ) : field.kind === "choice" ? (
                        <select
                          value={String(field.goal.target)}
                          onChange={(e) => goal({ target: e.target.value })}
                        >
                          {field.options.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="number"
                          required
                          step="any"
                          min={field.minimum}
                          max={field.maximum}
                          value={Number(field.goal.target)}
                          onChange={(e) =>
                            goal({ target: Number(e.target.value) })
                          }
                        />
                      )}
                    </label>
                    {field.goal.mode === "between" && (
                      <label>
                        {tr("upper")}
                        <input
                          type="number"
                          required
                          step="any"
                          min={Number(field.goal.target)}
                          max={field.maximum}
                          value={field.goal.upper ?? ""}
                          onChange={(e) =>
                            goal({ upper: Number(e.target.value) })
                          }
                        />
                      </label>
                    )}
                    {field.goal.mode !== "equals" && (
                      <label>
                        {tr("tolerance")}
                        <input
                          type="number"
                          required
                          step="any"
                          min={0.00001}
                          value={field.goal.tolerance}
                          onChange={(e) =>
                            goal({ tolerance: Number(e.target.value) })
                          }
                        />
                      </label>
                    )}
                    <label>
                      {tr("weight")}
                      <input
                        type="number"
                        required
                        min={0.1}
                        max={10}
                        step={0.1}
                        value={field.weight}
                        onChange={(e) =>
                          change({ weight: Number(e.target.value) })
                        }
                      />
                    </label>
                  </div>
                  <p className="muted tracking-small">{tr("tolerance_hint")}</p>
                </>
              )}
            </div>
          )}
        </section>
      </div>
      <ErrorMessage message={error || action.error} />
      <div className="tracking-editor-footer">
        <p className="muted">{tr("config_changes")}</p>
        <div className="tracking-inline">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={action.busy}
          >
            {tr("cancel")}
          </button>
          <button className="primary-button" disabled={action.busy}>
            {tr(action.busy ? "saving" : "save_tracker")}
            <Icon name="check" />
          </button>
        </div>
      </div>
      {sourceOpen && (
        <SourcePicker
          initial={field.source}
          frequency={draft.frequency}
          timezone={draft.timezone}
          onClose={() => setSourceOpen(false)}
          onSelect={(source, metric) => {
            change({
              source,
              kind: "number",
              unit: metric.unit,
              label: field.label || metric.label,
              goal: null,
              options: [],
              id:
                field.source?.metric_id === source.metric_id
                  ? field.id
                  : crypto.randomUUID(),
            });
            setSourceOpen(false);
          }}
        />
      )}
    </form>
  );
}
