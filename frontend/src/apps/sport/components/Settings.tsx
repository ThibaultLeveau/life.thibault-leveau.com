import { useState } from "react";
import { ErrorMessage } from "../../../shared/ui/Dialog";
import { sportApi } from "../api";
import { LoadState, useAction, useResource } from "./common";
function SettingsForm({ initial }: { initial: number }) {
  const [rest, setRest] = useState(initial);
  const [saved, setSaved] = useState(false);
  const action = useAction();
  return (
    <form
      className="stack-form sport-settings"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        void action.run(
          () => sportApi.write("/settings", { rest_seconds: rest }),
          () => setSaved(true),
        );
      }}
    >
      <h2>Le rythme de vos séances</h2>
      <label>
        Temps de repos entre les séries (secondes)
        <input
          type="number"
          required
          min={0}
          max={3600}
          step={1}
          value={rest}
          onChange={(e) => {
            setRest(Number(e.target.value));
            setSaved(false);
          }}
        />
      </label>
      <p className="muted">
        Le compte à rebours démarre quand vous validez une série. Il reprend
        après un rechargement. La nouvelle durée s’applique à la prochaine série
        ; 0 désactive le repos.
      </p>
      <button className="primary-button" disabled={action.busy}>
        Enregistrer les réglages
      </button>
      <ErrorMessage message={action.error} />
      {saved && <p role="status">Réglages enregistrés.</p>}
      <a className="text-button" href="/documentation/sport/">
        Guide de l’application Sport →
      </a>
    </form>
  );
}
export function Settings() {
  const resource = useResource(sportApi.settings, []);
  return (
    <>
      <LoadState {...resource} />
      {resource.data && <SettingsForm initial={resource.data.rest_seconds} />}
    </>
  );
}
