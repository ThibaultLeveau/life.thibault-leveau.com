import { tr } from "../../shared/i18n";
import type { ComponentProps, ReactNode } from "react";
import { Navbar } from "./Navbar";

export function AppLayout({
  children,
  account,
}: {
  children: ReactNode;
  account?: ComponentProps<typeof Navbar>["account"];
}) {
  return (
    <div className="app-shell ui-scope">
      <a className="skip-link" href="#contenu">
        {tr("skip_to_content")}
      </a>
      <Navbar account={account} />
      <main className="main-content" id="contenu" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
