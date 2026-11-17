import type { ComponentType, LazyExoticComponent } from "react";

export interface SettingsPanelProps {
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
}

export interface ApplicationModule {
  id: string;
  Page: LazyExoticComponent<ComponentType>;
  Settings?: LazyExoticComponent<ComponentType<SettingsPanelProps>>;
}
