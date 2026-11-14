import { api } from "../api";
import type { Application } from "./types";

export const getApplications = (signal?: AbortSignal) =>
  api<Application[]>("/applications", "GET", undefined, signal);
export const setApplication = (id: string, enabled: boolean) =>
  api<Application>(`/applications/${encodeURIComponent(id)}`, "PUT", {
    enabled,
  });
