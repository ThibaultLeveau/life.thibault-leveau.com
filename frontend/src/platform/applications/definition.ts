import type { ComponentType, LazyExoticComponent } from "react";
import type { AssistantSnippetProps } from "../assistant/types";

export interface SettingsPanelProps {
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
}

export interface ApplicationModule {
  id: string;
  Page: LazyExoticComponent<ComponentType>;
  AssistantSnippet?: LazyExoticComponent<ComponentType<AssistantSnippetProps>>;
  Settings?: LazyExoticComponent<ComponentType<SettingsPanelProps>>;
}
