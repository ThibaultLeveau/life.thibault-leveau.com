import { tr } from "../shared/i18n";
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
        <p className="eyebrow">{tr("your_personal_space")}</p>
        <h1 id="welcome-title">
          {tr("hello")} <span>{session.username}.</span>
        </h1>
        <p>{tr("a_space_for_every_part_of_your_life")}</p>
      </section>
      <section aria-labelledby="applications-title">
        <div className="collection-heading">
          <h2 id="applications-title">
            {tr("my_applications")} <span>{enabled.length}</span>
          </h2>
          <a href="/applications">
            {tr("manage_my_applications")} <Icon name="arrow" size={16} />
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
            <h3>{tr("no_applications_enabled")}</h3>
            <p>{tr("choose_your_applications_in_the_library")}</p>
            <a className="primary-button" href="/applications">
              {tr("explore_the_library")} <Icon name="arrow" />
            </a>
          </div>
        )}
      </section>
    </>
  );
}
