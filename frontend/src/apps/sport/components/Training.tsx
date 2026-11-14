import { useEffect, useState } from "react";
import { Dialog, ErrorMessage } from "../../../shared/ui/Dialog";
import { sportApi } from "../api";
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
  onChanged,
}: {
  training: Training;
  onChanged: (t: Training) => void;
}) {
  const [anchor, setAnchor] = useState({
    server: Date.parse(training.server_now),
    local: Date.now(),
  });
  const [now, setNow] = useState(Date.now());
  const action = useAction();
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
            (now - anchor.local)) /
            1000,
        ),
      )
    : 0;
  return (
    <div className={`sport-rest ${left ? "is-running" : ""}`}>
      <div>
        <span className="eyebrow">RÉCUPÉRATION</span>
        <strong role="timer" aria-label="Temps de repos restant">
          {String(Math.floor(left / 60)).padStart(2, "0")}:
          {String(left % 60).padStart(2, "0")}
        </strong>
        <span role="status">
          {left
            ? "Prenez le temps de récupérer"
            : "Prêt pour la prochaine série"}
        </span>
      </div>
      {left > 0 && (
        <button
          className="secondary-button"
          disabled={action.busy}
          onClick={() =>
            void action.run(
              () =>
                sportApi.write<Training>(`/sessions/${training.id}/rest`, {
                  expected_version: training.version,
                }),
              onChanged,
            )
          }
        >
          Passer le repos
        </button>
      )}
      <ErrorMessage message={action.error} />
    </div>
  );
}
function SetForm({
  training,
  entryIndex,
  setIndex,
  kinds,
  onClose,
  onChanged,
}: {
  training: Training;
  entryIndex: number;
  setIndex: number;
  kinds: KindDefinition[];
  onClose: () => void;
  onChanged: (t: Training) => void;
}) {
  const entry = training.entries[entryIndex];
  const existing = training.sets.find(
    (s) => s.entry_index === entryIndex && s.set_index === setIndex,
  );
  const previous = training.sets
    .filter((s) => s.entry_index === entryIndex && s.set_index < setIndex)
    .at(-1);
  const [values, setValues] = useState<Values>(
    existing?.values ?? previous?.values ?? entry.target,
  );
  const action = useAction();
  return (
    <Dialog title={`${entry.name} · série ${setIndex + 1}`} onClose={onClose}>
      <form
        className="dialog-body stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(
            () =>
              sportApi.write<Training>(
                `/sessions/${training.id}/sets/${entryIndex}/${setIndex}`,
                { expected_version: training.version, values },
              ),
            (t) => {
              onChanged(t);
              onClose();
            },
          );
        }}
      >
        <fieldset className="sport-fieldset" disabled={action.busy}>
          <ValuesFields
            kind={kinds.find((k) => k.id === entry.kind)!}
            value={values}
            onChange={setValues}
            required
          />
          <p className="muted small-text">
            {entry.kind.startsWith("weight")
              ? "Saisissez la charge totale : additionnez les deux haltères et incluez la barre si nécessaire."
              : "Saisissez ce que vous avez réellement effectué."}
          </p>
          <ErrorMessage message={action.error} />
          <div className="dialog-actions">
            {existing && (
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  void action.run(
                    () =>
                      sportApi.write<Training>(
                        `/sessions/${training.id}/sets/${entryIndex}/${setIndex}`,
                        { expected_version: training.version },
                        "DELETE",
                      ),
                    (t) => {
                      onChanged(t);
                      onClose();
                    },
                  )
                }
              >
                Annuler la validation
              </button>
            )}
            <button className="primary-button">
              {existing ? "Corriger la série" : "Valider la série"}
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
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
          <span>Début</span>
          <strong>{moment(training.started_at)}</strong>
        </div>
        <div>
          <span>Séries validées</span>
          <strong>{training.sets.length}</strong>
        </div>
        <div>
          <span>Score de séance</span>
          <strong>
            {training.score == null ? "—" : number(training.score)}
          </strong>
        </div>
      </div>
      {training.score != null && (
        <p className="muted">
          {training.baseline_id
            ? "100 = votre première séance terminée avec ces exercices et ce nombre de séries. Un score supérieur indique une meilleure performance selon les mesures choisies."
            : "Première séance comparable : elle devient votre référence à 100 points."}
        </p>
      )}
      {training.entries.map((entry, i) => (
        <section className="sport-plan-entry" key={i}>
          <h3>{entry.name}</h3>
          {training.sets
            .filter((s) => s.entry_index === i)
            .map((s) => (
              <p key={s.set_index}>
                Série {s.set_index + 1} ·{" "}
                {valuesText(kinds.find((k) => k.id === entry.kind)!, s.values)}
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
}: {
  training: Training | null | undefined;
  kinds: KindDefinition[];
  onChanged: (t: Training) => void;
  onFinished: () => void;
}) {
  const [editing, setEditing] = useState<{ entry: number; set: number } | null>(
    null,
  );
  const [ending, setEnding] = useState<"completed" | "cancelled" | null>(null);
  const [notes, setNotes] = useState("");
  const action = useAction();
  if (!training)
    return (
      <Empty title="Aucun entraînement en cours">
        Lancez une séance depuis l’onglet Séances.
      </Empty>
    );
  const total = training.entries.reduce((sum, e) => sum + e.sets, 0);
  return (
    <>
      <div className="sport-toolbar">
        <div>
          <h2>{training.name}</h2>
          <p className="muted">Démarré le {moment(training.started_at)}</p>
        </div>
        <span className="sport-tag">
          {training.sets.length} / {total} séries
        </span>
      </div>
      <progress
        className="sport-progress"
        max={total}
        value={training.sets.length}
        aria-label="Progression de la séance"
      />
      <RestTimer training={training} onChanged={onChanged} />
      {training.entries.map((entry, i) => (
        <section className="sport-session-exercise" key={i}>
          <div className="sport-section-heading">
            <h2>
              <span className="sport-order">{i + 1}</span>
              {entry.name}
            </h2>
            <span className="muted small-text">
              {kinds.find((k) => k.id === entry.kind)?.name}
            </span>
          </div>
          <div className="sport-set-list">
            {Array.from({ length: entry.sets }, (_, j) => {
              const record = training.sets.find(
                (s) => s.entry_index === i && s.set_index === j,
              );
              return (
                <button
                  className={`sport-set ${record ? "is-complete" : ""}`}
                  key={j}
                  onClick={() => setEditing({ entry: i, set: j })}
                  aria-label={`${record ? "Modifier" : "Valider"} ${entry.name}, série ${j + 1}`}
                >
                  <span className="sport-set-number">
                    {record ? "✓" : j + 1}
                  </span>
                  <span>
                    <strong>Série {j + 1}</strong>
                    <small>
                      {valuesText(
                        kinds.find((k) => k.id === entry.kind)!,
                        record?.values ?? entry.target,
                      ) || "Saisir les résultats"}
                    </small>
                  </span>
                  <span className="sport-set-action">
                    {record ? "Modifier" : "Valider"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <div className="sport-toolbar">
        <button
          className="text-button danger"
          onClick={() => setEnding("cancelled")}
        >
          Abandonner l’entraînement
        </button>
        <button
          className="primary-button"
          disabled={training.sets.length !== total}
          onClick={() => setEnding("completed")}
        >
          Terminer l’entraînement
        </button>
      </div>
      {editing && (
        <SetForm
          training={training}
          entryIndex={editing.entry}
          setIndex={editing.set}
          kinds={kinds}
          onClose={() => setEditing(null)}
          onChanged={onChanged}
        />
      )}{" "}
      {ending && (
        <Dialog
          title={
            ending === "completed"
              ? "Terminer l’entraînement"
              : "Abandonner l’entraînement"
          }
          onClose={() => setEnding(null)}
        >
          <form
            className="dialog-body stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(
                () =>
                  sportApi.write<Training>(`/sessions/${training.id}/finish`, {
                    expected_version: training.version,
                    outcome: ending,
                    notes,
                  }),
                () => {
                  setEnding(null);
                  onFinished();
                },
              );
            }}
          >
            <p>
              {ending === "completed"
                ? "Vos résultats seront conservés et votre score calculé."
                : "Les séries déjà saisies restent dans l’historique. Cet entraînement ne comptera pas dans les statistiques."}
            </p>
            <label>
              Ressenti et notes
              <textarea
                maxLength={4000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <ErrorMessage message={action.error} />
            <button disabled={action.busy} className="primary-button">
              {ending === "completed"
                ? "Enregistrer les résultats"
                : "Confirmer l’abandon"}
            </button>
          </form>
        </Dialog>
      )}
    </>
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
        <Empty title="Votre historique se construit ici">
          Vos entraînements terminés et abandonnés sont conservés avec chaque
          série.
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
                {moment(t.started_at)} · {t.sets.length} séries ·{" "}
                {t.status === "completed"
                  ? "Terminé"
                  : t.status === "cancelled"
                    ? "Abandonné"
                    : "En cours"}
              </small>
            </span>
            <span className="sport-score">
              {t.score === null ? "—" : number(t.score)}
              <small>score</small>
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
            Précédent
          </button>
          <span>
            {offset + 1}–{Math.min(offset + 30, resource.data.total)} sur{" "}
            {resource.data.total}
          </span>
          <button
            className="secondary-button"
            disabled={offset + 30 >= resource.data.total}
            onClick={() => setOffset(offset + 30)}
          >
            Suivant
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
