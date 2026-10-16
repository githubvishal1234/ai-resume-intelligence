import { useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";

/**
 * Warns before leaving with unsaved edits. Returns `allowLeave()`, called right before a
 * navigation that follows a successful save (state updates would land too late for the blocker).
 */
export function useUnsavedGuard(dirty: boolean) {
  const leaving = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm("You have unsaved changes. Leave without saving?")) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  // Browser reload / tab close.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
  return () => {
    leaving.current = true;
  };
}
