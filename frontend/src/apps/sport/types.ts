export type Kind =
  | "weight_reps"
  | "reps"
  | "assisted_reps"
  | "duration"
  | "distance_duration"
  | "weight_distance"
  | "weight_duration"
  | "reps_duration"
  | "distance"
  | "calories_duration";
export type Values = Partial<
  Record<
    | "weight_kg"
    | "reps"
    | "assistance_kg"
    | "duration_seconds"
    | "distance_m"
    | "calories",
    number | null
  >
>;
export interface KindDefinition {
  id: Kind;
  name: string;
  fields: {
    key: keyof Values;
    label: string;
    unit: string;
    minimum: number;
    maximum: number;
    step: number;
  }[];
  metric: string;
  metric_unit: string;
}
export interface Exercise {
  id: string;
  name: string;
  kind: Kind;
  muscle_group: string;
  equipment: string;
  notes: string;
  builtin: boolean;
  aliases: string[];
  version: number;
  archived_at: string | null;
}
export interface ExercisePage {
  items: Exercise[];
  total: number;
  offset: number;
  limit: number;
}
export interface Entry {
  exercise_id: string;
  name: string;
  kind: Kind;
  sets: number;
  target: Values;
}
export interface Workout {
  id: string;
  name: string;
  notes: string;
  entries: Entry[];
  version: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface SetRecord {
  entry_index: number;
  set_index: number;
  values: Values;
  completed_at: string;
}
export interface Metric {
  exercise_id: string;
  name: string;
  kind: Kind;
  value: number;
  unit: string;
  volume_kg: number;
  reps: number;
  distance_m: number;
  duration_seconds: number;
}
export interface Training {
  id: string;
  workout_id: string;
  name: string;
  entries: Entry[];
  sets: SetRecord[];
  status: "active" | "completed" | "cancelled";
  version: number;
  started_at: string;
  finished_at: string | null;
  rest_until: string | null;
  notes: string;
  score: number | null;
  baseline_id: string | null;
  metrics: Metric[];
  server_now: string;
}
export interface SessionPage {
  items: Training[];
  total: number;
  offset: number;
  limit: number;
}
export const measureFields = [
  ["weight_kg", "Poids", "kg"],
  ["body_fat_pct", "Masse grasse", "%"],
  ["neck_cm", "Cou", "cm"],
  ["shoulders_cm", "Épaules", "cm"],
  ["chest_cm", "Poitrine", "cm"],
  ["waist_cm", "Taille", "cm"],
  ["hips_cm", "Hanches", "cm"],
  ["arm_left_cm", "Bras gauche", "cm"],
  ["arm_right_cm", "Bras droit", "cm"],
  ["thigh_left_cm", "Cuisse gauche", "cm"],
  ["thigh_right_cm", "Cuisse droite", "cm"],
  ["calf_left_cm", "Mollet gauche", "cm"],
  ["calf_right_cm", "Mollet droit", "cm"],
] as const;
export type MeasureKey = (typeof measureFields)[number][0];
export type MeasureValues = Partial<Record<MeasureKey, number | null>>;
export interface Measurement extends MeasureValues {
  id: string;
  measured_on: string;
  notes: string;
  version: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface Statistics {
  completed_sessions: number;
  total_sets: number;
  total_volume_kg: number;
  total_distance_m: number;
  sessions: Training[];
  measurements: Measurement[];
  since: string;
  until: string;
}
