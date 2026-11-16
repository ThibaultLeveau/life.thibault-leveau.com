import { tr } from "../i18n";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../../../platform/api";
import { relativeDate } from "../dates";
import { plusDays } from "../scheduling";
import type { Section, Task, Workspace } from "../types";
import { workspaceTree } from "../workspaceTree";
import { Dialog, ErrorMessage } from "../../../shared/ui/Dialog";
import { Calendar } from "./ScheduleCalendar";

import { useTaskSync } from "../useTaskSync";

export type BulkAction = "reschedule" | "move" | "archive";

export function BulkTaskDialog({
  action,
  tasks,
  workspaces,
  today,
  onClose,
  onSaved,
}: {
  action: BulkAction;
  tasks: Task[];
  workspaces: Workspace[];
  today: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState<string | null>(today);
  const [spaceId, setSpaceId] = useState(tasks[0].workspace_id);
  const [sectionId, setSectionId] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(action === "move");
  const sync = useTaskSync();
  const [error, setError] = useState("");
  const calendar = useRef<HTMLFieldSetElement>(null);
  const verb =
    action === "archive"
      ? tr("delete")
      : action === "move"
        ? tr("move")
        : tr("reschedule");
  useEffect(() => {
    if (action !== "move") return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setSections([]);
    setSectionId("");
    api<Section[]>(
      `/workspaces/${spaceId}/sections`,
      "GET",
      undefined,
      controller.signal,
    )
      .then((items) => {
        setSections(items);
        setLoading(false);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [spaceId, action]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    sync.mutate(
      "/tasks/bulk",
      "POST",
      {
        action,
        tasks: tasks.map((task) => ({
          id: task.id,
          expected_version: task.version,
        })),
        ...(action === "reschedule" ? { due_date: date } : {}),
        ...(action === "move"
          ? { workspace_id: spaceId, section_id: sectionId || null }
          : {}),
      },
      { message: tr(`bulk_${action}`, { count: tasks.length }) },
    );
    onSaved();
  }

  return (
    <Dialog
      title={tr(`bulk_title_${action}`, { count: tasks.length })}
      onClose={onClose}
    >
      <form className="dialog-body stack-form bulk-task-form" onSubmit={submit}>
        {action === "archive" && (
          <p>{tr("these_tasks_will_be_removed_from_your_lists_you_can")}</p>
        )}
        {action === "reschedule" && (
          <>
            <div className="bulk-date-shortcuts">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDate(today)}
              >
                {tr("today")}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDate(plusDays(today, 1))}
              >
                {tr("tomorrow")}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={tasks.some((task) => !!task.recurrence)}
                onClick={() => setDate(null)}
              >
                {tr("no_date")}
              </button>
            </div>
            <fieldset ref={calendar} className="bulk-calendar">
              <legend className="sr-only">{tr("new_due_date")}</legend>
              <Calendar
                key={date?.slice(0, 7) ?? today.slice(0, 7)}
                value={date}
                today={today}
                onChange={(next) => {
                  setDate(next);
                  requestAnimationFrame(() =>
                    calendar.current
                      ?.querySelector<HTMLButtonElement>(
                        `[data-date="${next}"]`,
                      )
                      ?.focus({ preventScroll: true }),
                  );
                }}
              />
            </fieldset>
            <p role="status">
              {date
                ? relativeDate(date, today).full
                : tr("no_due_date_selected")}
            </p>
            {tasks.some((task) => !!task.recurrence) && (
              <p className="muted small-text">
                {tr(
                  "recurrences_are_preserved_the_date_must_respect_the_bounds_and",
                )}
              </p>
            )}
          </>
        )}
        {action === "move" && (
          <>
            <label>
              {tr("workspace")}
              <select
                value={spaceId}
                onChange={(event) => setSpaceId(event.target.value)}
              >
                {workspaceTree(workspaces).map(({ space, path }) => (
                  <option key={space.id} value={space.id}>
                    {path}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("section")}
              <select
                value={sectionId}
                disabled={loading}
                onChange={(event) => setSectionId(event.target.value)}
              >
                <option value="">{tr("no_section")}</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted small-text">
              {tr("tasks_will_be_placed_at_the_end_of_the_section")}
            </p>
          </>
        )}
        <ErrorMessage message={error} />
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            {tr("cancel")}
          </button>
          <button
            className={`primary-button ${action === "archive" ? "danger-button" : ""}`}
            disabled={loading}
          >
            {verb}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
