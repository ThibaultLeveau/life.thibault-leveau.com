import type {
  DynamicSource,
  Frequency,
  Snapshot,
} from "../../platform/integrations/types";
export type {
  Aggregation,
  DynamicSource,
  Evaluation,
  Filter,
  Frequency,
  Metric,
  MetricValue,
  Option,
  Snapshot,
  Source,
} from "../../platform/integrations/types";
export type Value = number | boolean | string | null;
export interface Goal {
  mode: "at_least" | "at_most" | "between" | "equals";
  target: number | boolean | string;
  upper: number | null;
  tolerance: number;
}
export interface TrackingField {
  id: string;
  label: string;
  kind: "number" | "boolean" | "duration" | "scale" | "choice" | "note";
  unit: string;
  required: boolean;
  weekdays: number[];
  minimum: number;
  maximum: number;
  options: string[];
  goal: Goal | null;
  weight: number;
  source: DynamicSource | null;
}
export interface TrackerInput {
  name: string;
  description: string;
  frequency: Frequency;
  timezone: string;
  start_date: string;
  color: string;
  fields: TrackingField[];
}
export interface Tracker extends TrackerInput {
  id: string;
  version: number;
  position: number;
  archived_at: string | null;
  effective_from: string;
  created_at: string;
}
export interface Entry {
  id: string;
  tracker_id: string;
  period_start: string;
  period_end: string;
  definition: TrackerInput;
  values: Record<string, Value>;
  sources: Record<string, Snapshot>;
  version: number;
  status: "draft" | "complete";
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  score: number | null;
  filled: number;
  expected: number;
  xp: number;
}
export interface Occurrence {
  tracker_id: string;
  definition: TrackerInput;
  period_start: string;
  period_end: string;
  fields: TrackingField[];
  entry: Entry | null;
  sources: Record<string, Snapshot>;
}
export interface Day {
  date: string;
  state: "rest" | "future" | "missing" | "partial" | "complete";
  completed: number;
  expected: number;
  filled: number;
  fields: number;
  score: number | null;
}
export interface TrackingCalendar {
  since: string;
  until: string;
  today: string;
  days: Day[];
  periods: Occurrence[];
}
export interface Achievements {
  xp: number;
  level: number;
  next_level_xp: number;
  completed_periods: number;
  perfect_periods: number;
  streak: number;
  best_streak: number;
  badges: {
    id: string;
    name: string;
    description: string;
    progress: number;
    target: number;
    earned: boolean;
  }[];
}
export interface Statistics {
  calendar: TrackingCalendar;
  completion_rate: number | null;
  average_score: number | null;
  achievements: Achievements;
  trends: {
    field_id: string;
    points: { date: string; value: Value; label: string; unit: string }[];
  }[];
}
