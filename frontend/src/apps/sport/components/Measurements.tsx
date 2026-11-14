import { useState } from "react";
import { Dialog, ErrorMessage } from "../../../shared/ui/Dialog";
import { sportApi } from "../api";
import { measureFields, type Measurement, type MeasureValues } from "../types";
import {
  day,
  Empty,
  LoadState,
  localDay,
  number,
  useAction,
  useResource,
} from "./common";

function MeasurementForm({
  measurement,
  onClose,
  onSaved,
}: {
  measurement?: Measurement;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(measurement?.measured_on ?? localDay());
  const [values, setValues] = useState<MeasureValues>(
    Object.fromEntries(
      measureFields.map(([key]) => [key, measurement?.[key] ?? null]),
    ),
  );
  const [notes, setNotes] = useState(measurement?.notes ?? "");
  const action = useAction();
  return (
    <Dialog
      title={
        measurement ? "Modifier les mensurations" : "Relever mes mensurations"
      }
      wide
      onClose={onClose}
    >
      <form
        className="dialog-body stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(
            () =>
              sportApi.write(
                `/measurements${measurement ? `/${measurement.id}` : ""}`,
                {
                  measured_on: date,
                  ...values,
                  notes,
                  ...(measurement
                    ? { expected_version: measurement.version }
                    : {}),
                },
                measurement ? "PUT" : "POST",
              ),
            onSaved,
          );
        }}
      >
        <fieldset className="sport-fieldset" disabled={action.busy}>
          <label>
            Date du relevé
            <input
              type="date"
              required
              value={date}
              max={localDay()}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <p className="muted">
            Renseignez les mesures que vous souhaitez suivre. Un seul relevé par
            jour, modifiable à tout moment.
          </p>
          <div className="form-grid">
            {measureFields.map(([key, label, unit]) => (
              <label key={key}>
                {label} ({unit})
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.1"
                  step="any"
                  max={
                    key === "weight_kg"
                      ? 1000
                      : key === "body_fat_pct"
                        ? 99.99
                        : 500
                  }
                  value={values[key] ?? ""}
                  onChange={(e) =>
                    setValues((old) => ({
                      ...old,
                      [key]:
                        e.target.value === "" ? null : Number(e.target.value),
                    }))
                  }
                />
              </label>
            ))}
          </div>
          <label>
            Notes
            <textarea
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <ErrorMessage message={action.error} />
          <div className="dialog-actions">
            <button
              className="primary-button"
              disabled={!Object.values(values).some((v) => v != null)}
            >
              Enregistrer les mensurations
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
export function Measurements() {
  const [archived, setArchived] = useState(false);
  const [form, setForm] = useState<Measurement | "new" | null>(null);
  const resource = useResource(
    (signal) => sportApi.measurements(archived, signal),
    [archived],
  );
  const action = useAction();
  return (
    <>
      <div className="sport-toolbar">
        <label className="sport-toggle">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          Relevés archivés
        </label>
        <button className="primary-button" onClick={() => setForm("new")}>
          Nouveau relevé
        </button>
      </div>
      <LoadState {...resource} />
      <ErrorMessage message={action.error} />
      {resource.data?.length === 0 && (
        <Empty title="Vos mensurations, au fil du temps">
          Ajoutez votre premier relevé pour suivre votre évolution dans les
          statistiques.
        </Empty>
      )}
      <div className="sport-measurements">
        {resource.data?.map((m) => (
          <article key={m.id} className="sport-measurement">
            <div className="sport-section-heading">
              <h2>{day(m.measured_on)}</h2>
              <div className="sport-inline">
                {!archived && (
                  <button
                    className="secondary-button small-button"
                    onClick={() => setForm(m)}
                  >
                    Modifier
                  </button>
                )}
                <button
                  disabled={action.busy}
                  className="text-button"
                  onClick={() =>
                    void action.run(
                      () =>
                        sportApi.write(`/measurements/${m.id}/archive`, {
                          expected_version: m.version,
                          archived: !archived,
                        }),
                      resource.reload,
                    )
                  }
                >
                  {archived ? "Restaurer" : "Archiver"}
                </button>
              </div>
            </div>
            <dl>
              {measureFields
                .filter(([key]) => m[key] != null)
                .map(([key, label, unit]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>
                      {number(m[key]!)} <small>{unit}</small>
                    </dd>
                  </div>
                ))}
            </dl>
            {m.notes && <p className="muted">{m.notes}</p>}
          </article>
        ))}
      </div>
      {form && (
        <MeasurementForm
          measurement={form === "new" ? undefined : form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            resource.reload();
          }}
        />
      )}
    </>
  );
}
