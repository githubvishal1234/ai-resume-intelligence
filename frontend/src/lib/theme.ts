import { useSyncExternalStore } from "react";

/**
 * Light / dark theme. The choice lives in this browser only (localStorage); "system" follows the
 * operating system. public/theme.js applies it before first paint so dark mode never flashes light;
 * this module keeps it in sync after that. The CSS keys off <html data-theme="light|dark">.
 */
export type ThemePref = "system" | "light" | "dark";

const KEY = "theme";
const EVENT = "themechange";

const systemDark = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;

export function themePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function resolvedTheme(pref = themePref()): "light" | "dark" {
  return pref === "system" ? (systemDark() ? "dark" : "light") : pref;
}

function apply() {
  document.documentElement.dataset.theme = resolvedTheme();
  window.dispatchEvent(new Event(EVENT));
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // Storage blocked (private mode): the choice still applies until the page is reloaded.
  }
  document.documentElement.dataset.theme = resolvedTheme(pref);
  window.dispatchEvent(new Event(EVENT));
}

/** Applies the saved theme and follows OS changes while the preference is "system". */
export function startTheme() {
  apply();
  if (typeof window.matchMedia === "function") {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (themePref() === "system") apply();
    });
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

const snapshot = () => `${themePref()}:${document.documentElement.dataset.theme ?? resolvedTheme()}`;

/** The saved preference and the theme actually shown. */
export function useTheme() {
  const [pref, shown] = useSyncExternalStore(subscribe, snapshot).split(":") as [ThemePref, "light" | "dark"];
  return { pref, resolved: shown, setPref: setThemePref };
}
