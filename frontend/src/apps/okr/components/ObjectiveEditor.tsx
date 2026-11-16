import { useEffect, useState } from "react";
import { useApiAction } from "../../../platform/useApiResource";
import { ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
import { okrApi } from "../api";
import { tr } from "../i18n";
import {
  horizons,
  inputOf,
  type Domain,
  type Horizon,
  type KeyResult,
  type Objective,
  type ObjectiveInput,
} from "../types";

export function ObjectiveEditor({
  existing,
  initialHorizon,
  objectives,
  today,
  onDirty,
  onBusy,
  onCancel,
  onSaved,
}: {
  existing?: Objective;
  initialHorizon: Horizon;
  objectives: Objective[];
  today: string;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
  onCancel: () => void;
  onSaved: (o: Objective) => void;
}) {
  const [draft, setDraft] = useState<ObjectiveInput>(() =>
    existing
      ? inputOf(existing)
      : {
          title: "",
          domain: "personal",
          horizon: initialHorizon,
          parent_id: null,
          why: "",
          outcome: "",
          first_action: "",
          start_date: initialHorizon === "quarterly" ? today : null,
          due_date: initialHorizon === "quarterly" ? today : null,
          key_results: [],
        },
  );
  const action = useApiAction();
  useEffect(() => {
    onBusy(action.busy);
    return () => onBusy(false);
  }, [action.busy, onBusy]);
  const rank = horizons.indexOf(draft.horizon);
  function change(value: Partial<ObjectiveInput>) {
    onDirty(true);
    setDraft((d) => {
      const next = { ...d, ...value };
      if (
        next.parent_id &&
        !objectives.some(
          (o) =>
            o.id === next.parent_id &&
            o.domain === next.domain &&
            o.horizon === horizons[horizons.indexOf(next.horizon) - 1],
        )
      )
        next.parent_id = null;
      return next;
    });
  }
  function changeResult(index: number, value: Partial<KeyResult>) {
    change({
      key_results: draft.key_results.map((k, i) =>
        i === index ? { ...k, ...value } : k,
      ),
    });
  }
  return (
    <form
      className="okr-editor"
      onSubmit={(e) => {
        e.preventDefault();
        void action.run(
          () =>
            existing ? okrApi.update(existing, draft) : okrApi.create(draft),
          onSaved,
        );
      }}
    >
      <fieldset disabled={action.busy}>
        <div className="okr-form-grid">
          <label>
            {tr("horizon")}
            <select
              value={draft.horizon}
              onChange={(e) => change({ horizon: e.target.value as Horizon })}
            >
              {horizons.map((h) => (
                <option key={h} value={h}>
                  {tr(h)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr("domain")}
            <select
              value={draft.domain}
              onChange={(e) => change({ domain: e.target.value as Domain })}
            >
              {(["personal", "professional"] as const).map((d) => (
                <option key={d} value={d}>
                  {tr(d)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <aside className="okr-guidance">
          <Icon name="flag" />
          <p>{tr(`guide_${draft.horizon}`)}</p>
        </aside>
        <p className="muted okr-small">{tr("required_hint")}</p>
        <label>
          {tr("title")} *
          <input
            autoFocus
            required
            maxLength={200}
            value={draft.title}
            placeholder={tr(`example_${draft.horizon}`)}
            onChange={(e) => change({ title: e.target.value })}
          />
        </label>
        {rank > 0 && (
          <label>
            {tr("parent")}
            <select
              value={draft.parent_id ?? ""}
              onChange={(e) => change({ parent_id: e.target.value || null })}
            >
              <option value="">{tr("no_parent")}</option>
              {objectives
                .filter(
                  (o) =>
                    o.id !== existing?.id &&
                    o.domain === draft.domain &&
                    o.horizon === horizons[rank - 1] &&
                    (!o.archived_at || o.id === draft.parent_id),
                )
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                    {o.archived_at ? ` (${tr("parent_archived")})` : ""}
                  </option>
                ))}
            </select>
            <small>{tr("parent_hint")}</small>
          </label>
        )}
        <label>
          {tr("why")}
          {rank > 0 ? " *" : ` (${tr("optional")})`}
          <textarea
            required={rank > 0}
            rows={3}
            maxLength={2000}
            value={draft.why}
            onChange={(e) => change({ why: e.target.value })}
          />
        </label>
        <label>
          {tr("outcome")}
          {rank >= 2 ? " *" : ` (${tr("optional")})`}
          <textarea
            required={rank >= 2}
            rows={3}
            maxLength={2000}
            value={draft.outcome}
            onChange={(e) => change({ outcome: e.target.value })}
          />
        </label>
        <label>
          {tr("first_action")}
          {rank === 3 ? " *" : ` (${tr("optional")})`}
          <input
            required={rank === 3}
            maxLength={1000}
            value={draft.first_action}
            onChange={(e) => change({ first_action: e.target.value })}
          />
        </label>
        <div className="okr-form-grid">
          <label>
            {tr("start_date")}
            {rank === 3 ? " *" : ""}
            <input
              type="date"
              min="2000-01-01"
              max="2100-12-31"
              required={rank === 3 || !!draft.due_date}
              value={draft.start_date ?? ""}
              onChange={(e) => change({ start_date: e.target.value || null })}
            />
          </label>
          <label>
            {tr("due_date")}
            {rank === 3 ? " *" : ""}
            <input
              type="date"
              min={draft.start_date ?? "2000-01-01"}
              max="2100-12-31"
              required={rank === 3 || !!draft.start_date}
              value={draft.due_date ?? ""}
              onChange={(e) => change({ due_date: e.target.value || null })}
            />
          </label>
        </div>
        <p className="muted okr-small">
          {tr(rank === 3 ? "month_hint" : "dates_hint")}
        </p>
        <section className="okr-results-editor">
          <h2>
            {tr("key_results")}
            {rank === 3 ? " *" : ""}
          </h2>
          <p className="muted">{tr("key_results_hint")}</p>
          {draft.key_results.map((k, i) => (
            <div className="okr-result-editor" key={k.id}>
              <div className="okr-inline">
                <span className="okr-result-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={tr("remove_result", { index: i + 1 })}
                  onClick={() =>
                    change({
                      key_results: draft.key_results.filter((_, j) => j !== i),
                    })
                  }
                >
                  <Icon name="x" />
                </button>
              </div>
              <label>
                {tr("result_title", { index: i + 1 })} *
                <input
                  required
                  maxLength={200}
                  placeholder={tr("result_example")}
                  value={k.title}
                  onChange={(e) => changeResult(i, { title: e.target.value })}
                />
              </label>
              <div className="okr-result-values">
                {(["start", "target", "current"] as const).map((field) => (
                  <label key={field}>
                    {tr(field)}
                    <input
                      required
                      type="number"
                      step="any"
                      min={-1e12}
                      max={1e12}
                      value={Number.isNaN(k[field]) ? "" : k[field]}
                      onChange={(e) =>
                        changeResult(i, { [field]: e.target.valueAsNumber })
                      }
                    />
                  </label>
                ))}
                <label>
                  {tr("unit")}
                  <input
                    maxLength={30}
                    value={k.unit}
                    onChange={(e) => changeResult(i, { unit: e.target.value })}
                  />
                </label>
              </div>
            </div>
          ))}
          {draft.key_results.length < 12 && (
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                change({
                  key_results: [
                    ...draft.key_results,
                    {
                      id: crypto.randomUUID(),
                      title: "",
                      start: 0,
                      target: 1,
                      current: 0,
                      unit: "",
                    },
                  ],
                })
              }
            >
              <Icon name="plus" />
              {tr("add_result")}
            </button>
          )}
        </section>
        <ErrorMessage message={action.error} />
        <div className="okr-form-actions">
          <button className="primary-button" type="submit">
            {tr("save")}
          </button>
          <button className="secondary-button" type="button" onClick={onCancel}>
            {tr("cancel")}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
