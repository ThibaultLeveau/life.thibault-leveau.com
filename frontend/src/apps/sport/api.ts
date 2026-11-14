import { api } from "../../platform/api";
import type {
  ExercisePage,
  KindDefinition,
  Measurement,
  SessionPage,
  Statistics,
  Training,
  Workout,
} from "./types";
export const sportApi = {
  kinds: (signal?: AbortSignal) =>
    api<KindDefinition[]>("/sport/kinds", "GET", undefined, signal),
  exercises: (query = "", signal?: AbortSignal) =>
    api<ExercisePage>(`/sport/exercises?${query}`, "GET", undefined, signal),
  workouts: (archived = false, signal?: AbortSignal) =>
    api<Workout[]>(
      `/sport/workouts?archived=${archived}`,
      "GET",
      undefined,
      signal,
    ),
  active: (signal?: AbortSignal) =>
    api<Training | null>("/sport/sessions/active", "GET", undefined, signal),
  session: (id: string, signal?: AbortSignal) =>
    api<Training>(`/sport/sessions/${id}`, "GET", undefined, signal),
  sessions: (offset = 0, signal?: AbortSignal) =>
    api<SessionPage>(
      `/sport/sessions?offset=${offset}`,
      "GET",
      undefined,
      signal,
    ),
  measurements: (archived = false, signal?: AbortSignal) =>
    api<Measurement[]>(
      `/sport/measurements?archived=${archived}`,
      "GET",
      undefined,
      signal,
    ),
  statistics: (since: string, until: string, signal?: AbortSignal) =>
    api<Statistics>(
      `/sport/statistics?since=${since}&until=${until}`,
      "GET",
      undefined,
      signal,
    ),
  settings: (signal?: AbortSignal) =>
    api<{ rest_seconds: number }>("/sport/settings", "GET", undefined, signal),
  write: <T>(path: string, body: unknown, method = "PUT") =>
    api<T>(`/sport${path}`, method, body),
};
