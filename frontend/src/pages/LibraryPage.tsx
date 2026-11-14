import { useApplications } from "../platform/applications/ApplicationProvider";
import { ApplicationCard } from "../platform/applications/ApplicationCard";
import { ErrorMessage } from "../shared/ui/Dialog";
export function LibraryPage() {
  const { items, busy, actionError, notice, setEnabled } = useApplications();
  return (
    <>
      <section className="library-heading" aria-labelledby="library-title">
        <p className="eyebrow">À VOTRE MESURE</p>
        <h1 id="library-title">Bibliothèque des applications</h1>
        <p>
          Activez ce qui vous est utile. Retrouvez vos applications sur
          l’accueil.
        </p>
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
      {!items?.length && <p>Aucune application disponible pour le moment.</p>}
      <p className="library-footnote">
        Vous pouvez désactiver une application à tout moment. Vos données sont
        conservées.
      </p>
    </>
  );
}
