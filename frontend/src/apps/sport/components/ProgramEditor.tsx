import { tr } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
import { sportApi } from "../api";
import type { Entry, KindDefinition, Workout } from "../types";
import { LoadState, useAction, useResource, ValuesFields } from "./common";
import { ExercisePicker } from "./Exercises";
import { isHyrox } from "../hyrox";
import { HyroxBrand, HyroxMark } from "./HyroxBrand";

type EditorProps = {
  kinds: KindDefinition[];
  onClose: () => void;
  onSaved: () => void;
  registerGuard: (guard: (() => boolean) | null) => void;
};
type DraftEntry = Entry & { key: string };

function ProgramForm({
  workout,
  kinds,
  onClose,
  onSaved,
  registerGuard,
}: EditorProps & { workout?: Workout }) {
  const [name, setName] = useState(workout?.name ?? "");
  const [notes, setNotes] = useState(workout?.notes ?? "");
  const [competitionDate, setCompetitionDate] = useState(
    workout?.competition_date ?? "",
  );
  const hyrox = isHyrox(name);
  const [entries, setEntries] = useState<DraftEntry[]>(() =>
    (workout?.entries ?? []).map((entry, i) => ({
      ...entry,
      key: `entry-${i}`,
    })),
  );
  const nextKey = useRef(entries.length);
  const [picking, setPicking] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const focusEntry = useRef<string | null>(null);
  const action = useAction();
  const payloadEntries = entries.map(({ exercise_id, sets, target }) => ({
    exercise_id,
    sets,
    target,
  }));
  const original = useRef(
    JSON.stringify({ name, notes, competitionDate, entries: payloadEntries }),
  );
  const dirty =
    JSON.stringify({
      name,
      notes,
      competitionDate,
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
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
  }
  return (
    <form
      ref={form}
      className={`stack-form sport-program-form ${hyrox ? "sport-hyrox" : ""}`}
      aria-label={workout ? tr("edit_program") : tr("new_program")}
      onSubmit={(event) => {
        event.preventDefault();
        if (!entries.length || limit) return;
        void action.run(
          () =>
            sportApi.write(
              `/workouts${workout ? `/${workout.id}` : ""}`,
              {
                name,
                notes,
                competition_date: competitionDate || null,
                entries: payloadEntries,
                ...(workout ? { expected_version: workout.version } : {}),
              },
              workout ? "PUT" : "POST",
            ),
          onSaved,
        );
      }}
    >
      {hyrox && <HyroxBrand date={competitionDate || null} />}
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
              required
              maxLength={160}
              placeholder={tr("upper_body_saturday_run")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {hyrox && (
            <div className="sport-hyrox-date">
              <label>
                {tr("hyrox_competition_date")}
                <span className="muted">{tr("optional")}</span>
                <input
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
        </section>
        <section aria-labelledby="program-exercises-title">
          <div className="sport-section-heading">
            <div>
              <h2 id="program-exercises-title">{tr("program_exercises")}</h2>
              <p className="muted small-text" role="status">
                {tr("program_limits", {
                  exercises: entries.length,
                  sets: total,
                })}
              </p>
            </div>
            {hyrox && (
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
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={tr("move_up", { name: entry.name })}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <Icon name="up" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={tr("move_down", { name: entry.name })}
                    disabled={index === entries.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <Icon name="down" />
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
                  </button>
                </div>
              </div>
              <label>
                {tr("number_of_sets")}
                <input
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
              <p className="muted small-text">
                {tr("target_per_set_optional")}
              </p>
              <ValuesFields
                kind={kinds.find((k) => k.id === entry.kind)!}
                value={entry.target}
                onChange={(target) => edit(index, { target })}
              />
            </section>
          ))}
          <button
            ref={addButton}
            type="button"
            className="secondary-button sport-add-exercise"
            aria-expanded={picking}
            aria-controls="program-picker"
            disabled={entries.length >= 50}
            onClick={() => setPicking((value) => !value)}
          >
            <Icon name={picking ? "x" : "plus"} />
            {picking ? tr("close_catalogue") : tr("add_an_exercise")}
          </button>
          {picking && (
            <div id="program-picker">
              {hyrox && (
                <div className="sport-hyrox-picker-heading">
                  <HyroxMark />
                  <span>{tr("build_next_session")}</span>
                </div>
              )}
              <ExercisePicker
                kinds={kinds}
                onPick={(exercise) => {
                  const key = `entry-${nextKey.current++}`;
                  focusEntry.current = key;
                  setEntries((old) => [
                    ...old,
                    {
                      key,
                      exercise_id: exercise.id,
                      name: exercise.name,
                      kind: exercise.kind,
                      sets: 3,
                      target: {},
                    },
                  ]);
                  setPicking(false);
                }}
              />
            </div>
          )}
          {entries.length >= 50 && (
            <p className="muted">
              {tr("limit_of_50_exercises_reached_remove_an_exercise_to_add")}
            </p>
          )}
        </section>
        <ErrorMessage message={limit || action.error} />
        <div className="sport-program-actions">
          <p className="muted small-text">
            {entries.length
              ? tr("your_changes_will_be_saved_in_this_program")
              : tr("add_at_least_one_exercise_to_save")}
          </p>
          <div className="sport-inline">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              {tr("cancel")}
            </button>
            <button
              className="primary-button"
              disabled={!entries.length || !!limit}
            >
              {action.busy ? tr("saving") : tr("save_program")}
            </button>
          </div>
        </div>
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
                  sportApi.write(`/workouts/${workout.id}/archive`, {
                    expected_version: workout.version,
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
