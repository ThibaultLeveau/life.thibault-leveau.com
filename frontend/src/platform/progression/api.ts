import { api } from "../api";
import type {
  Page,
  Progression,
  ProgressionSettings,
  Quest,
  Reward,
} from "./types";
export const progressionApi = {
  all: (signal?: AbortSignal) =>
    api<Progression[]>("/progression", "GET", undefined, signal),
  summary: (id: string, signal?: AbortSignal) =>
    api<Progression>(`/progression/${id}`, "GET", undefined, signal),
  quests: (
    id: string,
    state: string,
    q: string,
    offset: number,
    signal?: AbortSignal,
  ) =>
    api<Page<Quest>>(
      `/progression/${id}/quests?${new URLSearchParams({ state, q, offset: String(offset), limit: "60" })}`,
      "GET",
      undefined,
      signal,
    ),
  history: (id: string, offset: number, signal?: AbortSignal) =>
    api<Page<Reward>>(
      `/progression/${id}/history?offset=${offset}&limit=20`,
      "GET",
      undefined,
      signal,
    ),
  settings: (signal?: AbortSignal) =>
    api<ProgressionSettings>("/progression/settings", "GET", undefined, signal),
  saveSettings: ({ version, ...settings }: ProgressionSettings) =>
    api<ProgressionSettings>("/progression/settings", "PUT", {
      ...settings,
      expected_version: version,
    }),
};
