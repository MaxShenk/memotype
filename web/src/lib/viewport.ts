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

    apply();
    viewport?.addEventListener("resize", apply);
    viewport?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    return () => {
      viewport?.removeEventListener("resize", apply);
      viewport?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      root.classList.remove("keyboard-open");
    };
  }, []);
}
