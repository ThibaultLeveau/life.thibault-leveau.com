import { useEffect } from "react";

// The keyboard can shrink only the visual viewport (not CSS vh or innerHeight).
// Keep this enhancement independent of forms and of application business data.
export function useMobileFormViewport() {
  useEffect(() => {
    const touch = matchMedia("(pointer: coarse)");
    const viewport = window.visualViewport;
    const style = document.documentElement.style;
    let frame = 0;
    let reveal = false;
    let followingFocus = false;
    const reset = () => {
      style.removeProperty("--ui-viewport-height");
      style.removeProperty("--ui-viewport-top");
    };
    function update() {
      frame = 0;
      const shouldReveal = reveal && followingFocus;
      reveal = false;
      if (!touch.matches) {
        reset();
        return;
      }
      // Freeze the layout during a user's pinch zoom; do not resize it again.
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
      const height = viewport?.height ?? window.innerHeight;
      const top = viewport?.offsetTop ?? 0;
      style.setProperty("--ui-viewport-height", `${height}px`);
      style.setProperty("--ui-viewport-top", `${top}px`);
      const field = document.activeElement;
      if (
        !shouldReveal ||
        !(field instanceof HTMLElement) ||
        !field.matches(
          'textarea, select, input:not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="range"]):not([type="button"]):not([type="submit"])',
        ) ||
        !field.closest(".ui-scope, .auth-page, .app-dialog")
      )
        return;
      const bounds = field.getBoundingClientRect();
      const dialog = field.closest("dialog");
      const header = dialog?.querySelector(".dialog-header");
      const actions = dialog?.querySelector(".dialog-actions");
      const visibleTop = Math.max(
        top + 16,
        (header?.getBoundingClientRect().bottom ?? top) + 16,
      );
      const visibleBottom = Math.min(
        top + height - 32,
        dialog ? dialog.getBoundingClientRect().bottom - 16 : Infinity,
        actions && getComputedStyle(actions).position === "sticky"
          ? actions.getBoundingClientRect().top - 16
          : Infinity,
      );
      if (bounds.top < visibleTop || bounds.bottom > visibleBottom) {
        if (dialog) {
          // Scroll only the dialog, without asking the browser to pan the page
          // again while its native keyboard/focus animation is still settling.
          const targetTop =
            visibleTop +
            Math.max(0, (visibleBottom - visibleTop - bounds.height) / 2);
          dialog.scrollTop += bounds.top - targetTop;
        } else {
          field.scrollIntoView({
            block: "center",
            inline: "nearest",
            behavior: "instant",
          });
        }
      }
    }
    function schedule(ensureVisible = false) {
      reveal ||= ensureVisible;
      if (!frame) frame = requestAnimationFrame(update);
    }
    const onEditing = () => {
      followingFocus = true;
      schedule(true);
    };
    const onViewportChange = () => schedule(followingFocus);
    // Native scrolling may finish after focus/resize. Recheck the active field
    // then too, but stop following it as soon as the user scrolls deliberately.
    const onDialogScroll = (event: Event) => {
      if (event.target === document.activeElement?.closest("dialog"))
        schedule(followingFocus);
    };
    const onManualScroll = () => {
      followingFocus = false;
    };
    const onPointerDown = (event: PointerEvent) => {
      // A second tap on an already focused input can reopen the OS keyboard
      // without a new focusin; tapping elsewhere releases automatic following.
      followingFocus = event.target === document.activeElement;
    };
    document.addEventListener("focusin", onEditing);
    document.addEventListener("input", onEditing);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("touchmove", onManualScroll, { passive: true });
    document.addEventListener("wheel", onManualScroll, { passive: true });
    document.addEventListener("scroll", onDialogScroll, true);
    window.addEventListener("resize", onViewportChange);
    viewport?.addEventListener("resize", onViewportChange);
    viewport?.addEventListener("scroll", onViewportChange);
    touch.addEventListener("change", onViewportChange);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", onEditing);
      document.removeEventListener("input", onEditing);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("touchmove", onManualScroll);
      document.removeEventListener("wheel", onManualScroll);
      document.removeEventListener("scroll", onDialogScroll, true);
      window.removeEventListener("resize", onViewportChange);
      viewport?.removeEventListener("resize", onViewportChange);
      viewport?.removeEventListener("scroll", onViewportChange);
      touch.removeEventListener("change", onViewportChange);
      reset();
    };
  }, []);
}
