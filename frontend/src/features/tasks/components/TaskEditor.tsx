import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import type {
  Label,
  Page,
  Section,
  Status,
  Task,
  TaskEvent,
  Workspace,
} from "../types";
import { Dialog, ErrorMessage } from "./Dialog";
import { Icon } from "./Icon";
import { useScheduleRecognition } from "../scheduling";
import type { Schedule } from "../types";
import { SchedulePicker } from "./SchedulePicker";
import { ScheduleRecognition } from "./ScheduleRecognition";

const eventNames: Record<string, string> = {
  created: "Tâche créée",
  updated: "Tâche modifiée",
  moved: "Tâche déplacée",
  completed: "Tâche terminée",
  reopened: "Tâche rouverte",
  archived: "Tâche archivée",
  restored: "Tâche restaurée",
  rescheduled: "Prochaine occurrence planifiée",
  completion_undone: "Résolution annulée",
};

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
  onReload,
}: {
  task?: Task;
  workspace: Workspace;
  sections: Section[];
  statuses: Status[];
  labels: Label[];
  initialSection?: string | null;
  initialStatus?: string;
  onClose: () => void;
  onSaved: () => void;
  onMove: (task: Task) => void;
  onReload: (task: Task) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState(task?.label_ids ?? []);
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
    !task?.archived_at && title !== task?.title,
  );
  const displayedSchedule = recognition.suggestion ?? schedule;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || scheduleOpen) return;
    setBusy(true);
    setError("");
    setConflict(false);
    const values = new FormData(event.currentTarget);
    const data = {
      title,
      description: values.get("description"),
      priority: Number(values.get("priority")),
      ...schedule,
      section_id: values.get("section_id") || null,
      status_id: values.get("status_id"),
      label_ids: selectedLabels,
    };
    try {
      const parsed = await recognition.resolve();
      if (parsed?.matched_text) {
        if (!parsed.title.trim())
          throw new Error(
            "Ajoutez un titre à côté de la date, par exemple « Lire demain ».",
          );
        data.title = parsed.title;
        data.due_date = parsed.due_date;
        data.recurrence = parsed.recurrence;
      }
      await api<Task>(
        task ? `/tasks/${task.id}` : "/tasks",
        task ? "PATCH" : "POST",
        {
          ...data,
          ...(task
            ? { expected_version: task.version }
            : { workspace_id: workspace.id }),
        },
      );
      onSaved();
    } catch (error) {
      setError((error as Error).message);
      setConflict(error instanceof ApiError && error.status === 409);
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!task) return;
    setBusy(true);
    setError("");
    try {
      await api(`/tasks/${task.id}`, "PATCH", {
        expected_version: task.version,
        archived: !task.archived_at,
      });
      onSaved();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadHistory() {
    if (!task) return;
    setBusy(true);
    try {
      const page = await api<Page<TaskEvent>>(
        `/tasks/${task.id}/events?limit=50&offset=${events.length}`,
      );
      setEvents((previous) => [...previous, ...page.items]);
      setHistoryTotal(page.total);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    if (!task) return;
    setBusy(true);
    try {
      onReload(await api<Task>(`/tasks/${task.id}`));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={task ? "Détails de la tâche" : "Une nouvelle tâche"}
      onClose={onClose}
    >
      <form onSubmit={submit} className="stack-form dialog-body">
        <p className="dialog-context">
          <span className="color-dot" style={{ background: workspace.color }} />
          {workspace.name}
        </p>
        <label>
          Titre
          <input
            name="title"
            required
            maxLength={500}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
            placeholder="Lire demain, courir tous les lundis…"
            disabled={busy || !!task?.archived_at}
          />
        </label>
        {!task?.archived_at && (
          <ScheduleRecognition recognition={recognition} />
        )}
        <SchedulePicker
          value={displayedSchedule}
          disabled={busy || !!task?.archived_at}
          completed={task?.recurrence_completed ?? 0}
          onEditingChange={setScheduleOpen}
          onChange={(value) => {
            recognition.dismiss();
            if (recognition.suggestion) setTitle(recognition.suggestion.title);
            setSchedule(value);
          }}
        />
        {task?.recurrence && (
          <p className="field-help">
            {task.recurrence_completed} occurrence
            {task.recurrence_completed > 1 ? "s" : ""} terminée
            {task.recurrence_completed > 1 ? "s" : ""}
            {task.recurrence.max_occurrences
              ? ` sur ${task.recurrence.max_occurrences}`
              : ""}
            . Modifier la règle recommence ce compteur ; l’historique reste
            conservé.
          </p>
        )}
        <label>
          Description
          <textarea
            name="description"
            rows={4}
            maxLength={20000}
            defaultValue={task?.description}
            placeholder="Quelques détails pour y voir plus clair…"
            disabled={!!task?.archived_at}
          />
        </label>
        <div className="form-grid">
          <label>
            Section
            <select
              name="section_id"
              defaultValue={task?.section_id ?? initialSection ?? ""}
              disabled={!!task?.archived_at}
            >
              <option value="">Sans section</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Statut
            <select
              name="status_id"
              defaultValue={
                task?.status_id ??
                initialStatus ??
                statuses.find((status) => !status.is_completed)?.id
              }
              disabled={!!task?.archived_at}
            >
              {statuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priorité
            <select
              name="priority"
              defaultValue={task?.priority ?? 4}
              disabled={!!task?.archived_at}
            >
              <option value={1}>P1 · Urgente</option>
              <option value={2}>P2 · Haute</option>
              <option value={3}>P3 · Normale</option>
              <option value={4}>P4 · Aucune</option>
            </select>
          </label>
        </div>
        {labels.length > 0 && (
          <fieldset className="label-fieldset">
            <legend>Étiquettes</legend>
            <div className="label-picker">
              {labels.map((label) => (
                <label key={label.id} className="label-choice">
                  <input
                    type="checkbox"
                    checked={selectedLabels.includes(label.id)}
                    disabled={!!task?.archived_at}
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
        {conflict && (
          <button
            type="button"
            className="secondary-button"
            onClick={reload}
            disabled={busy}
          >
            Recharger la tâche enregistrée
          </button>
        )}
        <div className="dialog-actions">
          {task && (
            <button
              type="button"
              className="text-button danger"
              disabled={busy}
              onClick={archive}
            >
              <Icon name={task.archived_at ? "restore" : "archive"} />
              {task.archived_at ? "Restaurer" : "Archiver"}
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="secondary-button" onClick={onClose}>
            Annuler
          </button>
          {!task?.archived_at && (
            <button
              className="primary-button"
              disabled={busy || scheduleOpen}
              title={
                scheduleOpen
                  ? "Choisissez une date, appliquez la récurrence ou refermez le calendrier."
                  : undefined
              }
            >
              {busy
                ? "Enregistrement…"
                : task
                  ? "Enregistrer"
                  : "Ajouter la tâche"}
            </button>
          )}
        </div>
      </form>
      {task && (
        <div className="task-history">
          <div className="history-toolbar">
            <button
              className="text-button"
              onClick={loadHistory}
              disabled={busy || historyTotal !== null}
            >
              <Icon name="restore" />
              Historique
            </button>
            {!task.archived_at && (
              <button className="text-button" onClick={() => onMove(task)}>
                <Icon name="arrow" />
                Déplacer et réordonner
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
                        ? "Occurrence terminée"
                        : (eventNames[event.kind] ?? event.kind)}
                    </strong>
                    <span>
                      {event.context.after.workspace_name} ·{" "}
                      {event.context.after.section_name ?? "Sans section"} ·{" "}
                      {event.context.after.status_name}
                    </span>
                    {event.context.after.due_date &&
                      [
                        "completed",
                        "rescheduled",
                        "completion_undone",
                      ].includes(event.kind) && (
                        <span>
                          Échéance du{" "}
                          {new Date(
                            `${event.context.after.due_date}T12:00:00`,
                          ).toLocaleDateString("fr-FR")}
                        </span>
                      )}
                  </div>
                  <time dateTime={event.occurred_at}>
                    {new Date(event.occurred_at).toLocaleString("fr-FR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </time>
                </li>
              ))}
            </ol>
          )}
          {historyTotal !== null && events.length < historyTotal && (
            <button
              className="text-button"
              onClick={loadHistory}
              disabled={busy}
            >
              Charger la suite
            </button>
          )}
          <p className="muted small-text">
            Créée le {new Date(task.created_at).toLocaleString("fr-FR")}
          </p>
        </div>
      )}
    </Dialog>
  );
}
