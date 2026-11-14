import type { ReactNode } from "react";
import { relativeDate } from "../dates";
import type { Label, Task } from "../types";
import { Icon } from "../../../shared/ui/Icon";
import { shortRecurrence } from "../scheduling";
import { useTaskActions } from "./TaskActions";

export function TaskContents({
  task,
  today,
  labels,
  busy,
  onOpen,
  onComplete,
  context,
}: {
  task: Task;
  today: string;
  labels: Label[];
  busy: boolean;
  onOpen: () => void;
  onComplete: () => void;
  context?: ReactNode;
}) {
  const actions = useTaskActions();
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
            : `task-checkbox priority-${task.priority}`
        }
        onClick={() => (selecting ? actions?.toggle(task.id) : onComplete())}
        aria-label={`${selecting ? (selected ? "Désélectionner" : "Sélectionner") : completed ? "Rouvrir" : "Terminer"} : ${task.title}`}
        disabled={busy || actions?.busy}
      >
        {(selecting ? selected : completed) && (
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
          context) && (
          <div className="task-meta">
            {date && (
              <time
                dateTime={task.due_date!}
                title={date.full}
                aria-label={`Échéance : ${date.full}${!completed && date.tone === "overdue" ? ", en retard" : ""}`}
                className={`task-date is-${completed ? "completed" : date.tone}`}
              >
                <Icon
                  name={task.recurrence ? "repeat" : "calendar"}
                  size={13}
                />
                {date.label}
                {!completed && date.tone === "overdue" && (
                  <span> · En retard</span>
                )}
              </time>
            )}
            {task.recurrence && (
              <span
                className="task-recurrence"
                title={shortRecurrence(task.recurrence)}
                aria-label={`Récurrence : ${shortRecurrence(task.recurrence)}`}
              >
                {shortRecurrence(task.recurrence)}
              </span>
            )}
            {task.priority < 4 && (
              <span className={`task-priority priority-${task.priority}`}>
                <Icon name="flag" size={12} />P{task.priority}
              </span>
            )}
            {labels
              .filter((label) => task.label_ids.includes(label.id))
              .map((label) => (
                <span className="task-label" key={label.id}>
                  <span
                    className="color-dot"
                    style={{ background: label.color }}
                  />
                  {label.name}
                </span>
              ))}
            {context}
          </div>
        )}
      </div>
      <button
        className="task-more icon-button"
        aria-label={`Actions : ${task.title}`}
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
