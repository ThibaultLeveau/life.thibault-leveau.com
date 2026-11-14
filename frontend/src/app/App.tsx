import { Component, Suspense, useEffect, type ReactNode } from "react";
import { applications } from "../apps/registry";
import { AppLayout } from "../components/layout/AppLayout";
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
        <h1>Ouverture interrompue</h1>
        <p>Rechargez la page pour réessayer.</p>
        <button
          className="primary-button"
          onClick={() => window.location.reload()}
        >
          Recharger
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
    document.title = `${path === "/applications" ? "Bibliothèque" : "Accueil"} · LifeOS`;
  }, [path]);
  if (error)
    return (
      <AppLayout>
        <h1>Applications indisponibles</h1>
        <ErrorMessage message={error} />
        <button className="primary-button" onClick={refresh}>
          Réessayer
        </button>
      </AppLayout>
    );
  if (!items)
    return (
      <AppLayout>
        <p role="status">Chargement des applications…</p>
      </AppLayout>
    );
  if (path === "/")
    return (
      <AppLayout>
        <HomePage />
      </AppLayout>
    );
  if (path === "/applications")
    return (
      <AppLayout>
        <LibraryPage />
      </AppLayout>
    );
  const application = items.find((item) => item.path === path);
  const module = applications.find((item) => item.id === application?.id);
  if (!application || !module)
    return (
      <AppLayout>
        <h1>Page introuvable</h1>
        <a href="/">Revenir à l’accueil</a>
      </AppLayout>
    );
  if (!application.enabled)
    return (
      <AppLayout>
        <div className="applications-empty">
          <Icon name="grid" size={32} />
          <h1>{application.name} est désactivée</h1>
          <p>
            Vos données sont conservées. Réactivez l’application pour les
            retrouver.
          </p>
          <a className="primary-button" href="/applications">
            Ouvrir la bibliothèque <Icon name="arrow" />
          </a>
        </div>
      </AppLayout>
    );
  return (
    <ApplicationBoundary>
      <Suspense
        fallback={
          <AppLayout>
            <p role="status">Ouverture de {application.name}…</p>
          </AppLayout>
        }
      >
        <module.Page />
      </Suspense>
    </ApplicationBoundary>
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
