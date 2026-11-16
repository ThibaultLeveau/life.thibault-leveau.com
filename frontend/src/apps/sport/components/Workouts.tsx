import { tr } from "../i18n";
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
        <button
          className={`sport-active-banner ${isHyrox(active.name) ? "sport-hyrox" : ""}`}
          onClick={() => onStarted()}
        >
          {isHyrox(active.name) && (
            <span className="sport-hyrox-stamp">
              <HyroxMark />
            </span>
          )}
          <span>
            <strong>{active.name}</strong>
            <small>
              {active.sets.length}{" "}
              {tr("completed_sets_training_session_in_progress")}
            </small>
          </span>
          <span>{tr("resume")}</span>
        </button>
      )}
      <div className="sport-toolbar">
        <label className="sport-toggle">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => onArchivedChange(e.target.checked)}
          />
          {tr("archived_programs")}
        </label>
        <button className="primary-button" onClick={() => onEdit("new")}>
          <Icon name="plus" />
          {tr("new_program")}
        </button>
      </div>
      <LoadState {...resource} />
      <ErrorMessage message={action.error} />
      {resource.data?.length === 0 && (
        <Empty
          title={
            archived
              ? tr("no_archived_programs")
              : tr("your_next_training_session_starts_here")
          }
        >
          {archived
            ? tr("your_archived_programs_remain_available_to_restore")
            : tr("build_a_program_using_catalogue_exercises_then_use_it_for")}
        </Empty>
      )}
      <div className="sport-workout-grid">
        {resource.data?.map((w) => (
          <article
            className={`sport-workout ${isHyrox(w.name) ? "sport-hyrox" : ""}`}
            key={w.id}
          >
            {isHyrox(w.name) && (
              <HyroxBrand date={w.competition_date} compact />
            )}
            <div className="sport-workout-top">
              <div>
                <span className="sport-tag">
                  {tr("exercise_count", { count: w.entries.length })} ·{" "}
                  {tr("set_count", {
                    count: w.entries.reduce((sum, e) => sum + e.sets, 0),
                  })}
                </span>
                <h2>{w.name}</h2>
              </div>
              <button
                className="icon-button"
                aria-label={tr("edit_named", { name: w.name })}
                onClick={() => onEdit(w.id)}
              >
                <Icon name="edit" />
              </button>
            </div>
            {w.notes && <p className="muted sport-workout-notes">{w.notes}</p>}
            <ol>
              {w.entries.map((entry, i) => (
                <li key={i}>
                  <span>{entry.name}</span>
                  <small>
                    {tr("set_count", { count: entry.sets })}
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
            {w.entries.length > 2 && (
              <p className="sport-workout-more muted">
                {tr("more_exercises", { count: w.entries.length - 2 })}
              </p>
            )}
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
                  {tr("start_training_session")} <Icon name="arrow" />
                </button>
              )}
              {archived && (
                <button
                  className="text-button"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(
                      () =>
                        sportApi.write(`/workouts/${w.id}/archive`, {
                          expected_version: w.version,
                          archived: false,
                        }),
                      resource.reload,
                    )
                  }
                >
                  {tr("restore")}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
