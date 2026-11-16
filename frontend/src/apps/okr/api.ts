import { api } from "../../platform/api";
import type {
  AchievementPage,
  Objective,
  ObjectiveInput,
  OkrEvent,
  Settings,
  Status,
} from "./types";
export const okrApi = {
  objectives: (archived = false, signal?: AbortSignal) =>
    api<Objective[]>(
      `/okr/objectives?archived=${archived}`,
      "GET",
      undefined,
      signal,
    ),
  create: (input: ObjectiveInput) =>
    api<Objective>("/okr/objectives", "POST", input),
  update: (o: Objective, input: ObjectiveInput) =>
    api<Objective>(`/okr/objectives/${o.id}`, "PUT", {
      ...input,
      expected_version: o.version,
    }),
  move: (o: Objective, status: Status, position = 10000) =>
    api<Objective>(`/okr/objectives/${o.id}/move`, "PUT", {
      status,
      position,
      expected_version: o.version,
    }),
  archive: (o: Objective, archived: boolean) =>
    api<Objective>(`/okr/objectives/${o.id}/archive`, "PUT", {
      archived,
      expected_version: o.version,
    }),
  checkIn: (o: Objective, id: string, value: number, note: string) =>
    api<Objective>(`/okr/objectives/${o.id}/key-results/${id}`, "PUT", {
      value,
      note,
      expected_version: o.version,
    }),
  history: (id: string, offset: number, signal?: AbortSignal) =>
    api<OkrEvent[]>(
      `/okr/objectives/${id}/history?offset=${offset}`,
      "GET",
      undefined,
      signal,
    ),
  achievements: (quarter: string, offset: number, signal?: AbortSignal) =>
    api<AchievementPage>(
      `/okr/achievements?quarter=${quarter}&offset=${offset}`,
      "GET",
      undefined,
      signal,
    ),
  settings: (signal?: AbortSignal) =>
    api<Settings>("/okr/settings", "GET", undefined, signal),
  saveSettings: (settings: Settings, timezone: string) =>
    api<Settings>("/okr/settings", "PUT", {
      timezone,
      expected_version: settings.version,
    }),
};
