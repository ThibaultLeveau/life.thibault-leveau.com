import { useState } from "react";
import { Dialog, ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
import { sportApi } from "../api";
import type { Entry, KindDefinition, Training, Workout } from "../types";
import {
  Empty,
  LoadState,
  useAction,
  useResource,
  ValuesFields,
  valuesText,
} from "./common";
import { ExercisePicker } from "./Exercises";

function WorkoutForm({
  workout,
  kinds,
  onClose,
  onSaved,
}: {
  workout?: Workout;
  kinds: KindDefinition[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(workout?.name ?? "");
  const [notes, setNotes] = useState(workout?.notes ?? "");
  const [entries, setEntries] = useState<Entry[]>(workout?.entries ?? []);
  const [picking, setPicking] = useState(!workout);
  const action = useAction();
  function edit(index: number, change: Partial<Entry>) {
    setEntries((old) =>
      old.map((e, i) => (i === index ? { ...e, ...change } : e)),
    );
  }
  function move(index: number, delta: number) {
    setEntries((old) => {
      const next = [...old];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
  }
  return (
    <Dialog
      title={workout ? "Modifier la séance" : "Nouvelle séance"}
      wide
      onClose={onClose}
    >
      <form
        className="dialog-body stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(
            () =>
              sportApi.write(
                `/workouts${workout ? `/${workout.id}` : ""}`,
                {
                  name,
                  notes,
                  entries: entries.map(({ exercise_id, sets, target }) => ({
                    exercise_id,
                    sets,
                    target,
                  })),
                  ...(workout ? { expected_version: workout.version } : {}),
                },
                workout ? "PUT" : "POST",
              ),
            onSaved,
          );
        }}
      >
        <fieldset className="sport-fieldset" disabled={action.busy}>
          <label>
            Nom de la séance
            <input
              required
              maxLength={160}
              placeholder="Haut du corps, course du samedi…"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Notes de préparation
            <textarea
              value={notes}
              maxLength={4000}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <div className="sport-section-heading">
            <h3>
              Exercices · {entries.reduce((sum, e) => sum + e.sets, 0)} séries
            </h3>
            <button
              type="button"
              className="text-button"
              onClick={() => setPicking((p) => !p)}
            >
              {picking ? "Fermer le catalogue" : "Ajouter un exercice"}
            </button>
          </div>
          {picking && (
            <ExercisePicker
              kinds={kinds}
              onPick={(ex) => {
                setEntries((old) => [
                  ...old,
                  {
                    exercise_id: ex.id,
                    name: ex.name,
                    kind: ex.kind,
                    sets: 3,
                    target: {},
                  },
                ]);
                setPicking(false);
              }}
            />
          )}
          {entries.length === 0 && (
            <p className="muted">
              Ajoutez les exercices de votre séance depuis le catalogue.
            </p>
          )}
          {entries.map((entry, index) => (
            <section
              className="sport-plan-entry"
              key={`${index}-${entry.exercise_id}`}
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
                    onClick={() =>
                      setEntries((old) => old.filter((_, i) => i !== index))
                    }
                  >
                    <Icon name="x" />
                  </button>
                </div>
              </div>
              <label>
                Nombre de séries
                <input
                  type="number"
                  min={1}
                  max={30}
                  required
                  value={entry.sets}
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
          <ErrorMessage message={action.error} />
          <div className="dialog-actions">
            <button
              className="primary-button"
              disabled={
                !entries.length ||
                entries.length > 50 ||
                entries.reduce((sum, e) => sum + e.sets, 0) > 300
              }
            >
              Enregistrer la séance
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
export function Workouts({
  kinds,
  active,
  onStarted,
}: {
  kinds: KindDefinition[];
  active: Training | null | undefined;
  onStarted: (t?: Training) => void;
}) {
  const [archived, setArchived] = useState(false);
  const [form, setForm] = useState<Workout | "new" | null>(null);
  const resource = useResource(
    (signal) => sportApi.workouts(archived, signal),
    [archived],
  );
  const action = useAction();
  return (
    <>
      {active && (
        <button className="sport-active-banner" onClick={() => onStarted()}>
          <span>
            <strong>{active.name}</strong>
            <small>
              {active.sets.length} séries validées · entraînement en cours
            </small>
          </span>
          <span>Reprendre →</span>
        </button>
      )}
      <div className="sport-toolbar">
        <label className="sport-toggle">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          Séances archivées
        </label>
        <button className="primary-button" onClick={() => setForm("new")}>
          <Icon name="plus" />
          Nouvelle séance
        </button>
      </div>
      <LoadState {...resource} />
      <ErrorMessage message={action.error} />
      {resource.data?.length === 0 && (
        <Empty
          title={
            archived
              ? "Aucune séance archivée"
              : "Votre prochain entraînement commence ici"
          }
        >
          {archived
            ? "Vos séances archivées restent disponibles pour être restaurées."
            : "Composez une séance avec les exercices du catalogue, puis lancez-la à chaque entraînement."}
        </Empty>
      )}
      <div className="sport-workout-grid">
        {resource.data?.map((w) => (
          <article className="sport-workout" key={w.id}>
            <div className="sport-workout-top">
              <span className="sport-tag">
                {w.entries.length} exercices ·{" "}
                {w.entries.reduce((sum, e) => sum + e.sets, 0)} séries
              </span>
              <button
                className="icon-button"
                aria-label={`Modifier ${w.name}`}
                onClick={() => setForm(w)}
              >
                <Icon name="edit" />
              </button>
            </div>
            <h2>{w.name}</h2>
            {w.notes && <p className="muted">{w.notes}</p>}
            <ol>
              {w.entries.map((entry, i) => (
                <li key={i}>
                  <span>{entry.name}</span>
                  <small>
                    {entry.sets} séries
                    {valuesText(
                      kinds.find((k) => k.id === entry.kind)!,
                      entry.target,
                    ) &&
                      ` · ${valuesText(kinds.find((k) => k.id === entry.kind)!, entry.target)}`}
                  </small>
                </li>
              ))}
            </ol>
            <div className="sport-workout-actions">
              {!archived && (
                <button
                  className="primary-button"
                  disabled={action.busy || !!active}
                  onClick={() =>
                    void action.run(
                      () =>
                        sportApi.write<Training>(
                          "/sessions",
                          { workout_id: w.id, expected_version: w.version },
                          "POST",
                        ),
                      onStarted,
                    )
                  }
                >
                  Lancer la séance <Icon name="arrow" />
                </button>
              )}
              <button
                className="text-button"
                disabled={action.busy}
                onClick={() =>
                  void action.run(
                    () =>
                      sportApi.write(`/workouts/${w.id}/archive`, {
                        expected_version: w.version,
                        archived: !archived,
                      }),
                    resource.reload,
                  )
                }
              >
                {archived ? "Restaurer" : "Archiver"}
              </button>
            </div>
          </article>
        ))}
      </div>
      {form && (
        <WorkoutForm
          workout={form === "new" ? undefined : form}
          kinds={kinds}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            resource.reload();
          }}
        />
      )}
    </>
  );
}
