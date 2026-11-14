export type Theme = "system" | "light" | "dark";
export interface Session {
  user_id: string;
  username: string;
  csrf_token: string;
  expires_at: string;
  theme: Theme;
}
