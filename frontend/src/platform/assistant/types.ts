export type Provider = "openai" | "anthropic" | "gemini";
export interface AssistantSettings {
  provider: Provider;
  model: string;
  configured: boolean;
  token_hint: string | null;
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
