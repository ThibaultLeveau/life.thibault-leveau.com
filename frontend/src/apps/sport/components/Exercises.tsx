import { useEffect, useRef, useState } from "react";
import { tr } from "../i18n";
import { CompactActions, CompactOptions, useSportMobile } from "./compact";
import { Dialog, ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon, type IconName } from "../../../shared/ui/Icon";
import { sportApi } from "../api";
import { useView } from "../preferences";
import { pageOffset, queryString, useSportQuery } from "../navigation";
import type {
  Exercise,
  ExerciseFilters,
  KindDefinition,
  Workout,
} from "../types";
import {
  ConflictPanel,
  Empty,
  LoadState,
  Pagination,
  UndoNotice,
  useAction,
  useDebounced,
  useDraftGuard,
  useFormValidation,
  useResource,
  type RegisterGuard,
} from "./common";

type Filters = {
  q: string;
  kind: string;
  show: string;
  muscle: string;
  equipment: string;
};
const filterQuery = (filters: Filters) => ({
  q: filters.q,
  kind: filters.kind,
  archived: String(filters.show === "true"),
  origin:
    filters.show === "personal" || filters.show === "builtin"
      ? filters.show
      : "all",
  muscle: filters.muscle,
  equipment: filters.equipment,
});

function FilterFields({
  filters,
  onChange,
  kinds,
  options,
  picker = false,
  search,
}: {
  filters: Filters;
  onChange: (values: Partial<Filters>) => void;
  kinds: KindDefinition[];
  options?: ExerciseFilters;
  picker?: boolean;
  search?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="sport-filters sport-list-controls">
      <label className="sport-search">
        <span>{picker ? tr("search_for_an_exercise") : tr("search")}</span>
        <input
          ref={search}
          aria-label={picker ? tr("search_for_an_exercise") : tr("search")}
          type="search"
          maxLength={160}
          placeholder={tr("name_muscle_or_equipment")}
          value={filters.q}
          onChange={(event) => onChange({ q: event.target.value })}
          onKeyDown={(event) => {
            if (picker && event.key === "Enter") event.preventDefault();
          }}
        />
      </label>
      <CompactOptions
        count={
          [
            filters.kind,
            filters.muscle,
            filters.equipment,
            filters.show !== "false",
          ].filter(Boolean).length
        }
      >
        <label>
          {tr("exercise_type")}
          <select
            value={filters.kind}
            onChange={(event) => onChange({ kind: event.target.value })}
          >
            <option value="">{tr("all_types")}</option>
            {kinds.map((kind) => (
              <option key={kind.id} value={kind.id}>
                {kind.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr("show")}
          <select
            aria-label={tr("show")}
            value={filters.show}
            onChange={(event) =>
              onChange({ show: event.target.value, muscle: "", equipment: "" })
            }
          >
            <option value="false">{tr("catalogue_and_my_exercises")}</option>
            <option value="personal">{tr("personal_exercises_only")}</option>
            <option value="builtin">{tr("provided_exercises_only")}</option>
            {!picker && (
              <option value="true">{tr("my_archived_exercises")}</option>
            )}
          </select>
        </label>
        <details className="sport-extra-filters">
          <summary>
            {tr("muscle_equipment_filters")}
            {(filters.muscle || filters.equipment) && (
              <span className="sport-tag">
                {[filters.muscle, filters.equipment].filter(Boolean).length}
              </span>
            )}
          </summary>
          <div className="sport-filters">
            <label>
              {tr("muscle_group")}
              <select
                value={filters.muscle}
                onChange={(event) => onChange({ muscle: event.target.value })}
              >
                <option value="">{tr("all_muscles")}</option>
                {options?.muscles.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("equipment")}
              <select
                value={filters.equipment}
                onChange={(event) =>
                  onChange({ equipment: event.target.value })
                }
              >
                <option value="">{tr("all_equipment")}</option>
                {options?.equipment.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>
        {(filters.q ||
          filters.kind ||
          filters.muscle ||
          filters.equipment ||
          filters.show !== "false") && (
          <button
            type="button"
            className="text-button"
            onClick={() =>
              onChange({
                q: "",
                kind: "",
                show: "false",
                muscle: "",
                equipment: "",
              })
            }
          >
            {tr("clear_filters")}
          </button>
        )}
      </CompactOptions>
    </div>
  );
}

export function useExercisePickerState() {
  const [filters, setFilters] = useState<Filters>({
    q: "",
    kind: "",
    show: "false",
    muscle: "",
    equipment: "",
  });
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Record<string, Exercise>>({});
  const [added, setAdded] = useState<Set<string>>(new Set());
  return {
    filters,
    setFilters,
    offset,
    setOffset,
    selected,
    setSelected,
    added,
    setAdded,
  };
}

export function ExercisePicker({
  onPick,
  kinds,
  active = true,
  capacity = 50,
  state,
}: {
  state: ReturnType<typeof useExercisePickerState>;
  onPick: (exercises: Exercise[], individual: boolean) => void;
  kinds: KindDefinition[];
  active?: boolean;
  capacity?: number;
}) {
  const search = useRef<HTMLInputElement>(null);
  const mobile = useSportMobile();
  useEffect(() => {
    if (active && !mobile) search.current?.focus();
  }, [active, mobile]);
  const {
    filters,
    setFilters,
    offset,
    setOffset,
    selected,
    setSelected,
    added,
    setAdded,
  } = state;
  const query = useDebounced(filters.q);
  const params = queryString({
    ...filterQuery({ ...filters, q: query }),
    offset: String(offset),
    limit: "20",
  });
  const resource = useResource(
    (signal) => sportApi.exercises(params, signal),
    [params],
  );
  const options = useResource(
    (signal) =>
      sportApi.exerciseFilters(
        queryString({ origin: filterQuery(filters).origin }),
        signal,
      ),
    [filters.show],
  );
  function add(choices: Exercise[], individual = false) {
    const values = choices
      .filter((exercise) => !added.has(exercise.id))
      .slice(0, capacity);
    if (!values.length) return;
    onPick(values, individual);
    setAdded(
      (previous) =>
        new Set([...previous, ...values.map((exercise) => exercise.id)]),
    );
    setSelected({});
  }
  return (
    <section className="sport-picker">
      <FilterFields
        filters={filters}
        kinds={kinds}
        options={options.data}
        picker
        search={search}
        onChange={(changes) => {
          setFilters((previous) => ({ ...previous, ...changes }));
          setOffset(0);
        }}
      />
      <LoadState {...resource} />
      <LoadState {...options} />
      <div className="sport-picker-results">
        {resource.data?.items.map((exercise) => (
          <div className="sport-picker-row" key={exercise.id}>
            <label className="sport-picker-check">
              <input
                type="checkbox"
                aria-label={tr("select_exercise", { name: exercise.name })}
                checked={!!selected[exercise.id]}
                disabled={
                  added.has(exercise.id) ||
                  (!selected[exercise.id] &&
                    Object.keys(selected).length >= capacity)
                }
                onChange={(event) =>
                  setSelected((previous) => {
                    const next = { ...previous };
                    if (event.target.checked) next[exercise.id] = exercise;
                    else delete next[exercise.id];
                    return next;
                  })
                }
              />
            </label>
            <button
              type="button"
              className="sport-picker-item"
              aria-disabled={added.has(exercise.id) || capacity <= 0}
              onClick={() => add([exercise], true)}
            >
              <span>
                <strong>{exercise.name}</strong>
                <small>
                  {kinds.find((kind) => kind.id === exercise.kind)?.name} ·{" "}
                  {exercise.equipment}
                </small>
              </span>
              <span>{added.has(exercise.id) ? tr("added") : tr("add")}</span>
            </button>
          </div>
        ))}
      </div>
      {!!Object.keys(selected).length && (
        <div className="sport-picker-selection">
          <span role="status">
            {tr("selected_exercises", { count: Object.keys(selected).length })}
          </span>
          <button
            type="button"
            className="primary-button"
            disabled={
              !Object.keys(selected).length ||
              Object.keys(selected).length > capacity
            }
            onClick={() => add(Object.values(selected))}
          >
            {tr("add_selected")}
          </button>
        </div>
      )}
      {resource.data?.total === 0 && (
        <p>{tr("no_exercises_found_create_one_in_the_exercises_tab")}</p>
      )}
      {resource.data && (
        <Pagination
          offset={offset}
          limit={20}
          total={resource.data.total}
          onChange={setOffset}
        />
      )}
      {!!added.size && (
        <button
          type="button"
          className="text-button"
          onClick={() => setAdded(new Set())}
        >
          {tr("allow_another_occurrence")}
        </button>
      )}
      {capacity <= 0 && <p role="status">{tr("program_capacity_reached")}</p>}
    </section>
  );
}

function ExerciseForm({
  exercise,
  kinds,
  onClose,
  onSaved,
  registerGuard,
}: {
  exercise?: Exercise;
  kinds: KindDefinition[];
  onClose: () => void;
  onSaved: (exercise: Exercise) => void;
  registerGuard: RegisterGuard;
}) {
  const [copyMode, setCopyMode] = useState(false);
  const editing = exercise && !exercise.builtin && !copyMode;
  const [name, setName] = useState(exercise?.name ?? "");
  const [kind, setKind] = useState(exercise?.kind ?? "weight_reps");
  const [muscle, setMuscle] = useState(exercise?.muscle_group ?? tr("general"));
  const [equipment, setEquipment] = useState(
    exercise?.equipment ?? tr("no_equipment"),
  );
  const [notes, setNotes] = useState(exercise?.notes ?? "");
  const [version, setVersion] = useState(exercise?.version);
  const payload = { name, kind, muscle_group: muscle, equipment, notes };
  const original = useRef(JSON.stringify(payload));
  const action = useAction();
  const validation = useFormValidation(action.failure);
  const canLeave = useDraftGuard(
    original.current !== JSON.stringify(payload),
    action.busy,
    registerGuard,
  );
  const describe = (value: typeof payload) => [
    { label: tr("exercise_name"), value: value.name },
    {
      label: tr("input_type"),
      value: kinds.find((kind) => kind.id === value.kind)?.name ?? value.kind,
    },
    { label: tr("muscle_group"), value: value.muscle_group },
    { label: tr("equipment"), value: value.equipment },
    { label: tr("notes"), value: value.notes },
  ];
  function load(value: Exercise) {
    setName(value.name);
    setKind(value.kind);
    setMuscle(value.muscle_group);
    setEquipment(value.equipment);
    setNotes(value.notes);
    setVersion(value.version);
    original.current = JSON.stringify({
      name: value.name,
      kind: value.kind,
      muscle_group: value.muscle_group,
      equipment: value.equipment,
      notes: value.notes,
    });
    action.clear();
  }
  return (
    <Dialog
      title={
        editing
          ? tr("edit_exercise")
          : exercise
            ? tr("create_personal_copy")
            : tr("new_exercise")
      }
      onClose={() => {
        if (canLeave()) onClose();
      }}
    >
      <form
        ref={validation.form}
        noValidate
        className="dialog-body stack-form"
        aria-busy={action.busy}
        onSubmit={(event) => {
          event.preventDefault();
          if (!validation.validate()) return;
          void action.run(
            () =>
              sportApi.write<Exercise>(
                `/exercises${editing ? `/${exercise.id}` : ""}`,
                {
                  ...payload,
                  ...(editing ? { expected_version: version } : {}),
                },
                editing ? "PUT" : "POST",
              ),
            onSaved,
          );
        }}
      >
        {exercise?.builtin && (
          <p className="muted">{tr("personal_copy_help")}</p>
        )}
        <fieldset disabled={action.busy} className="sport-fieldset">
          <label>
            {tr("exercise_name")}
            <input
              {...validation.attrs("name")}
              required
              maxLength={160}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {validation.error("name")}
          <label>
            {tr("input_type")}
            <select
              {...validation.attrs("kind")}
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as Exercise["kind"])
              }
            >
              {kinds.map((kind) => (
                <option key={kind.id} value={kind.id}>
                  {kind.name}
                </option>
              ))}
            </select>
          </label>
          {validation.error("kind")}
          <p className="muted small-text">
            {kinds
              .find((definition) => definition.id === kind)
              ?.fields.map((field) => `${field.label} (${field.unit})`)
              .join(" · ")}
          </p>
          <div className="form-grid">
            <label>
              {tr("muscle_group")}
              <input
                {...validation.attrs("muscle_group")}
                required
                maxLength={80}
                value={muscle}
                onChange={(event) => setMuscle(event.target.value)}
              />
              {validation.error("muscle_group")}
            </label>
            <label>
              {tr("equipment")}
              <input
                {...validation.attrs("equipment")}
                required
                maxLength={80}
                value={equipment}
                onChange={(event) => setEquipment(event.target.value)}
              />
              {validation.error("equipment")}
            </label>
          </div>
          <label>
            {tr("notes")}
            <textarea
              {...validation.attrs("notes")}
              maxLength={4000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          {validation.error("notes")}
          <ErrorMessage message={action.error} />
          {editing && (
            <ConflictPanel
              failure={action.failure}
              draft={describe(payload)}
              load={() => sportApi.exercise(exercise.id)}
              describe={describe}
              onReload={load}
              onKeep={(value) => {
                setVersion(value.version);
                action.clear();
              }}
              onCopy={() => {
                setCopyMode(true);
                action.clear();
              }}
            />
          )}
          <div className="dialog-actions">
            <button className="primary-button">
              {action.busy ? tr("saving") : tr("save_exercise")}
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}

function ExerciseDetail({
  exercise,
  kinds,
  onClose,
  onEdit,
  onAdd,
}: {
  exercise: Exercise;
  kinds: KindDefinition[];
  onClose: () => void;
  onEdit: () => void;
  onAdd: (program: string, exercise: string) => void;
}) {
  const programs = useResource(
    (signal) => sportApi.workouts(false, signal),
    [],
  );
  const [program, setProgram] = useState("new");
  const kind = kinds.find((kind) => kind.id === exercise.kind)!;
  return (
    <Dialog title={exercise.name} onClose={onClose} initialFocus="close">
      <div className="dialog-body stack-form">
        <dl className="sport-exercise-details">
          <div>
            <dt>{tr("exercise_type")}</dt>
            <dd>{kind.name}</dd>
          </div>
          <div>
            <dt>{tr("muscle_group")}</dt>
            <dd>{exercise.muscle_group}</dd>
          </div>
          <div>
            <dt>{tr("equipment")}</dt>
            <dd>{exercise.equipment}</dd>
          </div>
        </dl>
        <p>
          {kind.fields
            .map((field) => `${field.label} (${field.unit})`)
            .join(" · ")}
        </p>
        {exercise.notes && (
          <p className="sport-preparation-notes">{exercise.notes}</p>
        )}
        <button className="secondary-button" onClick={onEdit}>
          {exercise.builtin ? tr("create_personal_copy") : tr("edit_exercise")}
        </button>
        {!exercise.archived_at && (
          <>
            <LoadState {...programs} />
            <label>
              {tr("add_to_program")}
              <select
                value={program}
                onChange={(event) => setProgram(event.target.value)}
              >
                <option value="new">{tr("new_program")}</option>
                {programs.data?.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary-button"
              onClick={() => onAdd(program, exercise.id)}
            >
              {tr("add_to_program")}
            </button>
            <p className="muted">{tr("add_to_program_help")}</p>
          </>
        )}
      </div>
    </Dialog>
  );
}

const exerciseIcon = (exercise: Exercise): IconName =>
  exercise.kind.startsWith("weight") || exercise.kind === "assisted_reps"
    ? "dumbbell"
    : exercise.kind.includes("distance")
      ? "route"
      : exercise.kind.includes("duration")
        ? "timer"
        : "activity";

export function Exercises({
  kinds,
  registerGuard,
  onAddToProgram,
  onPrograms,
}: {
  kinds: KindDefinition[];
  registerGuard: RegisterGuard;
  onAddToProgram: (program: string, exercise: string) => void;
  onPrograms: (exercise: string) => void;
}) {
  const [query, update] = useSportQuery({
    ex_q: "",
    ex_kind: "",
    ex_show: "false",
    ex_muscle: "",
    ex_equipment: "",
    ex_offset: "0",
  });
  const filters: Filters = {
    q: query.ex_q,
    kind: kinds.some((kind) => kind.id === query.ex_kind) ? query.ex_kind : "",
    show: ["false", "true", "personal", "builtin"].includes(query.ex_show)
      ? query.ex_show
      : "false",
    muscle: query.ex_muscle,
    equipment: query.ex_equipment,
  };
  const search = useDebounced(filters.q);
  const offset = pageOffset(query.ex_offset);
  const params = queryString({
    ...filterQuery({ ...filters, q: search }),
    offset: String(offset),
    limit: "40",
  });
  const resource = useResource(
    (signal) => sportApi.exercises(params, signal),
    [params],
  );
  const options = useResource(
    (signal) =>
      sportApi.exerciseFilters(
        queryString({
          archived: String(filters.show === "true"),
          origin: filterQuery(filters).origin,
        }),
        signal,
      ),
    [filters.show],
  );
  const presentation = useView("exercises");
  const [form, setForm] = useState<Exercise | "new" | null>(null);
  const [detail, setDetail] = useState<Exercise | null>(null);
  const [notice, setNotice] = useState<Exercise | null>(null);
  const [affected, setAffected] = useState<{
    exercise: Exercise;
    programs: Workout[];
  } | null>(null);
  const action = useAction();
  const archived = filters.show === "true";
  const restoreFocus = useRef<string | null>(null);
  useEffect(() => {
    if (
      restoreFocus.current &&
      resource.data?.items.some((item) => item.id === restoreFocus.current)
    ) {
      presentation.list.current
        ?.querySelector<HTMLElement>(
          `[data-record="${restoreFocus.current}"] button`,
        )
        ?.focus();
      restoreFocus.current = null;
    }
  }, [resource.data]);
  function changeFilters(changes: Partial<Filters>) {
    update({
      ...Object.fromEntries(
        Object.entries(changes).map(([key, value]) => [`ex_${key}`, value]),
      ),
      ex_offset: "0",
    });
  }
  function acceptArchive(value: Exercise) {
    setAffected(null);
    if (value.archived_at) setNotice(value);
    else {
      setNotice(null);
      restoreFocus.current = value.id;
    }
    resource.reload();
    options.reload();
  }
  function archive(exercise: Exercise, value: boolean) {
    void action.run(
      () =>
        sportApi.write<Exercise>(`/exercises/${exercise.id}/archive`, {
          expected_version: exercise.version,
          archived: value,
        }),
      acceptArchive,
    );
  }
  function requestArchive(exercise: Exercise) {
    if (exercise.archived_at) {
      archive(exercise, false);
      return;
    }
    void action.run(
      async () => {
        const programs = await sportApi.workouts(
          false,
          undefined,
          queryString({ exercise_id: exercise.id }),
        );
        return programs.length
          ? { programs, updated: null }
          : {
              programs,
              updated: await sportApi.write<Exercise>(
                `/exercises/${exercise.id}/archive`,
                { expected_version: exercise.version, archived: true },
              ),
            };
      },
      (value) => {
        if (value.updated) acceptArchive(value.updated);
        else setAffected({ exercise, programs: value.programs });
      },
    );
  }
  return (
    <>
      <div className="sport-toolbar sport-list-toolbar">
        <button
          className="primary-button"
          aria-label={tr("new_exercise")}
          onClick={() => setForm("new")}
        >
          <Icon name="plus" />
          <span className="sport-desktop-label">{tr("new_exercise")}</span>
          <span className="sport-mobile-label">{tr("new_exercise_short")}</span>
        </button>
        {presentation.controls}
      </div>
      <FilterFields
        filters={filters}
        kinds={kinds}
        options={options.data}
        onChange={changeFilters}
      />
      <p className="muted small-text sport-result-count" role="status">
        {resource.data
          ? tr("catalogue_count", { count: resource.data.total })
          : tr("loading")}
      </p>
      <LoadState {...resource} />
      <LoadState {...options} />
      <ErrorMessage message={action.error} />
      {notice && (
        <UndoNotice
          message={tr("archived_named", { name: notice.name })}
          busy={action.busy}
          onUndo={() => archive(notice, false)}
          onDismiss={() => setNotice(null)}
        />
      )}
      {resource.data?.total === 0 && (
        <Empty
          title={tr("no_exercises")}
          action={
            <div className="sport-inline">
              <button
                className="secondary-button"
                onClick={() =>
                  changeFilters({
                    q: "",
                    kind: "",
                    show: "false",
                    muscle: "",
                    equipment: "",
                  })
                }
              >
                {tr("clear_filters")}
              </button>
              <button className="primary-button" onClick={() => setForm("new")}>
                {tr("first_exercise")}
              </button>
            </div>
          }
        >
          {tr("try_another_search_or_create_your_own_exercise")}
        </Empty>
      )}
      <div
        ref={presentation.list}
        className={`sport-exercise-list sport-view-${presentation.view}`}
        data-view={presentation.view}
      >
        {resource.data?.items.map((exercise) => (
          <article
            key={exercise.id}
            className="sport-exercise"
            data-record={exercise.id}
          >
            <div className="sport-exercise-mark" aria-hidden="true">
              <Icon name={exerciseIcon(exercise)} size={22} />
            </div>
            <div className="sport-grow">
              <h2>
                <button
                  className="sport-title-button"
                  onClick={() => setDetail(exercise)}
                >
                  {exercise.name}
                </button>
              </h2>
              <p className="sport-exercise-kind">
                {kinds.find((kind) => kind.id === exercise.kind)?.name}
              </p>
              <small>
                {exercise.muscle_group} · {exercise.equipment} ·{" "}
                {exercise.builtin
                  ? tr("default_exercise")
                  : tr("personal_exercise")}
              </small>
              {exercise.notes && (
                <p className="sport-exercise-notes">{exercise.notes}</p>
              )}
            </div>
            <div className="sport-row-actions">
              <CompactActions name={exercise.name}>
                <button
                  className="secondary-button small-button"
                  onClick={() => setForm(exercise)}
                >
                  {exercise.builtin ? tr("create_personal_copy") : tr("edit")}
                </button>
                {!exercise.builtin && (
                  <button
                    className="text-button"
                    disabled={action.busy}
                    onClick={() => requestArchive(exercise)}
                  >
                    {archived ? tr("restore") : tr("archive")}
                  </button>
                )}
              </CompactActions>
            </div>
          </article>
        ))}
      </div>
      {resource.data && (
        <Pagination
          offset={offset}
          limit={40}
          total={resource.data.total}
          onChange={(value) => update({ ex_offset: String(value) })}
        />
      )}
      {detail && (
        <ExerciseDetail
          exercise={detail}
          kinds={kinds}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setForm(detail);
            setDetail(null);
          }}
          onAdd={onAddToProgram}
        />
      )}
      {affected && (
        <Dialog
          title={tr("archive_used_exercise")}
          onClose={() => {
            if (!action.busy) setAffected(null);
          }}
        >
          <div className="dialog-body stack-form">
            <p>
              {tr("archive_used_help", { count: affected.programs.length })}
            </p>
            <ul>
              {affected.programs.slice(0, 5).map((program) => (
                <li key={program.id}>{program.name}</li>
              ))}
            </ul>
            <button
              className="secondary-button"
              onClick={() => onPrograms(affected.exercise.id)}
            >
              {tr("open_affected_programs")}
            </button>
            <ErrorMessage message={action.error} />
            <button
              className="primary-button"
              disabled={action.busy}
              onClick={() => archive(affected.exercise, true)}
            >
              {tr("archive")}
            </button>
          </div>
        </Dialog>
      )}
      {form && (
        <ExerciseForm
          exercise={form === "new" ? undefined : form}
          kinds={kinds}
          registerGuard={registerGuard}
          onClose={() => setForm(null)}
          onSaved={(exercise) => {
            setForm(null);
            resource.reload();
            options.reload();
            restoreFocus.current = exercise.id;
          }}
        />
      )}
    </>
  );
}
