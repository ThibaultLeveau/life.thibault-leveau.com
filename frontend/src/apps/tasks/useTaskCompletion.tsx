import { useState } from "react";
import type { Task } from "./types";
import { tr } from "./i18n";
import { relativeDate } from "./dates";
import { useTaskSync } from "./useTaskSync";
import { Icon } from "../../shared/ui/Icon";
export function useTaskCompletion(today: string) {
  const sync = useTaskSync();
  const [notice, setNotice] = useState("");
  const [undo, setUndo] = useState<Task | null>(null);
  return {
    notice,
    clear: () => setNotice(""),
    canUndo: !!undo,
    complete: (task: Task) => {
      sync.dismissNotice();
      setNotice("");
      setUndo(null);
      sync.mutate(
        `/tasks/${task.id}/${task.completed_at ? "reopen" : "complete"}`,
        "POST",
        { expected_version: task.version },
        {
          success: (result) => {
            const saved = result as Task;
            setUndo(task.completed_at ? null : saved);
            setNotice(
              task.completed_at
                ? tr("task_reopened")
                : saved.recurrence && !saved.completed_at
                  ? tr("occurrence_next", {
                      date: relativeDate(saved.due_date!, today).full,
                    })
                  : saved.recurrence
                    ? tr("last_occurrence_completed")
                    : tr("task_completed"),
            );
          },
        },
      );
    },
    undo: () => {
      if (undo)
        sync.mutate(
          `/tasks/${undo.id}/undo-complete`,
          "POST",
          { expected_version: undo.version },
          {
            message: tr("completion_undone_the_previous_due_date_is_restored"),
            success: () => {
              setUndo(null);
              setNotice("");
            },
          },
        );
    },
  };
}
export function CompletionNotice({
  completion,
}: {
  completion: ReturnType<typeof useTaskCompletion>;
}) {
  return completion.notice ? (
    <div className="task-feedback-toast" role="status">
      <Icon name="check" />
      <span className="task-feedback-message">{completion.notice}</span>
      {completion.canUndo && (
        <button
          className="text-button task-feedback-undo"
          aria-label={tr("undo_completion")}
          onClick={completion.undo}
        >
          {tr("cancel")}
        </button>
      )}
      <button
        className="icon-button task-feedback-close"
        onClick={completion.clear}
        aria-label={tr("close_message")}
      >
        <Icon name="x" />
      </button>
    </div>
  ) : null;
}
