import { useEffect, useRef, useState } from "react";
import { Dialog, ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
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
    <div ref={bar} className={`sport-rest ${left ? "is-running" : ""}`}>
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
        <button className="secondary-button" disabled={busy} onClick={onSkip}>
          Passer le repos
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
          <span>Début</span>
          <strong>{moment(training.started_at)}</strong>
        </div>
        <div>
          <span>Séries validées</span>
          <strong>{training.sets.length}</strong>
        </div>
        <div>
          <span>Score de l’entraînement</span>
          <strong>
            {training.score == null ? "—" : number(training.score)}
          </strong>
        </div>
      </div>
      {training.score != null && (
        <p className="muted">
          {training.baseline_id
            ? "100 = votre premier entraînement terminé avec ces exercices et ce nombre de séries. Un score supérieur indique une meilleure performance selon les mesures choisies."
            : "Premier entraînement comparable : il devient votre référence à 100 points."}
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
                {valuesText(
                  kinds.find((k) => k.id === entry.kind)!,
                  s.values,
                )}
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
            "Quitter l’entraînement sans enregistrer les saisies en cours ?",
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
      <Empty title="Aucun entraînement en cours">
        Démarrez un entraînement depuis l’onglet Programmes.
      </Empty>
    );
  const total = training.entries.reduce((sum, e) => sum + e.sets, 0);
  return (
    <div className="sport-training">
      <div className="sport-toolbar">
        <div>
          <h2>{training.name}</h2>
          <p className="muted">Démarré le {moment(training.started_at)}</p>
        </div>
        <span className="sport-tag" aria-live="polite">
          {training.sets.length} / {total} séries
        </span>
      </div>
      <p className="muted small-text">
        Saisissez vos résultats puis validez chaque série. Les valeurs
        enregistrées seront proposées au prochain entraînement.
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
              Charge totale : barre comprise et deux haltères additionnés.
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
                  aria-label={`${entry.name}, série ${j + 1}`}
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
                    <legend className="sr-only">Série {j + 1}</legend>
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
                          record ? "Corriger la série" : "Valider la série"
                        }
                      >
                        {record ? "Corriger" : "Valider"}
                      </button>
                    </div>
                    <div className="sport-set-actions">
                      <span className="sport-set-state">
                        {record && <Icon name="check" size={14} />}
                        {drafts[key]
                          ? "Saisie à enregistrer"
                          : record
                            ? "Validée"
                            : suggested
                              ? "Derniers résultats"
                              : "À valider"}
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
                          Annuler la validation
                        </button>
                      )}
                      {drafts[key] && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => clearDraft(key)}
                        >
                          Annuler la saisie
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
                "Abandonner sans enregistrer les saisies en cours ?",
              )
            )
              setEnding("cancelled");
          }}
        >
          Abandonner l’entraînement
        </button>
        <button
          className="primary-button"
          disabled={action.busy || dirty || training.sets.length !== total}
          onClick={() => setEnding("completed")}
        >
          Terminer l’entraînement
        </button>
      </div>
      {dirty && (
        <p className="muted small-text">
          Validez, corrigez ou annulez les saisies en cours avant de terminer.
        </p>
      )}
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
            <ErrorMessage message={scope === "finish" ? action.error : ""} />
            <button disabled={action.busy} className="primary-button">
              {ending === "completed"
                ? "Enregistrer les résultats"
                : "Confirmer l’abandon"}
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
