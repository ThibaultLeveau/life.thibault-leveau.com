import { useState, type FormEvent } from "react";
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
      <section className="login-card">
        <h1>Connexion</h1>
        <form onSubmit={submit} className="stack-form">
          <label>
            Identifiant
            <input
              name="username"
              autoComplete="username"
              required
              maxLength={80}
              autoFocus
            />
          </label>
          <label>
            Mot de passe
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
            {busy ? "Connexion…" : "Se connecter"}
            <Icon name="arrow" />
          </button>
        </form>
      </section>
    </main>
  );
}
