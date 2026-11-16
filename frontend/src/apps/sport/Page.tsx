import { tr } from "./i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApplicationFooter } from "../../platform/auth/ApplicationFooter";
import {
  ApplicationSidebar,
  ApplicationTopbar,
} from "../../shared/ui/ApplicationNavigation";
import { Icon, type IconName } from "../../shared/ui/Icon";
import { sportApi } from "./api";
import { LoadState, useAction, useResource } from "./components/common";
import { Exercises } from "./components/Exercises";
import { Measurements } from "./components/Measurements";
import { Settings } from "./components/Settings";
import { Statistics } from "./components/Statistics";
import { ActiveTraining, History, RestTimer } from "./components/Training";
import { ProgramEditor } from "./components/ProgramEditor";
import { Workouts } from "./components/Workouts";
import type { Training } from "./types";
import "./styles.css";

const tabs = () =>
  [
    ["workouts", tr("programs"), "grid"],
    ["training", tr("training"), "flag"],
    ["exercises", tr("exercises"), "list"],
    ["measurements", tr("body_measurements"), "edit"],
    ["statistics", tr("statistics"), "board"],
    ["history", tr("history"), "calendar"],
    ["settings", tr("settings"), "settings"],
  ] as const satisfies readonly (readonly [string, string, IconName])[];
type Tab = ReturnType<typeof tabs>[number][0];
function readView() {
  const params = new URLSearchParams(location.search);
  const tab =
    tabs().find(([id]) => id === params.get("tab"))?.[0] ?? "workouts";
  return {
    tab,
    program: tab === "workouts" ? params.get("program") : null,
    archived: params.get("archived") === "true",
  };
}
export function Page() {
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
  const trainingAction = useAction();
  const [trainingScope, setTrainingScope] = useState("");
  const activeRevision = useRef(0);
  const changeActive = (training: Training | null) => {
    activeRevision.current += 1;
    setActive(training);
  };
  const kinds = useResource(sportApi.kinds, []);
  const activeResource = useResource(async (signal) => {
    const revision = activeRevision.current;
    return { training: await sportApi.active(signal), revision };
  }, []);
  useEffect(() => {
    if (activeResource.data?.revision === activeRevision.current)
      setActive(activeResource.data.training);
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
      ? tr("new_program")
      : tr("edit_program")
    : tabs().find(([id]) => id === tab)![1];
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
    <nav aria-label={tr("sport")}>
      {tabs().map(([id, label, icon]) => (
        <button
          key={id}
          className={`application-nav-item ${tab === id ? "is-active" : ""}`}
          aria-label={label}
          aria-current={tab === id ? "page" : undefined}
          onClick={() => choose(id)}
        >
          <Icon name={icon} />
          {label}
          {id === "training" && active && (
            <span className="sport-live-dot" aria-label={tr("in_progress")} />
          )}
        </button>
      ))}
    </nav>
  );
  return (
    <div
      ref={shell}
      className={`ui-scope sport-shell ${active ? "has-active-training" : ""}`}
    >
      <ApplicationSidebar
        name={tr("sport")}
        icon="flag"
        label={tr("sport_navigation")}
        mainId="sport-main"
        open={navigation}
        onOpenChange={setNavigation}
        footer={
          <ApplicationFooter
            documentation="sport"
            beforeSessionChange={() => guard.current()}
          />
        }
      >
        {nav}
      </ApplicationSidebar>
      <main className="sport-main" id="sport-main" tabIndex={-1}>
        <ApplicationTopbar
          name={tr("sport")}
          current={title}
          mainId="sport-main"
          open={navigation}
          onOpenChange={setNavigation}
        />
        <div className="sport-content">
          {program && (
            <button
              className="text-button sport-back"
              onClick={() => choose("workouts", null, archived)}
            >
              <span aria-hidden="true">←</span>
              {tr("all_programs")}
            </button>
          )}
          <div className="sport-page-heading">
            <p className="eyebrow">{tr("your_training_space")}</p>
            <h1 ref={heading} tabIndex={-1}>
              {title}
            </h1>
            <p className="muted">
              {tab === "workouts"
                ? program
                  ? tr("build_a_program_at_your_own_pace")
                  : tr("your_programs_ready_for_your_next_training_session")
                : tab === "exercises"
                  ? tr("find_the_right_movement_with_the_right_measurements")
                  : tab === "statistics"
                    ? tr("your_progress_one_training_session_at_a_time")
                    : tab === "measurements"
                      ? tr("keep_track_of_your_progress")
                      : tab === "training"
                        ? tr("one_set_at_a_time")
                        : tab === "history"
                          ? tr("revisit_the_details_of_each_training_session")
                          : tr("settings_that_follow_your_pace")}
            </p>
          </div>
          <LoadState {...kinds} />
          <LoadState {...activeResource} />
          {active && trainingAction.error && (
            <button
              className="secondary-button"
              disabled={activeResource.loading || trainingAction.busy}
              onClick={activeResource.reload}
            >
              {tr("refresh_training_session")}
            </button>
          )}
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
                    if (t) changeActive(t);
                    choose("training");
                  }}
                />
              )}
              {tab === "training" && (
                <ActiveTraining
                  key={active?.id ?? "empty"}
                  training={active}
                  registerGuard={registerGuard}
                  action={trainingAction}
                  scope={trainingScope}
                  setScope={setTrainingScope}
                  kinds={kinds.data}
                  onChanged={changeActive}
                  onFinished={() => {
                    changeActive(null);
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
      {active && (
        <RestTimer
          key={active.id}
          training={active}
          busy={trainingAction.busy}
          error={trainingScope === "rest" ? trainingAction.error : ""}
          onSkip={() =>
            void trainingAction.run(() => {
              setTrainingScope("rest");
              return sportApi.write<Training>(`/sessions/${active.id}/rest`, {
                expected_version: active.version,
              });
            }, changeActive)
          }
        />
      )}
    </div>
  );
}
