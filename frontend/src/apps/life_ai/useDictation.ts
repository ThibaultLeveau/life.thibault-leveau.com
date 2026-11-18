import { useEffect, useRef, useState } from "react";
import { tr } from "./i18n";
import { assistantApi } from "./api";

const maxBytes = 10 * 1024 * 1024;
export function useDictation(onText: (text: string) => void) {
  const [state, setState] = useState<
    "idle" | "permission" | "recording" | "transcribing"
  >("idle");
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const media = useRef<MediaStream | null>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const pendingAudio = useRef<{ blob: Blob; filename: string } | null>(null);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const mounted = useRef(true);
  const receive = useRef(onText);
  receive.current = onText;
  const supported =
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;
  function release() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    media.current?.getTracks().forEach((track) => track.stop());
    media.current = null;
  }
  function cancel() {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    pendingAudio.current = null;
    if (mounted.current) setRetryAvailable(false);
    if (recorder.current && recorder.current.state !== "inactive")
      recorder.current.stop();
    recorder.current = null;
    release();
    if (mounted.current) {
      setState("idle");
      setSeconds(0);
    }
  }
  useEffect(() => {
    mounted.current = true;
    const hidden = () => {
      if (document.hidden) stop();
    };
    const leave = () => cancel();
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", leave);
      mounted.current = false;
      cancel();
    };
  }, []);
  function stop() {
    if (recorder.current?.state === "recording") {
      setState("transcribing");
      recorder.current.stop();
      release();
    }
  }
  function transcribe(captured = generation.current) {
    const audio = pendingAudio.current;
    if (!audio || controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setState("transcribing");
    setError("");
    setRetryAvailable(false);
    void assistantApi
      .transcribe(audio.blob, audio.filename, request.signal)
      .then(({ text }) => {
        if (
          !request.signal.aborted &&
          mounted.current &&
          captured === generation.current
        ) {
          pendingAudio.current = null;
          if (text.trim()) receive.current(text.trim());
          else setError(tr("assistant_dictation_empty"));
        }
      })
      .catch((e) => {
        if (
          !request.signal.aborted &&
          mounted.current &&
          captured === generation.current &&
          (e as Error).name !== "AbortError"
        ) {
          setError((e as Error).message);
          setRetryAvailable(true);
        }
      })
      .finally(() => {
        if (controller.current === request) controller.current = null;
        if (mounted.current && captured === generation.current)
          setState("idle");
      });
  }
  async function start() {
    if (!supported || recorder.current || controller.current) return;
    pendingAudio.current = null;
    setRetryAvailable(false);
    const captured = ++generation.current;
    setError("");
    setState("permission");
    setSeconds(0);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      if (mounted.current && captured === generation.current) {
        setState("idle");
        setError(
          (e as Error).name === "NotAllowedError"
            ? tr("assistant_dictation_permission")
            : tr("assistant_dictation_device"),
        );
      }
      return;
    }
    if (
      !mounted.current ||
      captured !== generation.current ||
      document.hidden
    ) {
      if (mounted.current && captured === generation.current) setState("idle");
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    media.current = stream;
    try {
      const mime = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/wav",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recording = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.current = recording;
      const chunks: Blob[] = [];
      let size = 0;
      recording.ondataavailable = (event) => {
        if (captured !== generation.current) return;
        size += event.data.size;
        if (size > maxBytes) {
          cancel();
          setError(tr("assistant_dictation_size"));
          return;
        }
        if (event.data.size) chunks.push(event.data);
      };
      recording.onerror = () => {
        if (captured === generation.current) {
          cancel();
          setError(tr("assistant_dictation_device"));
        }
      };
      recording.onstop = () => {
        if (!mounted.current || captured !== generation.current) return;
        release();
        recorder.current = null;
        const audio = new Blob(chunks, {
          type: recording.mimeType || chunks[0]?.type || "audio/webm",
        });
        if (!audio.size) {
          setState("idle");
          setError(tr("assistant_dictation_empty"));
          return;
        }
        const extension = audio.type.includes("mp4")
          ? "m4a"
          : audio.type.includes("ogg")
            ? "ogg"
            : audio.type.includes("wav")
              ? "wav"
              : "webm";
        pendingAudio.current = {
          blob: audio,
          filename: `dictation.${extension}`,
        };
        transcribe(captured);
      };
      recording.start(1000);
      setState("recording");
      const started = Date.now();
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        setSeconds(Math.min(elapsed, 120));
        if (elapsed >= 120) stop();
      }, 250);
    } catch {
      cancel();
      setError(tr("assistant_dictation_device"));
    }
  }
  return {
    state,
    error,
    seconds,
    supported,
    start,
    stop,
    cancel,
    retry: () => transcribe(),
    retryAvailable,
    active: state !== "idle",
  };
}
