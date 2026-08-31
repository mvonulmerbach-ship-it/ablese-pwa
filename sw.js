// Cached NUR die App-Huelle (fuers Offline-Oeffnen im Keller) — Graph-
// Antworten (Zaehlerliste, Uploads) laufen NIE ueber den Cache, sonst waere
// die Datenaktualitaet des Zustands verdeckt (Geraete-Realitaet, A2).
"use strict";

// v2: UI-Uebernahme 31.08.2026 — Token-Dateien, Icon-Bank und Theme-Schalter
// gehoeren zur Huelle; der neue Cache-Name verdraengt die v1-Huelle.
const CACHE_NAME = "ablese-huelle-v2";
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
  "js/queue.js",
  "js/auth.js",
  "js/graph.js",
  "js/app.js",
  "vendor/msal/msal-browser.min.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
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
      if (treffer) return treffer;
      return fetch(event.request).catch(() => caches.match("index.html"));
    })
  );
});
