/* global window, document */
// Applies the saved light/dark theme before the first paint (see src/lib/theme.ts).
// A separate file rather than an inline script, because the CSP allows only same-origin scripts.
(function () {
  var pref = null;
  try {
    pref = window.localStorage.getItem("theme");
  } catch {
    // Storage blocked: fall back to the system setting.
  }
  var dark = pref === "dark" || (pref !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
})();
