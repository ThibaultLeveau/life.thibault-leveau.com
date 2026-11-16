import { useEffect, useRef, useState, type DependencyList } from "react";

export function useApiResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  dependencies: DependencyList,
  options: { keepPrevious?: boolean } = {},
) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    if (!options.keepPrevious) setData(undefined);
    load(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted && e.name !== "AbortError")
          setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [...dependencies, revision]);
  return { data, error, loading, reload: () => setRevision((r) => r + 1) };
}
export function useApiAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const alive = useRef(true),
    pending = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function run<T>(
    operation: () => Promise<T>,
    accept: (value: T) => void,
  ) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const value = await operation();
      if (alive.current) accept(value);
    } catch (e) {
      if (alive.current && (e as Error).name !== "AbortError")
        setError((e as Error).message);
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return { busy, error, run };
}
