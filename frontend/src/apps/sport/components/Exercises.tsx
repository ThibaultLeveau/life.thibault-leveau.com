import { tr } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { Dialog, ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
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
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    search.current?.focus();
  }, []);
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
          {tr("search_for_an_exercise")}
          <input
            ref={search}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            placeholder={tr("bench_press_running_farmer_carry")}
          />
        </label>
        <label>
          {tr("type")}
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">{tr("all_types")}</option>
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
        <p>{tr("no_exercises_found_create_one_in_the_exercises_tab")}</p>
      )}
      {resource.data && resource.data.total > 20 && (
        <p className="muted small-text">
          {tr("search_limit", { total: resource.data.total })}
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
  const [muscle, setMuscle] = useState(exercise?.muscle_group ?? tr("general"));
  const [equipment, setEquipment] = useState(
    exercise?.equipment ?? tr("no_equipment"),
  );
  const [notes, setNotes] = useState(exercise?.notes ?? "");
  const action = useAction();
  return (
    <Dialog
      title={editing ? tr("edit_exercise") : tr("new_exercise")}
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
            {tr("exercise_name")}
            <input
              required
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            {tr("input_type")}
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
              {tr("muscle_group")}
              <input
                required
                maxLength={80}
                value={muscle}
                onChange={(e) => setMuscle(e.target.value)}
              />
            </label>
            <label>
              {tr("equipment")}
              <input
                required
                maxLength={80}
                value={equipment}
                onChange={(e) => setEquipment(e.target.value)}
              />
            </label>
          </div>
          <label>
            {tr("notes")}
            <textarea
              maxLength={4000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <ErrorMessage message={action.error} />
          <div className="dialog-actions">
            <button className="primary-button">{tr("save_exercise")}</button>
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
          {resource.data
            ? tr("catalogue_count", { count: resource.data.total })
            : tr("loading")}
        </p>
        <button className="primary-button" onClick={() => setForm("new")}>
          {tr("new_exercise")}
        </button>
      </div>
      <div className="sport-filters">
        <label>
          {tr("search")}
          <input
            type="search"
            value={query}
            placeholder={tr("name_muscle_or_equipment")}
            onChange={(e) => {
              setQuery(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label>
          {tr("exercise_type")}
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">{tr("all_types")}</option>
            {kinds.map((k) => (
              <option value={k.id} key={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr("show")}
          <select
            aria-label={tr("show")}
            value={String(archived)}
            onChange={(e) => {
              setArchived(e.target.value === "true");
              setOffset(0);
            }}
          >
            <option value="false">{tr("catalogue_and_my_exercises")}</option>
            <option value="true">{tr("my_archived_exercises")}</option>
          </select>
        </label>
      </div>
      <LoadState {...resource} />
      <ErrorMessage message={action.error} />
      {resource.data?.total === 0 && (
        <Empty title={tr("no_exercises")}>
          {tr("try_another_search_or_create_your_own_exercise")}
        </Empty>
      )}
      <div className="sport-exercise-list">
        {resource.data?.items.map((ex) => (
          <article key={ex.id} className="sport-exercise">
            <div className="sport-exercise-mark" aria-hidden="true">
              <Icon
                name={
                  ex.kind === "distance_duration"
                    ? "arrow"
                    : ex.kind.includes("duration")
                      ? "repeat"
                      : "flag"
                }
                size={22}
              />
            </div>
            <div className="sport-grow">
              <h2>{ex.name}</h2>
              <p>{kinds.find((k) => k.id === ex.kind)?.name}</p>
              <small>
                {ex.muscle_group} · {ex.equipment}
                {ex.builtin ? ` · ${tr("default_exercise")}` : tr("personal")}
              </small>
              {ex.notes && <p>{ex.notes}</p>}
            </div>
            <div className="sport-row-actions">
              <button
                className="secondary-button small-button"
                onClick={() => setForm(ex)}
              >
                {ex.builtin ? tr("customize") : tr("edit")}
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
                  {archived ? tr("restore") : tr("archive")}
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
            {tr("previous")}
          </button>
          <span>
            {tr("page_range", {
              first: offset + 1,
              last: Math.min(offset + 40, resource.data.total),
              total: resource.data.total,
            })}
          </span>
          <button
            className="secondary-button"
            disabled={offset + 40 >= resource.data.total}
            onClick={() => setOffset(offset + 40)}
          >
            {tr("next")}
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
