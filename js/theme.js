// Dark Mode — dasselbe Fundament wie in der Mietverwaltung (core.js,
// v0.49.177): Umschaltung ueber [data-theme="dark"] am <html>-Element,
// ui-tokens-dark.css wirkt ausschliesslich unter diesem Attribut. Gemerkt
// wird direkt in localStorage — die PWA hat keine Einstellungs-Schicht;
// jeder Zugriff in try/catch, weil localStorage in privaten Fenstern
// fehlen kann und die App dann der Systemeinstellung folgt.
//
// 02.10.2026 (Mini-App-Ueberarbeitung S1, Befunde Q-3/Q-4, Max'
// Entscheidung): dreistufig System · Hell · Dunkel, Standard "System" —
// die App folgt jetzt der Systemeinstellung, solange niemand bewusst
// umstellt. Der Knopf schaltet reihum und zeigt die aktuelle Wahl
// (Halbkreis = System, Sonne = Hell, Mond = Dunkel). Der alte Wert
// "1"/"0" gilt als bewusste Wahl und wird als "dark"/"light" gelesen.
//
// Wird im <head> geladen (VOR dem Body), damit ein dunkles Design ohne
// hellen Blitz erscheint.
"use strict";

const THEME_SCHLUESSEL = "ablese.themeDunkel";
const THEME_FOLGE = ["system", "light", "dark"];
const THEME_NAME = { system: "System", light: "Hell", dark: "Dunkel" };
const themeDunkelAbfrage = window.matchMedia("(prefers-color-scheme: dark)");

function themeWahlLesen() {
  let wert = null;
  try { wert = localStorage.getItem(THEME_SCHLUESSEL); }
  catch (e) { /* privates Fenster o. ae. — dann gilt "System" */ }
  if (wert === "1") return "dark";   // gemerkt bis 02.10.2026
  if (wert === "0") return "light";
  return THEME_FOLGE.includes(wert) ? wert : "system";
}

function themeWahlMerken(wahl) {
  try { localStorage.setItem(THEME_SCHLUESSEL, wahl); }
  catch (e) { /* privates Fenster o. ae. — dann gilt die Wahl nur bis zum Neuladen */ }
}

function themeAnwenden() {
  const wahl = themeWahlLesen();
  const dunkel = wahl === "dark" || (wahl === "system" && themeDunkelAbfrage.matches);
  document.documentElement.setAttribute("data-theme", dunkel ? "dark" : "light");
  const knopf = document.getElementById("theme-umschalten");
  if (knopf) {
    knopf.dataset.wahl = wahl;
    knopf.setAttribute("aria-label", "Erscheinungsbild: " + THEME_NAME[wahl]);
    knopf.setAttribute("title", "Erscheinungsbild: " + THEME_NAME[wahl]);
  }
  // Browser-Chrom (Adressleiste) folgt dem Seitengrund der Tokens.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dunkel ? "#2E3440" : "#f9f8f7");
}

function themeUmschalten() {
  const wahl = themeWahlLesen();
  themeWahlMerken(THEME_FOLGE[(THEME_FOLGE.indexOf(wahl) + 1) % THEME_FOLGE.length]);
  themeAnwenden();
}

// Stellt jemand bei Wahl "System" das Handy um, zieht die App sofort nach.
themeDunkelAbfrage.addEventListener("change", themeAnwenden);

// Sofort anwenden — der Knopf existiert hier noch nicht, sein Zustand wird
// nach dem Laden in app.js (init) ein zweites Mal gesetzt.
themeAnwenden();
