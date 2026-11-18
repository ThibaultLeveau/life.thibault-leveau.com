import { useEffect, useRef, useState } from "react";
import { tr } from "../../shared/i18n";
import { useApiResource } from "../useApiResource";
import { assistantApi } from "./api";
import type { AssistantSource } from "./types";

export interface DraftSource {
  key: string;
  name: string;
  file?: File;
  url?: string;
  source?: AssistantSource;
  status: "loading" | "ready" | "error";
  error?: string;
}
export function useSourceDraft() {
  const limits = useApiResource(assistantApi.sourceLimits, []);
  const [items, setItems] = useState<DraftSource[]>([]);
  const current = useRef(items);
  current.current = items;
  const requests = useRef(new Map<string, AbortController>());
  const queue = useRef<DraftSource[]>([]);
  const mounted = useRef(true);
  const generation = useRef(0);
  const [error, setError] = useState("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requests.current.forEach((controller) => controller.abort());
      requests.current.clear();
      queue.current = [];
    };
  }, []);
  function replace(next: DraftSource[]) {
    current.current = next;
    setItems(next);
  }
  // The server admits two imports per owner. Keep selected files queued rather
  // than making valid batches compete for those slots.
  function pump() {
    while (
      mounted.current &&
      requests.current.size < 2 &&
      queue.current.length
    ) {
      const item = queue.current.shift()!;
      if (current.current.some((value) => value.key === item.key))
        void perform(item);
    }
  }
  function prepare(item: DraftSource) {
    if (requests.current.has(item.key)) return;
    replace(
      current.current.map((value) =>
        value.key === item.key
          ? { ...value, status: "loading", error: undefined }
          : value,
      ),
    );
    queue.current = [
      ...queue.current.filter((value) => value.key !== item.key),
      item,
    ];
    pump();
  }
  async function perform(item: DraftSource) {
    const controller = new AbortController();
    requests.current.set(item.key, controller);
    replace(
      current.current.map((value) =>
        value.key === item.key
          ? { ...value, status: "loading", error: undefined }
          : value,
      ),
    );
    try {
      const source = item.file
        ? await assistantApi.uploadSource(item.file, controller.signal)
        : await assistantApi.webSource(item.url!, controller.signal);
      if (
        controller.signal.aborted ||
        !mounted.current ||
        !current.current.some((value) => value.key === item.key)
      )
        return;
      replace(
        current.current.map((value) =>
          value.key === item.key
            ? { ...value, source, status: "ready" }
            : value,
        ),
      );
    } catch (e) {
      if (
        controller.signal.aborted ||
        !mounted.current ||
        (e as Error).name === "AbortError"
      )
        return;
      replace(
        current.current.map((value) =>
          value.key === item.key
            ? { ...value, status: "error", error: (e as Error).message }
            : value,
        ),
      );
    } finally {
      if (requests.current.get(item.key) === controller)
        requests.current.delete(item.key);
      pump();
    }
  }
  function add(values: { file?: File; url?: string }[]) {
    if (!limits.data) {
      setError(tr("assistant_sources_limits_unavailable"));
      return;
    }
    setError("");
    for (const value of values) {
      const file = value.file;
      const total = current.current.reduce(
        (sum, item) => sum + (item.file?.size ?? item.source?.size_bytes ?? 0),
        0,
      );
      let message = "";
      if (current.current.length >= limits.data.max_sources)
        message = tr("assistant_sources_max", {
          count: limits.data.max_sources,
        });
      else if (
        file &&
        !limits.data.accepted_extensions.includes(
          `.${file.name.split(".").pop()?.toLowerCase()}`,
        )
      )
        message = tr("assistant_sources_type");
      else if (
        file &&
        (file.size > limits.data.max_file_bytes ||
          (file.type.startsWith("image/") &&
            file.size > limits.data.max_image_bytes) ||
          total + file.size > limits.data.max_total_bytes)
      )
        message = tr("assistant_sources_size");
      if (message) {
        setError(message);
        continue;
      }
      const item: DraftSource = {
        key: crypto.randomUUID(),
        name: file?.name || value.url!,
        ...value,
        status: "loading",
      };
      replace([...current.current, item]);
      void prepare(item);
    }
  }
  async function remove(key: string) {
    const item = current.current.find((value) => value.key === key);
    if (!item) return;
    const captured = generation.current;
    queue.current = queue.current.filter((value) => value.key !== key);
    requests.current.get(key)?.abort();
    requests.current.delete(key);
    if (item.source) {
      replace(
        current.current.map((value) =>
          value.key === key ? { ...value, status: "loading" } : value,
        ),
      );
      try {
        await assistantApi.removeSource(item.source.id);
      } catch (e) {
        if (
          mounted.current &&
          captured === generation.current &&
          (e as Error).name !== "AbortError"
        ) {
          replace(
            current.current.map((value) =>
              value.key === key ? { ...value, status: "ready" } : value,
            ),
          );
          setError((e as Error).message);
        }
        return;
      }
    }
    if (mounted.current && captured === generation.current)
      replace(current.current.filter((value) => value.key !== key));
  }
  function clear(discard = true) {
    generation.current++;
    queue.current = [];
    requests.current.forEach((controller) => controller.abort());
    requests.current.clear();
    if (discard)
      current.current.forEach((item) => {
        if (item.source)
          void assistantApi.removeSource(item.source.id).catch(() => {});
      });
    replace([]);
    setError("");
  }
  function restore(sources: AssistantSource[]) {
    const existing = new Set(current.current.map((item) => item.source?.id));
    replace([
      ...current.current,
      ...sources
        .filter((source) => !existing.has(source.id))
        .map(
          (source): DraftSource => ({
            key: source.id,
            name: source.name,
            source,
            status: "ready",
          }),
        ),
    ]);
  }
  return {
    items,
    limits,
    error,
    addFiles: (files: File[]) => add(files.map((file) => ({ file }))),
    addUrl: (url: string) => add([{ url }]),
    remove,
    retry: prepare,
    clear,
    restore,
    ready: items.every((item) => item.status === "ready"),
    busy: items.some((item) => item.status === "loading"),
    sources: items.flatMap((item) => (item.source ? [item.source] : [])),
  };
}
export type SourceDraft = ReturnType<typeof useSourceDraft>;
