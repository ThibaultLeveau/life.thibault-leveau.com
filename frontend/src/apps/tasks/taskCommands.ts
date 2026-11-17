import { tr } from "./i18n";
import type { IconName } from "../../shared/ui/Icon";
export type BulkAction =
  | "reschedule"
  | "move"
  | "archive"
  | "restore"
  | "complete"
  | "reopen"
  | "duplicate"
  | "priority"
  | "status"
  | "labels";
export type TaskAction = BulkAction | "edit" | "select";
export const actionIcon: Record<TaskAction, IconName> = {
  edit: "edit",
  select: "select",
  reschedule: "calendar",
  move: "folder",
  archive: "archive",
  restore: "restore",
  complete: "check",
  reopen: "restore",
  duplicate: "copy",
  priority: "flag",
  status: "board",
  labels: "label",
};
export const actionLabel = (action: TaskAction) =>
  tr(action === "reschedule" ? "reschedule" : action);
