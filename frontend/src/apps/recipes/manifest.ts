import { lazy } from "react";
import type { ApplicationModule } from "../../platform/applications/definition";

export const application: ApplicationModule = {
  id: "recipes",
  AssistantSnippet: lazy(() =>
    import("./assistant/Snippet").then(({ Snippet }) => ({ default: Snippet })),
  ),
  Page: lazy(() => import("./Page").then(({ Page }) => ({ default: Page }))),
};
