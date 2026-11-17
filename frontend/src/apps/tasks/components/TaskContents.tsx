import { tr } from "../i18n";
import type { ReactNode } from "react";
import { relativeDate } from "../dates";
import type { Label, Status, Task } from "../types";
import { Icon } from "../../../shared/ui/Icon";
import { shortRecurrence } from "../scheduling";
import { useTaskActions } from "./TaskActions";

import { useTaskSync } from "../useTaskSync";

export function TaskContents({
  task,
  today,
  labels,
  busy,
  onOpen,
  onComplete,
  context,
  status,
  archived = false,
}: {
  task: Task;
  today: string;
  labels: Label[];
  busy: boolean;
  onOpen: () => void;
  onComplete: () => void;
  context?: ReactNode;
  status?: Status;
  archived?: boolean;
}) {
  const actions = useTaskActions();
  const sync = useTaskSync();
  status ??= sync.data?.statuses.find((status) => status.id === task.status_id);
  const flashing = sync.flashes.has(task.id);
  const selecting = actions?.selecting ?? false;
  const selected = actions?.selected.has(task.id) ?? false;
  const completed = !!task.completed_at;
  const date = task.due_date ? relativeDate(task.due_date, today) : null;
  return (
    <>
      <button
        role="checkbox"
        aria-checked={selecting ? selected : completed}
        className={
          selecting
            ? "task-checkbox task-select"
            : `task-checkbox priority-${task.priority} ${flashing ? "is-validating" : ""}`
        }
        onClick={(event) =>
          selecting ? actions?.toggle(task.id, event.shiftKey) : onComplete()
        }
        aria-label={tr("action_named", {
          action: selecting
            ? selected
              ? tr("deselect")
              : tr("select")
            : completed
              ? tr("reopen")
              : tr("complete"),
          name: task.title,
        })}
        disabled={busy || actions?.busy || (archived && !selecting)}
      >
        {(selecting ? selected : completed || flashing) && (
          <Icon name="check" size={13} />
        )}
      </button>
      <div className="task-content">
        <button
          className="task-title"
          onClick={onOpen}
          disabled={busy || actions?.busy}
        >
          {task.title}
        </button>
        {task.description && (
          <p className="task-description">{task.description}</p>
        )}
        {(date ||
          task.priority < 4 ||
          task.label_ids.length > 0 ||
          status ||
          context) && (
          <div className="task-meta">
            {date && (
              <button
                type="button"
                disabled={archived}
                onClick={() => actions?.action("reschedule", task)}
                title={date.full}
                aria-label={tr("due_label", {
                  date: date.full,
                  overdue:
                    !completed && date.tone === "overdue"
                      ? tr("overdue_suffix")
                      : "",
                })}
                className={`task-date is-${completed ? "completed" : date.tone}`}
              >
                <time
                  dateTime={task.due_date!}
                  className={`task-date is-${completed ? "completed" : date.tone}`}
                  title={date.full}
                >
                  <Icon
                    name={task.recurrence ? "repeat" : "calendar"}
                    size={13}
                  />
                  {date.label}
                  {!completed && date.tone === "overdue" && (
                    <span> {tr("overdue_annotation")}</span>
                  )}
                </time>
              </button>
            )}
            {task.recurrence && (
              <span
                className="task-recurrence"
                title={shortRecurrence(task.recurrence)}
                aria-label={tr("recurrence_label", {
                  rule: shortRecurrence(task.recurrence),
                })}
              >
                {shortRecurrence(task.recurrence)}
              </span>
            )}
            {task.priority < 4 && (
              <button
                type="button"
                disabled={archived}
                onClick={() => actions?.action("priority", task)}
                className={`task-priority priority-${task.priority}`}
                aria-label={`${tr("priority")} ${task.priority}`}
              >
                <Icon name="flag" size={12} />P{task.priority}
              </button>
            )}
            {labels
              .filter((label) => task.label_ids.includes(label.id))
              .map((label) => (
                <button
                  type="button"
                  disabled={archived}
                  onClick={() => actions?.action("labels", task)}
                  className="task-label"
                  key={label.id}
                >
                  <span
                    className="color-dot"
                    style={{ background: label.color }}
                  />
                  {label.name}
                </button>
              ))}
            {status && (
              <button
                type="button"
                className="task-status"
                disabled={archived}
                onClick={() => actions?.action("status", task)}
              >
                <span
                  className="color-dot"
                  style={{ background: status.color }}
                />
                {status.name}
              </button>
            )}
            {context}
          </div>
        )}
      </div>
      <button
        className="task-more icon-button"
        aria-label={tr("actions_for", { name: task.title })}
        aria-haspopup="menu"
        aria-expanded={actions?.menuId === task.id}
        disabled={busy || actions?.busy}
        onClick={(event) => actions?.openMenu(task, event)}
      >
        <Icon name="more" size={18} />
      </button>
    </>
  );
}
