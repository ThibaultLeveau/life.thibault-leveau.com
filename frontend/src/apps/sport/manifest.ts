import { lazy } from "react";
import type { ApplicationModule } from "../../platform/applications/definition";
export const application: ApplicationModule = {
  id: "sport",
  Settings: lazy(() =>
    import("./Settings").then(({ Settings }) => ({ default: Settings })),
  ),
  Page: lazy(() => import("./Page").then(({ Page }) => ({ default: Page }))),
};
