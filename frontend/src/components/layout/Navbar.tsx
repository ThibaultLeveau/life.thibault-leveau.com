import { AccountMenu } from "../../platform/auth/AccountMenu";
import { Icon } from "../../shared/ui/Icon";
export function Navbar() {
  const path = window.location.pathname;
  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href="/" aria-label="LifeOS, accueil">
          <span className="brand-symbol">
            <Icon name="grid" size={25} />
          </span>
          <span>
            LifeOS<span className="brand-period">.</span>
          </span>
        </a>
        <nav className="navigation" aria-label="Navigation principale">
          {[
            { path: "/", name: "Accueil" },
            { path: "/applications", name: "Bibliothèque" },
          ].map((item) => (
            <a
              key={item.path}
              className={`nav-link ${path === item.path ? "nav-link-active" : ""}`}
              href={item.path}
              aria-current={path === item.path ? "page" : undefined}
            >
              {item.name}
            </a>
          ))}
          <a className="nav-link" href="/documentation/">
            Documentation
          </a>
        </nav>
        <AccountMenu />
      </div>
    </header>
  );
}
