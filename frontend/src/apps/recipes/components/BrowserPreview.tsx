import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../../platform/api";
import { Icon } from "../../../shared/ui/Icon";
import { webImportApi } from "../api";
import { tr } from "../i18n";
import type { BrowserCommand, BrowserFrame } from "../types";

type Command = Omit<BrowserCommand, "document">;
export function BrowserPreview({
  initial,
  disabled,
  onFrame,
  onError,
  onPending,
}: {
  initial: BrowserFrame;
  disabled: boolean;
  onFrame: (frame: BrowserFrame) => void;
  onError: (error: string, expired?: boolean) => void;
  onPending: (pending: boolean) => void;
}) {
  const [frame, setFrame] = useState(initial),
    [keyboard, setKeyboard] = useState(false),
    [text, setText] = useState("");
  const image = useRef<HTMLImageElement>(null),
    keyboardButton = useRef<HTMLButtonElement>(null),
    live = useRef(true),
    latest = useRef(initial),
    queue = useRef(Promise.resolve()),
    control = useRef(new AbortController()),
    dragging = useRef(false),
    lastMove = useRef(0),
    pending = useRef(0),
    disabledRef = useRef(disabled);
  const callbacks = useRef({ onFrame, onError, onPending });
  callbacks.current = { onFrame, onError, onPending };
  disabledRef.current = disabled;
  function send(command: Command) {
    if (
      disabledRef.current ||
      !live.current ||
      (pending.current >= 8 && ["move", "scroll"].includes(command.action))
    )
      return;
    const document = latest.current.document;
    pending.current++;
    callbacks.current.onPending(true);
    queue.current = queue.current
      .then(async () => {
        if (!live.current) return;
        try {
          await webImportApi.input(
            initial.id,
            { ...command, document },
            control.current.signal,
          );
        } catch (error) {
          if (live.current && (error as Error).name !== "AbortError")
            callbacks.current.onError((error as Error).message);
        }
      })
      .finally(() => {
        pending.current--;
        if (live.current) callbacks.current.onPending(pending.current > 0);
      });
  }
  useEffect(() => {
    live.current = true;
    control.current = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        await queue.current;
        if (!live.current) return;
        const next = await webImportApi.frame(
          initial.id,
          control.current.signal,
        );
        if (!live.current) return;
        latest.current = next;
        setFrame(next);
        callbacks.current.onFrame(next);
      } catch (error) {
        if (!live.current || (error as Error).name === "AbortError") return;
        if (!(error instanceof ApiError && error.status === 409)) {
          const expired = error instanceof ApiError && error.status === 404;
          callbacks.current.onError((error as Error).message, expired);
          if (expired) return;
          if (live.current) timer = setTimeout(poll, 3000);
          return;
        }
      }
      if (live.current) timer = setTimeout(poll, 800);
    }
    timer = setTimeout(poll, 800);
    const wheel = (event: WheelEvent) => {
      if (disabledRef.current) return;
      event.preventDefault();
      send({
        action: "scroll",
        dx: Math.max(-1500, Math.min(1500, event.deltaX)),
        dy: Math.max(-1500, Math.min(1500, event.deltaY)),
      });
    };
    const element = image.current;
    element?.addEventListener("wheel", wheel, { passive: false });
    return () => {
      live.current = false;
      clearTimeout(timer);
      control.current.abort();
      element?.removeEventListener("wheel", wheel);
      callbacks.current.onPending(false);
    };
  }, [initial.id]);
  const coordinates = (event: React.PointerEvent<HTMLImageElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          frame.width,
          ((event.clientX - box.left) * frame.width) / box.width,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          frame.height,
          ((event.clientY - box.top) * frame.height) / box.height,
        ),
      ),
    };
  };
  return (
    <section className="recipes-web-browser" aria-label={tr("web_preview")}>
      <div className="recipes-web-browser-bar">
        <button
          type="button"
          className="icon-button"
          disabled={disabled}
          aria-label={tr("web_browser_back")}
          onClick={() => send({ action: "back" })}
        >
          <Icon name="chevron" />
        </button>
        <div className="recipes-web-address">
          <strong>{frame.title || tr("web_preview")}</strong>
          <a href={frame.url} target="_blank" rel="noopener noreferrer">
            {frame.url}
          </a>
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={disabled}
          onClick={() => send({ action: "reload" })}
        >
          {tr("web_reload")}
        </button>
      </div>
      {frame.image && (
        <img
          ref={image}
          className="recipes-web-screen"
          src={`data:image/jpeg;base64,${frame.image}`}
          alt={tr("web_preview_alt")}
          tabIndex={0}
          draggable={false}
          aria-describedby="recipe-browser-help"
          onPointerDown={(event) => {
            if (disabled || event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            dragging.current = true;
            setKeyboard(true);
            send({ action: "down", ...coordinates(event) });
          }}
          onPointerMove={(event) => {
            if (!dragging.current || Date.now() - lastMove.current < 90) return;
            lastMove.current = Date.now();
            send({ action: "move", ...coordinates(event) });
          }}
          onPointerUp={(event) => {
            if (!dragging.current) return;
            dragging.current = false;
            send({ action: "up", ...coordinates(event) });
          }}
          onPointerCancel={(event) => {
            dragging.current = false;
            send({ action: "up", ...coordinates(event) });
          }}
          onKeyDown={(event) => {
            if (!keyboard || disabled) return;
            if (event.key === "Escape") {
              event.preventDefault();
              setKeyboard(false);
              keyboardButton.current?.focus();
              return;
            }
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            const keys = [
              "Enter",
              "Tab",
              "Backspace",
              "Delete",
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ];
            if (keys.includes(event.key)) {
              event.preventDefault();
              send({
                action: "key",
                key:
                  event.key === "Tab" && event.shiftKey
                    ? "Shift+Tab"
                    : event.key,
              });
            } else if (event.key.length === 1) {
              event.preventDefault();
              send({ action: "text", text: event.key });
            }
          }}
        />
      )}
      <div className="recipes-web-browser-tools">
        <button
          ref={keyboardButton}
          type="button"
          className="secondary-button"
          aria-pressed={keyboard}
          disabled={disabled}
          onClick={() => {
            setKeyboard(!keyboard);
            if (!keyboard) image.current?.focus();
          }}
        >
          {tr("web_keyboard")}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={disabled}
          onClick={() => send({ action: "scroll", dx: 0, dy: -500 })}
        >
          {tr("web_scroll_up")}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={disabled}
          onClick={() => send({ action: "scroll", dx: 0, dy: 500 })}
        >
          {tr("web_scroll_down")}
        </button>
      </div>
      <p id="recipe-browser-help" className="muted recipes-small">
        {tr("web_interaction_hint")}
      </p>
      <form
        className="recipes-web-type"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) {
            send({ action: "text", text });
            setText("");
          }
        }}
      >
        <label>
          <span className="sr-only">{tr("web_type_label")}</span>
          <input
            value={text}
            maxLength={2000}
            disabled={disabled}
            onChange={(event) => setText(event.target.value)}
            placeholder={tr("web_type_label")}
            autoComplete="off"
          />
        </label>
        <button
          type="submit"
          className="secondary-button"
          disabled={disabled || !text}
        >
          {tr("web_type_send")}
        </button>
      </form>
    </section>
  );
}
