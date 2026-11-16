import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
import { evaluation, integrationApi } from "../api";
import { dateLabel, localDay, number, windowFor } from "../dates";
import { tr } from "../i18n";
import type {
  DynamicSource,
  Filter,
  Frequency,
  Metric,
  Snapshot,
} from "../types";
import { LoadState, useAction, useResource } from "./common";

export function SourceLabel({ source }: { source: DynamicSource }) {
  const result = useResource(integrationApi.sources, []);
  const app = result.data?.find((a) => a.id === source.application_id);
  const metric = app?.metrics.find((m) => m.id === source.metric_id);
  return (
    <>
      {app?.name ?? tr("source_name")}
      {metric ? ` · ${metric.label}` : ""}
    </>
  );
}

function OptionFilter({
  app,
  filter,
  value,
  onChange,
}: {
  app: string;
  filter: Filter;
  value: string;
  onChange: (v: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      setOffset(0);
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);
  const result = useResource(
    (signal) => integrationApi.options(app, filter.id, search, offset, signal),
    [app, filter.id, search, offset],
  );
  const selected = useResource(
    (signal) => integrationApi.options(app, filter.id, value, 0, signal),
    [app, filter.id, value],
  );
  return (
    <div className="tracking-option-picker">
      <label>
        {tr("search_options", { name: filter.label })}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <LoadState {...result} />
      {result.data && (
        <>
          <select
            aria-label={filter.label}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">{tr("filter_all")}</option>
            {value && !result.data.items.some((o) => o.id === value) && (
              <option value={value}>
                {selected.data?.items.find((o) => o.id === value)?.label ??
                  tr("selected_option")}
              </option>
            )}
            {result.data.items.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          {result.data.total > 30 && (
            <div className="tracking-inline">
              <button
                type="button"
                className="text-button"
                disabled={offset === 0}
                onClick={() => setOffset((n) => Math.max(0, n - 30))}
              >
                {tr("previous")}
              </button>
              <span className="muted">
                {offset + 1}–{Math.min(offset + 30, result.data.total)} /{" "}
                {result.data.total}
              </span>
              <button
                type="button"
                className="text-button"
                disabled={offset + 30 >= result.data.total}
                onClick={() => setOffset((n) => n + 30)}
              >
                {tr("next")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
export function SourcePicker({
  initial,
  frequency,
  timezone,
  range,
  onSelect,
  onClose,
}: {
  initial: DynamicSource | null;
  frequency: Frequency;
  timezone: string;
  range?: [string, string];
  onSelect: (source: DynamicSource, metric: Metric) => void;
  onClose: () => void;
}) {
  const sources = useResource(integrationApi.sources, []);
  const [app, setApp] = useState(initial?.application_id ?? ""),
    [metricId, setMetricId] = useState(initial?.metric_id ?? ""),
    [search, setSearch] = useState("");
  const [source, setSource] = useState<DynamicSource>(
    initial ?? {
      application_id: "",
      metric_id: "",
      aggregation: "count",
      filters: {},
      period: "tracking",
    },
  );
  const [sample, setSample] = useState<Snapshot | null>(null),
    [sampleQuery, setSampleQuery] = useState("");
  const action = useAction();
  const selection = sources.data?.find((s) => s.id === app),
    metric = selection?.metrics.find((m) => m.id === metricId);
  const root = useRef<HTMLDivElement>(null);
  const matches = useMemo(
    () =>
      selection?.metrics.filter((m) =>
        `${m.label} ${m.description}`
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .toLowerCase()
          .includes(
            search
              .normalize("NFD")
              .replace(/\p{Diacritic}/gu, "")
              .toLowerCase(),
          ),
      ) ?? [],
    [selection, search],
  );
  const ref = localDay(timezone),
    [since, until] =
      range ??
      windowFor(ref, source.period === "tracking" ? frequency : source.period);
  const query = evaluation(
      { ...source, application_id: app, metric_id: metricId },
      since,
      until,
      timezone,
    ),
    queryKey = JSON.stringify(query);
  useEffect(() => {
    root.current?.querySelector<HTMLElement>("input,select,button")?.focus();
  }, [app, metricId]);
  function filterChange(
    id: string,
    value: string | number | boolean | undefined,
  ) {
    setSource((s) => {
      const filters = { ...s.filters };
      if (value === undefined || value === "") delete filters[id];
      else filters[id] = value;
      return { ...s, filters };
    });
  }
  return (
    <Dialog title={tr("integration_title")} onClose={onClose} wide>
      <div
        className="dialog-body tracking-source"
        ref={root}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.target instanceof HTMLInputElement)
            e.preventDefault();
        }}
      >
        <div className="tracking-step-label">
          {tr(
            !app
              ? "choose_app"
              : !metric
                ? "choose_metric"
                : "configure_metric",
          )}
        </div>
        <LoadState {...sources} />
        {!app &&
          sources.data?.map((s) => (
            <button
              type="button"
              className="tracking-source-app"
              key={s.id}
              disabled={!s.enabled}
              onClick={() => {
                setApp(s.id);
                setMetricId("");
              }}
            >
              <span className="tracking-source-symbol">
                <Icon name={s.id === "sport" ? "flag" : "check"} size={24} />
              </span>
              <span>
                <strong>{s.name}</strong>
                <small>
                  {s.enabled
                    ? tr("field_count", { count: s.metrics.length })
                    : tr("source_disabled")}
                </small>
              </span>
              <Icon name="chevron" />
            </button>
          ))}
        {!app && <a href="/applications">{tr("library")}</a>}
        {app && !metric && (
          <>
            <button
              type="button"
              className="text-button"
              onClick={() => setApp("")}
            >
              <Icon name="chevron" size={14} />
              {tr("back")}
            </button>
            <label className="tracking-search">
              <Icon name="search" />
              <input
                type="search"
                aria-label={tr("search_metric")}
                placeholder={tr("search_metric")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="tracking-metric-list">
              {matches.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => {
                    setMetricId(m.id);
                    setSource({
                      application_id: app,
                      metric_id: m.id,
                      aggregation: m.aggregations[0],
                      filters: {},
                      period: "tracking",
                    });
                    setSample(null);
                  }}
                >
                  <span>
                    <strong>{m.label}</strong>
                    <small>{m.description}</small>
                  </span>
                  <Icon name="plus" size={16} />
                </button>
              ))}
              {!matches.length && <p className="muted">{tr("no_results")}</p>}
            </div>
          </>
        )}
        {metric && (
          <>
            <button
              type="button"
              className="text-button"
              onClick={() => setMetricId("")}
            >
              {tr("back")} · {selection?.name}
            </button>
            <h3>{metric.label}</h3>
            <p className="muted">{metric.description}</p>
            {metric.temporal === "current" && (
              <p className="tracking-notice">
                <Icon name="info" />
                {tr("current_metric")}
              </p>
            )}
            <div className="tracking-form-grid">
              {!range && (
                <label>
                  {tr("period")}
                  <select
                    value={source.period}
                    onChange={(e) =>
                      setSource((s) => ({
                        ...s,
                        period: e.target.value as DynamicSource["period"],
                      }))
                    }
                  >
                    {(
                      [
                        "tracking",
                        "daily",
                        "weekly",
                        "monthly",
                        "yearly",
                      ] as const
                    ).map((v) => (
                      <option key={v} value={v}>
                        {tr(v === "tracking" ? "tracking_period" : v)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                {tr("aggregation")}
                <select
                  value={source.aggregation}
                  onChange={(e) =>
                    setSource((s) => ({
                      ...s,
                      aggregation: e.target
                        .value as DynamicSource["aggregation"],
                    }))
                  }
                >
                  {metric.aggregations.map((v) => (
                    <option key={v} value={v}>
                      {tr(v)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!range && (
              <p className="muted tracking-small">{tr("source_period_hint")}</p>
            )}
            {metric.filters.length > 0 && (
              <fieldset className="tracking-fieldset">
                <legend>{tr("filters")}</legend>
                {metric.filters.map((f) => (
                  <div className="tracking-filter" key={f.id}>
                    <label className="tracking-check">
                      <input
                        type="checkbox"
                        checked={f.id in source.filters}
                        onChange={(e) =>
                          filterChange(
                            f.id,
                            e.target.checked
                              ? f.kind === "number"
                                ? 0
                                : f.kind === "boolean"
                                  ? true
                                  : (f.options[0]?.id ?? " ")
                              : undefined,
                          )
                        }
                      />
                      {f.label}
                    </label>
                    {f.id in source.filters &&
                      (f.kind === "options" ? (
                        <OptionFilter
                          app={app}
                          filter={f}
                          value={String(source.filters[f.id]).trim()}
                          onChange={(v) => filterChange(f.id, v || " ")}
                        />
                      ) : f.kind === "number" ? (
                        <input
                          aria-label={f.label}
                          type="number"
                          min={f.minimum}
                          max={f.maximum}
                          value={Number(source.filters[f.id])}
                          onChange={(e) =>
                            filterChange(f.id, Number(e.target.value))
                          }
                        />
                      ) : (
                        <select
                          aria-label={f.label}
                          value={String(source.filters[f.id])}
                          onChange={(e) =>
                            filterChange(
                              f.id,
                              f.kind === "boolean"
                                ? e.target.value === "true"
                                : e.target.value,
                            )
                          }
                        >
                          {f.kind === "boolean" ? (
                            <>
                              <option value="true">{tr("yes")}</option>
                              <option value="false">{tr("no")}</option>
                            </>
                          ) : (
                            f.options.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.label}
                              </option>
                            ))
                          )}
                        </select>
                      ))}
                  </div>
                ))}
              </fieldset>
            )}
            <div className="tracking-source-preview">
              <div>
                <span>{tr("preview")}</span>
                <strong aria-live="polite">
                  {sample && sampleQuery === queryKey
                    ? sample.result.state === "ok"
                      ? `${number(sample.result.value!)} ${metric.unit}`
                      : tr(
                          sample.result.state === "missing"
                            ? "no_measurement"
                            : "not_available",
                        )
                    : "—"}
                </strong>
                <small>
                  {dateLabel(since)} — {dateLabel(until)}
                </small>
              </div>
              <button
                type="button"
                className="secondary-button"
                disabled={
                  action.busy ||
                  Object.values(source.filters).some(
                    (v) => typeof v === "string" && !v.trim(),
                  )
                }
                onClick={() =>
                  void action.run(
                    () => integrationApi.evaluate(query),
                    (v) => {
                      setSample(v);
                      setSampleQuery(queryKey);
                    },
                  )
                }
              >
                {tr("calculate")}
              </button>
            </div>
            {sample && sampleQuery === queryKey && sample.result.message && (
              <p className="tracking-notice">{sample.result.message}</p>
            )}
            <ErrorMessage message={action.error} />
            <button
              type="button"
              className="primary-button"
              disabled={Object.values(source.filters).some(
                (v) => typeof v === "string" && !v.trim(),
              )}
              onClick={() =>
                onSelect(
                  { ...source, application_id: app, metric_id: metric.id },
                  metric,
                )
              }
            >
              {tr("use_metric")}
              <Icon name="check" />
            </button>
          </>
        )}
      </div>
    </Dialog>
  );
}
