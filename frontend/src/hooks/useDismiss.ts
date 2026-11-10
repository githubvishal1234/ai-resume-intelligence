import { useEffect, type RefObject } from "react";

/** Closes an open menu on Escape or a press outside `root`. */
export function useDismiss(open: boolean, close: () => void, root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onPress = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPress);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPress);
    };
    // `close` is a fresh function each render; the effect only needs to follow `open`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, root]);
}
