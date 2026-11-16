import { documentationPath, tr } from "../../shared/i18n";
import { Icon } from "../../shared/ui/Icon";
import { AccountMenu } from "./AccountMenu";
import type { ComponentProps } from "react";

export function ApplicationFooter({
  documentation,
  ...account
}: ComponentProps<typeof AccountMenu> & {
  documentation: string;
}) {
  return (
    <footer className="application-sidebar-footer">
      <a className="application-nav-item" href="/applications">
        <Icon name="grid" />
        {tr("application_library")}
      </a>
      <a
        className="application-nav-item"
        href={documentationPath(documentation)}
      >
        <Icon name="info" />
        {tr("documentation")}
      </a>
      <AccountMenu {...account} />
    </footer>
  );
}
