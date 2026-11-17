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
    <p className="notice task-feedback-toast" role="status">
      <Icon name="check" />
      {completion.notice}
      {completion.canUndo && (
        <button className="text-button" onClick={completion.undo}>
          {tr("undo_completion")}
        </button>
      )}
      <button
        className="icon-button"
        onClick={completion.clear}
        aria-label={tr("close_message")}
      >
        <Icon name="x" />
      </button>
    </p>
  ) : null;
}
