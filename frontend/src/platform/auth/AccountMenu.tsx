import { useState } from "react";
import { ErrorMessage } from "../../shared/ui/Dialog";
import { Icon } from "../../shared/ui/Icon";
import { useSession } from "./SessionProvider";
import type { Theme } from "./types";

export function AccountMenu({
  disabled = false,
  beforeLogout,
}: {
  disabled?: boolean;
  beforeLogout?: () => Promise<void>;
}) {
  const { session, changeTheme, logout } = useSession();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function act(operation: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-menu">
      <label className="theme-select">
        <Icon name={session.theme === "dark" ? "moon" : "sun"} />
        <span className="sr-only">Apparence</span>
        <select
          disabled={busy || disabled}
          value={session.theme}
          onChange={(event) =>
            void act(() => changeTheme(event.target.value as Theme))
          }
        >
          <option value="system">Thème du système</option>
          <option value="light">Thème clair</option>
          <option value="dark">Thème sombre</option>
        </select>
      </label>
      <span className="account-name">{session.username}</span>
      <button
        className="icon-button"
        aria-label="Se déconnecter"
        disabled={busy || disabled}
        onClick={() =>
          void act(async () => {
            await beforeLogout?.();
            await logout();
          })
        }
      >
        <Icon name="logout" />
      </button>
      <ErrorMessage message={error} />
    </div>
  );
}
