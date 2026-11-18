import { lazy } from "react";
import type { ApplicationModule } from "../../platform/applications/definition";
export const application: ApplicationModule = {
  id: "life_ai",
  Page: lazy(() => import("./Page").then(({ Page }) => ({ default: Page }))),
  Settings: lazy(() =>
    import("./Settings").then(({ Settings }) => ({ default: Settings })),
  ),
};
