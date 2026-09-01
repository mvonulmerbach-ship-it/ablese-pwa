// Dark Mode — dasselbe Fundament wie in der Mietverwaltung (core.js,
// v0.49.177): Umschaltung ueber [data-theme="dark"] am <html>-Element,
// ui-tokens-dark.css wirkt ausschliesslich unter diesem Attribut. Der
// Systemeinstellung folgt die App bewusst NICHT (gleiche Entscheidung wie
// am Master). Gemerkt wird direkt in localStorage — die PWA hat keine
// Einstellungs-Schicht; jeder Zugriff in try/catch, weil localStorage in
// privaten Fenstern fehlen kann und die App dann hell laufen soll.
//
// Wird im <head> geladen (VOR dem Body), damit ein gemerktes dunkles
// Design ohne hellen Blitz erscheint.
"use strict";

const THEME_SCHLUESSEL = "ablese.themeDunkel";

function themeDunkelLesen() {
  try { return localStorage.getItem(THEME_SCHLUESSEL) === "1"; }
  catch (e) { return false; }
}

function themeDunkelMerken(dunkel) {
  try { localStorage.setItem(THEME_SCHLUESSEL, dunkel ? "1" : "0"); }
  catch (e) { /* privates Fenster o. ae. — dann gilt das Design nur bis zum Neuladen */ }
}

function themeZustandAnwenden(dunkel) {
  if (dunkel) document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
  const knopf = document.getElementById("theme-umschalten");
  if (knopf) {
    knopf.setAttribute("aria-pressed", dunkel ? "true" : "false");
    knopf.setAttribute("title", dunkel ? "Helles Design" : "Dunkles Design");
  }
  // Browser-Chrom (Adressleiste) folgt dem Seitengrund der Tokens.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dunkel ? "#2E3440" : "#f9f8f7");
}

function themeUmschalten() {
  const dunkel = !themeDunkelLesen();
  themeDunkelMerken(dunkel);
  themeZustandAnwenden(dunkel);
}

// Sofort anwenden — der Knopf existiert hier noch nicht, sein Zustand wird
// nach dem Laden in app.js (init) ein zweites Mal gesetzt.
themeZustandAnwenden(themeDunkelLesen());
