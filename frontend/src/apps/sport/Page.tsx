import { ProgressionBadge } from "../../platform/progression/ProgressionBadge";
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
import { Statistics } from "./components/Statistics";
import { ActiveTraining, History, RestTimer } from "./components/Training";
import { ProgramEditor } from "./components/ProgramEditor";
import { Workouts } from "./components/Workouts";
import type { Training, Workout } from "./types";
import { SportPreferences } from "./preferences";
import type { SportNavigate } from "./navigation";
import "./styles.css";

const tabs = () =>
  [
    ["workouts", tr("programs"), "grid"],
    ["training", tr("training"), "dumbbell"],
    ["exercises", tr("exercises"), "list"],
    ["measurements", tr("body_measurements"), "ruler"],
    ["statistics", tr("statistics"), "activity"],
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
  return (
    <SportPreferences>
      <SportPage />
    </SportPreferences>
  );
}
function SportPage() {
  const [view, setView] = useState(readView);
  const { tab, program, archived } = view;
  const [completed, setCompleted] = useState<Training | null>(null);
  const [archivedProgram, setArchivedProgram] = useState<Workout | null>(null);
  const positions = useRef(new Map<string, number>());
  const viewKey = `${tab}-${program ?? "list"}-${archived}`;
  const currentKey = useRef(viewKey);
  const savePosition = () =>
    positions.current.set(
      currentKey.current,
      Math.max(window.scrollY, shell.current?.scrollTop ?? 0),
    );
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
      savePosition();
      index.current = nextIndex;
      setView(readView());
      setNavigation(false);
    };
    const sync = () => {
      index.current = history.state?.sportIndex ?? index.current;
    };
    window.addEventListener("popstate", pop);
    window.addEventListener("sport-query-change", sync);
    const previousRestoration = history.scrollRestoration;
    history.scrollRestoration = "manual";
    return () => {
      window.removeEventListener("popstate", pop);
      window.removeEventListener("sport-query-change", sync);
      history.scrollRestoration = previousRestoration;
    };
  }, []);
  const title = program
    ? program === "new"
      ? tr("new_program")
      : tr("edit_program")
    : tabs().find(([id]) => id === tab)![1];
  useEffect(() => {
    document.title = `${title} · Sport · LifeOS`;
    heading.current?.focus({ preventScroll: true });
    currentKey.current = viewKey;
    const top = positions.current.get(viewKey) ?? 0;
    let cancelled = false;
    const restore = () => {
      if (cancelled) return;
      window.scrollTo({ top, behavior: "instant" });
      shell.current?.scrollTo({ top, behavior: "instant" });
    };
    // Lists arrive asynchronously; restore their previous position once laid out.
    const observer = new ResizeObserver(restore);
    const content = shell.current?.querySelector(".sport-content");
    if (content) observer.observe(content);
    restore();
    const stop = () => {
      cancelled = true;
      observer.disconnect();
    };
    const timer = window.setTimeout(stop, 4000);
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("pointerdown", stop, { passive: true });
    window.addEventListener("keydown", stop);
    document.addEventListener("focusin", stop);
    return () => {
      stop();
      window.clearTimeout(timer);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("pointerdown", stop);
      window.removeEventListener("keydown", stop);
      document.removeEventListener("focusin", stop);
    };
  }, [viewKey, title]);
  function choose(
    next: Tab,
    nextProgram: string | null = null,
    nextArchived = archived,
    saved = false,
    extra: Record<string, string> = {},
  ) {
    if (!saved && !guard.current()) return;
    if (next === "settings") {
      window.location.assign("/settings?application=sport");
      return;
    }
    savePosition();
    const params = new URLSearchParams(location.search);
    params.set("tab", next);
    params.delete("program");
    params.delete("add_exercise");
    if (nextProgram) params.set("program", nextProgram);
    if (nextArchived) params.set("archived", "true");
    else params.delete("archived");
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (!saved) index.current += 1;
    history[saved ? "replaceState" : "pushState"](
      { sportIndex: index.current },
      "",
      `?${params}`,
    );
    setView(readView());
    window.dispatchEvent(new Event("sport-query-change"));
    setNavigation(false);
  }
  const navigate: SportNavigate = (next, params = {}) =>
    choose(next, params.program ?? null, archived, false, params);
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
        icon="dumbbell"
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
          status={<ProgressionBadge applicationId="sport" />}
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
                  addedExercise={new URLSearchParams(location.search).get(
                    "add_exercise",
                  )}
                  onSaved={(workout) => {
                    if (workout?.archived_at) setArchivedProgram(workout);
                    choose(
                      "workouts",
                      null,
                      program !== "new" && archived,
                      true,
                    );
                  }}
                />
              )}
              {tab === "workouts" && !program && (
                <Workouts
                  kinds={kinds.data}
                  archived={archived}
                  registerGuard={registerGuard}
                  archivedProgram={archivedProgram}
                  onDismissArchive={() => setArchivedProgram(null)}
                  onArchivedChange={(value) => choose("workouts", null, value)}
                  onEdit={(id) => choose("workouts", id, archived)}
                  active={active}
                  onStarted={(t) => {
                    if (t) changeActive(t);
                    choose("training", null, archived, !!t);
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
                  navigate={navigate}
                  onFinished={(result) => {
                    setCompleted(result);
                    changeActive(null);
                    activeResource.reload();
                    choose("history", null, archived, true, {
                      session: result.id,
                      summary: "1",
                      history_q: "",
                      history_status: "",
                      history_workout: "",
                      history_since: "",
                      history_until: "",
                      history_offset: "0",
                    });
                  }}
                />
              )}
              {tab === "exercises" && (
                <Exercises
                  kinds={kinds.data}
                  registerGuard={registerGuard}
                  onAddToProgram={(program, exercise) =>
                    choose("workouts", program, false, false, {
                      add_exercise: exercise,
                    })
                  }
                  onPrograms={(exercise) =>
                    choose("workouts", null, false, false, {
                      program_exercise: exercise,
                      program_q: "",
                    })
                  }
                />
              )}
              {tab === "measurements" && (
                <Measurements
                  registerGuard={registerGuard}
                  navigate={navigate}
                />
              )}
              {tab === "statistics" && (
                <Statistics kinds={kinds.data} navigate={navigate} />
              )}{" "}
              {tab === "history" && (
                <History
                  kinds={kinds.data}
                  navigate={navigate}
                  completed={completed}
                />
              )}{" "}
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
          away={tab !== "training"}
          onResume={() => choose("training")}
          onAdjust={(seconds) =>
            void trainingAction.run(() => {
              setTrainingScope("rest");
              return sportApi.write<Training>(`/sessions/${active.id}/rest`, {
                expected_version: active.version,
                adjustment_seconds: seconds,
              });
            }, changeActive)
          }
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
