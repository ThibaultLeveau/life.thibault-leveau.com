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
    const reset = () => {
      style.removeProperty("--ui-viewport-height");
      style.removeProperty("--ui-viewport-top");
    };
    function update() {
      frame = 0;
      const shouldReveal = reveal;
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
        actions && getComputedStyle(actions).position === "sticky"
          ? actions.getBoundingClientRect().top - 16
          : Infinity,
      );
      if (bounds.top < visibleTop || bounds.bottom > visibleBottom)
        field.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: "instant",
        });
    }
    function schedule(ensureVisible = false) {
      reveal ||= ensureVisible;
      if (!frame) frame = requestAnimationFrame(update);
    }
    const onFocusOrResize = () => schedule(true);
    // Native panning changes the offset; manual scrolling must stay under user control.
    const onScroll = () => schedule();
    document.addEventListener("focusin", onFocusOrResize);
    window.addEventListener("resize", onFocusOrResize);
    viewport?.addEventListener("resize", onFocusOrResize);
    viewport?.addEventListener("scroll", onScroll);
    touch.addEventListener("change", onFocusOrResize);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", onFocusOrResize);
      window.removeEventListener("resize", onFocusOrResize);
      viewport?.removeEventListener("resize", onFocusOrResize);
      viewport?.removeEventListener("scroll", onScroll);
      touch.removeEventListener("change", onFocusOrResize);
      reset();
    };
  }, []);
}
