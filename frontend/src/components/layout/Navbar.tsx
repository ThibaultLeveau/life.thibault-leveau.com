import { tr, documentationPath } from "../../shared/i18n";
import { AccountMenu } from "../../platform/auth/AccountMenu";
import { Icon } from "../../shared/ui/Icon";
import type { ComponentProps } from "react";
export function Navbar({
  account,
}: {
  account?: ComponentProps<typeof AccountMenu>;
}) {
  const path = window.location.pathname;
  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href="/" aria-label={tr("lifeos_home")}>
          <span className="brand-symbol">
            <Icon name="grid" size={25} />
          </span>
          <span>
            LifeOS<span className="brand-period">.</span>
          </span>
        </a>
        <nav className="navigation" aria-label={tr("main_navigation")}>
          {[
            { path: "/", name: tr("home") },
            { path: "/applications", name: tr("library") },
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
          <a className="nav-link" href={documentationPath("")}>
            {tr("documentation")}
          </a>
        </nav>
        <AccountMenu {...account} dropdown />
      </div>
    </header>
  );
}
