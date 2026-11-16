import { formatLocale } from "../../../shared/i18n";
import { tr } from "../i18n";
import { useEffect, useState } from "react";
import logo from "../assets/hyrox-logo.svg";
import { daysUntil, localDay } from "../hyrox";

export function HyroxMark() {
  return (
    <img
      className="sport-hyrox-logo"
      src={logo}
      alt="HYROX"
      width="520"
      height="72"
    />
  );
}

export function HyroxBrand({
  date,
  compact = false,
}: {
  date: string | null;
  compact?: boolean;
}) {
  const [today, setToday] = useState(localDay);
  useEffect(() => {
    if (!date) return;
    const refresh = () => setToday(localDay());
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [date]);
  const days = date ? daysUntil(date, today) : null;
  return (
    <div
      className={`sport-hyrox-brand ${compact ? "is-compact" : ""}`}
      role="region"
      aria-label={tr("hyrox_preparation")}
    >
      <div className="sport-hyrox-identity">
        <span className="sport-hyrox-kicker">{tr("hyrox_kicker")}</span>
        <HyroxMark />
        <span className="sport-hyrox-motto">{tr("hyrox_motto")}</span>
      </div>
      <div
        className="sport-hyrox-countdown"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="sport-hyrox-kicker">{tr("hyrox_goal")}</span>
        <strong>
          {days === null
            ? tr("hyrox_on_the_way")
            : days > 0
              ? tr("hyrox_countdown", { count: days })
              : days === 0
                ? tr("hyrox_race_day")
                : tr("hyrox_after_race")}
        </strong>
        <span>
          {days === null
            ? tr("hyrox_prepare_start")
            : days > 0
              ? tr("hyrox_days_until", { count: days })
              : days === 0
                ? tr("hyrox_today")
                : tr("hyrox_next_challenge")}
        </span>
        {date && days !== null && (
          <time dateTime={date}>
            {new Intl.DateTimeFormat(formatLocale(), {
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(date))}
          </time>
        )}
      </div>
      <div className="sport-hyrox-track" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}
