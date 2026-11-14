import { useEffect, useRef, useState } from "react";
import { ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
import { sportApi } from "../api";
import type { Entry, KindDefinition, Workout } from "../types";
import { LoadState, useAction, useResource, ValuesFields } from "./common";
import { ExercisePicker } from "./Exercises";

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
    JSON.stringify({ name, notes, entries: payloadEntries }),
  );
  const dirty =
    JSON.stringify({ name, notes, entries: payloadEntries }) !==
    original.current;
  const total = entries.reduce((sum, entry) => sum + entry.sets, 0);
  const limit =
    total > 300
      ? "Un programme contient au maximum 300 séries. Réduisez le nombre de séries pour enregistrer."
      : "";

  useEffect(() => {
    registerGuard(
      () =>
        !action.busy &&
        (!dirty ||
          window.confirm(
            "Quitter ce programme sans enregistrer vos modifications ?",
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
      className="stack-form sport-program-form"
      aria-label={workout ? "Modifier le programme" : "Nouveau programme"}
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
                entries: payloadEntries,
                ...(workout ? { expected_version: workout.version } : {}),
              },
              workout ? "PUT" : "POST",
            ),
          onSaved,
        );
      }}
    >
      <fieldset className="sport-fieldset" disabled={action.busy}>
        <section
          className="sport-program-info"
          aria-labelledby="program-info-title"
        >
          <h2 id="program-info-title">Votre programme</h2>
          <p className="muted">
            Préparez vos exercices une fois, puis retrouvez-les à chaque
            entraînement.
          </p>
          <label>
            Nom du programme
            <input
              required
              maxLength={160}
              placeholder="Haut du corps, course du samedi…"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Notes de préparation <span className="muted">Facultatif</span>
            <textarea
              value={notes}
              maxLength={4000}
              placeholder="Échauffement, matériel à prévoir…"
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </section>
        <section aria-labelledby="program-exercises-title">
          <div className="sport-section-heading">
            <div>
              <h2 id="program-exercises-title">Exercices du programme</h2>
              <p className="muted small-text" role="status">
                {entries.length} / 50 exercices · {total} / 300 séries
              </p>
            </div>
          </div>
          {!entries.length && (
            <div className="sport-empty">
              <p>Ajoutez votre premier exercice pour composer ce programme.</p>
            </div>
          )}
          {entries.map((entry, index) => (
            <section
              className="sport-plan-entry"
              key={entry.key}
              data-entry-key={entry.key}
              aria-label={`Exercice ${index + 1} : ${entry.name}`}
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
                    aria-label={`Monter ${entry.name}`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <Icon name="up" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Descendre ${entry.name}`}
                    disabled={index === entries.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <Icon name="down" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Retirer ${entry.name}`}
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
                Nombre de séries
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
                Objectif par série (facultatif)
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
            {picking ? "Fermer le catalogue" : "Ajouter un exercice"}
          </button>
          {picking && (
            <div id="program-picker">
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
              Limite de 50 exercices atteinte. Retirez un exercice pour en
              ajouter un autre.
            </p>
          )}
        </section>
        <ErrorMessage message={limit || action.error} />
        <div className="sport-program-actions">
          <p className="muted small-text">
            {entries.length
              ? "Vos modifications seront enregistrées dans ce programme."
              : "Ajoutez au moins un exercice pour enregistrer."}
          </p>
          <div className="sport-inline">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Annuler
            </button>
            <button
              className="primary-button"
              disabled={!entries.length || !!limit}
            >
              {action.busy ? "Enregistrement…" : "Enregistrer le programme"}
            </button>
          </div>
        </div>
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
