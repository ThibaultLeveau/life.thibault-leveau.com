import type { ComponentType, LazyExoticComponent } from "react";
import type { AssistantSnippetProps } from "../assistant/types";

export interface SettingsPanelProps {
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
}

export interface ApplicationLaunch {
  id: string;
  applicationId: string;
  text: string;
}

export interface ApplicationPageProps {
  modules: ApplicationModule[];
  launch?: ApplicationLaunch;
  onConsumeLaunch: (id: string) => void;
}

export interface ApplicationModule {
  id: string;
  Page: LazyExoticComponent<ComponentType<ApplicationPageProps>>;
  AssistantSnippet?: LazyExoticComponent<ComponentType<AssistantSnippetProps>>;
  Settings?: LazyExoticComponent<ComponentType<SettingsPanelProps>>;
}
