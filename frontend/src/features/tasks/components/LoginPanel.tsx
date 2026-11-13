import { useState, type FormEvent } from "react";
import { api } from "../api";
import type { Session } from "../types";
import { Icon } from "./Icon";
import { ErrorMessage } from "./Dialog";

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
      <a className="task-brand" href="/">
        <span className="task-brand-icon">
          <Icon name="check" size={22} />
        </span>
        Life<span className="brand-period">.</span>
      </a>
      <section className="login-card">
        <div className="login-symbol">
          <Icon name="list" size={30} />
        </div>
        <p className="eyebrow">UN PEU DE CLARTÉ, CHAQUE JOUR</p>
        <h1>Place à l’essentiel.</h1>
        <p className="muted">
          Connectez-vous pour retrouver vos espaces et avancer à votre rythme.
        </p>
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
            {busy ? "Connexion…" : "Ouvrir mon espace"}
            <Icon name="arrow" />
          </button>
        </form>
        <p className="login-footer">Votre espace personnel, au même endroit.</p>
      </section>
      <a className="muted login-docs" href="/documentation/">
        Documentation de Life <Icon name="arrow" size={14} />
      </a>
    </main>
  );
}
