import { useCallback, useEffect, useRef, useState } from "react";
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
import { ProgramEditor } from "./components/ProgramEditor";
import { Workouts } from "./components/Workouts";
import type { Training } from "./types";
import "./styles.css";

const tabs = [
  ["workouts", "Programmes", "grid"],
  ["training", "Entraînement", "flag"],
  ["exercises", "Exercices", "list"],
  ["measurements", "Mensurations", "edit"],
  ["statistics", "Statistiques", "board"],
  ["history", "Historique", "calendar"],
  ["settings", "Réglages", "settings"],
] as const satisfies readonly (readonly [string, string, IconName])[];
type Tab = (typeof tabs)[number][0];
function readView() {
  const params = new URLSearchParams(location.search);
  const tab = tabs.find(([id]) => id === params.get("tab"))?.[0] ?? "workouts";
  return {
    tab,
    program: tab === "workouts" ? params.get("program") : null,
    archived: params.get("archived") === "true",
  };
}
export function Page() {
  const { session } = useSession();
  const [view, setView] = useState(readView);
  const { tab, program, archived } = view;
  const guard = useRef<() => boolean>(() => true);
  const index = useRef(0);
  const restoring = useRef(false);
  const shell = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const registerGuard = useCallback((next: (() => boolean) | null) => {
    guard.current = next ?? (() => true);
  }, []);
  const [navigation, setNavigation] = useState(false);
  const [active, setActive] = useState<Training | null>();
  const kinds = useResource(sportApi.kinds, []);
  const activeResource = useResource(sportApi.active, []);
  useEffect(() => {
    if (activeResource.data !== undefined) setActive(activeResource.data);
  }, [activeResource.data]);
  useEffect(() => {
    index.current = history.state?.sportIndex ?? 0;
    history.replaceState({ ...history.state, sportIndex: index.current }, "");
    const pop = (event: PopStateEvent) => {
      if (restoring.current) {
        restoring.current = false;
        return;
      }
      const nextIndex = event.state?.sportIndex ?? 0;
      if (!guard.current()) {
        restoring.current = true;
        history.go(index.current - nextIndex);
        return;
      }
      index.current = nextIndex;
      setView(readView());
      setNavigation(false);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  const title = program
    ? program === "new"
      ? "Nouveau programme"
      : "Modifier le programme"
    : tabs.find(([id]) => id === tab)![1];
  useEffect(() => {
    document.title = `${title} · Sport · LifeOS`;
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
    shell.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [tab, program, title]);
  function choose(
    next: Tab,
    nextProgram: string | null = null,
    nextArchived = false,
    saved = false,
  ) {
    if (!saved && !guard.current()) return;
    const params = new URLSearchParams({ tab: next });
    if (nextProgram) params.set("program", nextProgram);
    if (nextArchived) params.set("archived", "true");
    if (!saved) index.current += 1;
    history[saved ? "replaceState" : "pushState"](
      { sportIndex: index.current },
      "",
      `?${params}`,
    );
    setView({ tab: next, program: nextProgram, archived: nextArchived });
    setNavigation(false);
  }
  const nav = (
    <nav aria-label="Sport">
      {tabs.map(([id, label, icon]) => (
        <button
          key={id}
          className={`sport-nav-item ${tab === id ? "is-active" : ""}`}
          aria-label={label}
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
    <div ref={shell} className="ui-scope sport-shell">
      <a
        className="sport-skip"
        href="#sport-main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("sport-main")?.focus();
        }}
      >
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
          <span className="sport-user" title={session.username}>
            {session.username}
          </span>
        </header>
        <div className="sport-content">
          {program && (
            <button
              className="text-button sport-back"
              onClick={() => choose("workouts", null, archived)}
            >
              <span aria-hidden="true">←</span>Tous les programmes
            </button>
          )}
          <div className="sport-page-heading">
            <p className="eyebrow">VOTRE ESPACE SPORT</p>
            <h1 ref={heading} tabIndex={-1}>
              {title}
            </h1>
            <p className="muted">
              {tab === "workouts"
                ? program
                  ? "Composez un programme à votre rythme."
                  : "Vos programmes, prêts pour le prochain entraînement."
                : tab === "exercises"
                  ? "Trouvez le bon mouvement, avec les bonnes mesures."
                  : tab === "statistics"
                    ? "Votre évolution, entraînement après entraînement."
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
          {kinds.data && active !== undefined && (
            <div key={`${tab}-${program ?? "list"}`}>
              {tab === "workouts" && program && (
                <ProgramEditor
                  id={program}
                  kinds={kinds.data}
                  registerGuard={registerGuard}
                  onClose={() => choose("workouts", null, archived)}
                  onSaved={() =>
                    choose(
                      "workouts",
                      null,
                      program !== "new" && archived,
                      true,
                    )
                  }
                />
              )}
              {tab === "workouts" && !program && (
                <Workouts
                  kinds={kinds.data}
                  archived={archived}
                  onArchivedChange={(value) => choose("workouts", null, value)}
                  onEdit={(id) => choose("workouts", id, archived)}
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
        <Dialog
          title="Navigation Sport"
          initialFocus="close"
          onClose={() => setNavigation(false)}
        >
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
