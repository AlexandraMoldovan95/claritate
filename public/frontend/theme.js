// Tema se aplică înainte de prima afișare (fără „clipire” albă): alegerea salvată, altfel setarea dispozitivului.
// Fișier separat (nu <script> inline în index.html), ca politica CSP să poată interzice scripturile inline.
// Se încarcă în <head>, fără defer, tocmai ca să ruleze înainte să se deseneze pagina.
(function () {
  var t = null;
  try { t = localStorage.getItem("claritate-theme"); } catch (e) {}
  if (t !== "dark" && t !== "light") t = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", t);
})();
