import { useEffect, useState } from "react";
import { AccountMenu } from "../../platform/auth/AccountMenu";
import { useSession } from "../../platform/auth/SessionProvider";
import { Dialog } from "../../shared/ui/Dialog";
import { Icon, type IconName } from "../../shared/ui/Icon";
import { sportApi } from "./api";
import { LoadState, useResource } from "./components/common";
import { Exercises } from "./components/Exercises";
import { Measurements } from "./components/Measurements";
import { Settings } from "./components/Settings";
import { Statistics } from "./components/Statistics";
import { ActiveTraining, History } from "./components/Training";
import { Workouts } from "./components/Workouts";
import type { Training } from "./types";
import "./styles.css";

const tabs = [
  ["workouts", "Séances", "grid"],
  ["training", "Entraînement", "flag"],
  ["exercises", "Exercices", "list"],
  ["measurements", "Mensurations", "edit"],
  ["statistics", "Statistiques", "board"],
  ["history", "Historique", "calendar"],
  ["settings", "Réglages", "settings"],
] as const satisfies readonly (readonly [string, string, IconName])[];
type Tab = (typeof tabs)[number][0];
function readTab(): Tab {
  const key = new URLSearchParams(location.search).get("tab");
  return tabs.find(([id]) => id === key)?.[0] ?? "workouts";
}
export function Page() {
  const { session } = useSession();
  const [tab, setTab] = useState<Tab>(readTab);
  const [navigation, setNavigation] = useState(false);
  const [active, setActive] = useState<Training | null>();
  const kinds = useResource(sportApi.kinds, []);
  const activeResource = useResource(sportApi.active, []);
  useEffect(() => {
    if (activeResource.data !== undefined) setActive(activeResource.data);
  }, [activeResource.data]);
  useEffect(() => {
    const pop = () => setTab(readTab());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  // A manual reload also recovers from a version conflict in another device.
  function choose(next: Tab) {
    setTab(next);
    setNavigation(false);
    history.pushState({}, "", `?tab=${next}`);
  }
  const nav = (
    <nav aria-label="Sport">
      {tabs.map(([id, label, icon]) => (
        <button
          key={id}
          className={`sport-nav-item ${tab === id ? "is-active" : ""}`}
          aria-current={tab === id ? "page" : undefined}
          onClick={() => choose(id)}
        >
          <Icon name={icon} />
          {label}
          {id === "training" && active && (
            <span className="sport-live-dot" aria-label="En cours" />
          )}
        </button>
      ))}
    </nav>
  );
  return (
    <div className="ui-scope sport-shell">
      <a className="sport-skip" href="#sport-main">
        Aller au contenu
      </a>
      <aside className="sport-sidebar">
        <a className="app-brand" href="/" aria-label="Accueil LifeOS">
          <span className="app-brand-icon">
            <Icon name="grid" />
          </span>
          LifeOS<span className="brand-period">.</span>
        </a>
        <div className="sport-app-label">
          <Icon name="flag" />
          SPORT
        </div>
        {nav}
        <div className="sport-sidebar-bottom">
          <a href="/applications">
            <Icon name="grid" />
            Bibliothèque des applications
          </a>
          <a href="/documentation/sport/">
            <Icon name="info" />
            Guide Sport
          </a>
          <AccountMenu />
        </div>
      </aside>
      <main className="sport-main" id="sport-main" tabIndex={-1}>
        <header className="sport-topbar">
          <button
            className="icon-button sport-mobile"
            aria-label="Ouvrir la navigation"
            onClick={() => setNavigation(true)}
          >
            <Icon name="menu" />
          </button>
          <a href="/">LifeOS</a>
          <span>/</span>
          <span>Sport</span>
          <div className="spacer" />
          <button
            className="icon-button"
            aria-label="Actualiser l’entraînement"
            onClick={activeResource.reload}
          >
            <Icon name="restore" />
          </button>
          <span className="sport-user">{session.username}</span>
        </header>
        <div className="sport-content">
          <div className="sport-page-heading">
            <p className="eyebrow">VOTRE ESPACE SPORT</p>
            <h1>{tabs.find(([id]) => id === tab)![1]}</h1>
            <p className="muted">
              {tab === "workouts"
                ? "Préparez votre séance. Suivez chaque progrès."
                : tab === "exercises"
                  ? "Trouvez le bon mouvement, avec les bonnes mesures."
                  : tab === "statistics"
                    ? "Votre évolution, séance après séance."
                    : tab === "measurements"
                      ? "Gardez une trace de votre évolution."
                      : tab === "training"
                        ? "Une série à la fois."
                        : tab === "history"
                          ? "Retrouvez les détails de chaque entraînement."
                          : "Des réglages qui suivent votre rythme."}
            </p>
          </div>
          <LoadState {...kinds} />
          <LoadState {...activeResource} />
          {kinds.data && activeResource.data !== undefined && (
            <div key={tab}>
              {tab === "workouts" && (
                <Workouts
                  kinds={kinds.data}
                  active={active}
                  onStarted={(t) => {
                    if (t) setActive(t);
                    choose("training");
                  }}
                />
              )}
              {tab === "training" && (
                <ActiveTraining
                  training={active}
                  kinds={kinds.data}
                  onChanged={setActive}
                  onFinished={() => {
                    setActive(null);
                    activeResource.reload();
                    choose("history");
                  }}
                />
              )}
              {tab === "exercises" && <Exercises kinds={kinds.data} />}{" "}
              {tab === "measurements" && <Measurements />}
              {tab === "statistics" && <Statistics kinds={kinds.data} />}{" "}
              {tab === "history" && <History kinds={kinds.data} />}{" "}
              {tab === "settings" && <Settings />}
            </div>
          )}
        </div>
      </main>
      {navigation && (
        <Dialog title="Navigation Sport" onClose={() => setNavigation(false)}>
          <div className="dialog-body sport-mobile-nav">
            {nav}
            <a href="/applications">Bibliothèque des applications</a>
            <AccountMenu />
          </div>
        </Dialog>
      )}
    </div>
  );
}
