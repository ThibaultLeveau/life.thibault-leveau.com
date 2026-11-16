import { tr } from "../shared/i18n";
import { useApplications } from "../platform/applications/ApplicationProvider";
import { ApplicationCard } from "../platform/applications/ApplicationCard";
import { ErrorMessage } from "../shared/ui/Dialog";
export function LibraryPage() {
  const { items, busy, actionError, notice, setEnabled } = useApplications();
  return (
    <>
      <section className="library-heading" aria-labelledby="library-title">
        <p className="eyebrow">{tr("tailored_to_you")}</p>
        <h1 id="library-title">{tr("application_library")}</h1>
        <p>{tr("enable_what_you_need_find_your_applications_on_the_home")}</p>
      </section>
      <ErrorMessage message={actionError} />
      <p className="library-notice" role="status">
        {notice}
      </p>
      <div className="application-grid" aria-busy={busy}>
        {items?.map((application) => (
          <ApplicationCard
            key={application.id}
            application={application}
            library
            busy={busy}
            onToggle={() =>
              void setEnabled(application.id, !application.enabled)
            }
          />
        ))}
      </div>
      {!items?.length && <p>{tr("no_applications_available_yet")}</p>}
      <p className="library-footnote">
        {tr("you_can_disable_an_application_at_any_time_your_data")}
      </p>
    </>
  );
}
