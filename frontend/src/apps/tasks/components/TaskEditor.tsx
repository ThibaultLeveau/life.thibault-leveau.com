import { formatLocale } from "../../../shared/i18n";
import { tr } from "../i18n";
import { useDraftForm } from "../useTaskDrafts";
import { useState, type FormEvent } from "react";
import { api } from "../../../platform/api";
import type {
  Label,
  Page,
  Section,
  Status,
  Task,
  TaskDraft,
  TaskEvent,
  Workspace,
} from "../types";
import { Dialog, ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
import { useScheduleRecognition } from "../scheduling";
import type { Schedule } from "../types";
import { SchedulePicker } from "./SchedulePicker";
import { ScheduleRecognition } from "./ScheduleRecognition";

import { useTaskSync } from "../useTaskSync";

const eventNames = (): Record<string, string> => ({
  created: tr("task_created"),
  updated: tr("task_updated"),
  moved: tr("event_moved"),
  completed: tr("event_completed"),
  reopened: tr("event_reopened"),
  archived: tr("task_archived"),
  restored: tr("task_restored"),
  rescheduled: tr("next_occurrence_scheduled"),
  completion_undone: tr("completion_undone"),
});

export function TaskEditor({
  task,
  workspace,
  sections,
  statuses,
  labels,
  initialSection = null,
  initialStatus,
  onClose,
  onSaved,
  onMove,
}: {
  task?: TaskDraft;
  workspace: Workspace;
  sections: Section[];
  statuses: Status[];
  labels: Label[];
  initialSection?: string | null;
  initialStatus?: string;
  onClose: () => void;
  onSaved: () => void;
  onMove: (task: Task) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sync = useTaskSync();
  const archivedParent =
    !!workspace.archived_at ||
    !!sections.find((section) => section.id === task?.section_id)?.archived_at;
  const readonly = !!task?.archived_at || archivedParent;
  const existing = task && task.id !== "draft";
  const [selectedLabels, setSelectedLabels] = useState(task?.label_ids ?? []);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [historyTotal, setHistoryTotal] = useState<number | null>(null);
  const [title, setTitle] = useState(task?.title ?? "");
  const [schedule, setSchedule] = useState<Schedule>({
    due_date: task?.due_date ?? null,
    recurrence: task?.recurrence ?? null,
  });
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const recognition = useScheduleRecognition(
    title,
    !readonly && title !== task?.title,
  );
  const draft = useDraftForm({ schedule, selectedLabels });
  const close = () => draft.leave(onClose);
  const displayedSchedule = recognition.suggestion ?? schedule;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || scheduleOpen) return;
    setBusy(true);
    setError("");
    const values = new FormData(event.currentTarget);
    const data = {
      title,
      description: String(values.get("description") ?? ""),
      priority: Number(values.get("priority")),
      ...schedule,
      section_id: String(values.get("section_id") || "") || null,
      status_id: String(values.get("status_id")),
      label_ids: selectedLabels,
    };
    try {
      const parsed = await recognition.resolve();
      if (parsed?.matched_text) {
        if (!parsed.title.trim())
          throw new Error(tr("add_a_title_next_to_the_date_for_example_read"));
        data.title = parsed.title;
        data.due_date = parsed.due_date;
        data.recurrence = parsed.recurrence;
      }
      const draft: Task = {
        id: "draft",
        workspace_id: workspace.id,
        version: 0,
        position: 0,
        created_at: "",
        updated_at: "",
        completed_at: null,
        archived_at: null,
        recurrence_completed: 0,
        ...task,
        ...data,
      };
      const baseline = task?.recoveryBase ?? task;
      const fields =
        existing && baseline
          ? (Object.fromEntries(
              Object.entries(data).filter(
                ([key, value]) =>
                  JSON.stringify(value) !==
                  JSON.stringify(baseline[key as keyof Task]),
              ),
            ) as Partial<Task>)
          : data;
      sync.mutate(
        existing ? `/tasks/${task.id}` : "/tasks",
        existing ? "PATCH" : "POST",
        {
          ...fields,
          ...(existing
            ? { expected_version: task.version }
            : { workspace_id: workspace.id }),
        },
        {
          message: tr("task_saved"),
          recover: () => sync.recoverTask(draft, fields),
        },
      );
      onSaved();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (
      !task ||
      archivedParent ||
      (!task.archived_at && !window.confirm(tr("archive_task_confirmation")))
    )
      return;
    sync.mutate(
      `/tasks/${task.id}`,
      "PATCH",
      { expected_version: task.version, archived: !task.archived_at },
      { message: tr("task_saved") },
    );
    onSaved();
  }

  async function loadHistory() {
    if (!task) return;
    setHistoryLoading(true);
    try {
      await sync.idle();
      const page = await api<Page<TaskEvent>>(
        `/tasks/${sync.canonicalId(task.id)}/events?limit=50&offset=${events.length}`,
      );
      setEvents((previous) => [...previous, ...page.items]);
      setHistoryTotal(page.total);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setHistoryLoading(false);
    }
  }
  return (
    <Dialog
      title={existing ? tr("task_details") : tr("a_new_task")}
      onClose={close}
    >
      <form
        ref={draft.ref}
        onSubmit={submit}
        className="stack-form dialog-body"
      >
        {archivedParent && (
          <p className="muted">{tr("restore_parent_first")}</p>
        )}
        <p className="dialog-context">
          <span className="color-dot" style={{ background: workspace.color }} />
          {workspace.name}
        </p>
        <label>
          {tr("title")}
          <input
            name="title"
            required
            maxLength={500}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
            placeholder={tr("read_tomorrow_run_every_monday")}
            disabled={busy || readonly}
          />
        </label>
        {!readonly && <ScheduleRecognition recognition={recognition} />}
        <SchedulePicker
          value={displayedSchedule}
          disabled={busy || readonly}
          completed={task?.recurrence_completed ?? 0}
          onEditingChange={setScheduleOpen}
          onChange={(value) => {
            const literal = recognition.suggestion?.title ?? title;
            recognition.dismiss(literal);
            setTitle(literal);
            setSchedule(value);
          }}
        />
        {task?.recurrence && (
          <p className="field-help">
            {tr("completed_occurrences", { count: task.recurrence_completed })}
            {task.recurrence.max_occurrences
              ? tr("out_of_total", { total: task.recurrence.max_occurrences })
              : ""}
            {tr("changing_the_rule_restarts_this_count_history_is_preserved")}
          </p>
        )}
        <label>
          {tr("description")}
          <textarea
            name="description"
            rows={4}
            maxLength={20000}
            defaultValue={task?.description}
            placeholder={tr("a_few_details_to_make_things_clearer")}
            disabled={readonly}
          />
        </label>
        <div className="form-grid">
          <label>
            {tr("section")}
            <select
              name="section_id"
              defaultValue={task?.section_id ?? initialSection ?? ""}
              disabled={readonly}
            >
              <option value="">{tr("no_section")}</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr("status")}
            <select
              name="status_id"
              defaultValue={
                task?.status_id ??
                initialStatus ??
                statuses.find((status) => !status.is_completed)?.id
              }
              disabled={readonly}
            >
              {statuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr("priority")}
            <select
              name="priority"
              defaultValue={task?.priority ?? 4}
              disabled={readonly}
            >
              <option value={1}>{tr("p1_urgent")}</option>
              <option value={2}>{tr("p2_high")}</option>
              <option value={3}>{tr("p3_normal")}</option>
              <option value={4}>{tr("p4_none")}</option>
            </select>
          </label>
        </div>
        {labels.length > 0 && (
          <fieldset className="label-fieldset">
            <legend>{tr("labels")}</legend>
            <div className="label-picker">
              {labels.map((label) => (
                <label key={label.id} className="label-choice">
                  <input
                    type="checkbox"
                    checked={selectedLabels.includes(label.id)}
                    disabled={readonly}
                    onChange={(event) =>
                      setSelectedLabels((previous) =>
                        event.target.checked
                          ? [...previous, label.id]
                          : previous.filter((id) => id !== label.id),
                      )
                    }
                  />
                  <span
                    className="color-dot"
                    style={{ background: label.color }}
                  />
                  {label.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <ErrorMessage message={error} />
        <div className="dialog-actions">
          {existing && (
            <button
              type="button"
              className="text-button danger"
              disabled={busy || archivedParent}
              onClick={() => draft.leave(() => void archive())}
            >
              <Icon name={task.archived_at ? "restore" : "archive"} />
              {task.archived_at ? tr("restore") : tr("archive")}
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="secondary-button" onClick={close}>
            {tr("cancel")}
          </button>
          {!readonly && (
            <button
              className="primary-button"
              disabled={busy || scheduleOpen}
              title={
                scheduleOpen
                  ? tr(
                      "choose_a_date_apply_the_recurrence_or_close_the_calendar",
                    )
                  : undefined
              }
            >
              {busy ? tr("saving") : existing ? tr("save") : tr("add_task")}
            </button>
          )}
        </div>
      </form>
      {existing && (
        <div className="task-history">
          <div className="history-toolbar">
            <button
              className="text-button"
              onClick={loadHistory}
              disabled={historyLoading || historyTotal !== null}
            >
              <Icon name="restore" />
              {tr("history")}
            </button>
            {!readonly && (
              <button
                className="text-button"
                onClick={() => draft.leave(() => onMove(task))}
              >
                <Icon name="arrow" />
                {tr("move_and_reorder")}
              </button>
            )}
          </div>
          {events.length > 0 && (
            <ol className="event-list">
              {events.map((event) => (
                <li key={event.id}>
                  <span className="event-mark" />
                  <div>
                    <strong>
                      {event.kind === "completed" &&
                      event.context.after.recurrence
                        ? tr("occurrence_completed")
                        : (eventNames()[event.kind] ?? event.kind)}
                    </strong>
                    <span>
                      {event.context.after.workspace_name} ·{" "}
                      {event.context.after.section_name ?? tr("no_section")} ·{" "}
                      {event.context.after.status_name}
                    </span>
                    {event.context.after.due_date &&
                      [
                        "completed",
                        "rescheduled",
                        "completion_undone",
                      ].includes(event.kind) && (
                        <span>
                          {tr("due_on")}{" "}
                          {new Date(
                            `${event.context.after.due_date}T12:00:00`,
                          ).toLocaleDateString(formatLocale())}
                        </span>
                      )}
                  </div>
                  <time dateTime={event.occurred_at}>
                    {new Date(event.occurred_at).toLocaleString(
                      formatLocale(),
                      {
                        dateStyle: "short",
                        timeStyle: "short",
                      },
                    )}
                  </time>
                </li>
              ))}
            </ol>
          )}
          {historyTotal !== null && events.length < historyTotal && (
            <button
              className="text-button"
              onClick={loadHistory}
              disabled={historyLoading}
            >
              {tr("load_more")}
            </button>
          )}
          <p className="muted small-text">
            {tr("created_on")}{" "}
            {new Date(task.created_at).toLocaleString(formatLocale())}
          </p>
        </div>
      )}
    </Dialog>
  );
}
