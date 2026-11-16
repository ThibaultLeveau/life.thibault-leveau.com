export type Frequency = "daily" | "weekly" | "monthly" | "yearly";
export type Aggregation =
  | "count"
  | "sum"
  | "average"
  | "min"
  | "max"
  | "latest"
  | "change";
export interface Option {
  id: string;
  label: string;
}
export interface Filter {
  id: string;
  label: string;
  kind: "options" | "select" | "number" | "boolean";
  options: Option[];
  minimum: number;
  maximum: number;
}
export interface Metric {
  id: string;
  label: string;
  description: string;
  unit: string;
  temporal: "events" | "current";
  aggregations: Aggregation[];
  filters: Filter[];
}
export interface Source {
  id: string;
  name: string;
  enabled: boolean;
  metrics: Metric[];
}
export interface DynamicSource {
  application_id: string;
  metric_id: string;
  aggregation: Aggregation;
  filters: Record<string, string | boolean | number>;
  period: "tracking" | Frequency;
}
export interface Evaluation extends Omit<DynamicSource, "period"> {
  since: string;
  until: string;
  timezone: string;
}
export interface MetricValue {
  value: number | null;
  state: "ok" | "missing" | "unavailable";
  unit: string;
  observed_at: string;
  sample_count: number;
  message: string;
}
export interface Snapshot {
  query: Evaluation;
  result: MetricValue;
}
