import { tr } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { Dialog, ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
import { sportApi } from "../api";
import { ScoreExplanation } from "./ScoreExplanation";
import { isHyrox } from "../hyrox";
import { HyroxBrand, HyroxMark } from "./HyroxBrand";
import type { KindDefinition, Training, Values } from "../types";
import {
  Empty,
  LoadState,
  moment,
  number,
  useAction,
  useResource,
  ValuesFields,
  valuesText,
} from "./common";

export function RestTimer({
  training,
  onSkip,
  busy,
  error,
}: {
  training: Training;
  onSkip: () => void;
  busy: boolean;
  error: string;
}) {
  const [anchor, setAnchor] = useState({
    server: Date.parse(training.server_now),
    local: Date.now(),
  });
  const [now, setNow] = useState(Date.now());
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = bar.current!;
    const shell = element.closest<HTMLElement>(".sport-shell")!;
    const measure = () => {
      const height = `${element.getBoundingClientRect().height}px`;
      shell.style.setProperty("--sport-rest-height", height);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => {
      observer.disconnect();
      shell.style.removeProperty("--sport-rest-height");
    };
  }, []);
  useEffect(() => {
    setAnchor({ server: Date.parse(training.server_now), local: Date.now() });
  }, [training.server_now]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const left = training.rest_until
    ? Math.max(
        0,
        Math.ceil(
          (Date.parse(training.rest_until) -
            anchor.server -
            Math.max(0, now - anchor.local)) /
            1000,
        ),
      )
    : 0;
  return (
    <div
      ref={bar}
      className={`sport-rest ${left ? "is-running" : ""} ${isHyrox(training.name) ? "sport-hyrox" : ""}`}
    >
      {isHyrox(training.name) && (
        <span className="sport-hyrox-stamp">
          <HyroxMark />
        </span>
      )}
      <div>
        <span className="eyebrow">{tr("recovery")}</span>
        <strong role="timer" aria-label={tr("remaining_rest_time")}>
          {String(Math.floor(left / 60)).padStart(2, "0")}:
          {String(left % 60).padStart(2, "0")}
        </strong>
        <span role="status">
          {left ? tr("take_time_to_recover") : tr("ready_for_the_next_set")}
        </span>
      </div>
      {left > 0 && (
        <button className="secondary-button" disabled={busy} onClick={onSkip}>
          {tr("skip_rest")}
        </button>
      )}
      <ErrorMessage message={error} />
    </div>
  );
}
export function TrainingDetail({
  training,
  kinds,
}: {
  training: Training;
  kinds: KindDefinition[];
}) {
  return (
    <>
      <div className="sport-summary">
        <div>
          <span>{tr("start")}</span>
          <strong>{moment(training.started_at)}</strong>
        </div>
        <div>
          <span>{tr("completed_sets")}</span>
          <strong>{training.sets.filter((s) => !s.skipped).length}</strong>
        </div>
        <div>
          <span>{tr("training_score")}</span>
          <strong>
            {training.score == null ? "—" : number(training.score)}
          </strong>
        </div>
      </div>
      {training.score_details ? (
        <>
          <div className="sport-summary" role="group" aria-label={tr("score_breakdown")}>
            <div>
              <span>{tr("score_completion")}</span>
              <strong>{number(training.score_details.completion_percent)} %</strong>
            </div>
            <div>
              <span>{tr("score_difficulty")}</span>
              <strong>
                {training.score_details.difficulty_percent == null
                  ? "—"
                  : `${number(training.score_details.difficulty_percent)} %`}
              </strong>
            </div>
            <div>
              <span>{tr("score_completed_planned")}</span>
              <strong>
                {training.score_details.completed_sets} / {training.score_details.planned_sets}
              </strong>
            </div>
          </div>
          <ScoreExplanation />
        </>
      ) : training.score != null ? (
        <p className="muted">{tr("score_legacy")}</p>
      ) : training.status === "completed" ? (
        <p className="muted">{tr("score_needs_positive_baseline")}</p>
      ) : null}
      {training.entries.map((entry, i) => (
        <section className="sport-plan-entry" key={i}>
          <h3>{entry.name}</h3>
          {training.metrics[i]?.scoring && (
            <details className="sport-score-references">
              <summary>{tr("score_references")}</summary>
              <ul>
                {training.metrics[i].scoring!.references.map((reference, j) => (
                  <li key={j}>
                    {tr("set")} {j + 1} · {kinds.find((k) => k.id === entry.kind)!.fields
                      .filter((field) => reference.values[field.key] != null)
                      .map((field) => {
                        const value = number(reference.values[field.key]!);
                        const source = tr(`score_source_${reference.sources[field.key]!}`);
                        return `${field.label} : ${value} ${field.unit} (${source})`;
                      })
                      .join(" · ") || tr("score_reference_pending")}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {training.sets
            .filter((s) => s.entry_index === i)
            .map((s) => (
              <p key={s.set_index}>
                {tr("set")} {s.set_index + 1} ·{" "}
                {valuesText(kinds.find((k) => k.id === entry.kind)!, s.values)}
                {s.skipped && <> · {tr("set_not_performed")}</>}
              </p>
            ))}
        </section>
      ))}
      {training.notes && <p>{training.notes}</p>}
    </>
  );
}
export function ActiveTraining({
  training,
  kinds,
  onChanged,
  onFinished,
  registerGuard,
  action,
  scope,
  setScope,
}: {
  training: Training | null | undefined;
  kinds: KindDefinition[];
  onChanged: (t: Training) => void;
  onFinished: () => void;
  registerGuard: (guard: (() => boolean) | null) => void;
  action: ReturnType<typeof useAction>;
  scope: string;
  setScope: (scope: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, Values>>({});
  const [ending, setEnding] = useState<"completed" | "cancelled" | null>(null);
  const [notes, setNotes] = useState("");
  const dirty = Object.keys(drafts).length > 0;
  useEffect(() => {
    registerGuard(
      () =>
        !action.busy &&
        (!dirty ||
          window.confirm(
            tr(
              "leave_the_training_session_without_saving_your_current_entries",
            ),
          )),
    );
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    if (dirty || action.busy) window.addEventListener("beforeunload", unload);
    return () => {
      registerGuard(null);
      window.removeEventListener("beforeunload", unload);
    };
  }, [dirty, action.busy, registerGuard]);
  function clearDraft(key: string) {
    setDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }
  if (!training)
    return (
      <Empty title={tr("no_training_session_in_progress")}>
        {tr("start_a_training_session_from_the_programs_tab")}
      </Empty>
    );
  const total = training.entries.reduce((sum, e) => sum + e.sets, 0);
  return (
    <div
      className={`sport-training ${isHyrox(training.name) ? "sport-hyrox" : ""}`}
    >
      {isHyrox(training.name) && (
        <HyroxBrand date={training.competition_date} />
      )}
      <div className="sport-toolbar">
        <div>
          <h2>{training.name}</h2>
          <p className="muted">
            {tr("started_on")} {moment(training.started_at)}
          </p>
        </div>
        <span className="sport-tag" aria-live="polite">
          {tr("progress_sets", {
            completed: training.sets.length,
            count: total,
          })}
        </span>
      </div>
      <p className="muted small-text">
        {tr("enter_your_results_then_complete_each_set_saved_values_will")}
      </p>
      {training.entries.map((entry, i) => (
        <section
          className="sport-session-exercise"
          key={i}
          aria-labelledby={`sport-exercise-${i}`}
        >
          <div className="sport-section-heading">
            <h2 id={`sport-exercise-${i}`}>
              <span className="sport-order" aria-hidden="true">
                {i + 1}
              </span>
              {entry.name}
            </h2>
            <span className="muted small-text">
              {kinds.find((k) => k.id === entry.kind)?.name}
            </span>
          </div>
          {entry.kind.startsWith("weight") && (
            <p className="muted small-text">
              {tr(
                "total_weight_include_the_bar_and_add_both_dumbbells_together",
              )}
            </p>
          )}
          <div className="sport-set-list">
            {Array.from({ length: entry.sets }, (_, j) => {
              const record = training.sets.find(
                (s) => s.entry_index === i && s.set_index === j,
              );
              const key = `${i}/${j}`;
              const kind = kinds.find((k) => k.id === entry.kind)!;
              const previous = training.sets
                .filter((s) => s.entry_index === i && s.set_index < j)
                .at(-1);
              const suggested = entry.suggested_values[j];
              const values =
                drafts[key] ??
                record?.values ??
                suggested ??
                previous?.values ??
                entry.target;
              return (
                <form
                  className={`sport-set ${record ? "is-complete" : ""}`}
                  key={j}
                  aria-label={tr("named_set", {
                    name: entry.name,
                    number: j + 1,
                  })}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void action.run(
                      () => {
                        setScope(key);
                        return sportApi.write<Training>(
                          `/sessions/${training.id}/sets/${key}`,
                          { expected_version: training.version, values },
                        );
                      },
                      (t) => {
                        onChanged(t);
                        clearDraft(key);
                      },
                    );
                  }}
                >
                  <fieldset className="sport-set-fields" disabled={action.busy}>
                    <legend className="sr-only">
                      {tr("set")} {j + 1}
                    </legend>
                    <div className="sport-set-row">
                      <span className="sport-set-number" aria-hidden="true">
                        {j + 1}
                      </span>
                      <ValuesFields
                        kind={kind}
                        value={values}
                        onChange={(v) =>
                          setDrafts((old) => ({ ...old, [key]: v }))
                        }
                        required
                        compact
                      />
                      <button
                        className={
                          record ? "secondary-button" : "primary-button"
                        }
                        aria-label={
                          record ? tr("correct_set") : tr("complete_set")
                        }
                      >
                        {record ? tr("correct") : tr("confirm")}
                      </button>
                    </div>
                    <div className="sport-set-actions">
                      <span className="sport-set-state">
                        {record && <Icon name="check" size={14} />}
                        {drafts[key]
                          ? tr("entry_to_save")
                          : record
                            ? tr("completed")
                            : suggested
                              ? tr("previous_results")
                              : tr("to_complete")}
                      </span>
                      {record && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            void action.run(
                              () => {
                                setScope(key);
                                return sportApi.write<Training>(
                                  `/sessions/${training.id}/sets/${key}`,
                                  { expected_version: training.version },
                                  "DELETE",
                                );
                              },
                              (t) => {
                                onChanged(t);
                                setDrafts((old) => ({ ...old, [key]: values }));
                              },
                            )
                          }
                        >
                          {tr("undo_completion")}
                        </button>
                      )}
                      {drafts[key] && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => clearDraft(key)}
                        >
                          {tr("discard_entry")}
                        </button>
                      )}
                    </div>
                    <ErrorMessage message={scope === key ? action.error : ""} />
                  </fieldset>
                </form>
              );
            })}
          </div>
        </section>
      ))}
      <div className="sport-toolbar">
        <button
          className="text-button danger"
          disabled={action.busy}
          onClick={() => {
            if (
              !dirty ||
              window.confirm(
                tr(
                  "cancel_the_training_session_without_saving_your_current_entries",
                ),
              )
            )
              setEnding("cancelled");
          }}
        >
          {tr("cancel_training_session")}
        </button>
        <button
          className="primary-button"
          disabled={action.busy || dirty}
          onClick={() => setEnding("completed")}
        >
          {tr("finish_training_session")}
        </button>
      </div>
      {dirty && (
        <p className="muted small-text">
          {tr("save_correct_or_discard_your_current_entries_before_finishing")}
        </p>
      )}
      {ending && (
        <Dialog
          title={
            ending === "completed"
              ? tr("finish_training_session")
              : tr("cancel_training_session")
          }
          onClose={() => setEnding(null)}
        >
          <form
            className="dialog-body stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(
                () => {
                  setScope("finish");
                  return sportApi.write<Training>(
                    `/sessions/${training.id}/finish`,
                    {
                      expected_version: training.version,
                      outcome: ending,
                      notes,
                    },
                  );
                },
                () => {
                  setEnding(null);
                  registerGuard(null);
                  onFinished();
                },
              );
            }}
          >
            <p>
              {ending === "completed"
                ? tr("your_results_will_be_saved_and_your_score_calculated")
                : tr(
                    "sets_already_recorded_remain_in_your_history_this_training_session",
                  )}
            </p>
            {ending === "completed" && training.sets.length < total && (
              <p>{tr("unfinished_sets_will_be_zero")}</p>
            )}
            <label>
              {tr("how_it_felt_and_notes")}
              <textarea
                maxLength={4000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <ErrorMessage message={scope === "finish" ? action.error : ""} />
            <button disabled={action.busy} className="primary-button">
              {ending === "completed"
                ? tr("save_results")
                : tr("confirm_cancellation")}
            </button>
          </form>
        </Dialog>
      )}
    </div>
  );
}
export function History({ kinds }: { kinds: KindDefinition[] }) {
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Training | null>(null);
  const resource = useResource(
    (signal) => sportApi.sessions(offset, signal),
    [offset],
  );
  return (
    <>
      <LoadState {...resource} />
      {resource.data?.total === 0 && (
        <Empty title={tr("your_history_starts_here")}>
          {tr(
            "your_completed_and_cancelled_training_sessions_are_kept_with_every",
          )}
        </Empty>
      )}
      <div className="sport-history">
        {resource.data?.items.map((t) => (
          <button
            className="sport-history-row"
            key={t.id}
            onClick={() => setSelected(t)}
          >
            <span>
              <strong>{t.name}</strong>
              <small>
                {moment(t.started_at)} ·{" "}
                {tr("set_count", {
                  count: t.sets.filter((s) => !s.skipped).length,
                })}{" "}
                ·{" "}
                {t.status === "completed"
                  ? tr("session_completed")
                  : t.status === "cancelled"
                    ? tr("cancelled")
                    : tr("in_progress")}
              </small>
            </span>
            <span className="sport-score">
              {t.score === null ? "—" : number(t.score)}
              <small>{tr("score")}</small>
            </span>
          </button>
        ))}
      </div>
      {resource.data && resource.data.total > 30 && (
        <div className="sport-pagination">
          <button
            className="secondary-button"
            disabled={!offset}
            onClick={() => setOffset(offset - 30)}
          >
            {tr("previous")}
          </button>
          <span>
            {offset + 1}–{Math.min(offset + 30, resource.data.total)} {tr("of")}{" "}
            {resource.data.total}
          </span>
          <button
            className="secondary-button"
            disabled={offset + 30 >= resource.data.total}
            onClick={() => setOffset(offset + 30)}
          >
            {tr("next")}
          </button>
        </div>
      )}
      {selected && (
        <Dialog title={selected.name} wide onClose={() => setSelected(null)}>
          <div className="dialog-body">
            <TrainingDetail training={selected} kinds={kinds} />
          </div>
        </Dialog>
      )}
    </>
  );
}
