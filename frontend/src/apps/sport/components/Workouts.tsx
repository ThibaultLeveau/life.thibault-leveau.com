import { ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
import { sportApi } from "../api";
import { isHyrox } from "../hyrox";
import { HyroxBrand, HyroxMark } from "./HyroxBrand";
import type { KindDefinition, Training } from "../types";
import { Empty, LoadState, useAction, useResource, valuesText } from "./common";

export function Workouts({
  kinds,
  active,
  onStarted,
  archived,
  onArchivedChange,
  onEdit,
}: {
  kinds: KindDefinition[];
  active: Training | null | undefined;
  onStarted: (t?: Training) => void;
  archived: boolean;
  onArchivedChange: (value: boolean) => void;
  onEdit: (id: string) => void;
}) {
  const resource = useResource(
    (signal) => sportApi.workouts(archived, signal),
    [archived],
  );
  const action = useAction();
  return (
    <>
      {active && (
        <button className={`sport-active-banner ${isHyrox(active.name) ? "sport-hyrox" : ""}`} onClick={() => onStarted()}>
          {isHyrox(active.name) && <span className="sport-hyrox-stamp"><HyroxMark /></span>}
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
            onChange={(e) => onArchivedChange(e.target.checked)}
          />
          Programmes archivés
        </label>
        <button className="primary-button" onClick={() => onEdit("new")}>
          <Icon name="plus" />
          Nouveau programme
        </button>
      </div>
      <LoadState {...resource} />
      <ErrorMessage message={action.error} />
      {resource.data?.length === 0 && (
        <Empty
          title={
            archived
              ? "Aucun programme archivé"
              : "Votre prochain entraînement commence ici"
          }
        >
          {archived
            ? "Vos programmes archivés restent disponibles pour être restaurés."
            : "Composez un programme avec les exercices du catalogue, puis utilisez-le à chaque entraînement."}
        </Empty>
      )}
      <div className="sport-workout-grid">
        {resource.data?.map((w) => (
          <article className={`sport-workout ${isHyrox(w.name) ? "sport-hyrox" : ""}`} key={w.id}>
            {isHyrox(w.name) && <HyroxBrand date={w.competition_date} compact />}
            <div className="sport-workout-top">
              <span className="sport-tag">
                {w.entries.length} exercices ·{" "}
                {w.entries.reduce((sum, e) => sum + e.sets, 0)} séries
              </span>
              <button
                className="icon-button"
                aria-label={`Modifier ${w.name}`}
                onClick={() => onEdit(w.id)}
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
                      ` · ${valuesText(
                        kinds.find((k) => k.id === entry.kind)!,
                        entry.target,
                      )}`}
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
                  Démarrer l’entraînement <Icon name="arrow" />
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
    </>
  );
}
