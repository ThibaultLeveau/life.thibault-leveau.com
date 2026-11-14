import {
  useEffect,
  useRef,
  useState,
  type DependencyList,
  type ReactNode,
} from "react";
import { ErrorMessage } from "../../../shared/ui/Dialog";
import type { KindDefinition, Values } from "../types";

export function useResource<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  dependencies: DependencyList,
) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(undefined);
    loader(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [...dependencies, revision]);
  return { data, error, loading, reload: () => setRevision((r) => r + 1) };
}
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function run<T>(
    operation: () => Promise<T>,
    accept: (result: T) => void,
  ) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const value = await operation();
      if (alive.current) accept(value);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return { busy, error, run };
}
export function LoadState({
  loading,
  error,
  reload,
}: {
  loading: boolean;
  error: string;
  reload: () => void;
}) {
  return (
    <>
      {loading && (
        <p role="status" className="sport-empty">
          Chargement…
        </p>
      )}
      <ErrorMessage message={error} />
      {error && (
        <button className="secondary-button" onClick={reload}>
          Réessayer
        </button>
      )}
    </>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="sport-empty">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
export function ValuesFields({
  kind,
  value,
  onChange,
  required = false,
}: {
  kind: KindDefinition;
  value: Values;
  onChange: (v: Values) => void;
  required?: boolean;
}) {
  return (
    <div className="sport-value-fields">
      {kind.fields.map((field) => (
        <label key={field.key}>
          {field.label} ({field.unit})
          <input
            type="number"
            inputMode={field.key === "reps" ? "numeric" : "decimal"}
            min={field.minimum}
            max={field.maximum}
            step={field.key === "reps" ? 1 : "any"}
            required={required}
            value={value[field.key] ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                [field.key]:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </label>
      ))}
    </div>
  );
}
export const number = (n: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n);
export function valuesText(kind: KindDefinition, values: Values) {
  return kind.fields
    .filter((f) => values[f.key] != null)
    .map((f) => `${number(values[f.key]!)} ${f.unit}`)
    .join(" · ");
}
export function localDay() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function day(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(
    "fr-FR",
    { day: "numeric", month: "short", year: "numeric" },
  );
}
export function moment(value: string) {
  return new Date(value).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
