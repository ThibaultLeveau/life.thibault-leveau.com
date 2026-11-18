import { api } from "../api";
import type { AssistantSettings, Provider } from "./types";
const root = "/assistant/provider-settings";
export const providerApi = {
  settings: (signal?: AbortSignal) =>
    api<AssistantSettings>(root, "GET", undefined, signal),
  saveSettings: (value: {
    provider?: Provider;
    model?: string;
    api_token?: string | null;
  }) => api<AssistantSettings>(root, "PUT", value),
  test: () => api<{ ok: boolean }>(`${root}/test`, "POST"),
};
