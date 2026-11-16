import { useEffect, useState } from "react";
import { tr, formatLocale, type MessageKey } from "../../../shared/i18n";
import { Icon, type IconName } from "../../../shared/ui/Icon";
import { ErrorMessage } from "../../../shared/ui/Dialog";
import { useApiResource } from "../../../platform/useApiResource";
import { progressionApi } from "../../../platform/progression/api";
import {
  ProgressBar,
  points,
} from "../../../platform/progression/ProgressionBadge";
import { useProgressionRevision } from "../../../platform/progression/useProgression";
import type { Progression, Quest } from "../../../platform/progression/types";

function ResourceState({
  loading,
  error,
  reload,
}: {
  loading: boolean;
  error: string;
  reload: () => void;
}) {
  return (
    <>
      {loading && <p role="status">{tr("progression_loading")}</p>}
      {error && (
        <>
          <ErrorMessage message={error} />
          <button className="secondary-button" onClick={reload}>
            {tr("try_again")}
          </button>
        </>
      )}
    </>
  );
}
export function AchievementsView({ revision }: { revision: number }) {
  const live = useProgressionRevision();
  const result = useApiResource(progressionApi.all, [revision, live]);
  const [selected, setSelected] = useState(
    () => new URLSearchParams(location.search).get("application") ?? "tracking",
  );
  const app =
    result.data?.find((a) => a.application_id === selected) ?? result.data?.[0];
  return (
    <div className="progression-achievements">
      <ResourceState {...result} />
      {result.data && (
        <>
          <div
            className="progression-app-picker"
            role="group"
            aria-label={tr("progression_name")}
          >
            {result.data.map((item) => (
              <button
                key={item.application_id}
                aria-pressed={item.application_id === app?.application_id}
                onClick={() => {
                  setSelected(item.application_id);
                  const url = new URL(location.href);
                  url.searchParams.set("application", item.application_id);
                  history.replaceState(history.state, "", url);
                }}
              >
                <Icon name={item.icon as IconName} />
                <span>{item.name}</span>
                <small>{tr("progression_level", { level: item.level })}</small>
              </button>
            ))}
          </div>
          {app && (
            <ApplicationAchievements
              key={app.application_id}
              app={app}
              revision={`${revision}:${live}`}
            />
          )}
        </>
      )}
    </div>
  );
}
function ApplicationAchievements({
  app,
  revision,
}: {
  app: Progression;
  revision: string;
}) {
  const nextTitle = app.titles.find((t) => !t.earned);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setOffset(0);
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);
  const quests = useApiResource(
    (signal) =>
      progressionApi.quests(app.application_id, filter, query, offset, signal),
    [app.application_id, filter, query, offset, revision],
  );
  return (
    <>
      <section className="progression-hero" aria-label={tr("progression_open")}>
        <div className="progression-hero-main">
          <div className="progression-emblem" aria-hidden="true">
            <span>{app.level}</span>
            <Icon name="flag" size={22} />
          </div>
          <div className="progression-hero-copy">
            <p className="progression-eyebrow">{tr("progression_journey")}</p>
            <h2>{app.title}</h2>
            <p>
              {tr("progression_level", { level: app.level })} <span>·</span>{" "}
              {points(app.xp)} XP
            </p>
            <ProgressBar
              value={app.level_progress}
              label={tr("progression_next_level")}
            />
            <small>
              {app.next_level_xp
                ? tr("progression_remaining", {
                    xp: points(app.next_level_xp - app.xp),
                  })
                : tr("progression_max")}
            </small>
          </div>
        </div>
        <div className="progression-hero-next">
          <span>{tr("progression_next_title")}</span>
          <strong>{nextTitle?.name ?? app.title}</strong>
          <small>
            {tr("progression_level", { level: nextTitle?.level ?? 100 })}
          </small>
          <p>
            {tr("progression_quest_count", {
              earned: app.quests_earned,
              total: app.quests_total,
            })}
          </p>
        </div>
      </section>
      <div className="progression-stats">
        <article>
          <span>
            <Icon name="repeat" />
            {tr("progression_series_label")}
          </span>
          <strong>
            {app.streak}
            <small>{tr("progression_days", { count: app.streak })}</small>
          </strong>
          <p>
            {tr("progression_best", { count: app.best_streak })}
            {app.next_streak &&
              ` · ${tr("progression_streak_next", { count: app.next_streak })}`}
          </p>
        </article>
        <article>
          <span>
            <Icon name="calendar" />
            {tr("progression_active_days")}
          </span>
          <strong>{points(app.active_days)}</strong>
          <p>
            {tr(
              app.paused_today
                ? "progression_rest"
                : app.today_active
                  ? "progression_today_done"
                  : "progression_today_waiting",
            )}
          </p>
        </article>
      </div>
      <details className="progression-titles">
        <summary>
          {tr("progression_titles")}
          <span>10 → 100</span>
        </summary>
        <ol>
          {app.titles.map((title) => (
            <li key={title.level} className={title.earned ? "is-earned" : ""}>
              <span className="progression-title-level">
                {title.earned ? <Icon name="check" size={15} /> : title.level}
              </span>
              <div>
                <strong>{title.name}</strong>
                <small>
                  {tr("progression_level", { level: title.level })} ·{" "}
                  {points(title.xp)} XP
                </small>
              </div>
            </li>
          ))}
        </ol>
      </details>
      <div className="progression-body">
        <section className="progression-wall">
          <div className="progression-section-heading">
            <div>
              <h2>{tr("progression_wall")}</h2>
              <p>{tr("progression_wall_hint")}</p>
            </div>
            <span className="progression-count">
              {app.quests_earned}/{app.quests_total}
            </span>
          </div>
          <div className="progression-filters">
            <div role="group" aria-label={tr("progression_wall")}>
              {(["all", "available", "earned"] as const).map((state) => (
                <button
                  key={state}
                  aria-pressed={filter === state}
                  onClick={() => {
                    setFilter(state);
                    setOffset(0);
                  }}
                >
                  {tr(`progression_${state}`)}
                </button>
              ))}
            </div>
            <label className="progression-search">
              <Icon name="search" size={16} />
              <input
                type="search"
                aria-label={tr("progression_search")}
                placeholder={tr("progression_search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          <ResourceState {...quests} />
          {quests.data && (
            <>
              {quests.data.items.length ? (
                <div className="progression-quest-grid">
                  {quests.data.items.map((quest) => (
                    <QuestCard key={quest.id} quest={quest} />
                  ))}
                </div>
              ) : (
                <p className="progression-empty">{tr("progression_empty")}</p>
              )}
              {quests.data.total > 60 && (
                <Pagination
                  offset={offset}
                  limit={60}
                  total={quests.data.total}
                  onChange={setOffset}
                />
              )}
            </>
          )}
        </section>
        <aside className="progression-journal">
          <PointHistory
            applicationId={app.application_id}
            revision={revision}
          />
          <details className="progression-rules">
            <summary>{tr("progression_rules")}</summary>
            <p>{app.rules}</p>
            <p>{tr("progression_rules_common")}</p>
          </details>
        </aside>
      </div>
    </>
  );
}
function QuestCard({ quest }: { quest: Quest }) {
  const icons: Record<string, IconName> = {
    practice: "check",
    mastery: "flag",
    exploration: "grid",
    consistency: "calendar",
    streak: "repeat",
  };
  return (
    <article
      className={`progression-quest-card ${quest.earned_at ? "is-earned" : ""}`}
    >
      <div className="progression-quest-top">
        <span className="progression-quest-icon">
          <Icon
            name={quest.earned_at ? "check" : (icons[quest.category] ?? "flag")}
            size={20}
          />
        </span>
        <span className="progression-xp">+{points(quest.xp)} XP</span>
      </div>
      <span className="progression-eyebrow">
        {tr(`progression_category_${quest.category}` as MessageKey)}
      </span>
      <h3>{quest.name}</h3>
      <p>{quest.description}</p>
      <div className="progression-quest-bottom">
        <ProgressBar value={quest.ratio} label={quest.name} />
        <span>
          {quest.earned_at
            ? tr("progression_earned")
            : `${points(quest.progress)} / ${points(quest.target)}`}
        </span>
        {quest.earned_at && (
          <time dateTime={quest.earned_at}>
            {new Intl.DateTimeFormat(formatLocale(), {
              day: "numeric",
              month: "short",
              year: "numeric",
            }).format(new Date(quest.earned_at))}
          </time>
        )}
      </div>
    </article>
  );
}
function PointHistory({
  applicationId,
  revision,
}: {
  applicationId: string;
  revision: string;
}) {
  const [offset, setOffset] = useState(0);
  const result = useApiResource(
    (signal) => progressionApi.history(applicationId, offset, signal),
    [applicationId, offset, revision],
  );
  return (
    <section>
      <h2>{tr("progression_history")}</h2>
      <p className="progression-muted">{tr("progression_history_hint")}</p>
      <ResourceState {...result} />
      {result.data && (
        <>
          {!result.data.items.length && (
            <p className="progression-empty">
              {tr("progression_history_empty")}
            </p>
          )}
          <ol className="progression-history-list">
            {result.data.items.map((reward) => (
              <li key={reward.id}>
                <span className="progression-history-icon">
                  <Icon
                    name={reward.kind === "quest" ? "flag" : "check"}
                    size={15}
                  />
                </span>
                <div>
                  <strong>{reward.label}</strong>
                  <time dateTime={reward.occurred_at}>
                    {new Intl.DateTimeFormat(formatLocale(), {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(reward.occurred_at))}
                  </time>
                  {reward.imported && (
                    <small>{tr("progression_imported")}</small>
                  )}
                </div>
                <b>+{points(reward.xp)}</b>
              </li>
            ))}
          </ol>
          {result.data.total > 20 && (
            <Pagination
              offset={offset}
              limit={20}
              total={result.data.total}
              onChange={setOffset}
            />
          )}
        </>
      )}
    </section>
  );
}
function Pagination({
  offset,
  limit,
  total,
  onChange,
}: {
  offset: number;
  limit: number;
  total: number;
  onChange: (value: number) => void;
}) {
  return (
    <nav
      className="progression-pagination"
      aria-label={tr("progression_page", {
        from: offset + 1,
        to: Math.min(total, offset + limit),
        total,
      })}
    >
      <button
        className="icon-button"
        disabled={!offset}
        aria-label={tr("progression_previous")}
        onClick={() => onChange(Math.max(0, offset - limit))}
      >
        ←
      </button>
      <small>
        {tr("progression_page", {
          from: offset + 1,
          to: Math.min(total, offset + limit),
          total,
        })}
      </small>
      <button
        className="icon-button"
        disabled={offset + limit >= total}
        aria-label={tr("progression_next")}
        onClick={() => onChange(offset + limit)}
      >
        →
      </button>
    </nav>
  );
}
