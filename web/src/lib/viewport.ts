import { useEffect } from "react";

/** Size the app to the visible viewport. Phones do not shrink 100dvh when the keyboard opens. */
export function useVisualViewport(): void {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;

    function apply() {
      const height = viewport?.height ?? window.innerHeight;
      const offset = viewport?.offsetTop ?? 0;
      root.style.setProperty("--app-height", `${height}px`);
      root.style.setProperty("--app-offset", `${offset}px`);
      root.classList.toggle("keyboard-open", window.innerHeight - height > 120);
    }

    function blockGesture(event: Event) {
      event.preventDefault();
    }
    function blockPinch(event: TouchEvent) {
      if (event.touches.length > 1) event.preventDefault();
    }

    apply();
    viewport?.addEventListener("resize", apply);
    viewport?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    document.addEventListener("focusout", apply);
    document.addEventListener("gesturestart", blockGesture);
    document.addEventListener("gesturechange", blockGesture);
    document.addEventListener("touchmove", blockPinch, { passive: false });
    return () => {
      viewport?.removeEventListener("resize", apply);
      viewport?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      document.removeEventListener("focusout", apply);
      document.removeEventListener("gesturestart", blockGesture);
      document.removeEventListener("gesturechange", blockGesture);
      document.removeEventListener("touchmove", blockPinch);
      root.classList.remove("keyboard-open");
    };
  }, []);
}
