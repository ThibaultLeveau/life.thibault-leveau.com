import { api } from "../../platform/api";
import type {
  Achievements,
  Entry,
  Occurrence,
  Statistics,
  Tracker,
  TrackerInput,
  TrackingCalendar,
  Value,
} from "./types";
export const trackingApi = {
  trackers: (archived = false, signal?: AbortSignal) =>
    api<Tracker[]>(
      `/tracking/trackers?archived=${archived}`,
      "GET",
      undefined,
      signal,
    ),
  tracker: (id: string, signal?: AbortSignal) =>
    api<Tracker>(`/tracking/trackers/${id}`, "GET", undefined, signal),
  saveTracker: (value: TrackerInput, id?: string, version?: number) =>
    api<Tracker>(
      `/tracking/trackers${id ? `/${id}` : ""}`,
      id ? "PUT" : "POST",
      id ? { ...value, expected_version: version } : value,
    ),
  archive: (t: Tracker, archived: boolean) =>
    api<Tracker>(`/tracking/trackers/${t.id}/archive`, "PUT", {
      archived,
      expected_version: t.version,
    }),
  order: (ids: string[]) =>
    api<Tracker[]>("/tracking/trackers/order", "PUT", { ids }),
  settings: (signal?: AbortSignal) =>
    api<{ timezone: string }>("/tracking/settings", "GET", undefined, signal),
  saveSettings: (timezone: string) =>
    api<{ timezone: string }>("/tracking/settings", "PUT", { timezone }),
  current: (day?: string, signal?: AbortSignal, archived = false) =>
    api<Occurrence[]>(
      `/tracking/current?include_archived=${archived}${day ? `&day=${day}` : ""}`,
      "GET",
      undefined,
      signal,
    ),
  calendar: (
    since: string,
    until: string,
    tracker: string,
    signal?: AbortSignal,
  ) =>
    api<TrackingCalendar>(
      `/tracking/calendar?since=${since}&until=${until}${tracker ? `&tracker_id=${tracker}` : ""}`,
      "GET",
      undefined,
      signal,
    ),
  statistics: (
    since: string,
    until: string,
    tracker: string,
    signal?: AbortSignal,
  ) =>
    api<Statistics>(
      `/tracking/statistics?since=${since}&until=${until}${tracker ? `&tracker_id=${tracker}` : ""}`,
      "GET",
      undefined,
      signal,
    ),
  achievements: (signal?: AbortSignal) =>
    api<Achievements>("/tracking/achievements", "GET", undefined, signal),
  preview: (id: string, day: string, signal?: AbortSignal) =>
    api<Occurrence>(
      `/tracking/trackers/${id}/entries/${day}/preview`,
      "POST",
      {},
      signal,
    ),
  saveEntry: (
    id: string,
    day: string,
    values: Record<string, Value>,
    version: number,
    complete: boolean,
    refresh: boolean,
  ) =>
    api<Entry>(`/tracking/trackers/${id}/entries/${day}`, "PUT", {
      values,
      expected_version: version,
      complete,
      refresh_sources: refresh,
    }),
  history: (id: string, day: string, signal?: AbortSignal, offset = 0) =>
    api<{ version: number; recorded_at: string; snapshot: Entry }[]>(
      `/tracking/trackers/${id}/entries/${day}/history?offset=${offset}`,
      "GET",
      undefined,
      signal,
    ),
};
export { integrationApi, evaluation } from "../../platform/integrations/api";
