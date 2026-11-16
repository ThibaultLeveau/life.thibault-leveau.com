import { useEffect, useId, useRef, useState } from "react";
import { tr, formatLocale } from "../../shared/i18n";
import { Icon } from "../../shared/ui/Icon";
import { ErrorMessage } from "../../shared/ui/Dialog";
import { useApiResource } from "../useApiResource";
import { useApplications } from "../applications/ApplicationProvider";
import { progressionApi } from "./api";
import { usageDaysLabel } from "./calendar";
import { useProgressionRevision } from "./useProgression";
import type { Quest } from "./types";
import "./styles.css";

export const points = (n: number) =>
  new Intl.NumberFormat(formatLocale()).format(n);
export function ProgressBar({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  return (
    <div
      className="progression-bar"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <span style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  );
}
export function QuestPreview({ quest }: { quest: Quest }) {
  return (
    <div className="progression-quest-preview">
      <div>
        <strong>{quest.name}</strong>
        <span>+{points(quest.xp)} XP</span>
      </div>
      <p>{quest.description}</p>
      <ProgressBar value={quest.ratio} label={quest.name} />
      <small>
        {points(quest.progress)} / {points(quest.target)}
      </small>
    </div>
  );
}
export function ProgressionBadge({ applicationId }: { applicationId: string }) {
  const revision = useProgressionRevision();
  const result = useApiResource(
    (signal) => progressionApi.summary(applicationId, signal),
    [applicationId, revision],
  );
  const { items } = useApplications();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const data = result.data;
  const tracking = items?.find((app) => app.id === "tracking" && app.enabled);
  return (
    <div
      className="progression-widget"
      ref={root}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget as Node)
        )
          setOpen(false);
      }}
    >
      <button
        ref={button}
        className="progression-badge"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        aria-label={
          data
            ? tr("progression_badge_label", {
                level: data.level,
                title: data.title,
                streak: data.streak,
                count: data.streak,
              })
            : tr("progression_open")
        }
        onClick={() => setOpen((value) => !value)}
      >
        <span className="progression-level-number">{data?.level ?? "·"}</span>
        <span className="progression-badge-title">
          {data?.title ?? tr("progression_name")}
        </span>
        <span className="progression-badge-streak">
          <Icon name="repeat" size={12} />
          {data?.streak ?? "—"}
        </span>
        <Icon name="down" size={12} />
      </button>
      {open && (
        <section
          id={panelId}
          className="progression-popover"
          role="dialog"
          aria-label={tr("progression_open")}
        >
          <div className="progression-popover-heading">
            <strong>{tr("progression_open")}</strong>
            <button
              ref={closeButton}
              className="icon-button"
              aria-label={tr("close")}
              onClick={() => {
                setOpen(false);
                button.current?.focus();
              }}
            >
              <Icon name="x" />
            </button>
          </div>
          {result.loading && <p role="status">{tr("progression_loading")}</p>}
          {result.error && (
            <>
              <ErrorMessage message={result.error} />
              <button className="secondary-button" onClick={result.reload}>
                {tr("try_again")}
              </button>
            </>
          )}
          {data && (
            <>
              <div className="progression-popover-status">
                <strong>
                  {tr("progression_level", { level: data.level })} ·{" "}
                  {data.title}
                </strong>
                <span>{points(data.xp)} XP</span>
              </div>
              <ProgressBar
                value={data.level_progress}
                label={tr("progression_next_level")}
              />
              <p className="progression-muted">
                {data.next_level_xp
                  ? tr("progression_remaining", {
                      xp: points(data.next_level_xp - data.xp),
                    })
                  : tr("progression_max")}
              </p>
              <p className="progression-series-note">
                {tr("progression_series", { count: data.streak })}
                {data.paused_today ? ` · ${tr("progression_rest")}` : ""}
              </p>
              <p className="progression-muted">
                {tr("progression_schedule", {
                  days: usageDaysLabel(data.usage_days),
                })}
              </p>
              <h3>{tr("progression_almost")}</h3>
              {data.closest.map((quest) => (
                <QuestPreview key={quest.id} quest={quest} />
              ))}
              {!data.closest.length && <p>{tr("progression_all_earned")}</p>}
              {tracking && (
                <a
                  className="progression-wall-link"
                  href={`${tracking.path}?tab=achievements&application=${applicationId}`}
                >
                  {tr("progression_view_wall")}
                  <Icon name="arrow" size={15} />
                </a>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
