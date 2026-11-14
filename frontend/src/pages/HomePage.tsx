import { useSession } from "../platform/auth/SessionProvider";
import { useApplications } from "../platform/applications/ApplicationProvider";
import { ApplicationCard } from "../platform/applications/ApplicationCard";
import { Icon } from "../shared/ui/Icon";
export function HomePage() {
  const { session } = useSession();
  const { items } = useApplications();
  const enabled = items?.filter((item) => item.enabled) ?? [];
  return (
    <>
      <section className="home-welcome" aria-labelledby="welcome-title">
        <p className="eyebrow">VOTRE ESPACE PERSONNEL</p>
        <h1 id="welcome-title">
          Bonjour, <span>{session.username}.</span>
        </h1>
        <p>Un espace pour chaque aspect de votre vie.</p>
      </section>
      <section aria-labelledby="applications-title">
        <div className="collection-heading">
          <h2 id="applications-title">
            Mes applications <span>{enabled.length}</span>
          </h2>
          <a href="/applications">
            Gérer mes applications <Icon name="arrow" size={16} />
          </a>
        </div>
        {enabled.length ? (
          <div className="application-grid">
            {enabled.map((application) => (
              <ApplicationCard key={application.id} application={application} />
            ))}
          </div>
        ) : (
          <div className="applications-empty">
            <Icon name="grid" size={32} />
            <h3>Aucune application activée</h3>
            <p>Choisissez vos applications dans la bibliothèque.</p>
            <a className="primary-button" href="/applications">
              Explorer la bibliothèque <Icon name="arrow" />
            </a>
          </div>
        )}
      </section>
    </>
  );
}
