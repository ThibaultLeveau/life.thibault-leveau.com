import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, tr } from "../../shared/i18n";
import { ApiError } from "../api";
import { assistantApi, synchronizeAssistant } from "./api";
import type { Conversation, Message } from "./types";

export function useConversation(
  id: string | null,
  onCreated: (id: string) => void,
  onChanged: () => void,
  onRejected: (content: string) => void,
) {
  const [conversation, setConversation] = useState<Conversation>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false),
    [loadingEarlier, setLoadingEarlier] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const mounted = useRef(true),
    pending = useRef(false),
    generation = useRef(0);
  const stream = useRef<AbortController | null>(null),
    read = useRef<AbortController | null>(null);
  const recovering = useRef(false);
  const created = useRef<string | null>(null),
    currentId = useRef(id);
  currentId.current = id;
  const refresh = useCallback(async (clearError = true) => {
    const current = currentId.current;
    if (!current) return;
    read.current?.abort();
    const controller = new AbortController();
    read.current = controller;
    try {
      const result = await assistantApi.conversation(
        current,
        controller.signal,
      );
      if (
        !controller.signal.aborted &&
        mounted.current &&
        currentId.current === current
      ) {
        if (
          recovering.current &&
          !result.messages.some((message) => message.status === "running")
        ) {
          await synchronizeAssistant();
          recovering.current = false;
          if (
            !mounted.current ||
            controller.signal.aborted ||
            currentId.current !== current
          )
            return;
        }
        setConversation(result.conversation);
        setMessages(result.messages);
        setHasMore(result.has_more ?? false);
        if (clearError) setError("");
        setRunId(
          result.run_id ??
            result.messages.find((message) => message.status === "running")
              ?.run_id ??
            null,
        );
        if (result.messages.some((message) => message.status === "running"))
          recovering.current = true;
      }
    } catch (e) {
      if (
        !controller.signal.aborted &&
        mounted.current &&
        (e as Error).name !== "AbortError"
      )
        setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (created.current === id) {
      created.current = null;
      return;
    }
    generation.current++;
    read.current?.abort();
    setConversation(undefined);
    setMessages([]);
    setHasMore(false);
    setError("");
    setRunId(null);
    setStatus("");
    if (!id) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    read.current = controller;
    setLoading(true);
    assistantApi
      .conversation(id, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setConversation(result.conversation);
          setMessages(result.messages);
          setHasMore(result.has_more ?? false);
          setError("");
          recovering.current = result.messages.some(
            (message) => message.status === "running",
          );
          setRunId(
            result.run_id ??
              result.messages.find((message) => message.status === "running")
                ?.run_id ??
              null,
          );
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted && e.name !== "AbortError")
          setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stream.current?.abort();
      read.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (busy || !runId || !id) return;
    const timer = setInterval(() => {
      void refresh(false);
    }, 1800);
    return () => clearInterval(timer);
  }, [busy, runId, id, refresh]);
  async function send(content: string) {
    if (pending.current || !content.trim()) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setStatus(tr("assistant_sending"));
    const currentGeneration = generation.current;
    const controller = new AbortController();
    stream.current = controller;
    let conversationId = currentId.current;
    let attempted = false;
    let rejected = false;
    const draftId = `pending-${crypto.randomUUID()}`;
    let replyId = draftId;
    const valid = () =>
      mounted.current &&
      generation.current === currentGeneration &&
      !controller.signal.aborted;
    try {
      if (!conversationId) {
        const result = await assistantApi.create();
        if (!valid()) return;
        conversationId = result.id;
        currentId.current = result.id;
        created.current = result.id;
        setConversation(result);
        onCreated(result.id);
        onChanged();
      }
      const now = new Date().toISOString();
      setMessages((values) => [
        ...values,
        {
          id: `user-${draftId}`,
          role: "user",
          content,
          status: "complete",
          created_at: now,
          snippets: [],
        },
        {
          id: draftId,
          role: "assistant",
          content: "",
          status: "running",
          created_at: now,
          snippets: [],
        },
      ]);
      let complete = false;
      attempted = true;
      await assistantApi.send(
        conversationId,
        content,
        crypto.randomUUID(),
        (event) => {
          if (!valid()) return;
          if (event.run_id) setRunId(event.run_id);
          if (event.type === "status" && event.text) setStatus(event.text);
          if (event.type === "delta" && event.text)
            setMessages((values) =>
              values.map((value) =>
                value.id === replyId
                  ? { ...value, content: value.content + event.text }
                  : value,
              ),
            );
          if (event.type === "message" && event.message) {
            const message = event.message;
            const previousId = replyId;
            replyId = message.id;
            setMessages((values) => [
              ...values.filter(
                (value) => value.id !== previousId && value.id !== message.id,
              ),
              message,
            ]);
          }
          if (event.type === "done") complete = true;
          if (event.type === "error")
            throw new Error(
              errorMessage(event.text || event.code || tr("assistant_error")),
            );
        },
        controller.signal,
      );
      if (!complete && valid()) throw new Error(tr("assistant_stream_lost"));
    } catch (e) {
      if (mounted.current && generation.current === currentGeneration) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
        rejected =
          (e as Error).name !== "AbortError" &&
          (!attempted ||
            (e instanceof ApiError &&
              e.status >= 400 &&
              e.status < 500 &&
              e.status !== 401));
        if (rejected) onRejected(content);
        setMessages((values) =>
          values.map((value) =>
            value.id === replyId ? { ...value, status: "interrupted" } : value,
          ),
        );
      }
    } finally {
      if (mounted.current && generation.current === currentGeneration) {
        await refresh(false);
        try {
          if (!rejected) await synchronizeAssistant();
        } catch (error) {
          if (mounted.current && (error as Error).name !== "AbortError")
            setError((error as Error).message);
        }
        pending.current = false;
        if (mounted.current) {
          setBusy(false);
          setStatus("");
          onChanged();
        }
      }
      if (stream.current === controller) stream.current = null;
    }
  }
  async function stop() {
    try {
      if (runId) await assistantApi.cancel(runId);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
      return;
    }
    stream.current?.abort();
    if (!pending.current) {
      setRunId(null);
      await refresh();
    }
  }
  async function earlier() {
    if (!id || loadingEarlier || !hasMore) return;
    const captured = id;
    const count = messages.length;
    setLoadingEarlier(true);
    try {
      const result = await assistantApi.conversation(id, undefined, count);
      if (mounted.current && currentId.current === captured) {
        setMessages((values) => [
          ...result.messages.filter(
            (message) => !values.some((item) => item.id === message.id),
          ),
          ...values,
        ]);
        setHasMore(result.has_more ?? false);
      }
    } catch (e) {
      if (
        mounted.current &&
        currentId.current === captured &&
        (e as Error).name !== "AbortError"
      )
        setError((e as Error).message);
    } finally {
      if (mounted.current) setLoadingEarlier(false);
    }
  }
  return {
    conversation,
    messages,
    loading,
    busy,
    error,
    status,
    runId,
    send,
    stop,
    refresh,
    earlier,
    hasMore,
    loadingEarlier,
  };
}
