import { useEffect, useState } from "react";

export function motionAllowed(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Counts from 0 up to `target` over `ms` for display only (screen readers get the final value from
 * the caller's label). Returns the target as is when motion is reduced or unavailable (tests).
 */
export function useCountUp(target: number, ms = 900): number {
  const animate = motionAllowed();
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!animate) return;
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setValue(target * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [animate, target, ms]);
  return animate ? value : target;
}
