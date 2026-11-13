export type Theme = "system" | "light" | "dark";
export interface Session {
  user_id: string;
  username: string;
  csrf_token: string;
  expires_at: string;
  theme: Theme;
}
export interface Workspace {
  id: string;
  name: string;
  description: string;
  color: string;
  position: number;
  archived_at: string | null;
  created_at: string;
}
export interface Section {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  color: string;
  position: number;
  visibility: "list" | "board" | "both";
  archived_at: string | null;
}
export interface Status {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  position: number;
  is_completed: boolean;
}
export interface Label {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
}
export interface Task {
  id: string;
  workspace_id: string;
  section_id: string | null;
  status_id: string;
  title: string;
  description: string;
  priority: number;
  due_date: string | null;
  label_ids: string[];
  position: number;
  version: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  archived_at: string | null;
}
export interface ViewSettings {
  layout: "list" | "board";
  density: "comfortable" | "compact";
  show_completed: boolean;
  search: string;
  sort: "manual" | "priority" | "due_date";
  status_id: string | null;
  priority: number | null;
  label_id: string | null;
  due: "all" | "overdue" | "today" | "upcoming" | "none";
}
export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}
export interface TaskEvent {
  id: string;
  kind: string;
  occurred_at: string;
  context: { before: Context | null; after: Context };
  was_completed: boolean;
  is_completed: boolean;
}
interface Context {
  workspace_name: string;
  section_name: string | null;
  status_name: string;
}
export const defaultView: ViewSettings = {
  layout: "list",
  density: "comfortable",
  show_completed: true,
  search: "",
  sort: "manual",
  status_id: null,
  priority: null,
  label_id: null,
  due: "all",
};

export function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T12:00:00`));
}
