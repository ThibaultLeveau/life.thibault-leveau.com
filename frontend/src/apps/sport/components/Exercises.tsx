import { useState } from "react";
import { Dialog, ErrorMessage } from "../../../shared/ui/Dialog";
import { sportApi } from "../api";
import type { Exercise, KindDefinition } from "../types";
import { Empty, LoadState, useAction, useResource } from "./common";

export function ExercisePicker({
  onPick,
  kinds,
}: {
  onPick: (ex: Exercise) => void;
  kinds: KindDefinition[];
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const resource = useResource(
    (signal) =>
      sportApi.exercises(
        new URLSearchParams({ q: query, kind, limit: "20" })
          .toString()
          .replace("kind=&", ""),
        signal,
      ),
    [query, kind],
  );
  return (
    <section className="sport-picker">
      <div className="sport-filters">
        <label>
          Rechercher un exercice
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Développé, course, farmer…"
          />
        </label>
        <label>
          Type
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Tous les types</option>
            {kinds.map((k) => (
              <option value={k.id} key={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <LoadState {...resource} />
      <div className="sport-picker-results">
        {resource.data?.items.map((ex) => (
          <button
            type="button"
            className="sport-picker-item"
            key={ex.id}
            onClick={() => onPick(ex)}
          >
            <span>
              <strong>{ex.name}</strong>
              <small>
                {kinds.find((k) => k.id === ex.kind)?.name} · {ex.equipment}
              </small>
            </span>
            <span aria-hidden="true">＋</span>
          </button>
        ))}
      </div>
      {resource.data?.total === 0 && (
        <p>Aucun exercice trouvé. Créez-le dans l’onglet Exercices.</p>
      )}
      {resource.data && resource.data.total > 20 && (
        <p className="muted small-text">
          20 résultats sur {resource.data.total} — précisez votre recherche.
        </p>
      )}
    </section>
  );
}
function ExerciseForm({
  exercise,
  kinds,
  onClose,
  onSaved,
}: {
  exercise?: Exercise;
  kinds: KindDefinition[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = exercise && !exercise.builtin;
  const [name, setName] = useState(exercise?.name ?? "");
  const [kind, setKind] = useState(exercise?.kind ?? "weight_reps");
  const [muscle, setMuscle] = useState(exercise?.muscle_group ?? "Général");
  const [equipment, setEquipment] = useState(
    exercise?.equipment ?? "Sans matériel",
  );
  const [notes, setNotes] = useState(exercise?.notes ?? "");
  const action = useAction();
  return (
    <Dialog
      title={editing ? "Modifier l’exercice" : "Nouvel exercice"}
      onClose={onClose}
    >
      <form
        className="dialog-body stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(
            () =>
              sportApi.write(
                `/exercises${editing ? `/${exercise.id}` : ""}`,
                {
                  name,
                  kind,
                  muscle_group: muscle,
                  equipment,
                  notes,
                  ...(editing ? { expected_version: exercise.version } : {}),
                },
                editing ? "PUT" : "POST",
              ),
            onSaved,
          );
        }}
      >
        <fieldset disabled={action.busy} className="sport-fieldset">
          <label>
            Nom de l’exercice
            <input
              required
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Type de saisie
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as Exercise["kind"])}
            >
              {kinds.map((k) => (
                <option value={k.id} key={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
          <p className="muted small-text">
            {kinds
              .find((k) => k.id === kind)
              ?.fields.map((f) => `${f.label} (${f.unit})`)
              .join(" · ")}
          </p>
          <div className="form-grid">
            <label>
              Groupe musculaire
              <input
                required
                maxLength={80}
                value={muscle}
                onChange={(e) => setMuscle(e.target.value)}
              />
            </label>
            <label>
              Matériel
              <input
                required
                maxLength={80}
                value={equipment}
                onChange={(e) => setEquipment(e.target.value)}
              />
            </label>
          </div>
          <label>
            Notes
            <textarea
              maxLength={4000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <ErrorMessage message={action.error} />
          <div className="dialog-actions">
            <button className="primary-button">Enregistrer l’exercice</button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
export function Exercises({ kinds }: { kinds: KindDefinition[] }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [archived, setArchived] = useState(false);
  const [offset, setOffset] = useState(0);
  const [form, setForm] = useState<Exercise | "new" | null>(null);
  const resource = useResource(
    (signal) => {
      const params = new URLSearchParams({
        q: query,
        archived: String(archived),
        offset: String(offset),
        limit: "40",
      });
      if (kind) params.set("kind", kind);
      return sportApi.exercises(params.toString(), signal);
    },
    [query, kind, archived, offset],
  );
  const action = useAction();
  return (
    <>
      <div className="sport-toolbar">
        <p className="muted">
          {resource.data?.total ?? "…"} exercices · un catalogue prêt à utiliser
        </p>
        <button className="primary-button" onClick={() => setForm("new")}>
          Nouvel exercice
        </button>
      </div>
      <div className="sport-filters">
        <label>
          Rechercher
          <input
            type="search"
            value={query}
            placeholder="Nom, muscle ou matériel"
            onChange={(e) => {
              setQuery(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label>
          Type d’exercice
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Tous les types</option>
            {kinds.map((k) => (
              <option value={k.id} key={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Afficher
          <select
            aria-label="Afficher"
            value={String(archived)}
            onChange={(e) => {
              setArchived(e.target.value === "true");
              setOffset(0);
            }}
          >
            <option value="false">Catalogue et mes exercices</option>
            <option value="true">Mes exercices archivés</option>
          </select>
        </label>
      </div>
      <LoadState {...resource} />
      <ErrorMessage message={action.error} />
      {resource.data?.total === 0 && (
        <Empty title="Aucun exercice">
          Essayez une autre recherche ou créez votre exercice.
        </Empty>
      )}
      <div className="sport-exercise-list">
        {resource.data?.items.map((ex) => (
          <article key={ex.id} className="sport-exercise">
            <div className="sport-exercise-mark" aria-hidden="true">
              {ex.kind === "distance_duration"
                ? "↗"
                : ex.kind.includes("duration")
                  ? "◷"
                  : "↟"}
            </div>
            <div className="sport-grow">
              <h2>{ex.name}</h2>
              <p>{kinds.find((k) => k.id === ex.kind)?.name}</p>
              <small>
                {ex.muscle_group} · {ex.equipment}
                {!ex.builtin && " · Personnel"}
              </small>
              {ex.notes && <p>{ex.notes}</p>}
            </div>
            <div className="sport-row-actions">
              <button
                className="secondary-button small-button"
                onClick={() => setForm(ex)}
              >
                {ex.builtin ? "Personnaliser" : "Modifier"}
              </button>
              {!ex.builtin && (
                <button
                  disabled={action.busy}
                  className="text-button"
                  onClick={() =>
                    void action.run(
                      () =>
                        sportApi.write(`/exercises/${ex.id}/archive`, {
                          expected_version: ex.version,
                          archived: !archived,
                        }),
                      resource.reload,
                    )
                  }
                >
                  {archived ? "Restaurer" : "Archiver"}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {resource.data && resource.data.total > 40 && (
        <div className="sport-pagination">
          <button
            className="secondary-button"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 40))}
          >
            Précédent
          </button>
          <span>
            {offset + 1}–{Math.min(offset + 40, resource.data.total)} sur{" "}
            {resource.data.total}
          </span>
          <button
            className="secondary-button"
            disabled={offset + 40 >= resource.data.total}
            onClick={() => setOffset(offset + 40)}
          >
            Suivant
          </button>
        </div>
      )}
      {form && (
        <ExerciseForm
          exercise={form === "new" ? undefined : form}
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
