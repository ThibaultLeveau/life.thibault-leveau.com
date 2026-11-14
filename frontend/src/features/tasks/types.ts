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
  parent_id: string | null;
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
  recurrence: Recurrence | null;
  recurrence_completed: number;
  label_ids: string[];
  position: number;
  version: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  archived_at: string | null;
}
export interface Recurrence {
  rrule: string;
  start_date: string;
  timezone: string;
  mode: "scheduled" | "completion";
  end_date: string | null;
  max_occurrences: number | null;
  excluded_dates: string[];
}
export interface Schedule {
  due_date: string | null;
  recurrence: Recurrence | null;
}
export interface ScheduleSuggestion extends Schedule {
  status: "none" | "recognized" | "incomplete" | "invalid";
  diagnostic: string | null;
  title: string;
  matched_text: string | null;
  start: number | null;
  end: number | null;
  label: string | null;
  dates: string[];
}
export interface SchedulePreview {
  label: string;
  dates: string[];
  explanation: string;
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
  due_date?: string | null;
  recurrence?: Recurrence | null;
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

export interface AgendaSettings {
  period: "today" | "tomorrow" | "week" | "custom";
  custom_days: number;
  include_overdue: boolean;
  show_completed: boolean;
}
export interface AgendaPage extends Page<Task> {
  today: string;
  start_date: string;
  end_date: string;
}
