import { useEffect, useState, type FormEvent } from "react";
import { allTasks, api } from "../api";
import {
  defaultView,
  type Section,
  type Status,
  type Task,
  type Workspace,
} from "../types";
import { Dialog, ErrorMessage } from "./Dialog";

export function MoveDialog({
  task,
  workspaces,
  onClose,
  onSaved,
}: {
  task: Task;
  workspaces: Workspace[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [spaceId, setSpaceId] = useState(task.workspace_id);
  const [sections, setSections] = useState<Section[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sectionId, setSectionId] = useState(task.section_id ?? "");
  const [statusId, setStatusId] = useState(task.status_id);
  const [beforeId, setBeforeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      api<Section[]>(
        `/workspaces/${spaceId}/sections`,
        "GET",
        undefined,
        controller.signal,
      ),
      api<Status[]>(
        `/workspaces/${spaceId}/statuses`,
        "GET",
        undefined,
        controller.signal,
      ),
      allTasks(spaceId, defaultView, false, controller.signal),
    ])
      .then(([sections, statuses, page]) => {
        setSections(sections);
        setStatuses(statuses);
        setTasks(page.items);
        setSectionId(
          spaceId === task.workspace_id ? (task.section_id ?? "") : "",
        );
        setStatusId(
          spaceId === task.workspace_id
            ? task.status_id
            : statuses.find(
                (status) => status.is_completed === !!task.completed_at,
              )!.id,
        );
        setBeforeId("");
        setLoading(false);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setError(error.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [spaceId, task]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/tasks/${task.id}/move`, "POST", {
        expected_version: task.version,
        workspace_id: spaceId,
        section_id: sectionId || null,
        status_id: statusId,
        before_id: beforeId || null,
      });
      onSaved();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Déplacer la tâche" onClose={onClose}>
      <form className="stack-form dialog-body" onSubmit={submit}>
        <p className="move-task-title">{task.title}</p>
        <label>
          Espace
          <select
            value={spaceId}
            onChange={(event) => setSpaceId(event.target.value)}
          >
            {workspaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            Section
            <select
              value={sectionId}
              disabled={loading}
              onChange={(event) => {
                setSectionId(event.target.value);
                setBeforeId("");
              }}
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
              value={statusId}
              disabled={loading}
              onChange={(event) => setStatusId(event.target.value)}
            >
              {statuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Position
          <select
            value={beforeId}
            disabled={loading}
            onChange={(event) => setBeforeId(event.target.value)}
          >
            <option value="">En fin de liste</option>
            {tasks
              .filter(
                (item) =>
                  item.id !== task.id && (item.section_id ?? "") === sectionId,
              )
              .map((item) => (
                <option key={item.id} value={item.id}>
                  Avant : {item.title}
                </option>
              ))}
          </select>
        </label>
        {spaceId !== task.workspace_id && (
          <p className="muted small-text">
            Les étiquettes seront reprises dans l’espace choisi.
          </p>
        )}
        <ErrorMessage message={error} />
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Annuler
          </button>
          <button
            className="primary-button"
            disabled={loading || busy || !statusId}
          >
            {busy ? "Déplacement…" : "Déplacer"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
