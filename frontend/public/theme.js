// Applies the saved light/dark theme before the first paint (see src/lib/theme.ts).
// A separate file rather than an inline script, because the CSP allows only same-origin scripts.
(function () {
  var pref = null;
  try {
    pref = localStorage.getItem("theme");
  } catch (e) {}
  var dark = pref === "dark" || (pref !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
})();
