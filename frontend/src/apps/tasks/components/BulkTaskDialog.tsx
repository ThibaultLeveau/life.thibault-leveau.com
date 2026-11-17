import { tr } from "../i18n";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../../../platform/api";
import { relativeDate } from "../dates";
import { plusDays } from "../scheduling";
import type { Label, Status, Section, Task, Workspace } from "../types";
import { workspaceTree } from "../workspaceTree";
import { Dialog, ErrorMessage } from "../../../shared/ui/Dialog";
import { Calendar } from "./ScheduleCalendar";

import { useTaskSync } from "../useTaskSync";

import { actionLabel, type BulkAction } from "../taskCommands";

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
  const [date, setDate] = useState<string | null>(
    tasks.length === 1 ? (tasks[0].due_date ?? today) : today,
  );
  const [priority, setPriority] = useState(tasks[0].priority);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [statusIds, setStatusIds] = useState<Record<string, string>>({});
  const [labelIds, setLabelIds] = useState<Record<string, string[]>>({});
  const [operation, setOperation] = useState("add");
  const [attempt, setAttempt] = useState(0);
  const spaceIds = [...new Set(tasks.map((task) => task.workspace_id))];
  const spaceKey = spaceIds.join(",");
  const [spaceId, setSpaceId] = useState(tasks[0].workspace_id);
  const [sectionId, setSectionId] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(action === "move");
  const sync = useTaskSync();
  const [error, setError] = useState("");
  const calendar = useRef<HTMLFieldSetElement>(null);
  const verb = actionLabel(action);
  useEffect(() => {
    setSectionId("");
  }, [spaceId]);
  useEffect(() => {
    if (!["move", "status", "labels"].includes(action)) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const kind =
      action === "move"
        ? "sections"
        : action === "status"
          ? "statuses"
          : "labels";
    const targets = action === "move" ? [spaceId] : spaceIds;
    Promise.all(
      targets.map((id) =>
        api<(Section | Status | Label)[]>(
          `/workspaces/${id}/${kind}`,
          "GET",
          undefined,
          controller.signal,
        ),
      ),
    )
      .then((groups) => {
        if (controller.signal.aborted) return;
        if (action === "move") setSections(groups.flat() as Section[]);
        else if (action === "status") setStatuses(groups.flat() as Status[]);
        else setLabels(groups.flat() as Label[]);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [spaceId, action, spaceKey, attempt]);
  const restoreBlocked =
    action === "restore" &&
    tasks.some(
      (task) =>
        !task.archived_at ||
        workspaces.find((space) => space.id === task.workspace_id)
          ?.archived_at ||
        sync.data?.sections.find((section) => section.id === task.section_id)
          ?.archived_at,
    );
  const incomplete =
    action === "status" && spaceIds.some((id) => !statusIds[id]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (loading || error || incomplete || restoreBlocked) return;
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
        ...(action === "priority" ? { priority } : {}),
        ...(action === "status" ? { status_ids: statusIds } : {}),
        ...(action === "labels"
          ? {
              operation,
              label_ids: Object.fromEntries(
                spaceIds.map((id) => [id, labelIds[id] ?? []]),
              ),
            }
          : {}),
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
      <form
        className="dialog-body stack-form bulk-task-form"
        aria-busy={loading}
        onSubmit={submit}
      >
        {loading && <p role="status">{tr("loading")}</p>}
        <p className="bulk-task-summary">
          {tr("selected_count", { count: tasks.length })}
        </p>
        {action === "complete" && <p>{tr("bulk_complete_help")}</p>}
        {action === "reopen" && <p>{tr("bulk_reopen_help")}</p>}
        {action === "duplicate" && <p>{tr("bulk_duplicate_help")}</p>}
        {action === "restore" && (
          <p>
            {tr(restoreBlocked ? "restore_parent_first" : "bulk_restore_help")}
          </p>
        )}
        {action === "priority" && (
          <label>
            {tr("priority")}
            <select
              value={priority}
              onChange={(event) => setPriority(Number(event.target.value))}
            >
              {[1, 2, 3, 4].map((value) => (
                <option key={value} value={value}>
                  {tr(
                    (["p1_urgent", "p2_high", "p3_normal", "p4_none"] as const)[
                      value - 1
                    ],
                  )}
                </option>
              ))}
            </select>
          </label>
        )}
        {action === "status" &&
          spaceIds.map((id) => (
            <label key={id}>
              {
                workspaceTree(workspaces).find((row) => row.space.id === id)
                  ?.path
              }
              <select
                required
                disabled={loading}
                value={statusIds[id] ?? ""}
                onChange={(event) =>
                  setStatusIds((previous) => ({
                    ...previous,
                    [id]: event.target.value,
                  }))
                }
              >
                <option value="">{tr("choose_status")}</option>
                {statuses
                  .filter((status) => status.workspace_id === id)
                  .map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.name}
                    </option>
                  ))}
              </select>
            </label>
          ))}
        {action === "status" && (
          <p className="field-help">{tr("bulk_status_help")}</p>
        )}
        {action === "labels" && (
          <>
            <label>
              {tr("label_operation")}
              <select
                value={operation}
                onChange={(event) => setOperation(event.target.value)}
              >
                <option value="add">{tr("add_labels")}</option>
                <option value="remove">{tr("remove_labels")}</option>
              </select>
            </label>
            {spaceIds.map((id) => (
              <fieldset className="label-fieldset" key={id} disabled={loading}>
                <legend>
                  {
                    workspaceTree(workspaces).find((row) => row.space.id === id)
                      ?.path
                  }
                </legend>
                {!loading &&
                  !labels.some((label) => label.workspace_id === id) && (
                    <p className="muted">{tr("no_labels_for_workspace")}</p>
                  )}
                {labels
                  .filter((label) => label.workspace_id === id)
                  .map((label) => (
                    <label className="check-label" key={label.id}>
                      <input
                        type="checkbox"
                        checked={(labelIds[id] ?? []).includes(label.id)}
                        onChange={(event) =>
                          setLabelIds((previous) => ({
                            ...previous,
                            [id]: event.target.checked
                              ? [...(previous[id] ?? []), label.id]
                              : (previous[id] ?? []).filter(
                                  (value) => value !== label.id,
                                ),
                          }))
                        }
                      />
                      {label.name}
                    </label>
                  ))}
              </fieldset>
            ))}
          </>
        )}
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
                {workspaceTree(
                  workspaces.filter((space) => !space.archived_at),
                ).map(({ space, path }) => (
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
        {error && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {tr("retry")}
          </button>
        )}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            {tr("cancel")}
          </button>
          <button
            className={`primary-button ${action === "archive" ? "danger-button" : ""}`}
            disabled={loading || !!error || incomplete || restoreBlocked}
          >
            {verb}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
