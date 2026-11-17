import { tr } from "../i18n";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../../platform/api";
import { useTaskSync } from "../useTaskSync";
import { allTasks } from "../api";
import {
  defaultView,
  type Section,
  type Status,
  type Task,
  type Workspace,
} from "../types";
import { workspaceTree } from "../workspaceTree";
import { Dialog, ErrorMessage } from "../../../shared/ui/Dialog";

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
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const sync = useTaskSync();
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
        if (controller.signal.aborted) return;
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
  }, [spaceId, task, attempt]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (loading || error) return;
    sync.mutate(
      `/tasks/${task.id}/move`,
      "POST",
      {
        expected_version: task.version,
        workspace_id: spaceId,
        section_id: sectionId || null,
        status_id: statusId,
        before_id: beforeId || null,
      },
      { message: tr("task_moved") },
    );
    onSaved();
  }

  return (
    <Dialog title={tr("move_task")} onClose={onClose}>
      <form className="stack-form dialog-body" onSubmit={submit}>
        <p className="move-task-title">{task.title}</p>
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
        <div className="form-grid">
          <label>
            {tr("section")}
            <select
              value={sectionId}
              disabled={loading}
              onChange={(event) => {
                setSectionId(event.target.value);
                setBeforeId("");
              }}
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
          {tr("position")}
          <select
            value={beforeId}
            disabled={loading}
            onChange={(event) => setBeforeId(event.target.value)}
          >
            <option value="">{tr("end_of_list")}</option>
            {tasks
              .filter(
                (item) =>
                  item.id !== task.id && (item.section_id ?? "") === sectionId,
              )
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {tr("before")} {item.title}
                </option>
              ))}
          </select>
        </label>
        {spaceId !== task.workspace_id && (
          <p className="muted small-text">
            {tr("labels_will_be_carried_over_to_the_selected_workspace")}
          </p>
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
            className="primary-button"
            disabled={loading || !!error || !statusId}
          >
            {tr("move")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
