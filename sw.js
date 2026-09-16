// Cached NUR die App-Huelle (fuers Offline-Oeffnen im Keller) — Graph-
// Antworten (Zaehlerliste, Uploads) laufen NIE ueber den Cache, sonst waere
// die Datenaktualitaet des Zustands verdeckt (Geraete-Realitaet, A2).
"use strict";

// v6: 15.09.2026 — js/zahl.js ist neu (Zählerstand deutsch lesen, W68/F64),
// dazu Doppel-Tipp-Sperre, Ordner-Anlage mit „:/children“, Redirect nur bei
// nötiger Anmeldung. Die neue Datei MUSS in die Huelle, sonst fehlt der
// Leser offline — und app.js wirft beim ersten Erfassen.
// v5: 09.09.2026 — der fetch-Handler war reines Cache-first: was einmal in
// der Huelle lag, wurde NIE wieder vom Netz geholt. Jede Korrektur (auch die
// am Postfach-Pfad in js/config.js) erreichte ein Geraet nur, wenn jemand
// daran dachte, hier die Version hochzuzaehlen — sonst lief das Handy
// stillschweigend weiter mit dem alten Stand. Jetzt "aus dem Cache zeigen,
// im Hintergrund erneuern": die App startet im Keller weiter sofort, holt
// aber bei Netz jede Datei nach, sodass das naechste Oeffnen aktuell ist.
// Der Versionsdreh bleibt trotzdem sinnvoll, wenn eine Datei WEGFAELLT.
// v4: 01.09.2026 — die Icons kommen jetzt aus dem EIGENEN Zeichen der
// Mietverwaltung (das Schild, tools/icons_erzeugen.py dort). Ein Geraet mit
// der v3-Huelle traegt sonst weiter das Donauwinkel der Gutsverwaltung —
// und genau dieser Fall ist der Grund, warum die Huellen-Version bei jedem
// Icon-Wechsel steigen MUSS: ein Startbildschirm-Icon wird nie neu geholt.
// v3: 01.09.2026 — die Icons kamen aus dem Hauslogo der Gutsverwaltung.
// v2: UI-Uebernahme 31.08.2026 — Token-Dateien, Icon-Bank und Theme-Schalter
// gehoeren zur Huelle; der neue Cache-Name verdraengt die v1-Huelle.
const CACHE_NAME = "ablese-huelle-v6";
const HUELLE = [
  "./",
  "index.html",
  "app.css",
  "ui-tokens.css",
  "ui-tokens-dark.css",
  "manifest.json",
  "js/icons.js",
  "js/theme.js",
  "js/config.js",
  "js/zahl.js",
  "js/queue.js",
  "js/auth.js",
  "js/graph.js",
  "js/app.js",
  "vendor/msal/msal-browser.min.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  // v5: die drei fehlten — das maskable Icon steht im Manifest (Android
  // zeichnet damit das Startbildschirm-Symbol) und die beiden kleinen
  // Favicons in index.html. Ohne Netz blieben sie leer.
  "icons/icon-512-maskable.png",
  "icons/favicon.svg",
  "icons/favicon-16.png",
  "icons/favicon-32.png",
  "icons/favicon-48.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(HUELLE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((namen) =>
      Promise.all(namen.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Fremde Herkunft (login.microsoftonline.com, graph.microsoft.com) NIE
  // abfangen — nur die eigene App-Huelle wird gecacht.
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((treffer) => {
      // Im Hintergrund immer nachladen und die Huelle auffrischen. Laeuft
      // absichtlich NEBEN der Antwort: der Keller-Start wartet nie darauf.
      const nachladen = fetch(event.request)
        .then((antwort) => {
          // Nur vollstaendige eigene Antworten cachen — ein 404 oder eine
          // abgeschnittene 206 wuerde die Huelle sonst vergiften.
          if (antwort && antwort.ok && antwort.status === 200) {
            const kopie = antwort.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, kopie));
          }
          return antwort;
        })
        .catch(() => null);

      if (treffer) {
        // Der Cache antwortet sofort; das Nachladen darf den Worker
        // ueberleben, sonst bricht es beim Beenden ab.
        event.waitUntil(nachladen);
        return treffer;
      }
      // Nichts im Cache: auf das Netz warten, und wenn auch das nichts
      // liefert, die Huelle zeigen (Navigation aus dem Funkloch heraus).
      return nachladen.then((antwort) => antwort || caches.match("index.html"));
    })
  );
});
