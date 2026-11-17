import { tr } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { Dialog, ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
import { sportApi } from "../api";
import type { Entry, KindDefinition, Workout, SportContext } from "../types";
import {
  ConflictPanel,
  LoadState,
  useAction,
  useResource,
  useFormValidation,
  ValuesFields,
  valuesText,
} from "./common";
import { CompactActions, useSportMobile } from "./compact";
import { ExercisePicker, useExercisePickerState } from "./Exercises";
import { isHyrox } from "../hyrox";
import { HyroxBrand, HyroxMark } from "./HyroxBrand";

type EditorProps = {
  kinds: KindDefinition[];
  onClose: () => void;
  onSaved: (workout?: Workout) => void;
  registerGuard: (guard: (() => boolean) | null) => void;
  addedExercise?: string | null;
};
type DraftEntry = Entry & { key: string };

function ProgramForm({
  workout,
  kinds,
  onClose,
  onSaved,
  registerGuard,
  addedExercise,
}: EditorProps & { workout?: Workout }) {
  const mobile = useSportMobile();
  const [name, setName] = useState(workout?.name ?? "");
  const [notes, setNotes] = useState(workout?.notes ?? "");
  const [competitionDate, setCompetitionDate] = useState(
    workout?.competition_date ?? "",
  );
  const [context, setContext] = useState<SportContext>(
    workout?.context ?? "auto",
  );
  const [version, setVersion] = useState(workout?.version);
  const [copyMode, setCopyMode] = useState(false);
  const hyrox = isHyrox(name, context);
  const [entries, setEntries] = useState<DraftEntry[]>(() =>
    (workout?.entries ?? []).map((entry, i) => ({
      ...entry,
      key: `entry-${i}`,
    })),
  );
  const nextKey = useRef(entries.length);
  const [picking, setPicking] = useState(false);
  const pickerState = useExercisePickerState();

  const addButton = useRef<HTMLButtonElement>(null);
  const focusEntry = useRef<string | null>(null);
  const action = useAction();
  const validation = useFormValidation(action.failure);
  const form = validation.form;
  const payloadEntries = entries.map(({ exercise_id, sets, target }) => ({
    exercise_id,
    sets,
    target,
  }));
  const original = useRef(
    JSON.stringify({
      name,
      notes,
      competitionDate,
      context,
      entries: payloadEntries,
    }),
  );
  const dirty =
    JSON.stringify({
      name,
      notes,
      competitionDate,
      context,
      entries: payloadEntries,
    }) !== original.current;
  const total = entries.reduce((sum, entry) => sum + entry.sets, 0);
  const limit =
    total > 300 ? tr("a_program_can_contain_up_to_300_sets_reduce_the") : "";

  useEffect(() => {
    registerGuard(
      () =>
        !action.busy &&
        (!dirty ||
          window.confirm(tr("leave_this_program_without_saving_your_changes"))),
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
  useEffect(() => {
    if (focusEntry.current) {
      form.current
        ?.querySelector<HTMLElement>(
          `[data-entry-key="${focusEntry.current}"] input`,
        )
        ?.focus();
      focusEntry.current = null;
    }
  }, [entries]);
  useEffect(() => {
    if (action.error)
      form.current
        ?.querySelector<HTMLElement>("[role=alert]")
        ?.scrollIntoView({ block: "center" });
  }, [action.error]);

  function edit(index: number, change: Partial<Entry>) {
    setEntries((old) =>
      old.map((entry, i) => (i === index ? { ...entry, ...change } : entry)),
    );
  }
  function move(index: number, delta: number) {
    focusEntry.current = entries[index].key;
    setEntries((old) => {
      const next = [...old];
      const [entry] = next.splice(index, 1);
      next.splice(index + delta, 0, entry);
      return next;
    });
  }
  function loadLatest(value: Workout) {
    setName(value.name);
    setNotes(value.notes);
    setCompetitionDate(value.competition_date ?? "");
    setContext(value.context);
    setVersion(value.version);
    setCopyMode(false);
    const next = value.entries.map((entry) => ({
      ...entry,
      key: `entry-${nextKey.current++}`,
    }));
    setEntries(next);
    original.current = JSON.stringify({
      name: value.name,
      notes: value.notes,
      competitionDate: value.competition_date ?? "",
      context: value.context,
      entries: next.map(({ exercise_id, sets, target }) => ({
        exercise_id,
        sets,
        target,
      })),
    });
    action.clear();
  }
  const describe = (value: {
    name: string;
    notes: string;
    competition_date: string | null;
    context: SportContext;
    entries: Entry[];
  }) => [
    { label: tr("program_name"), value: value.name },
    { label: tr("preparation_notes"), value: value.notes },
    {
      label: tr("program_context"),
      value:
        value.context === "auto"
          ? tr("context_auto")
          : value.context === "hyrox"
            ? "HYROX"
            : tr("context_standard"),
    },
    {
      label: tr("hyrox_competition_date"),
      value: value.competition_date ?? "",
    },
    {
      label: tr("program_exercises"),
      value: value.entries
        .map(
          (entry) =>
            `${entry.name} · ${tr("set_count", { count: entry.sets })} · ${valuesText(kinds.find((kind) => kind.id === entry.kind)!, entry.target)}`,
        )
        .join("\n"),
    },
  ];
  const seeded = useRef<string | null>(null);
  const [seedError, setSeedError] = useState("");
  const suggestion = useResource(
    (signal) =>
      addedExercise
        ? sportApi.exercise(addedExercise, signal)
        : Promise.resolve(null),
    [addedExercise],
    { keepPrevious: false },
  );
  useEffect(() => {
    if (!suggestion.data || seeded.current === suggestion.data.id) return;
    seeded.current = suggestion.data.id;
    if (entries.length >= 50 || total >= 300) {
      setSeedError(tr("program_capacity_reached"));
      return;
    }
    const exercise = suggestion.data;
    setEntries((previous) => [
      ...previous,
      {
        key: `entry-${nextKey.current++}`,
        exercise_id: exercise.id,
        name: exercise.name,
        kind: exercise.kind,
        sets: Math.min(3, 300 - total),
        target: {},
      },
    ]);
  }, [suggestion.data]);
  const picker = (
    <ExercisePicker
      state={pickerState}
      kinds={kinds}
      active={picking}
      capacity={Math.min(50 - entries.length, 300 - total)}
      onPick={(selected, individual) => {
        const choices = selected.slice(
          0,
          Math.min(50 - entries.length, 300 - total),
        );
        if (!choices.length) return;
        const sets = Math.min(3, Math.floor((300 - total) / choices.length));
        if (individual) {
          focusEntry.current = `entry-${nextKey.current}`;
          setPicking(false);
        }
        setEntries((old) => [
          ...old,
          ...choices.map((exercise) => ({
            key: `entry-${nextKey.current++}`,
            exercise_id: exercise.id,
            name: exercise.name,
            kind: exercise.kind,
            sets,
            target: {},
          })),
        ]);
      }}
    />
  );
  const addControl = (
    <button
      ref={addButton}
      type="button"
      className="secondary-button sport-add-exercise"
      aria-label={picking ? tr("close_catalogue") : tr("add_an_exercise")}
      aria-expanded={picking}
      aria-controls="program-picker"
      disabled={entries.length >= 50}
      onClick={() => setPicking((value) => !value)}
    >
      <Icon name={picking ? "x" : "plus"} />
      <span className="sport-desktop-label">
        {picking ? tr("close_catalogue") : tr("add_an_exercise")}
      </span>
      <span className="sport-mobile-label">{tr("add_exercise_short")}</span>
    </button>
  );
  return (
    <form
      ref={form}
      noValidate
      aria-busy={action.busy}
      className={`stack-form sport-program-form ${hyrox ? "sport-hyrox" : ""}`}
      aria-label={workout ? tr("edit_program") : tr("new_program")}
      onSubmit={(event) => {
        event.preventDefault();
        if (!entries.length || limit || !validation.validate()) return;
        void action.run(
          () =>
            sportApi.write<Workout>(
              `/workouts${workout && !copyMode ? `/${workout.id}` : ""}`,
              {
                name,
                notes,
                context,
                competition_date: competitionDate || null,
                entries: payloadEntries,
                ...(workout && !copyMode ? { expected_version: version } : {}),
              },
              workout && !copyMode ? "PUT" : "POST",
            ),
          onSaved,
        );
      }}
    >
      <div className="sport-program-actions">
        <p className="muted small-text">
          {entries.length
            ? tr("your_changes_will_be_saved_in_this_program")
            : tr("add_at_least_one_exercise_to_save")}
        </p>
        <div className="sport-inline">
          <button type="button" className="secondary-button" onClick={onClose}>
            {tr("cancel")}
          </button>
          <button
            className="primary-button"
            aria-label={tr("save_program")}
            disabled={!entries.length || !!limit || action.busy}
          >
            <span className="sport-desktop-label">
              {action.busy ? tr("saving") : tr("save_program")}
            </span>
            <span className="sport-mobile-label">
              {action.busy ? tr("saving") : tr("save_short")}
            </span>
          </button>
        </div>
      </div>
      {hyrox && <HyroxBrand date={competitionDate || null} compact />}
      <LoadState {...suggestion} />
      <ErrorMessage message={seedError} />
      <fieldset className="sport-fieldset" disabled={action.busy}>
        <section
          className="sport-program-info"
          aria-labelledby="program-info-title"
        >
          <h2 id="program-info-title">{tr("your_program")}</h2>
          <p className="muted">
            {tr("prepare_your_exercises_once_then_use_them_for_every_training")}
          </p>
          <label>
            {tr("program_name")}
            <input
              {...validation.attrs("name")}
              required
              maxLength={160}
              placeholder={tr("upper_body_saturday_run")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {validation.error("name")}
          <details
            className="sport-program-options"
            open={!mobile && (hyrox || !!competitionDate)}
          >
            <summary aria-label={tr("preparation_options")}>
              <span className="sport-desktop-label">
                {tr("preparation_options")}
              </span>
              <span className="sport-mobile-label">{tr("options")}</span>
            </summary>
            <label>
              {tr("program_context")}
              <select
                value={context}
                onChange={(event) =>
                  setContext(event.target.value as SportContext)
                }
              >
                <option value="auto">{tr("context_auto")}</option>
                <option value="standard">{tr("context_standard")}</option>
                <option value="hyrox">HYROX</option>
              </select>
            </label>

            {(hyrox || competitionDate) && (
              <div className="sport-hyrox-date">
                <label>
                  {tr("hyrox_competition_date")}
                  <span className="muted">{tr("optional")}</span>
                  <input
                    {...validation.attrs("competition_date")}
                    type="date"
                    min="0001-01-01"
                    max="9999-12-31"
                    value={competitionDate}
                    aria-describedby="competition-date-help"
                    onChange={(e) => setCompetitionDate(e.target.value)}
                  />
                </label>
                <p id="competition-date-help" className="muted small-text">
                  {tr("hyrox_date_help")}
                </p>
                {competitionDate && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setCompetitionDate("")}
                  >
                    {tr("clear_competition_date")}
                  </button>
                )}
              </div>
            )}
            <label>
              {tr("preparation_notes")}{" "}
              <span className="muted">{tr("optional")}</span>
              <textarea
                value={notes}
                maxLength={4000}
                placeholder={tr("warm_up_equipment_to_bring")}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            {validation.error("competition_date")}
          </details>
        </section>
        <section aria-labelledby="program-exercises-title">
          <div className="sport-section-heading">
            <div>
              <h2 id="program-exercises-title">
                <span className="sport-desktop-label">
                  {tr("program_exercises")}
                </span>
                <span className="sport-mobile-label">{tr("exercises")}</span>
              </h2>
              <p className="muted small-text" role="status">
                {tr("program_limits", {
                  exercises: entries.length,
                  sets: total,
                })}
              </p>
            </div>
            {mobile
              ? addControl
              : hyrox && (
                  <span className="sport-hyrox-stamp">
                    <HyroxMark />
                  </span>
                )}
          </div>
          {!entries.length && (
            <div className="sport-empty">
              <p>{tr("add_your_first_exercise_to_build_this_program")}</p>
            </div>
          )}
          {entries.map((entry, index) => (
            <section
              className="sport-plan-entry"
              key={entry.key}
              data-entry-key={entry.key}
              aria-label={tr("named_exercise", {
                number: index + 1,
                name: entry.name,
              })}
            >
              <div className="sport-section-heading">
                <h3>
                  <span className="sport-order">{index + 1}</span>
                  {entry.name}
                </h3>
                <div className="sport-inline">
                  <CompactActions name={entry.name}>
                    <label className="sport-move-select">
                      <span>{tr("position")}</span>
                      <select
                        aria-label={tr("move_to_position", {
                          name: entry.name,
                        })}
                        value={index}
                        onChange={(event) =>
                          move(index, Number(event.target.value) - index)
                        }
                      >
                        {entries.map((_, position) => (
                          <option key={position} value={position}>
                            {position + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={tr("move_up", { name: entry.name })}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <Icon name="up" />
                      <span className="sport-action-label">
                        {tr("move_up_short")}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={tr("move_down", { name: entry.name })}
                      disabled={index === entries.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <Icon name="down" />
                      <span className="sport-action-label">
                        {tr("move_down_short")}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={tr("remove_named", { name: entry.name })}
                      onClick={() => {
                        focusEntry.current =
                          entries[index + 1]?.key ??
                          entries[index - 1]?.key ??
                          null;
                        setEntries((old) => old.filter((_, i) => i !== index));
                        if (entries.length === 1) addButton.current?.focus();
                      }}
                    >
                      <Icon name="x" />
                      <span className="sport-action-label">
                        {tr("remove_short")}
                      </span>
                    </button>
                  </CompactActions>
                </div>
              </div>
              <div className="sport-entry-values">
                <label>
                  <span className="sport-desktop-label">
                    {tr("number_of_sets")}
                  </span>
                  <span className="sport-mobile-label">{tr("sets_short")}</span>
                  <input
                    {...validation.attrs(`entries.${index}.sets`)}
                    aria-label={tr("number_of_sets")}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={30}
                    required
                    value={entry.sets || ""}
                    onChange={(e) =>
                      edit(index, { sets: Number(e.target.value) })
                    }
                  />
                </label>
                {validation.error(`entries.${index}.sets`)}
                <div>
                  <p className="muted small-text">
                    {tr("target_per_set_optional")}
                  </p>
                  <ValuesFields
                    validation={validation}
                    prefix={`entries.${index}.target.`}
                    kind={kinds.find((k) => k.id === entry.kind)!}
                    value={entry.target}
                    onChange={(target) => edit(index, { target })}
                  />
                </div>
              </div>
            </section>
          ))}
          {!mobile && addControl}
          {mobile ? (
            picking && (
              <Dialog
                title={tr("add_an_exercise")}
                wide
                initialFocus="close"
                onClose={() => setPicking(false)}
              >
                <div
                  className="dialog-body sport-picker-dialog"
                  id="program-picker"
                >
                  {picker}
                </div>
              </Dialog>
            )
          ) : (
            <div id="program-picker" hidden={!picking}>
              {hyrox && (
                <div className="sport-hyrox-picker-heading">
                  <HyroxMark />
                  <span>{tr("build_next_session")}</span>
                </div>
              )}
              {picker}
            </div>
          )}
          {entries.length >= 50 && (
            <p className="muted">
              {tr("limit_of_50_exercises_reached_remove_an_exercise_to_add")}
            </p>
          )}
        </section>
        <ErrorMessage message={limit || action.error} />
        {workout && !copyMode && (
          <ConflictPanel
            failure={action.failure}
            draft={describe({
              name,
              notes,
              competition_date: competitionDate || null,
              context,
              entries,
            })}
            load={() => sportApi.workout(workout.id)}
            describe={describe}
            onReload={loadLatest}
            onKeep={(value) => {
              setVersion(value.version);
              action.clear();
            }}
            onCopy={() => {
              setCopyMode(true);
              setName(tr("copy_name", { name }).slice(0, 160));
              action.clear();
            }}
          />
        )}

        {workout && !workout.archived_at && (
          <button
            type="button"
            className="text-button danger sport-program-archive"
            onClick={() => {
              if (
                dirty &&
                !window.confirm(tr("archive_program_discard_changes"))
              )
                return;
              void action.run(
                () =>
                  sportApi.write<Workout>(`/workouts/${workout.id}/archive`, {
                    expected_version: version,
                    archived: true,
                  }),
                onSaved,
              );
            }}
          >
            {tr("archive")}
          </button>
        )}
      </fieldset>
    </form>
  );
}

export function ProgramEditor({ id, ...props }: EditorProps & { id: string }) {
  const resource = useResource(
    (signal) =>
      id === "new" ? Promise.resolve(null) : sportApi.workout(id, signal),
    [id],
    { keepPrevious: false },
  );
  return (
    <>
      <LoadState {...resource} />
      {resource.data !== undefined && (
        <ProgramForm key={id} {...props} workout={resource.data ?? undefined} />
      )}
    </>
  );
}
