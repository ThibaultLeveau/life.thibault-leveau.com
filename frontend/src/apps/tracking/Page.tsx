import { useCallback, useEffect, useRef, useState } from "react";
import { ApplicationFooter } from "../../platform/auth/ApplicationFooter";
import {
  ApplicationSidebar,
  ApplicationTopbar,
} from "../../shared/ui/ApplicationNavigation";
import { ErrorMessage } from "../../shared/ui/Dialog";
import { Icon, type IconName } from "../../shared/ui/Icon";
import { trackingApi } from "./api";
import { CalendarView } from "./components/Calendar";
import { EntryWizard } from "./components/EntryWizard";
import { AchievementsView, StatisticsView } from "./components/Statistics";
import { TrackerEditor } from "./components/TrackerEditor";
import {
  Empty,
  LoadState,
  OccurrenceCard,
  useAction,
  useResource,
} from "./components/common";
import { dateLabel, localDay } from "./dates";
import { tr } from "./i18n";
import type { Tracker } from "./types";
import "./styles.css";
const tabs = [
  ["today", "sun"],
  ["calendar", "calendar"],
  ["trackers", "list"],
  ["statistics", "board"],
  ["achievements", "flag"],
  ["settings", "settings"],
] as const satisfies readonly (readonly [string, IconName])[];
type Tab = (typeof tabs)[number][0];
function readView() {
  const q = new URLSearchParams(location.search);
  return {
    tab: tabs.find(([id]) => id === q.get("tab"))?.[0] ?? "today",
    edit: q.get("edit"),
  };
}
export function Page() {
  const [view, setView] = useState(readView),
    [mobile, setMobile] = useState(false),
    [revision, setRevision] = useState(0),
    [wizard, setWizard] = useState<{ id: string; day: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null),
    dirty = useRef(false),
    index = useRef(0),
    restoring = useRef(false);
  const setDirty = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);
  const settings = useResource(trackingApi.settings, [revision], {
    keepPrevious: true,
  });
  const trackers = useResource(
    async (signal) => {
      const [active, archived] = await Promise.all([
        trackingApi.trackers(false, signal),
        trackingApi.trackers(true, signal),
      ]);
      return { active, archived };
    },
    [revision],
    { keepPrevious: true },
  );
  const permit = () => !dirty.current || window.confirm(tr("unsaved"));
  useEffect(() => {
    index.current = history.state?.trackingIndex ?? 0;
    history.replaceState(
      { ...history.state, trackingIndex: index.current },
      "",
    );
    const pop = (event: PopStateEvent) => {
      if (restoring.current) {
        restoring.current = false;
        return;
      }
      const next = event.state?.trackingIndex ?? 0;
      if (!permit()) {
        restoring.current = true;
        history.go(index.current - next);
        return;
      }
      dirty.current = false;
      index.current = next;
      setView(readView());
      setMobile(false);
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
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
  }, []);
  const title = view.edit
    ? tr(view.edit === "new" ? "new_tracker" : "edit_tracker")
    : tr(view.tab);
  useEffect(() => {
    document.title = `${title} · ${tr("app")} · LifeOS`;
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [title, view.tab, view.edit]);
  function choose(tab: Tab, edit: string | null = null, saved = false) {
    if (!saved && !permit()) return;
    dirty.current = false;
    const params = new URLSearchParams({ tab });
    if (edit) params.set("edit", edit);
    if (!saved) index.current++;
    history[saved ? "replaceState" : "pushState"](
      { trackingIndex: index.current },
      "",
      `?${params}`,
    );
    setView({ tab, edit });
    setMobile(false);
  }
  const refresh = () => setRevision((r) => r + 1),
    all = [
      ...(trackers.data?.active ?? []),
      ...(trackers.data?.archived ?? []),
    ],
    today = localDay(settings.data?.timezone ?? "Europe/Paris");
  const navigation = (
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
  );
  return (
    <div className="ui-scope tracking-shell">
      <ApplicationSidebar
        name={tr("app")}
        icon="calendar"
        label={tr("navigation")}
        mainId="tracking-main"
        open={mobile}
        onOpenChange={setMobile}
        footer={
          <ApplicationFooter
            documentation="tracking"
            beforeSessionChange={permit}
          />
        }
      >
        {navigation}
      </ApplicationSidebar>
      <main className="tracking-main" id="tracking-main" tabIndex={-1}>
        <ApplicationTopbar
          name={tr("app")}
          current={title}
          mainId="tracking-main"
          open={mobile}
          onOpenChange={setMobile}
        />
        <div className="tracking-content">
          <div className="tracking-page-heading">
            <div>
              <p className="eyebrow">
                {view.tab === "today" && !view.edit
                  ? dateLabel(today, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })
                  : tr("eyebrow")}
              </p>
              <h1 ref={heading} tabIndex={-1}>
                {title}
              </h1>
              {!view.edit && (
                <p className="muted">{tr(`${view.tab}_subtitle`)}</p>
              )}
            </div>
            {!view.edit &&
              (view.tab === "today" || view.tab === "trackers") && (
                <button
                  className="primary-button"
                  onClick={() => choose("trackers", "new")}
                >
                  <Icon name="plus" />
                  {tr("new_tracker")}
                </button>
              )}
          </div>
          <LoadState {...settings} />
          <LoadState {...trackers} />
          {settings.data && trackers.data && (
            <>
              {view.edit ? (
                view.edit === "new" || all.some((t) => t.id === view.edit) ? (
                  <TrackerEditor
                    key={view.edit}
                    existing={all.find((t) => t.id === view.edit)}
                    timezone={settings.data.timezone}
                    onDirty={setDirty}
                    onClose={() => choose("trackers")}
                    onSaved={() => {
                      refresh();
                      choose("trackers", null, true);
                    }}
                  />
                ) : (
                  <Empty
                    title={tr("no_results")}
                    action={
                      <button
                        className="secondary-button"
                        onClick={() => choose("trackers")}
                      >
                        {tr("back")}
                      </button>
                    }
                  >
                    {tr("retry")}
                  </Empty>
                )
              ) : (
                <>
                  {view.tab === "today" && (
                    <Today
                      revision={revision}
                      empty={!trackers.data.active.length}
                      onCreate={() => choose("trackers", "new")}
                      onOpen={(id, day) => setWizard({ id, day })}
                      today={today}
                    />
                  )}
                  {view.tab === "calendar" && (
                    <CalendarView
                      today={today}
                      trackers={all}
                      revision={revision}
                      onOpen={(id, day) => setWizard({ id, day })}
                    />
                  )}
                  {view.tab === "trackers" && (
                    <Trackers
                      active={trackers.data.active}
                      archived={trackers.data.archived}
                      onChange={refresh}
                      onEdit={(id) => choose("trackers", id)}
                      onCreate={() => choose("trackers", "new")}
                    />
                  )}
                  {view.tab === "statistics" && (
                    <StatisticsView
                      today={today}
                      timezone={settings.data.timezone}
                      trackers={all}
                      revision={revision}
                    />
                  )}
                  {view.tab === "achievements" && (
                    <AchievementsView revision={revision} />
                  )}
                  {view.tab === "settings" && (
                    <Settings
                      timezone={settings.data.timezone}
                      onSaved={refresh}
                    />
                  )}
                </>
              )}
            </>
          )}
          {wizard && (
            <EntryWizard
              key={`${wizard.id}:${wizard.day}`}
              {...wizard}
              onClose={() => setWizard(null)}
              onSaved={refresh}
            />
          )}
        </div>
      </main>
    </div>
  );
}
function Today({
  revision,
  empty,
  onCreate,
  onOpen,
  today,
}: {
  revision: number;
  empty: boolean;
  onCreate: () => void;
  onOpen: (id: string, day: string) => void;
  today: string;
}) {
  const result = useResource(
    (signal) => trackingApi.current(undefined, signal),
    [revision],
  );
  const daily =
    result.data?.filter((o) => o.definition.frequency === "daily") ?? [];
  return (
    <>
      <LoadState {...result} />
      {result.data &&
        (empty ? (
          <Empty
            title={tr("empty_title")}
            action={
              <button className="primary-button" onClick={onCreate}>
                <Icon name="plus" />
                {tr("new_tracker")}
              </button>
            }
          >
            {tr("empty_description")}
          </Empty>
        ) : !result.data.length ? (
          <Empty title={tr("nothing_today")}>
            {tr("nothing_today_description")}
          </Empty>
        ) : (
          <>
            {daily.length > 0 && (
              <div className="tracking-today-summary">
                <span className="tracking-today-symbol">
                  <Icon name="sun" size={30} />
                </span>
                <div>
                  <strong>{tr("current_progress")}</strong>
                  <p>
                    {tr("completed_count", {
                      count: daily.filter((o) => o.entry?.status === "complete")
                        .length,
                      total: daily.length,
                    })}
                  </p>
                </div>
                <span className="tracking-today-fraction">
                  {daily.filter((o) => o.entry?.status === "complete").length}
                  <small>/{daily.length}</small>
                </span>
              </div>
            )}
            {(["daily", "weekly", "monthly", "yearly"] as const).map(
              (frequency) => {
                const items = result.data!.filter(
                  (o) => o.definition.frequency === frequency,
                );
                return items.length ? (
                  <section className="tracking-current-group" key={frequency}>
                    <div className="tracking-section-heading">
                      <h2>{tr(frequency)}</h2>
                      <span className="muted">{items.length}</span>
                    </div>
                    <div className="tracking-current-grid">
                      {items.map((o) => (
                        <OccurrenceCard
                          key={o.tracker_id}
                          item={o}
                          onOpen={() =>
                            onOpen(
                              o.tracker_id,
                              localDay(o.definition.timezone) || today,
                            )
                          }
                        />
                      ))}
                    </div>
                  </section>
                ) : null;
              },
            )}
          </>
        ))}
    </>
  );
}
function Trackers({
  active,
  archived,
  onChange,
  onEdit,
  onCreate,
}: {
  active: Tracker[];
  archived: Tracker[];
  onChange: () => void;
  onEdit: (id: string) => void;
  onCreate: () => void;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const action = useAction(),
    items = showArchived ? archived : active;
  function order(index: number, delta: number) {
    const ids = active.map((t) => t.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    void action.run(() => trackingApi.order(ids), onChange);
  }
  return (
    <>
      <div className="tracking-toolbar">
        <label className="tracking-check">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          {tr("archives")}
        </label>
        <span className="muted">
          {items.length} {tr("trackers").toLowerCase()}
        </span>
      </div>
      <ErrorMessage message={action.error} />
      {!items.length ? (
        <Empty
          title={tr(showArchived ? "no_archives" : "empty_title")}
          action={
            !showArchived ? (
              <button className="primary-button" onClick={onCreate}>
                {tr("new_tracker")}
              </button>
            ) : undefined
          }
        >
          {tr(showArchived ? "archive_description" : "empty_description")}
        </Empty>
      ) : (
        <div className="tracking-tracker-list">
          {items.map((t, i) => (
            <article key={t.id}>
              <span className="tracking-tracker-symbol">
                <Icon
                  name={t.frequency === "daily" ? "sun" : "calendar"}
                  size={24}
                />
              </span>
              <div className="tracking-tracker-name">
                <h2>{t.name}</h2>
                <p>
                  {tr(t.frequency)} ·{" "}
                  {tr("field_count", { count: t.fields.length })}
                </p>
                {t.description && <small>{t.description}</small>}
              </div>
              <div className="tracking-tracker-actions">
                {!showArchived && (
                  <>
                    <button
                      className="icon-button"
                      disabled={!i || action.busy}
                      aria-label={`${tr("move_up")} ${t.name}`}
                      onClick={() => order(i, -1)}
                    >
                      <Icon name="up" />
                    </button>
                    <button
                      className="icon-button"
                      disabled={i === items.length - 1 || action.busy}
                      aria-label={`${tr("move_down")} ${t.name}`}
                      onClick={() => order(i, 1)}
                    >
                      <Icon name="down" />
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => onEdit(t.id)}
                    >
                      {tr("edit")}
                    </button>
                  </>
                )}
                <button
                  className="icon-button"
                  disabled={action.busy}
                  aria-label={`${tr(showArchived ? "restore" : "archive")} ${t.name}`}
                  onClick={() =>
                    void action.run(
                      () => trackingApi.archive(t, !showArchived),
                      onChange,
                    )
                  }
                >
                  <Icon name={showArchived ? "restore" : "archive"} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
function Settings({
  timezone,
  onSaved,
}: {
  timezone: string;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(timezone),
    [saved, setSaved] = useState(false),
    action = useAction();
  return (
    <form
      className="tracking-settings"
      onSubmit={(e) => {
        e.preventDefault();
        void action.run(
          () => trackingApi.saveSettings(value),
          () => {
            setSaved(true);
            onSaved();
          },
        );
      }}
    >
      <label>
        {tr("timezone")}
        <input
          required
          maxLength={100}
          list="tracking-timezones"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
        />
      </label>
      <datalist id="tracking-timezones">
        {[
          "Europe/Paris",
          "Europe/London",
          "Europe/Brussels",
          "America/Montreal",
          "America/New_York",
          "Asia/Tokyo",
          "UTC",
        ].map((z) => (
          <option key={z} value={z} />
        ))}
      </datalist>
      <p className="muted">{tr("settings_hint")}</p>
      <ErrorMessage message={action.error} />
      <button className="primary-button" disabled={action.busy}>
        {tr(action.busy ? "saving" : "save_settings")}
      </button>
      {saved && <p role="status">{tr("saved")}</p>}
      <p className="muted tracking-small">{tr("data_preserved")}</p>
    </form>
  );
}
