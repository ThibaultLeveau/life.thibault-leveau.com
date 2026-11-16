import { api } from "../api";
import type {
  DynamicSource,
  Evaluation,
  Option,
  Snapshot,
  Source,
} from "./types";
export const integrationApi = {
  sources: (signal?: AbortSignal) =>
    api<Source[]>("/integrations", "GET", undefined, signal),
  options: (
    app: string,
    filter: string,
    q: string,
    offset = 0,
    signal?: AbortSignal,
  ) =>
    api<{ items: Option[]; total: number }>(
      `/integrations/${app}/options/${filter}?q=${encodeURIComponent(q)}&offset=${offset}`,
      "GET",
      undefined,
      signal,
    ),
  evaluate: (value: Evaluation, signal?: AbortSignal) =>
    api<Snapshot>("/integrations/evaluate", "POST", value, signal),
};
export function evaluation(
  source: DynamicSource,
  since: string,
  until: string,
  timezone: string,
): Evaluation {
  const { period: _period, ...query } = source;
  return { ...query, since, until, timezone };
}
