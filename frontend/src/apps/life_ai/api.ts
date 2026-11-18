import { api, apiStream } from "../../platform/api";
import type {
  AssistantSettings,
  AssistantSource,
  SourceLimits,
  TranscriptionSettings,
  Conversation,
  ConversationDetail,
  Memory,
  PageResult,
  Provider,
  Snippet,
  StreamEvent,
} from "./types";
const root = "/assistant";
export async function synchronizeAssistant() {
  const preferences = await api<{
    theme: "light" | "dark" | "system";
    locale: "fr" | "en";
  }>("/preferences");
  window.dispatchEvent(
    new CustomEvent("life-assistant-changed", { detail: preferences }),
  );
}

export const assistantApi = {
  sourceLimits: (signal?: AbortSignal) =>
    api<SourceLimits>(`${root}/sources/limits`, "GET", undefined, signal),
  uploadSource: (file: File, signal: AbortSignal) =>
    api<AssistantSource>(
      `${root}/sources/files?${new URLSearchParams({ filename: file.name })}`,
      "POST",
      file,
      signal,
    ),
  webSource: (url: string, signal: AbortSignal) =>
    api<AssistantSource>(`${root}/sources/web`, "POST", { url }, signal),
  removeSource: (id: string) =>
    api<void>(`${root}/sources/${encodeURIComponent(id)}`, "DELETE"),
  sourceContent: (id: string) =>
    `/api/v1${root}/sources/${encodeURIComponent(id)}/content`,
  transcribe: (audio: Blob, filename: string, signal: AbortSignal) =>
    api<{ text: string }>(
      `${root}/transcription?${new URLSearchParams({ filename })}`,
      "POST",
      audio,
      signal,
    ),
  transcriptionSettings: (signal?: AbortSignal) =>
    api<TranscriptionSettings>(
      `${root}/transcription/settings`,
      "GET",
      undefined,
      signal,
    ),
  saveTranscriptionSettings: (value: {
    provider?: "openai" | "gemini";
    model?: string;
    api_token?: string | null;
    use_chat_provider: boolean;
  }) =>
    api<TranscriptionSettings>(`${root}/transcription/settings`, "PUT", value),
  settings: (signal?: AbortSignal) =>
    api<AssistantSettings>(`${root}/settings`, "GET", undefined, signal),
  saveSettings: (value: {
    provider?: Provider;
    model?: string;
    api_token?: string | null;
    memory_enabled?: boolean;
  }) => api<AssistantSettings>(`${root}/settings`, "PUT", value),
  test: () => api<{ ok: boolean }>(`${root}/settings/test`, "POST"),
  conversations: (q = "", archived = false, offset = 0, signal?: AbortSignal) =>
    api<PageResult<Conversation>>(
      `${root}/conversations?${new URLSearchParams({ q, archived: String(archived), offset: String(offset), limit: "30" })}`,
      "GET",
      undefined,
      signal,
    ),
  create: () => api<Conversation>(`${root}/conversations`, "POST", {}),
  conversation: (id: string, signal?: AbortSignal, offset = 0) =>
    api<ConversationDetail>(
      `${root}/conversations/${encodeURIComponent(id)}?offset=${offset}&limit=100`,
      "GET",
      undefined,
      signal,
    ),
  update: (id: string, value: { title?: string; archived?: boolean }) =>
    api<Conversation>(
      `${root}/conversations/${encodeURIComponent(id)}`,
      "PATCH",
      value,
    ),
  delete: (id: string, forget: boolean) =>
    api<void>(
      `${root}/conversations/${encodeURIComponent(id)}?forget_memories=${forget}`,
      "DELETE",
    ),
  send: (
    id: string,
    content: string,
    requestId: string,
    receive: (event: StreamEvent) => void,
    signal: AbortSignal,
    sourceIds: string[] = [],
  ) =>
    apiStream<StreamEvent>(
      `${root}/conversations/${encodeURIComponent(id)}/messages`,
      { content, request_id: requestId, source_ids: sourceIds },
      receive,
      signal,
    ),
  cancel: (id: string) =>
    api<void>(`${root}/runs/${encodeURIComponent(id)}/cancel`, "POST"),
  confirm: (id: string) =>
    api<{
      operation_id: string;
      status: string;
      result: unknown;
      snippet?: Snippet;
    }>(`${root}/operations/${encodeURIComponent(id)}/confirm`, "POST"),
  memories: (signal?: AbortSignal, offset = 0) =>
    api<PageResult<Memory>>(
      `${root}/memories?offset=${offset}&limit=100`,
      "GET",
      undefined,
      signal,
    ),
  remember: (content: string) =>
    api<Memory>(`${root}/memories`, "POST", { content }),
  editMemory: (id: string, content: string) =>
    api<Memory>(`${root}/memories/${encodeURIComponent(id)}`, "PATCH", {
      content,
    }),
  forget: (id?: string) =>
    api<void>(
      `${root}/memories${id ? `/${encodeURIComponent(id)}` : ""}`,
      "DELETE",
    ),
};
