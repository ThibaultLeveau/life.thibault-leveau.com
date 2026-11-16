import { useCallback, useEffect, useRef, useState } from "react";
import { ApplicationFooter } from "../../platform/auth/ApplicationFooter";
import { useApplications } from "../../platform/applications/ApplicationProvider";
import { ProgressionBadge } from "../../platform/progression/ProgressionBadge";
import { useApiAction, useApiResource } from "../../platform/useApiResource";
import {
  ApplicationSidebar,
  ApplicationTopbar,
} from "../../shared/ui/ApplicationNavigation";
import { ErrorMessage } from "../../shared/ui/Dialog";
import { Icon, type IconName } from "../../shared/ui/Icon";
import { okrApi } from "./api";
import { Empty, LoadState } from "./components/common";
import { ObjectiveCard } from "./components/ObjectiveCard";
import { ObjectiveDetail } from "./components/ObjectiveDetail";
import { ObjectiveEditor } from "./components/ObjectiveEditor";
import { Retrospective } from "./components/Retrospective";
import { Settings } from "./components/Settings";
import { quarterLabel, tr } from "./i18n";
import {
  horizons,
  resultProgress,
  statuses,
  type Domain,
  type Horizon,
  type Objective,
  type Status,
} from "./types";
import "./styles.css";
const tabs = [
  ["horizons", "flag"],
  ["quarter", "board"],
  ["achievements", "check"],
  ["archives", "archive"],
  ["settings", "settings"],
] as const satisfies readonly (readonly [string, IconName])[];
type Tab = (typeof tabs)[number][0];
function readView() {
  const params = new URLSearchParams(location.search);
  return {
    tab: tabs.find(([id]) => id === params.get("tab"))?.[0] ?? "horizons",
    edit: params.get("edit"),
  };
}
export function Page() {
  const [view, setView] = useState(readView),
    [mobile, setMobile] = useState(false),
    [revision, setRevision] = useState(0),
    [horizon, setHorizon] = useState<Horizon>("ten_year"),
    [domain, setDomain] = useState<Domain | "all">("all"),
    [quarter, setQuarter] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [notice, setNotice] = useState("");
  const dirty = useRef(false),
    pending = useRef(false),
    drag = useRef<string | null>(null),
    heading = useRef<HTMLHeadingElement>(null),
    index = useRef(0),
    restoring = useRef(false);
  const onDirty = useCallback((v: boolean) => {
      dirty.current = v;
    }, []),
    onBusy = useCallback((v: boolean) => {
      pending.current = v;
    }, []);
  const { items: applications } = useApplications();
  const tracking = applications?.find((a) => a.id === "tracking" && a.enabled);
  const resource = useApiResource(
    async (signal) => {
      const [active, archived, settings] = await Promise.all([
        okrApi.objectives(false, signal),
        okrApi.objectives(true, signal),
        okrApi.settings(signal),
      ]);
      return { active, archived, settings };
    },
    [revision],
    { keepPrevious: true },
  );
  const action = useApiAction();
  const writing = useRef(false);
  writing.current = action.busy;
  const permit = useCallback(() => {
    if (pending.current || writing.current) {
      window.alert(tr("busy_leave"));
      return false;
    }
    return !dirty.current || window.confirm(tr("unsaved"));
  }, []);
  useEffect(() => {
    index.current = history.state?.okrIndex ?? 0;
    history.replaceState({ ...history.state, okrIndex: index.current }, "");
    const pop = (event: PopStateEvent) => {
      if (restoring.current) {
        restoring.current = false;
        return;
      }
      const next = event.state?.okrIndex ?? 0;
      if (!permit()) {
        restoring.current = true;
        history.go(index.current - next);
        return;
      }
      index.current = next;
      dirty.current = false;
      setSelected(null);
      setView(readView());
      setMobile(false);
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty.current || pending.current || writing.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("popstate", pop);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("popstate", pop);
      window.removeEventListener("beforeunload", unload);
    };
  }, [permit]);
  const title = view.edit
    ? tr(view.edit === "new" ? "new_objective" : "edit_objective")
    : tr(view.tab);
  useEffect(() => {
    document.title = `${title} · ${tr("app")} · LifeOS`;
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [title, view.tab, view.edit]);
  function choose(tab: Tab, edit: string | null = null, saved = false) {
    if (!saved && !permit()) return;
    dirty.current = false;
    setSelected(null);
    setMobile(false);
    const params = new URLSearchParams({ tab });
    if (edit) params.set("edit", edit);
    if (!saved) index.current++;
    history[saved ? "replaceState" : "pushState"](
      { okrIndex: index.current },
      "",
      `?${params}`,
    );
    setView({ tab, edit });
  }
  function open(id: string) {
    if (!permit()) return;
    dirty.current = false;
    setSelected(id);
  }
  function refresh() {
    setRevision((v) => v + 1);
  }
  function accepted(o: Objective, close = false) {
    dirty.current = false;
    setNotice(
      o.status === "done"
        ? tr("completion_message", {
            quarter: quarterLabel(o.completed_quarter!),
          })
        : o.archived_at
          ? tr("archive_message")
          : tr("saved_message"),
    );
    if (close) setSelected(null);
    refresh();
  }
  function move(o: Objective, status: Status, position = 10000) {
    void action.run(
      () => okrApi.move(o, status, position),
      (value) => accepted(value),
    );
  }
  const all = [
    ...(resource.data?.active ?? []),
    ...(resource.data?.archived ?? []),
  ];
  const active = resource.data?.active ?? [],
    settings = resource.data?.settings;
  const shownQuarter = quarter || settings?.current_quarter || "";
  const filter = (o: Objective) => domain === "all" || o.domain === domain;
  const current = all.find((o) => o.id === selected),
    existing = all.find((o) => o.id === view.edit);
  const quarterOptions = new Set([
    shownQuarter,
    settings?.current_quarter ?? "",
    ...active.map((o) => o.planned_quarter ?? ""),
    ...active.map((o) => o.completed_quarter ?? ""),
  ]);
  if (settings) {
    const year = Number(settings.current_quarter.slice(0, 4));
    for (let y = year - 1; y <= year + 1; y++)
      for (let q = 1; q <= 4; q++) quarterOptions.add(`${y}-Q${q}`);
  }
  const board = active.filter(
    (o) =>
      o.horizon === "quarterly" &&
      filter(o) &&
      (o.status === "done"
        ? o.completed_quarter === shownQuarter
        : !!o.planned_quarter && o.planned_quarter <= shownQuarter),
  );
  const card = (o: Objective) => (
    <ObjectiveCard
      key={o.id}
      objective={o}
      parent={all.find((p) => p.id === o.parent_id)}
      today={settings!.today}
      busy={action.busy || resource.loading}
      onOpen={() => open(o.id)}
      onMove={(status, position) => move(o, status, position)}
    />
  );
  return (
    <div className="ui-scope okr-shell">
      <ApplicationSidebar
        name={tr("app")}
        icon="flag"
        label={tr("navigation")}
        mainId="okr-main"
        open={mobile}
        onOpenChange={setMobile}
        footer={
          <ApplicationFooter documentation="okr" beforeSessionChange={permit} />
        }
      >
        <nav aria-label={tr("app")}>
          {tabs.map(([id, icon]) => (
            <button
              key={id}
              className={`application-nav-item ${view.tab === id ? "is-active" : ""}`}
              aria-current={view.tab === id ? "page" : undefined}
              onClick={() => choose(id)}
            >
              <Icon name={icon} />
              {tr(id)}
            </button>
          ))}
        </nav>
      </ApplicationSidebar>
      <main id="okr-main" className="okr-main" tabIndex={-1}>
        <ApplicationTopbar
          status={<ProgressionBadge applicationId="okr" />}
          name={tr("app")}
          current={title}
          mainId="okr-main"
          open={mobile}
          onOpenChange={setMobile}
        />
        <div className="okr-content">
          <header className="okr-page-heading">
            <div>
              <p className="eyebrow">{tr("eyebrow")}</p>
              <h1 ref={heading} tabIndex={-1}>
                {title}
              </h1>
              {!view.edit && (
                <p className="muted">{tr(`${view.tab}_subtitle`)}</p>
              )}
            </div>
            {!view.edit &&
              (view.tab === "horizons" || view.tab === "quarter") && (
                <button
                  className="primary-button"
                  onClick={() => {
                    if (view.tab === "quarter") setHorizon("quarterly");
                    choose(view.tab, "new");
                  }}
                >
                  <Icon name="plus" />
                  {tr("new_objective")}
                </button>
              )}
          </header>
          {notice && (
            <p role="status" className="okr-notice">
              <Icon name="check" />
              {notice}
            </p>
          )}
          <LoadState {...resource} />
          <ErrorMessage message={action.error} />
          {settings &&
            resource.data &&
            (view.edit ? (
              view.edit === "new" || existing ? (
                <ObjectiveEditor
                  key={view.edit}
                  existing={existing}
                  initialHorizon={horizon}
                  objectives={all}
                  today={settings.today}
                  onDirty={onDirty}
                  onBusy={onBusy}
                  onCancel={() => choose(view.tab)}
                  onSaved={(o) => {
                    accepted(o);
                    setHorizon(o.horizon);
                    choose(
                      o.horizon === "quarterly" ? "quarter" : "horizons",
                      null,
                      true,
                    );
                  }}
                />
              ) : (
                <Empty title={tr("not_found")} />
              )
            ) : (
              <>
                {view.tab === "horizons" && (
                  <>
                    <section className="okr-hero">
                      <div>
                        <span className="okr-orbit" aria-hidden="true">
                          <Icon name="flag" size={28} />
                        </span>
                        <h2>{tr("hero_title")}</h2>
                        <p>{tr("hero_body")}</p>
                      </div>
                      <dl className="okr-hero-stats">
                        <div>
                          <dt>{tr("in_motion")}</dt>
                          <dd>
                            {
                              active.filter((o) => o.status === "in_progress")
                                .length
                            }
                          </dd>
                        </div>
                        <div>
                          <dt>{tr("finished")}</dt>
                          <dd>
                            {
                              all.filter(
                                (o) =>
                                  o.completed_quarter ===
                                  settings.current_quarter,
                              ).length
                            }
                          </dd>
                        </div>
                        <div>
                          <dt>{tr("results_reached")}</dt>
                          <dd>
                            {
                              active
                                .flatMap((o) => o.key_results)
                                .filter((k) => resultProgress(k) === 100).length
                            }
                          </dd>
                        </div>
                      </dl>
                    </section>
                    <div
                      className="okr-horizons"
                      role="group"
                      aria-label={tr("horizon")}
                    >
                      {horizons.map((h, i) => (
                        <button
                          key={h}
                          aria-pressed={horizon === h}
                          onClick={() => setHorizon(h)}
                        >
                          <span>0{i + 1}</span>
                          <strong>{tr(h)}</strong>
                          <small>
                            {
                              active.filter((o) => o.horizon === h && filter(o))
                                .length
                            }
                          </small>
                        </button>
                      ))}
                    </div>
                    <div className="okr-toolbar">
                      <p>{tr(`guide_${horizon}`)}</p>
                      <label>
                        {tr("domain")}
                        <select
                          value={domain}
                          onChange={(e) =>
                            setDomain(e.target.value as Domain | "all")
                          }
                        >
                          <option value="all">{tr("all_domains")}</option>
                          <option value="personal">{tr("personal")}</option>
                          <option value="professional">
                            {tr("professional")}
                          </option>
                        </select>
                      </label>
                    </div>
                    {active.filter((o) => o.horizon === horizon && filter(o))
                      .length ? (
                      <div className="okr-grid">
                        {active
                          .filter((o) => o.horizon === horizon && filter(o))
                          .map(card)}
                      </div>
                    ) : (
                      <Empty
                        title={
                          active.length ? tr("no_match") : tr("empty_title")
                        }
                        action={
                          <button
                            className="secondary-button"
                            onClick={() => choose("horizons", "new")}
                          >
                            <Icon name="plus" />
                            {tr("new_objective")}
                          </button>
                        }
                      >
                        {tr("empty_body")}
                      </Empty>
                    )}
                  </>
                )}
                {view.tab === "quarter" && (
                  <>
                    <div className="okr-toolbar">
                      <label>
                        {tr("quarter_select")}
                        <select
                          value={shownQuarter}
                          onChange={(e) => setQuarter(e.target.value)}
                        >
                          {[...quarterOptions]
                            .filter(Boolean)
                            .sort()
                            .reverse()
                            .map((q) => (
                              <option key={q} value={q}>
                                {quarterLabel(q)}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        {tr("domain")}
                        <select
                          value={domain}
                          onChange={(e) =>
                            setDomain(e.target.value as Domain | "all")
                          }
                        >
                          <option value="all">{tr("all_domains")}</option>
                          <option value="personal">{tr("personal")}</option>
                          <option value="professional">
                            {tr("professional")}
                          </option>
                        </select>
                      </label>
                    </div>
                    <div className="okr-board">
                      {statuses.map((status) => {
                        const column = board.filter((o) => o.status === status);
                        const fullColumn = active.filter(
                          (o) =>
                            o.horizon === "quarterly" && o.status === status,
                        );
                        const indexOf = (neighbor?: Objective) =>
                          neighbor
                            ? fullColumn.findIndex((o) => o.id === neighbor.id)
                            : undefined;
                        function drop(before?: Objective) {
                          const o = active.find((o) => o.id === drag.current);
                          drag.current = null;
                          if (
                            o &&
                            o.id !== before?.id &&
                            !action.busy &&
                            !resource.loading
                          ) {
                            const remaining = fullColumn.filter(
                              (item) => item.id !== o.id,
                            );
                            const position = before
                              ? remaining.findIndex(
                                  (item) => item.id === before.id,
                                )
                              : remaining.length;
                            move(o, status, position);
                          }
                        }
                        return (
                          <section
                            key={status}
                            className={`okr-column is-${status}`}
                            aria-label={tr(status)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              drop();
                            }}
                          >
                            <header>
                              <h2>
                                <span />
                                {tr(status)}
                              </h2>
                              <span>{column.length}</span>
                            </header>
                            {column.map((o, i) => (
                              <ObjectiveCard
                                key={o.id}
                                objective={o}
                                parent={all.find((p) => p.id === o.parent_id)}
                                today={settings.today}
                                quarter={shownQuarter}
                                busy={action.busy || resource.loading}
                                onOpen={() => open(o.id)}
                                onMove={(target, pos) => move(o, target, pos)}
                                onDrag={(id) => {
                                  drag.current = id;
                                }}
                                onDrop={() => drop(o)}
                                up={indexOf(column[i - 1])}
                                down={indexOf(column[i + 1])}
                              />
                            ))}
                            {!column.length && (
                              <p className="okr-column-empty">
                                {tr("empty_column")}
                              </p>
                            )}
                          </section>
                        );
                      })}
                    </div>
                  </>
                )}
                {view.tab === "achievements" && (
                  <Retrospective
                    currentQuarter={settings.current_quarter}
                    revision={revision}
                  />
                )}
                {view.tab === "archives" &&
                  (resource.data.archived.length ? (
                    <div className="okr-grid">
                      {resource.data.archived.map(card)}
                    </div>
                  ) : (
                    <Empty title={tr("empty_archive")} />
                  ))}
                {view.tab === "settings" && (
                  <Settings
                    key={settings.version}
                    settings={settings}
                    onBusy={onBusy}
                    onDirty={onDirty}
                    onSaved={() => {
                      refresh();
                      setNotice(tr("settings_saved"));
                    }}
                  />
                )}
                {(view.tab === "horizons" || view.tab === "quarter") && (
                  <aside className="okr-quests-note">
                    <Icon name="flag" />
                    <p>
                      {tr("quests_hint")}
                      {tracking && (
                        <>
                          {" "}
                          <a
                            href={`${tracking.path}?tab=achievements&application=okr`}
                          >
                            {tr("quests_link")}
                          </a>
                        </>
                      )}
                    </p>
                  </aside>
                )}
              </>
            ))}
        </div>
      </main>
      {current && (
        <ObjectiveDetail
          key={current.id}
          objective={current}
          objectives={all}
          onClose={() => {
            if (permit()) {
              dirty.current = false;
              setSelected(null);
            }
          }}
          onEdit={() => choose(view.tab, current.id)}
          onOpen={open}
          onSaved={accepted}
          onDirty={onDirty}
          onBusy={onBusy}
        />
      )}
    </div>
  );
}
