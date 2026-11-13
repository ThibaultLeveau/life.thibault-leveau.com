export function HomePage() {
  return (
    <section className="welcome" aria-labelledby="welcome-title">
      <div className="welcome-marker" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <h1 id="welcome-title">
        <span className="welcome-greeting">Bienvenue,</span>{' '}
        <span className="welcome-name">Thibault.</span>
      </h1>
      <div className="welcome-rule" aria-hidden="true" />
    </section>
  );
}
