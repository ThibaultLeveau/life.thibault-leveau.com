import { useState, type FormEvent } from "react";
import { api } from "../api";
import type { Workspace } from "../types";
import { Dialog, ErrorMessage } from "./Dialog";

export function WorkspaceDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (workspace: Workspace) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = new FormData(event.currentTarget);
    try {
      onCreated(
        await api<Workspace>("/workspaces", "POST", Object.fromEntries(values)),
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Créer un espace" onClose={onClose}>
      <form className="stack-form dialog-body" onSubmit={submit}>
        <p className="muted">
          Un espace pour vos projets, votre quotidien ou ce qui compte pour
          vous.
        </p>
        <label>
          Nom de l’espace
          <input
            name="name"
            autoFocus
            required
            maxLength={120}
            placeholder="Personnel, Travail, Un nouveau projet…"
          />
        </label>
        <label>
          Description
          <textarea
            name="description"
            rows={3}
            maxLength={20000}
            placeholder="À quoi cet espace est-il dédié ?"
          />
        </label>
        <label className="color-field">
          Couleur
          <input name="color" type="color" defaultValue="#c05a45" />
        </label>
        <ErrorMessage message={error} />
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Annuler
          </button>
          <button className="primary-button" disabled={busy}>
            {busy ? "Création…" : "Créer l’espace"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
