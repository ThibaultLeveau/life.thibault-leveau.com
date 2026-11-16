import { tr } from "../../shared/i18n";
import { useTranslation } from "react-i18next";
import { setLanguage, type Locale } from "../i18n";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import type { Session } from "./types";
import { Icon } from "../../shared/ui/Icon";
import { ErrorMessage } from "../../shared/ui/Dialog";

export function LoginPanel({
  onLogin,
  initialError = "",
}: {
  onLogin: (session: Session) => void;
  initialError?: string;
}) {
  const { i18n } = useTranslation();
  useEffect(() => {
    document.title = `${tr("sign_in")} · LifeOS`;
  }, [i18n.language]);
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      onLogin(
        await api<Session>("/auth/session", "POST", {
          username: form.get("username"),
          password: form.get("password"),
        }),
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <a className="app-brand" href="/">
        <span className="app-brand-icon">
          <Icon name="grid" size={22} />
        </span>
        LifeOS<span className="brand-period">.</span>
      </a>
      <label className="theme-select">
        <span className="sr-only">{tr("language")}</span>
        <select
          value={i18n.language}
          disabled={busy}
          onChange={(event) => {
            setError("");
            setLanguage(event.target.value as Locale);
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
      <section className="login-card">
        <h1>{tr("sign_in")}</h1>
        <form onSubmit={submit} className="stack-form">
          <label>
            {tr("username")}
            <input
              name="username"
              autoComplete="username"
              required
              maxLength={80}
              autoFocus
            />
          </label>
          <label>
            {tr("password")}
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={1024}
            />
          </label>
          <ErrorMessage message={error} />
          <button className="primary-button" disabled={busy}>
            {busy ? tr("signing_in") : tr("sign_in_action")}
            <Icon name="arrow" />
          </button>
        </form>
      </section>
    </main>
  );
}
