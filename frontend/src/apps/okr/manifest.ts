import { lazy } from "react";
import type { ApplicationModule } from "../../platform/applications/definition";
export const application: ApplicationModule = {
  id: "okr",
  Page: lazy(() => import("./Page").then(({ Page }) => ({ default: Page }))),
};
