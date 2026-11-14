export interface Application {
  id: string;
  name: string;
  description: string;
  path: string;
  icon: string;
  enabled: boolean;
  updated_at: string | null;
}
