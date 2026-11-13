export function Navbar() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href="/" aria-label="Life, accueil">
          <svg className="brand-symbol" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <rect width="40" height="40" rx="12" fill="currentColor" />
            <path d="M12 11v18h16v-5H17V11h-5Z" fill="var(--color-background)" />
            <circle cx="26" cy="14" r="3" fill="var(--color-accent-soft)" />
          </svg>
          <span>Life<span className="brand-period">.</span></span>
        </a>

        <nav className="navigation" aria-label="Navigation principale">
          <a className="nav-link nav-link-active" href="/" aria-current="page">
            <span className="active-dot" aria-hidden="true" />
            Accueil
          </a>
          <a className="nav-link" href="/tasks">Tâches</a>
          <a className="nav-link nav-link-documentation" href="/documentation/">
            Documentation
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M5 10h10m-4-4 4 4-4 4" />
            </svg>
          </a>
        </nav>
      </div>
    </header>
  );
}
