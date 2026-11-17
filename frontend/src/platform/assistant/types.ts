export type Provider = "openai" | "anthropic" | "gemini";
export interface AssistantSettings {
  provider: Provider;
  model: string;
  configured: boolean;
  token_hint: string | null;
  memory_enabled: boolean;
}
export interface Conversation {
  id: string;
  title: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}
export interface Snippet {
  id: string;
  application_id: string;
  kind: string;
  schema_version: number;
  phase: "preview" | "result";
  operation_id?: string;
  data: unknown;
}
export interface AssistantSnippetProps {
  snippet: Snippet;
}
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "complete" | "running" | "interrupted" | "failed";
  created_at: string;
  snippets: Snippet[];
  run_id?: string | null;
}
export interface ConversationDetail {
  conversation: Conversation;
  messages: Message[];
  has_more?: boolean;
  run_id?: string | null;
}
export interface Memory {
  id: string;
  content: string;
  category: string;
  source_conversation_id?: string | null;
  created_at: string;
  updated_at: string;
}
export interface StreamEvent {
  type: "status" | "delta" | "message" | "done" | "error";
  text?: string;
  message?: Message;
  run_id?: string;
  code?: string;
}
export interface PageResult<T> {
  items: T[];
  total: number;
}
