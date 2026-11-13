import type { ReactNode } from 'react';
import { Navbar } from './Navbar';

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <Navbar />
      <main className="main-content" id="contenu" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
