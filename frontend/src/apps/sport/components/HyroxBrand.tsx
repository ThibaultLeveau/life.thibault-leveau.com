import { useEffect, useState } from "react";
import logo from "../assets/hyrox-logo.svg";
import { daysUntil, localDay } from "../hyrox";

export function HyroxMark() {
  return (
    <img className="sport-hyrox-logo" src={logo} alt="HYROX" width="520" height="72" />
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
      aria-label="Préparation HYROX"
    >
      <div className="sport-hyrox-identity">
        <span className="sport-hyrox-kicker">LIFEOS SPORT / PRÉPARATION</span>
        <HyroxMark />
        <span className="sport-hyrox-motto">Chaque séance vous rapproche.</span>
      </div>
      <div className="sport-hyrox-countdown" aria-live="polite" aria-atomic="true">
        <span className="sport-hyrox-kicker">OBJECTIF COMPÉTITION</span>
        <strong>
          {days === null
            ? "EN ROUTE"
            : days > 0
              ? `J−${days}`
              : days === 0
                ? "JOUR J"
                : "APRÈS COURSE"}
        </strong>
        <span>
          {days === null
            ? "Votre prochain départ se prépare ici."
            : days > 0
              ? `${days} jour${days > 1 ? "s" : ""} avant le départ`
              : days === 0
                ? "C’est votre jour. À vous de jouer."
                : "Cap sur votre prochain défi."}
        </span>
        {date && days !== null && (
          <time dateTime={date}>
            {new Intl.DateTimeFormat("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(date))}
          </time>
        )}
      </div>
      <div className="sport-hyrox-track" aria-hidden="true">
        <i /><i /><i /><i /><i />
      </div>
    </div>
  );
}
