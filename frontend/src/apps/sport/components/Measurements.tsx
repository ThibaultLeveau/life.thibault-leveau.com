import { tr } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { Dialog, ErrorMessage } from "../../../shared/ui/Dialog";
import { sportApi } from "../api";
import { useView } from "../preferences";
import { useSportQuery, type SportNavigate } from "../navigation";
import { measureFields, type Measurement, type MeasureValues } from "../types";
import {
  ConflictPanel,
  day,
  Empty,
  LoadState,
  number,
  UndoNotice,
  useAction,
  useDraftGuard,
  useFormValidation,
  useResource,
  type RegisterGuard,
} from "./common";

const measureValues = (measurement?: Measurement): MeasureValues =>
  Object.fromEntries(
    measureFields().map(([key]) => [key, measurement?.[key] ?? null]),
  );

function MeasurementForm({
  measurement,
  today,
  onClose,
  onSaved,
  registerGuard,
}: {
  measurement?: Measurement;
  today: string;
  onClose: () => void;
  onSaved: (measurement: Measurement) => void;
  registerGuard: RegisterGuard;
}) {
  const [date, setDate] = useState(measurement?.measured_on ?? today);
  const [values, setValues] = useState<MeasureValues>(() =>
    measureValues(measurement),
  );
  const [notes, setNotes] = useState(measurement?.notes ?? "");
  const [version, setVersion] = useState(measurement?.version);
  const action = useAction();
  const validation = useFormValidation(action.failure);
  const original = useRef(JSON.stringify({ date, values, notes }));
  const canLeave = useDraftGuard(
    original.current !== JSON.stringify({ date, values, notes }),
    action.busy,
    registerGuard,
  );
  const fields = measureFields();
  const extraCount = fields
    .slice(2)
    .filter(([key]) => values[key] != null).length;
  const describe = (
    value: { measured_on: string; notes: string } & MeasureValues,
  ) => [
    { label: tr("measurement_date"), value: day(value.measured_on) },
    ...fields.map(([key, label, unit]) => ({
      label,
      value: value[key] == null ? "" : `${number(value[key]!)} ${unit}`,
    })),
    { label: tr("notes"), value: value.notes },
  ];
  function load(value: Measurement) {
    setDate(value.measured_on);
    setValues(measureValues(value));
    setNotes(value.notes);
    setVersion(value.version);
    original.current = JSON.stringify({
      date: value.measured_on,
      values: measureValues(value),
      notes: value.notes,
    });
    action.clear();
  }
  const input = ([key, label, unit]: (typeof fields)[number]) => (
    <label key={key}>
      {label} ({unit})
      <input
        {...validation.attrs(key)}
        type="number"
        inputMode="decimal"
        min="0.1"
        step="any"
        max={key === "weight_kg" ? 1000 : key === "body_fat_pct" ? 99.99 : 500}
        value={values[key] ?? ""}
        onChange={(event) =>
          setValues((previous) => ({
            ...previous,
            [key]:
              event.target.value === "" ? null : Number(event.target.value),
          }))
        }
      />
      {validation.error(key)}
    </label>
  );
  return (
    <Dialog
      title={
        measurement
          ? tr("edit_body_measurements")
          : tr("record_my_measurements")
      }
      wide
      onClose={() => {
        if (canLeave()) onClose();
      }}
    >
      <form
        ref={validation.form}
        noValidate
        className="dialog-body stack-form"
        aria-busy={action.busy}
        onSubmit={(event) => {
          event.preventDefault();
          if (
            !validation.validate() ||
            !Object.values(values).some((value) => value != null)
          )
            return;
          void action.run(
            () =>
              sportApi.write<Measurement>(
                `/measurements${measurement ? `/${measurement.id}` : ""}`,
                {
                  measured_on: date,
                  ...values,
                  notes,
                  ...(measurement ? { expected_version: version } : {}),
                },
                measurement ? "PUT" : "POST",
              ),
            onSaved,
          );
        }}
      >
        <fieldset className="sport-fieldset" disabled={action.busy}>
          <label>
            {tr("measurement_date")}
            <input
              {...validation.attrs("measured_on")}
              type="date"
              required
              value={date}
              max={today}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          {validation.error("measured_on")}
          <p className="muted small-text">
            {tr("measurement_calendar", { date: day(today) })}
          </p>
          <div className="form-grid">{fields.slice(0, 2).map(input)}</div>
          <details className="sport-other-measures">
            <summary>
              {tr("other_measurements")}
              {extraCount > 0 && (
                <span className="sport-tag">
                  {tr("entered_measurements", { count: extraCount })}
                </span>
              )}
            </summary>
            <p className="muted">{tr("hidden_measurements_preserved")}</p>
            <div className="form-grid">{fields.slice(2).map(input)}</div>
          </details>
          <label>
            {tr("notes")}
            <textarea
              {...validation.attrs("notes")}
              maxLength={2000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          {validation.error("notes")}
          <ErrorMessage message={action.error} />
          {measurement && (
            <ConflictPanel
              failure={action.failure}
              draft={describe({ measured_on: date, ...values, notes })}
              load={() => sportApi.measurement(measurement.id)}
              describe={describe}
              onReload={load}
              onKeep={(value) => {
                setVersion(value.version);
                action.clear();
              }}
            />
          )}
          <div className="dialog-actions sport-sticky-actions">
            <button
              className="primary-button"
              disabled={!Object.values(values).some((value) => value != null)}
            >
              {action.busy ? tr("saving") : tr("save_body_measurements")}
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}

function MeasurementEditor(
  props: Omit<Parameters<typeof MeasurementForm>[0], "today">,
) {
  const calendar = useResource(sportApi.settings, []);
  return (
    <>
      <LoadState {...calendar} />
      {calendar.data && (
        <MeasurementForm {...props} today={calendar.data.server_today} />
      )}
    </>
  );
}

export function Measurements({
  registerGuard,
  navigate,
}: {
  registerGuard: RegisterGuard;
  navigate: SportNavigate;
}) {
  const [query, update] = useSportQuery({
    measurement_archived: "false",
    measure_new: "",
  });
  const archived = query.measurement_archived === "true";
  const [form, setForm] = useState<Measurement | "new" | null>(null);
  const [notice, setNotice] = useState<Measurement | null>(null);
  const resource = useResource(
    (signal) => sportApi.measurements(archived, signal),
    [archived],
  );
  const action = useAction();
  const presentation = useView("measurements");
  const restoreFocus = useRef<string | null>(null);
  useEffect(() => {
    if (query.measure_new) {
      setForm("new");
      update({ measure_new: "" });
    }
  }, [query.measure_new]);
  useEffect(() => {
    if (
      restoreFocus.current &&
      resource.data?.some((item) => item.id === restoreFocus.current)
    ) {
      presentation.list.current
        ?.querySelector<HTMLElement>(
          `[data-record="${restoreFocus.current}"] button`,
        )
        ?.focus();
      restoreFocus.current = null;
    }
  }, [resource.data]);
  function archive(measurement: Measurement, value: boolean) {
    void action.run(
      () =>
        sportApi.write<Measurement>(`/measurements/${measurement.id}/archive`, {
          expected_version: measurement.version,
          archived: value,
        }),
      (result) => {
        setNotice(value ? result : null);
        if (!value) restoreFocus.current = result.id;
        resource.reload();
      },
    );
  }
  return (
    <>
      <div className="sport-toolbar">
        <label className="sport-toggle">
          <input
            type="checkbox"
            checked={archived}
            onChange={(event) =>
              update({ measurement_archived: String(event.target.checked) })
            }
          />
          {tr("archived_records")}
        </label>
        <button className="primary-button" onClick={() => setForm("new")}>
          {tr("new_record")}
        </button>
      </div>
      <div className="sport-toolbar">
        {presentation.controls}
        <p className="muted small-text">{tr("measurement_delta_help")}</p>
      </div>
      <LoadState {...resource} />
      <ErrorMessage message={action.error} />
      {notice && (
        <UndoNotice
          message={tr("archived_measurement", {
            date: day(notice.measured_on),
          })}
          busy={action.busy}
          onUndo={() => archive(notice, false)}
          onDismiss={() => setNotice(null)}
        />
      )}
      {resource.data?.length === 0 && (
        <Empty
          title={tr("your_measurements_over_time")}
          action={
            <button
              className="primary-button"
              onClick={() =>
                archived
                  ? update({ measurement_archived: "false" })
                  : setForm("new")
              }
            >
              {archived ? tr("active_measurements") : tr("first_measurement")}
            </button>
          }
        >
          {archived
            ? tr("no_archived_measurements")
            : tr("add_your_first_record_to_track_your_progress_in_the")}
        </Empty>
      )}
      <div
        ref={presentation.list}
        className={`sport-measurements sport-view-${presentation.view}`}
        data-view={presentation.view}
      >
        {resource.data?.map((measurement, index) => (
          <article
            key={measurement.id}
            className="sport-measurement"
            data-record={measurement.id}
          >
            <div className="sport-section-heading">
              <h2>{day(measurement.measured_on)}</h2>
              <div className="sport-inline">
                {!archived && (
                  <button
                    className="secondary-button small-button"
                    onClick={() => setForm(measurement)}
                  >
                    {tr("edit")}
                  </button>
                )}
                <button
                  className="text-button"
                  disabled={action.busy}
                  onClick={() => archive(measurement, !archived)}
                >
                  {archived ? tr("restore") : tr("archive")}
                </button>
              </div>
            </div>
            <dl>
              {measureFields()
                .filter(([key]) => measurement[key] != null)
                .map(([key, label, unit]) => {
                  const previous =
                    !archived &&
                    resource.data
                      ?.slice(index + 1)
                      .find((older) => older[key] != null);
                  const delta = previous
                    ? measurement[key]! - previous[key]!
                    : null;
                  return (
                    <div key={key}>
                      <dt>
                        {!archived ? (
                          <button
                            className="sport-title-button"
                            onClick={() =>
                              navigate("statistics", { stat_measure: key })
                            }
                            aria-label={tr("view_measurement_chart", {
                              name: label,
                            })}
                          >
                            {label}
                          </button>
                        ) : (
                          label
                        )}
                      </dt>
                      <dd>
                        {number(measurement[key]!)} <small>{unit}</small>
                        {delta != null && (
                          <span
                            className="sport-measure-delta"
                            aria-label={tr("measurement_delta", {
                              value: `${delta > 0 ? "+" : ""}${number(delta)} ${unit}`,
                              date: day(
                                previous
                                  ? previous.measured_on
                                  : measurement.measured_on,
                              ),
                            })}
                          >
                            {delta > 0 ? "+" : ""}
                            {number(delta)} {unit}
                          </span>
                        )}
                      </dd>
                    </div>
                  );
                })}
            </dl>
            {measurement.notes && <p className="muted">{measurement.notes}</p>}
          </article>
        ))}
      </div>
      {form && (
        <MeasurementEditor
          measurement={form === "new" ? undefined : form}
          registerGuard={registerGuard}
          onClose={() => setForm(null)}
          onSaved={(measurement) => {
            setForm(null);
            resource.reload();
            restoreFocus.current = measurement.id;
          }}
        />
      )}
    </>
  );
}
