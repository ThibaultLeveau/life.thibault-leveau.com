export interface Quest {
  id: string;
  name: string;
  description: string;
  category: string;
  target: number;
  progress: number;
  xp: number;
  earned_at: string | null;
  ratio: number;
}
export interface Title {
  level: number;
  name: string;
  xp: number;
  earned: boolean;
}
export interface Progression {
  application_id: string;
  name: string;
  icon: string;
  xp: number;
  level: number;
  title: string;
  level_xp: number;
  next_level_xp: number | null;
  level_progress: number;
  titles: Title[];
  streak: number;
  best_streak: number;
  next_streak: number | null;
  active_days: number;
  today_active: boolean;
  paused_today: boolean;
  exclude_weekends: boolean;
  timezone: string;
  quests_earned: number;
  quests_total: number;
  closest: Quest[];
  base_xp: number;
  rules: string;
}
export interface Vacation {
  start: string;
  end: string;
}
export interface ProgressionSettings {
  timezone: string;
  exclude_weekends: Record<string, boolean>;
  vacations: Vacation[];
  version: number;
}
export interface Reward {
  id: string;
  kind: "activity" | "quest";
  label: string;
  xp: number;
  occurred_at: string;
  recorded_at: string;
  imported: boolean;
}
export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}
