import { Icon, type IconName } from "../../shared/ui/Icon";
import type { Application } from "./types";
export function ApplicationCard({
  application,
  library = false,
  busy = false,
  onToggle,
}: {
  application: Application;
  library?: boolean;
  busy?: boolean;
  onToggle?: () => void;
}) {
  const icon: IconName = application.icon === "check" ? "check" : "grid";
  return (
    <article className="application-card" aria-label={application.name}>
      <div className="application-card-top">
        <span className="application-icon">
          <Icon name={icon} size={29} />
        </span>
        {library && (
          <span
            className={`application-state ${application.enabled ? "is-enabled" : ""}`}
          >
            {application.enabled ? "Activée" : "Désactivée"}
          </span>
        )}
      </div>
      <h2>{application.name}</h2>
      <p>{application.description}</p>
      <div className="application-card-actions">
        {application.enabled && (
          <a
            className="application-open"
            href={application.path}
            aria-label={`Ouvrir ${application.name}`}
          >
            Ouvrir <Icon name="arrow" />
          </a>
        )}
        {library && (
          <button
            className="application-toggle"
            role="switch"
            aria-checked={application.enabled}
            aria-label={`Activer ${application.name}`}
            disabled={busy}
            onClick={onToggle}
          >
            <span className="toggle-track" aria-hidden="true">
              <span />
            </span>
            <span>{application.enabled ? "Désactiver" : "Activer"}</span>
          </button>
        )}
      </div>
    </article>
  );
}
