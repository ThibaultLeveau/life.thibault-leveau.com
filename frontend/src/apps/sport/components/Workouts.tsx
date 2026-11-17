import { useEffect, useRef, useState } from "react";
import { tr } from "../i18n";
import { Dialog, ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
import { sportApi } from "../api";
import { isHyrox } from "../hyrox";
import { useView } from "../preferences";
import { queryString, useSportQuery } from "../navigation";
import { HyroxBrand, HyroxMark } from "./HyroxBrand";
import type { KindDefinition, Training, Workout } from "../types";
import {
  day,
  Empty,
  LoadState,
  useDraftGuard,
  type RegisterGuard,
  UndoNotice,
  useAction,
  useDebounced,
  useResource,
  valuesText,
} from "./common";

export function Workouts({
  kinds,
  active,
  onStarted,
  archived,
  onArchivedChange,
  onEdit,
  archivedProgram,
  onDismissArchive,
  registerGuard,
}: {
  kinds: KindDefinition[];
  active: Training | null | undefined;
  onStarted: (training?: Training) => void;
  archived: boolean;
  onArchivedChange: (value: boolean) => void;
  onEdit: (id: string) => void;
  registerGuard: RegisterGuard;
  archivedProgram?: Workout | null;
  onDismissArchive?: () => void;
}) {
  const [filters, update] = useSportQuery({
    program_q: "",
    program_sort: "updated",
    program_exercise: "",
  });
  const query = useDebounced(filters.program_q);
  const sort = ["updated", "name", "recent"].includes(filters.program_sort)
    ? filters.program_sort
    : "updated";
  const resource = useResource(
    (signal) =>
      sportApi.workouts(
        archived,
        signal,
        queryString({ q: query, sort, exercise_id: filters.program_exercise }),
      ),
    [archived, query, sort, filters.program_exercise],
  );
  const presentation = useView("workouts");
  const [detail, setDetail] = useState<Workout | null>(null);
  const [copy, setCopy] = useState<Workout | null>(null);
  const [copyName, setCopyName] = useState("");
  const [notice, setNotice] = useState<Workout | null>(null);
  const archivedItem = notice ?? archivedProgram;
  const action = useAction();
  const canLeave = useDraftGuard(
    !!copy && copyName !== tr("copy_name", { name: copy.name }).slice(0, 160),
    action.busy,
    registerGuard,
  );
  const copyInput = useRef<HTMLInputElement>(null);
  const restoreFocus = useRef<string | null>(null);
  useEffect(() => {
    if (
      restoreFocus.current &&
      resource.data?.some((item) => item.id === restoreFocus.current)
    ) {
      presentation.list.current
        ?.querySelector<HTMLElement>(
          `[data-record="${restoreFocus.current}"] button`,
        )
        ?.focus();
      restoreFocus.current = null;
    }
  }, [resource.data]);
  const clearNotice = () => {
    setNotice(null);
    onDismissArchive?.();
  };
  const start = (workout: Workout) =>
    void action.run(
      () =>
        sportApi.write<Training>(
          "/sessions",
          { workout_id: workout.id, expected_version: workout.version },
          "POST",
        ),
      onStarted,
    );
  function archive(workout: Workout, value: boolean) {
    void action.run(
      () =>
        sportApi.write<Workout>(`/workouts/${workout.id}/archive`, {
          expected_version: workout.version,
          archived: value,
        }),
      (result) => {
        if (value) setNotice(result);
        else {
          clearNotice();
          restoreFocus.current = result.id;
        }
        setDetail(null);
        resource.reload();
      },
    );
  }
  return (
    <>
      {active && (
        <button
          className={`sport-active-banner ${isHyrox(active.name, active.context) ? "sport-hyrox" : ""}`}
          onClick={() => onStarted()}
        >
          {isHyrox(active.name, active.context) && (
            <span className="sport-hyrox-stamp">
              <HyroxMark />
            </span>
          )}
          <span className="sport-active-copy">
            <strong>{active.name}</strong>
            <small>
              {tr("completed_sets_training_session_in_progress", {
                count: active.sets.filter((set) => !set.skipped).length,
              })}
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
            onChange={(event) => onArchivedChange(event.target.checked)}
          />
          {tr("archived_programs")}
        </label>
        <button className="primary-button" onClick={() => onEdit("new")}>
          <Icon name="plus" />
          {tr("new_program")}
        </button>
      </div>
      <div className="sport-filters">
        <label>
          {tr("search_programs")}
          <input
            type="search"
            maxLength={160}
            value={filters.program_q}
            onChange={(event) => update({ program_q: event.target.value })}
          />
        </label>
        <label>
          {tr("sort_programs")}
          <select
            value={sort}
            onChange={(event) => update({ program_sort: event.target.value })}
          >
            <option value="updated">{tr("sort_updated")}</option>
            <option value="name">{tr("sort_name")}</option>
            <option value="recent">{tr("sort_recent")}</option>
          </select>
        </label>
        {presentation.controls}
      </div>
      {(filters.program_q || filters.program_exercise) && (
        <button
          type="button"
          className="text-button"
          onClick={() => update({ program_q: "", program_exercise: "" })}
        >
          {tr("clear_filters")}
        </button>
      )}
      <LoadState {...resource} />
      <ErrorMessage message={action.error} />
      {archivedItem && (
        <UndoNotice
          message={tr("archived_named", { name: archivedItem.name })}
          busy={action.busy}
          onUndo={() => archive(archivedItem, false)}
          onDismiss={clearNotice}
        />
      )}
      {resource.data?.length === 0 && (
        <Empty
          title={
            query || filters.program_exercise
              ? tr("no_matching_programs")
              : archived
                ? tr("no_archived_programs")
                : tr("your_next_training_session_starts_here")
          }
          action={
            <button
              className="secondary-button"
              onClick={() =>
                query || filters.program_exercise
                  ? update({ program_q: "", program_exercise: "" })
                  : archived
                    ? onArchivedChange(false)
                    : onEdit("new")
              }
            >
              {query || filters.program_exercise
                ? tr("clear_filters")
                : archived
                  ? tr("active_programs")
                  : tr("first_program")}
            </button>
          }
        >
          {archived
            ? tr("your_archived_programs_remain_available_to_restore")
            : tr("build_a_program_using_catalogue_exercises_then_use_it_for")}
        </Empty>
      )}
      <div
        ref={presentation.list}
        className={`sport-workout-grid sport-view-${presentation.view}`}
        data-view={presentation.view}
      >
        {resource.data?.map((workout) => (
          <article
            className={`sport-workout ${isHyrox(workout.name, workout.context) ? "sport-hyrox" : ""}`}
            key={workout.id}
            data-record={workout.id}
          >
            {isHyrox(workout.name, workout.context) && (
              <HyroxBrand date={workout.competition_date} compact />
            )}
            <div className="sport-workout-top">
              <div>
                <span className="sport-tag">
                  {tr("exercise_count", { count: workout.entries.length })} ·{" "}
                  {tr("set_count", {
                    count: workout.entries.reduce(
                      (sum, entry) => sum + entry.sets,
                      0,
                    ),
                  })}
                </span>
                <h2>
                  <button
                    className="sport-title-button"
                    onClick={() => setDetail(workout)}
                  >
                    {workout.name}
                  </button>
                </h2>
                {workout.last_used_at && (
                  <small className="muted">
                    {tr("last_used", { date: day(workout.last_used_at) })}
                  </small>
                )}
              </div>
              <button
                className="icon-button"
                aria-label={tr("edit_named", { name: workout.name })}
                onClick={() => onEdit(workout.id)}
              >
                <Icon name="edit" />
              </button>
            </div>
            {workout.notes && (
              <p className="muted sport-workout-notes">{workout.notes}</p>
            )}
            <ol>
              {workout.entries.slice(0, 3).map((entry, index) => (
                <li key={index}>
                  <span>{entry.name}</span>
                  <small>
                    {tr("set_count", { count: entry.sets })}
                    {valuesText(
                      kinds.find((kind) => kind.id === entry.kind)!,
                      entry.target,
                    ) &&
                      ` · ${valuesText(kinds.find((kind) => kind.id === entry.kind)!, entry.target)}`}
                  </small>
                </li>
              ))}
            </ol>
            {(presentation.view === "list" || workout.entries.length > 3) && (
              <button
                className="text-button sport-workout-more"
                onClick={() => setDetail(workout)}
              >
                {presentation.view === "list"
                  ? tr("view_program_exercises", {
                      count: workout.entries.length,
                    })
                  : tr("more_exercises", { count: workout.entries.length - 3 })}
              </button>
            )}
            <div className="sport-workout-actions">
              {!archived ? (
                <button
                  className="primary-button"
                  aria-label={
                    active?.workout_id === workout.id
                      ? tr("resume")
                      : tr("start_training_session")
                  }
                  aria-disabled={
                    action.busy ||
                    (!!active && active.workout_id !== workout.id)
                  }
                  onClick={() => {
                    if (active?.workout_id === workout.id) onStarted();
                    else if (!active) start(workout);
                  }}
                >
                  {active?.workout_id === workout.id
                    ? tr("resume")
                    : tr("start_session_short")}
                  <Icon name="arrow" />
                </button>
              ) : (
                <button
                  className="secondary-button"
                  disabled={action.busy}
                  onClick={() => archive(workout, false)}
                >
                  {tr("restore")}
                </button>
              )}
              <button
                className="icon-button"
                aria-label={tr("duplicate_named", { name: workout.name })}
                onClick={() => {
                  action.clear();
                  setCopy(workout);
                  setCopyName(
                    tr("copy_name", { name: workout.name }).slice(0, 160),
                  );
                }}
              >
                <Icon name="copy" />
              </button>
              {!archived && (
                <button
                  className="icon-button"
                  aria-label={tr("archive_named", { name: workout.name })}
                  disabled={action.busy}
                  onClick={() => archive(workout, true)}
                >
                  <Icon name="archive" />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {detail && (
        <Dialog
          title={detail.name}
          wide
          onClose={() => setDetail(null)}
          initialFocus="close"
        >
          <div className="dialog-body stack-form">
            {isHyrox(detail.name, detail.context) && (
              <HyroxBrand date={detail.competition_date} compact />
            )}
            {detail.notes && (
              <p className="sport-preparation-notes">{detail.notes}</p>
            )}
            <ol className="sport-preview-entries">
              {detail.entries.map((entry, index) => (
                <li key={index}>
                  <strong>{entry.name}</strong>
                  <span>
                    {tr("set_count", { count: entry.sets })} ·{" "}
                    {valuesText(
                      kinds.find((kind) => kind.id === entry.kind)!,
                      entry.target,
                    )}
                  </span>
                </li>
              ))}
            </ol>
            <div className="dialog-actions">
              <button
                className="secondary-button"
                onClick={() => onEdit(detail.id)}
              >
                {tr("edit_program")}
              </button>
              {!detail.archived_at && !active && (
                <button
                  className="primary-button"
                  disabled={action.busy}
                  onClick={() => start(detail)}
                >
                  {tr("start_training_session")}
                </button>
              )}
            </div>
            <ErrorMessage message={action.error} />
          </div>
        </Dialog>
      )}
      {copy && (
        <Dialog
          title={tr("duplicate_program")}
          onClose={() => {
            if (canLeave()) setCopy(null);
          }}
        >
          <form
            className="dialog-body stack-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!copyName.trim()) {
                copyInput.current?.setCustomValidity(tr("field_required"));
                copyInput.current?.reportValidity();
                return;
              }
              void action.run(
                () =>
                  sportApi.write<Workout>(
                    `/workouts/${copy.id}/duplicate`,
                    { name: copyName, expected_version: copy.version },
                    "POST",
                  ),
                (result) => {
                  setCopy(null);
                  resource.reload();
                  restoreFocus.current = result.id;
                },
              );
            }}
          >
            <label>
              {tr("program_name")}
              <input
                ref={copyInput}
                required
                maxLength={160}
                value={copyName}
                readOnly={action.busy}
                onChange={(event) => {
                  event.target.setCustomValidity("");
                  setCopyName(event.target.value);
                }}
              />
            </label>
            <p className="muted">{tr("duplicate_help")}</p>
            <ErrorMessage message={action.error} />
            <button className="primary-button" disabled={action.busy}>
              {tr("duplicate_program")}
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}
