import { tr } from "../shared/i18n";
import { Component, Suspense, useEffect, type ReactNode } from "react";
import { applications } from "../apps/registry";
import { AppLayout } from "../components/layout/AppLayout";
import { SettingsPage } from "../pages/SettingsPage";
import { HomePage } from "../pages/HomePage";
import { LibraryPage } from "../pages/LibraryPage";
import { SessionProvider } from "../platform/auth/SessionProvider";
import {
  ApplicationProvider,
  useApplications,
} from "../platform/applications/ApplicationProvider";
import { ErrorMessage } from "../shared/ui/Dialog";
import { Icon } from "../shared/ui/Icon";
import { useMobileFormViewport } from "../shared/ui/useMobileFormViewport";
import "./shell.css";
class ApplicationBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <AppLayout>
        <h1>{tr("unable_to_open")}</h1>
        <p>{tr("reload_the_page_to_try_again")}</p>
        <button
          className="primary-button"
          onClick={() => window.location.reload()}
        >
          {tr("reload")}
        </button>
      </AppLayout>
    ) : (
      this.props.children
    );
  }
}
function Routes() {
  const path = window.location.pathname;
  const { items, error, refresh } = useApplications();
  useEffect(() => {
    document.title = `${path === "/applications" ? tr("library") : tr("home")} · LifeOS`;
  }, [path]);
  if (error)
    return (
      <AppLayout>
        <h1>{tr("applications_unavailable")}</h1>
        <ErrorMessage message={error} />
        <button className="primary-button" onClick={refresh}>
          {tr("try_again")}
        </button>
      </AppLayout>
    );
  if (!items)
    return (
      <AppLayout>
        <p role="status">{tr("loading_applications")}</p>
      </AppLayout>
    );
  if (path === "/")
    return (
      <ApplicationBoundary>
        <HomePage modules={applications} />
      </ApplicationBoundary>
    );
  if (path === "/applications")
    return (
      <AppLayout>
        <LibraryPage />
      </AppLayout>
    );
  if (path === "/settings")
    return (
      <ApplicationBoundary>
        <SettingsPage modules={applications} />
      </ApplicationBoundary>
    );
  const application = items.find((item) => item.path === path);
  const module = applications.find((item) => item.id === application?.id);
  if (!application || !module)
    return (
      <AppLayout>
        <h1>{tr("page_not_found")}</h1>
        <a href="/">{tr("back_to_home")}</a>
      </AppLayout>
    );
  if (new URLSearchParams(location.search).get("tab") === "settings")
    return <SettingsRedirect applicationId={application.id} />;
  if (!application.enabled)
    return (
      <AppLayout>
        <div className="applications-empty">
          <Icon name="grid" size={32} />
          <h1>{tr("application_disabled", { name: application.name })}</h1>
          <p>
            {tr(
              "your_data_is_preserved_enable_the_application_again_to_access",
            )}
          </p>
          <a className="primary-button" href="/applications">
            {tr("open_the_library")} <Icon name="arrow" />
          </a>
        </div>
      </AppLayout>
    );
  return (
    <ApplicationBoundary>
      <Suspense
        fallback={
          <AppLayout>
            <p role="status">
              {tr("opening_application", { name: application.name })}
            </p>
          </AppLayout>
        }
      >
        <module.Page />
      </Suspense>
    </ApplicationBoundary>
  );
}
function SettingsRedirect({ applicationId }: { applicationId: string }) {
  useEffect(() => {
    window.location.replace(
      `/settings?application=${encodeURIComponent(applicationId)}`,
    );
  }, [applicationId]);
  return (
    <AppLayout>
      <p role="status">{tr("settings_loading")}</p>
    </AppLayout>
  );
}
export function App() {
  useMobileFormViewport();
  return (
    <SessionProvider>
      <ApplicationProvider>
        <Routes />
      </ApplicationProvider>
    </SessionProvider>
  );
}
