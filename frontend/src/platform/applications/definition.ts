import type { ComponentType, LazyExoticComponent } from "react";

export interface ApplicationModule {
  id: string;
  Page: LazyExoticComponent<ComponentType>;
}
