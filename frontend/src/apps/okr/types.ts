export const horizons = [
  "ten_year",
  "three_year",
  "annual",
  "quarterly",
] as const;
export const statuses = ["backlog", "in_progress", "done"] as const;
export type Horizon = (typeof horizons)[number];
export type Status = (typeof statuses)[number];
export type Domain = "personal" | "professional";
export interface KeyResult {
  id: string;
  title: string;
  start: number;
  target: number;
  current: number;
  unit: string;
}
export interface ObjectiveInput {
  title: string;
  domain: Domain;
  horizon: Horizon;
  parent_id: string | null;
  why: string;
  outcome: string;
  first_action: string;
  start_date: string | null;
  due_date: string | null;
  key_results: KeyResult[];
}
export interface Objective extends ObjectiveInput {
  id: string;
  version: number;
  status: Status;
  position: number;
  planned_quarter: string | null;
  completed_quarter: string | null;
  progress: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  archived_at: string | null;
}
export interface OkrEvent {
  id: string;
  objective_id: string;
  kind: string;
  occurred_at: string;
  quarter: string;
  snapshot: Objective;
  detail: { note?: string; key_result_id?: string };
}
export interface Achievement extends OkrEvent {
  reopened: boolean;
}
export interface AchievementPage {
  quarter: string;
  quarters: string[];
  items: Achievement[];
  total: number;
}
export interface Settings {
  timezone: string;
  version: number;
  today: string;
  current_quarter: string;
}
export function inputOf(o: Objective): ObjectiveInput {
  const {
    title,
    domain,
    horizon,
    parent_id,
    why,
    outcome,
    first_action,
    start_date,
    due_date,
    key_results,
  } = o;
  return {
    title,
    domain,
    horizon,
    parent_id,
    why,
    outcome,
    first_action,
    start_date,
    due_date,
    key_results,
  };
}
export function resultProgress(k: KeyResult) {
  return Math.max(
    0,
    Math.min(100, (100 * (k.current - k.start)) / (k.target - k.start)),
  );
}
