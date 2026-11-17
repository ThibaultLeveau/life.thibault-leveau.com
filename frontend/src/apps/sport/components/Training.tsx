import { tr } from "../i18n";
import { formatLocale } from "../../../shared/i18n";
import { progressionApi } from "../../../platform/progression/api";
import { useSportSettings } from "../preferences";
import {
  pageOffset,
  queryString,
  useSportQuery,
  type SportNavigate,
} from "../navigation";
import { useEffect, useRef, useState } from "react";
import { Dialog, ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
import { sportApi } from "../api";
import { isHyrox } from "../hyrox";
import { HyroxBrand, HyroxMark } from "./HyroxBrand";
import type { KindDefinition, Training, Values, SportSettings } from "../types";
import {
  ConflictPanel,
  day,
  Pagination,
  useDebounced,
  useDraftGuard,
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
  onAdjust,
  onResume,
  away,
  busy,
  error,
}: {
  training: Training;
  onSkip: () => void;
  onAdjust: (seconds: -15 | 15) => void;
  onResume: () => void;
  away: boolean;
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
      className={`sport-rest ${left ? "is-running" : "is-ready"} ${isHyrox(training.name, training.context) ? "sport-hyrox" : ""}`}
    >
      {isHyrox(training.name, training.context) && (
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
        <div className="sport-rest-controls">
          <button
            type="button"
            className="secondary-button"
            aria-label={tr("shorten_rest")}
            aria-disabled={busy}
            onClick={() => onAdjust(-15)}
          >
            −15 s
          </button>
          <button
            type="button"
            className="secondary-button"
            aria-label={tr("extend_rest")}
            aria-disabled={busy}
            onClick={() => onAdjust(15)}
          >
            +15 s
          </button>
          <button
            className="secondary-button"
            aria-disabled={busy}
            onClick={onSkip}
          >
            {tr("skip_rest")}
          </button>
        </div>
      )}
      {away && (
        <button className="text-button" onClick={onResume}>
          {tr("resume_training")}
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
      {isHyrox(training.name, training.context) && (
        <HyroxBrand date={training.competition_date} compact />
      )}
      <p className="sport-tag">
        {training.status === "completed"
          ? tr("session_completed")
          : training.status === "cancelled"
            ? tr("cancelled")
            : tr("in_progress")}
      </p>
      <div className="sport-summary">
        <div>
          <span>{tr("start")}</span>
          <strong>{moment(training.started_at)}</strong>
        </div>
        {training.finished_at && (
          <>
            <div>
              <span>{tr("finished_at")}</span>
              <strong>{moment(training.finished_at)}</strong>
            </div>
            <div>
              <span>{tr("duration_metric")}</span>
              <strong>
                {number(
                  Math.max(
                    0,
                    Date.parse(training.finished_at) -
                      Date.parse(training.started_at),
                  ) / 60000,
                )}{" "}
                min
              </strong>
            </div>
          </>
        )}
        {training.competition_date && (
          <div>
            <span>{tr("hyrox_competition_date")}</span>
            <strong>{day(training.competition_date)}</strong>
          </div>
        )}
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
      {training.score != null && (
        <p className="muted">
          {training.baseline_id
            ? tr(
                "100_your_first_completed_training_session_with_these_exercises_and",
              )
            : tr(
                "first_comparable_training_session_it_becomes_your_baseline_at_100",
              )}
        </p>
      )}
      {training.status === "completed" && training.score == null && (
        <p className="muted">{tr("score_needs_positive_baseline")}</p>
      )}
      {training.preparation_notes && (
        <details className="sport-preparation">
          <summary>{tr("preparation_notes")}</summary>
          <p>{training.preparation_notes}</p>
        </details>
      )}
      {training.entries.map((entry, i) => (
        <section className="sport-plan-entry" key={i}>
          <h3>{entry.name}</h3>
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
      {training.notes && (
        <section>
          <h3>{tr("how_it_felt_and_notes")}</h3>
          <p className="sport-preparation-notes">{training.notes}</p>
        </section>
      )}
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
  navigate,
}: {
  training: Training | null | undefined;
  kinds: KindDefinition[];
  onChanged: (t: Training) => void;
  onFinished: (training: Training) => void;
  registerGuard: (guard: (() => boolean) | null) => void;
  action: ReturnType<typeof useAction>;
  scope: string;
  setScope: (scope: string) => void;
  navigate: SportNavigate;
}) {
  const [drafts, setDrafts] = useState<Record<string, Values>>({});
  const [ending, setEnding] = useState<"completed" | "cancelled" | null>(null);
  const [notes, setNotes] = useState("");
  const dirty = Object.keys(drafts).length > 0;
  const origins = useRef<Record<string, Values>>({});
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  useDraftGuard(dirty || (!!ending && !!notes), action.busy, registerGuard);
  function clearDraft(key: string) {
    delete origins.current[key];
    setDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }
  if (!training)
    return (
      <Empty
        title={tr("no_training_session_in_progress")}
        action={
          <button
            className="primary-button"
            onClick={() => navigate("workouts")}
          >
            {tr("choose_a_program")}
          </button>
        }
      >
        {tr("start_a_training_session_from_the_programs_tab")}
      </Empty>
    );
  const total = training.entries.reduce((sum, e) => sum + e.sets, 0);
  const nextSet = training.entries
    .flatMap((entry, i) =>
      Array.from({ length: entry.sets }, (_, j) => ({ i, j })),
    )
    .find(
      ({ i, j }) =>
        !training.sets.some(
          (set) => set.entry_index === i && set.set_index === j,
        ),
    );
  function jump(i: number, j = 0) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      next.delete(i);
      return next;
    });
    requestAnimationFrame(() => {
      const element = document.getElementById(`sport-set-${i}-${j}`);
      element?.scrollIntoView({
        block: "center",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
      element
        ?.querySelector<HTMLInputElement>("input")
        ?.focus({ preventScroll: true });
    });
  }
  return (
    <div
      className={`sport-training ${isHyrox(training.name, training.context) ? "sport-hyrox" : ""}`}
    >
      {isHyrox(training.name, training.context) && (
        <HyroxBrand date={training.competition_date} compact />
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
      <div className="sport-training-tools">
        {nextSet && (
          <button
            className="secondary-button"
            onClick={() => jump(nextSet.i, nextSet.j)}
          >
            {tr("next_set", {
              number: nextSet.j + 1,
              name: training.entries[nextSet.i].name,
            })}
          </button>
        )}
        <RestPresets />
      </div>
      <details className="sport-training-index">
        <summary>{tr("session_outline")}</summary>
        <ol>
          {training.entries.map((entry, index) => (
            <li key={index}>
              <button
                type="button"
                className="text-button"
                onClick={() => jump(index)}
              >
                {entry.name} ·{" "}
                {
                  training.sets.filter((set) => set.entry_index === index)
                    .length
                }
                /{entry.sets}
              </button>
            </li>
          ))}
        </ol>
      </details>
      {training.preparation_notes && (
        <details className="sport-preparation">
          <summary>{tr("preparation_notes")}</summary>
          <p>{training.preparation_notes}</p>
        </details>
      )}
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
            <button
              type="button"
              className="text-button"
              aria-expanded={!collapsed.has(i)}
              aria-controls={`sport-entry-sets-${i}`}
              onClick={() =>
                setCollapsed((previous) => {
                  const next = new Set(previous);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  return next;
                })
              }
            >
              {tr(collapsed.has(i) ? "expand_exercise" : "collapse_exercise")}
            </button>
          </div>
          {entry.kind.startsWith("weight") && (
            <p className="muted small-text">
              {tr(
                "total_weight_include_the_bar_and_add_both_dumbbells_together",
              )}
            </p>
          )}
          <div
            className="sport-set-list"
            id={`sport-entry-sets-${i}`}
            hidden={collapsed.has(i)}
          >
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
              const base =
                record?.values ?? suggested ?? previous?.values ?? entry.target;
              const values = drafts[key] ?? base;
              return (
                <form
                  className={`sport-set ${record ? "is-complete" : ""}`}
                  key={j}
                  id={`sport-set-${i}-${j}`}
                  aria-busy={action.busy && scope === key}
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
                  <fieldset className="sport-set-fields">
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
                        readOnly={action.busy}
                        onChange={(value) => {
                          const origin = origins.current[key] ?? base;
                          if (
                            kind.fields.every(
                              (field) =>
                                (value[field.key] ?? null) ===
                                (origin[field.key] ?? null),
                            )
                          )
                            clearDraft(key);
                          else {
                            origins.current[key] = origin;
                            setDrafts((old) => ({ ...old, [key]: value }));
                          }
                        }}
                        required
                        compact
                      />
                      <button
                        aria-disabled={action.busy}
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
                          aria-disabled={action.busy}
                          onClick={(event) => {
                            const container =
                              event.currentTarget.closest("form");
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
                                origins.current[key] = base;
                                setDrafts((old) => ({ ...old, [key]: values }));
                                requestAnimationFrame(() =>
                                  container
                                    ?.querySelector<HTMLButtonElement>(
                                      ".sport-set-row button",
                                    )
                                    ?.focus({ preventScroll: true }),
                                );
                              },
                            );
                          }}
                        >
                          {tr("undo_completion")}
                        </button>
                      )}
                      {drafts[key] && (
                        <button
                          type="button"
                          className="text-button"
                          aria-disabled={action.busy}
                          onClick={(event) => {
                            if (action.busy) return;
                            const container =
                              event.currentTarget.closest("form");
                            clearDraft(key);
                            requestAnimationFrame(() =>
                              container
                                ?.querySelector<HTMLInputElement>("input")
                                ?.focus({ preventScroll: true }),
                            );
                          }}
                        >
                          {tr("discard_entry")}
                        </button>
                      )}
                    </div>
                    <ErrorMessage message={scope === key ? action.error : ""} />
                    {scope === key && (
                      <ConflictPanel
                        failure={action.failure}
                        draft={[
                          {
                            label: tr("your_results"),
                            value: valuesText(kind, values),
                          },
                        ]}
                        load={() => sportApi.session(training.id)}
                        describe={(current) => [
                          {
                            label: tr("your_results"),
                            value: valuesText(
                              kind,
                              current.sets.find(
                                (set) =>
                                  set.entry_index === i && set.set_index === j,
                              )?.values ?? {},
                            ),
                          },
                        ]}
                        onReload={(current) => {
                          onChanged(current);
                          clearDraft(key);
                          action.clear();
                        }}
                        onKeep={(current) => {
                          onChanged(current);
                          setDrafts((old) => ({ ...old, [key]: values }));
                          action.clear();
                        }}
                      />
                    )}
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
          onClose={() => {
            if (
              !action.busy &&
              (!notes || window.confirm(tr("discard_draft")))
            ) {
              setEnding(null);
              setNotes("");
            }
          }}
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
                (result) => {
                  setEnding(null);
                  registerGuard(null);
                  onFinished(result);
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
                readOnly={action.busy}
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

function RestPresets() {
  const { settings, accept } = useSportSettings();
  const action = useAction();
  return (
    <details className="sport-training-rest-settings">
      <summary>
        {tr("rest_current", { seconds: settings.rest_seconds })}
      </summary>
      <div
        className="sport-presets"
        role="group"
        aria-label={tr("rest_presets")}
      >
        {[0, 60, 90, 120].map((seconds) => (
          <button
            type="button"
            key={seconds}
            className="secondary-button"
            aria-pressed={settings.rest_seconds === seconds}
            disabled={action.busy}
            onClick={() =>
              void action.run(
                () =>
                  sportApi.write<SportSettings>("/settings", {
                    rest_seconds: seconds,
                    expected_version: settings.version,
                  }),
                accept,
              )
            }
          >
            {seconds ? `${seconds} s` : tr("no_rest")}
          </button>
        ))}
      </div>
      <p className="muted small-text">{tr("rest_next_set_help")}</p>
      <ErrorMessage message={action.error} />
    </details>
  );
}

function SessionSummary({
  training,
  onDetail,
  onPrograms,
}: {
  training: Training;
  onDetail: () => void;
  onPrograms: () => void;
}) {
  const progression = useResource(
    (signal) => progressionApi.summary("sport", signal),
    [training.id],
  );
  const completed = training.sets.filter((set) => !set.skipped).length;
  const skipped = training.sets.filter((set) => set.skipped).length;
  return (
    <section className="sport-session-summary">
      <p className="eyebrow" role="status">
        {training.status === "completed"
          ? tr("training_completed")
          : tr("training_cancelled_saved")}
      </p>
      <h2>{training.name}</h2>
      <div className="sport-summary">
        <div>
          <span>{tr("completed_sets")}</span>
          <strong>{completed}</strong>
        </div>
        <div>
          <span>{tr("unperformed_sets")}</span>
          <strong>{skipped}</strong>
        </div>
        <div>
          <span>{tr("duration_metric")}</span>
          <strong>
            {number(
              Math.max(
                0,
                Date.parse(training.finished_at ?? training.started_at) -
                  Date.parse(training.started_at),
              ) / 60000,
            )}{" "}
            min
          </strong>
        </div>
        <div>
          <span>{tr("training_score")}</span>
          <strong>
            {training.score == null ? "—" : number(training.score)}
          </strong>
        </div>
        {training.metrics.some((metric) => metric.volume_kg > 0) && (
          <div>
            <span>{tr("weight_lifted")}</span>
            <strong>
              {number(
                training.metrics.reduce(
                  (sum, metric) => sum + metric.volume_kg,
                  0,
                ),
              )}{" "}
              kg
            </strong>
          </div>
        )}
        {training.metrics.some((metric) => metric.distance_m > 0) && (
          <div>
            <span>{tr("total_distance")}</span>
            <strong>
              {number(
                training.metrics.reduce(
                  (sum, metric) => sum + metric.distance_m,
                  0,
                ),
              )}{" "}
              m
            </strong>
          </div>
        )}
      </div>
      {training.awarded_xp != null && (
        <p className="sport-earned">
          {tr("session_awarded_xp", { xp: training.awarded_xp })}
        </p>
      )}
      <LoadState {...progression} />
      {progression.data && (
        <p className="muted">
          {tr("current_progression", {
            xp: progression.data.xp,
            level: progression.data.level,
            title: progression.data.title,
          })}
        </p>
      )}
      {training.notes && (
        <p className="sport-preparation-notes">{training.notes}</p>
      )}
      <div className="sport-inline">
        <button className="primary-button" onClick={onDetail}>
          {tr("view_session_details")}
        </button>
        <button className="secondary-button" onClick={onPrograms}>
          {tr("back_to_programs")}
        </button>
      </div>
    </section>
  );
}

export function History({
  kinds,
  navigate,
  completed,
}: {
  kinds: KindDefinition[];
  navigate: SportNavigate;
  completed?: Training | null;
}) {
  const [query, update] = useSportQuery({
    history_q: "",
    history_workout: "",
    history_status: "",
    history_since: "",
    history_until: "",
    history_offset: "0",
    session: "",
    summary: "",
  });
  const search = useDebounced(query.history_q);
  const status = ["active", "completed", "cancelled"].includes(
    query.history_status,
  )
    ? query.history_status
    : "";
  const offset = pageOffset(query.history_offset);
  const filters = queryString({
    q: search,
    workout_id: query.history_workout,
    status,
    since: query.history_since,
    until: query.history_until,
  });
  const resource = useResource(
    (signal) => sportApi.sessions(offset, signal, filters),
    [offset, filters, completed?.id],
  );
  const programs = useResource(
    (signal) =>
      Promise.all([
        sportApi.workouts(false, signal),
        sportApi.workouts(true, signal),
      ]).then((values) => values.flat()),
    [],
  );
  const detail = useResource(
    (signal) =>
      query.session
        ? completed?.id === query.session
          ? Promise.resolve(completed)
          : sportApi.session(query.session, signal)
        : Promise.resolve(null),
    [query.session, completed?.id],
    { keepPrevious: false },
  );
  const adjacent = useResource(
    (signal) =>
      query.session
        ? sportApi.sessionNavigation(query.session, filters, signal)
        : Promise.resolve(null),
    [query.session, filters],
    { keepPrevious: false },
  );
  const hasFilters = !!(
    query.history_q ||
    query.history_workout ||
    status ||
    query.history_since ||
    query.history_until
  );
  function clear() {
    update({
      history_q: "",
      history_workout: "",
      history_status: "",
      history_since: "",
      history_until: "",
      history_offset: "0",
    });
  }
  function open(id: string) {
    update({ session: id, summary: "" }, true);
    history.replaceState({ ...history.state, sportDetail: true }, "");
  }
  function close() {
    if (history.state?.sportDetail) history.back();
    else update({ session: "", summary: "" });
  }
  const groups = new Map<string, Training[]>();
  for (const training of resource.data?.items ?? []) {
    const month = new Date(training.started_at).toLocaleDateString(
      formatLocale(),
      { month: "long", year: "numeric" },
    );
    groups.set(month, [...(groups.get(month) ?? []), training]);
  }
  return (
    <>
      {query.summary && query.session && (
        <>
          <LoadState {...detail} />
          {detail.data && (
            <SessionSummary
              training={detail.data}
              onDetail={() => update({ summary: "" })}
              onPrograms={() => navigate("workouts")}
            />
          )}
        </>
      )}
      <div className="sport-filters">
        <label>
          {tr("search_history")}
          <input
            type="search"
            maxLength={160}
            value={query.history_q}
            onChange={(event) =>
              update({ history_q: event.target.value, history_offset: "0" })
            }
          />
        </label>
        <label>
          {tr("program")}
          <select
            value={query.history_workout}
            onChange={(event) =>
              update({
                history_workout: event.target.value,
                history_offset: "0",
              })
            }
          >
            <option value="">{tr("all_programs")}</option>
            {programs.data?.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name}
                {program.archived_at ? ` · ${tr("archived_state")}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr("session_status")}
          <select
            value={status}
            onChange={(event) =>
              update({
                history_status: event.target.value,
                history_offset: "0",
              })
            }
          >
            <option value="">{tr("all_statuses")}</option>
            <option value="completed">{tr("session_completed")}</option>
            <option value="cancelled">{tr("cancelled")}</option>
            <option value="active">{tr("in_progress")}</option>
          </select>
        </label>
      </div>
      <details className="sport-extra-filters">
        <summary>{tr("history_dates")}</summary>
        <div className="sport-filters">
          <label>
            {tr("from")}
            <input
              type="date"
              value={query.history_since}
              onChange={(event) =>
                update({
                  history_since: event.target.value,
                  history_offset: "0",
                })
              }
            />
          </label>
          <label>
            {tr("period_end")}
            <input
              type="date"
              value={query.history_until}
              onChange={(event) =>
                update({
                  history_until: event.target.value,
                  history_offset: "0",
                })
              }
            />
          </label>
        </div>
      </details>
      {hasFilters && (
        <button className="text-button" onClick={clear}>
          {tr("clear_filters")}
        </button>
      )}
      <LoadState {...resource} />
      <LoadState {...programs} />
      {resource.data?.total === 0 && (
        <Empty
          title={
            hasFilters
              ? tr("no_matching_sessions")
              : tr("your_history_starts_here")
          }
          action={
            <button
              className="primary-button"
              onClick={() => (hasFilters ? clear() : navigate("workouts"))}
            >
              {hasFilters ? tr("clear_filters") : tr("choose_a_program")}
            </button>
          }
        >
          {tr(
            "your_completed_and_cancelled_training_sessions_are_kept_with_every",
          )}
        </Empty>
      )}
      <div className="sport-history">
        {[...groups.entries()].map(([month, trainings]) => (
          <section key={month}>
            <h2 className="sport-history-month">{month}</h2>
            {trainings.map((training) => (
              <button
                className="sport-history-row"
                key={training.id}
                onClick={() => open(training.id)}
              >
                <span>
                  <strong>{training.name}</strong>
                  <small>
                    {moment(training.started_at)} ·{" "}
                    {tr("set_count", {
                      count: training.sets.filter((set) => !set.skipped).length,
                    })}{" "}
                    ·{" "}
                    {training.status === "completed"
                      ? tr("session_completed")
                      : training.status === "cancelled"
                        ? tr("cancelled")
                        : tr("in_progress")}
                  </small>
                </span>
                <span className="sport-score">
                  {training.score === null ? "—" : number(training.score)}
                  <small>{tr("score")}</small>
                </span>
              </button>
            ))}
          </section>
        ))}
      </div>
      {resource.data && (
        <Pagination
          offset={offset}
          limit={30}
          total={resource.data.total}
          onChange={(value) => update({ history_offset: String(value) })}
        />
      )}
      {query.session && !query.summary && (
        <Dialog
          title={detail.data?.name ?? tr("loading")}
          wide
          onClose={close}
          initialFocus="close"
        >
          <div className="dialog-body">
            <div className="sport-pagination">
              <button
                className="secondary-button"
                aria-disabled={
                  !adjacent.data?.newer_id || adjacent.loading || detail.loading
                }
                onClick={() => {
                  if (
                    !adjacent.loading &&
                    !detail.loading &&
                    adjacent.data?.newer_id
                  )
                    update({ session: adjacent.data.newer_id });
                }}
              >
                {tr("newer_session")}
              </button>
              <button
                className="secondary-button"
                aria-disabled={
                  !adjacent.data?.older_id || adjacent.loading || detail.loading
                }
                onClick={() => {
                  if (
                    !adjacent.loading &&
                    !detail.loading &&
                    adjacent.data?.older_id
                  )
                    update({ session: adjacent.data.older_id });
                }}
              >
                {tr("older_session")}
              </button>
            </div>
            <LoadState {...detail} />
            <LoadState {...adjacent} />
            {detail.data && (
              <TrainingDetail training={detail.data} kinds={kinds} />
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
