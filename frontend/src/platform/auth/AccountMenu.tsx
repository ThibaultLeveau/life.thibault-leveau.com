import { tr } from "../../shared/i18n";
import type { Locale } from "../i18n";
import { useState } from "react";
import { AccountDropdown } from "./AccountDropdown";
import { ErrorMessage } from "../../shared/ui/Dialog";
import { Icon } from "../../shared/ui/Icon";
import { useSession } from "./SessionProvider";
import type { Theme } from "./types";

export function AccountMenu({
  disabled = false,
  dropdown = false,
  beforeSessionChange,
}: {
  disabled?: boolean;
  dropdown?: boolean;
  beforeSessionChange?: () => boolean | void | Promise<boolean | void>;
}) {
  const { session, changeTheme, changeLocale, logout } = useSession();
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
        <span className="sr-only">{tr("appearance")}</span>
        <select
          disabled={busy || disabled}
          value={session.theme}
          onChange={(event) =>
            void act(() => changeTheme(event.target.value as Theme))
          }
        >
          <option value="system">{tr("system_theme")}</option>
          <option value="light">{tr("light_theme")}</option>
          <option value="dark">{tr("dark_theme")}</option>
        </select>
      </label>
      <label className="theme-select">
        <span className="sr-only">{tr("language")}</span>
        <select
          disabled={busy || disabled}
          value={session.locale}
          onChange={(event) => {
            const locale = event.target.value as Locale;
            void act(async () => {
              if ((await beforeSessionChange?.()) === false) return;
              await changeLocale(locale);
            });
          }}
        >
          <option value="fr" lang="fr">
            Français
          </option>
          <option value="en" lang="en">
            English
          </option>
        </select>
      </label>
      {dropdown ? (
        <AccountDropdown
          username={session.username}
          disabled={busy || disabled}
          onLogout={() =>
            void act(async () => {
              if ((await beforeSessionChange?.()) === false) return;
              await logout();
            })
          }
        />
      ) : (
        <>
          <span className="account-name">{session.username}</span>
          <button
            className="icon-button"
            aria-label={tr("sign_out")}
            disabled={busy || disabled}
            onClick={() =>
              void act(async () => {
                if ((await beforeSessionChange?.()) === false) return;
                await logout();
              })
            }
          >
            <Icon name="logout" />
          </button>
        </>
      )}
      <ErrorMessage message={error} />
    </div>
  );
}
