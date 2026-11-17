import { api } from "../../platform/api";
import type {
  ExercisePage,
  Exercise,
  ExerciseFilters,
  SportSettings,
  KindDefinition,
  Measurement,
  SessionPage,
  Statistics,
  Training,
  Workout,
} from "./types";
export const sportApi = {
  exercise: (id: string, signal?: AbortSignal) =>
    api<Exercise>(
      `/sport/exercises/${encodeURIComponent(id)}`,
      "GET",
      undefined,
      signal,
    ),
  exerciseFilters: (query = "", signal?: AbortSignal) =>
    api<ExerciseFilters>(
      `/sport/exercises/filters?${query}`,
      "GET",
      undefined,
      signal,
    ),
  measurement: (id: string, signal?: AbortSignal) =>
    api<Measurement>(`/sport/measurements/${id}`, "GET", undefined, signal),
  sessionNavigation: (id: string, query = "", signal?: AbortSignal) =>
    api<{ newer_id: string | null; older_id: string | null }>(
      `/sport/sessions/${id}/navigation?${query}`,
      "GET",
      undefined,
      signal,
    ),
  kinds: (signal?: AbortSignal) =>
    api<KindDefinition[]>("/sport/kinds", "GET", undefined, signal),
  exercises: (query = "", signal?: AbortSignal) =>
    api<ExercisePage>(`/sport/exercises?${query}`, "GET", undefined, signal),
  workouts: (archived = false, signal?: AbortSignal, query = "") =>
    api<Workout[]>(
      `/sport/workouts?archived=${archived}&${query}`,
      "GET",
      undefined,
      signal,
    ),
  workout: (id: string, signal?: AbortSignal) =>
    api<Workout>(
      `/sport/workouts/${encodeURIComponent(id)}`,
      "GET",
      undefined,
      signal,
    ),
  active: (signal?: AbortSignal) =>
    api<Training | null>("/sport/sessions/active", "GET", undefined, signal),
  session: (id: string, signal?: AbortSignal) =>
    api<Training>(`/sport/sessions/${id}`, "GET", undefined, signal),
  sessions: (offset = 0, signal?: AbortSignal, query = "") =>
    api<SessionPage>(
      `/sport/sessions?offset=${offset}&${query}`,
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
  statistics: (
    since: string,
    until: string,
    signal?: AbortSignal,
    query = "",
  ) =>
    api<Statistics>(
      `/sport/statistics?since=${since}&until=${until}&${query}`,
      "GET",
      undefined,
      signal,
    ),
  settings: (signal?: AbortSignal) =>
    api<SportSettings>("/sport/settings", "GET", undefined, signal),
  write: <T>(path: string, body: unknown, method = "PUT") =>
    api<T>(`/sport${path}`, method, body),
};
