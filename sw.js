// Cached NUR die App-Huelle (fuers Offline-Oeffnen im Keller) — WebDAV-
// Antworten (Zaehlerliste, Uploads) laufen NIE ueber den Cache, sonst waere
// die Datenaktualitaet des Zustands verdeckt (Geraete-Realitaet, A2).
"use strict";

// v10: 02.10.2026 — Mini-App-Ueberarbeitung S8 (NP-3): Vorladen mit cache:"reload",
// wie in allen anderen Mini-Apps.

// v9: 02.10.2026 — Mini-App-Ueberarbeitung S1 (Befund Q-1): Auf GitHub Pages
// liegen alle Mini-Apps auf DERSELBEN Herkunft und teilen sich EINEN
// Cache-Speicher. Der Worker loeschte beim Aktivieren jeden fremden Cache
// (und die anderen Apps seinen) — nach einmal Pizzateig oeffnen startete
// die Ablesung offline nicht mehr. Jetzt: Cache-Name mit App-Praefix, beim
// Aktivieren nur eigene alte Huellen (und die Altlast "ablese-huelle-")
// loeschen, Treffer nur aus dem eigenen Cache, nur Anfragen im eigenen
// Geltungsbereich abfangen. "::" als Trenner, damit ein Praefix nie den
// Namen einer anderen App mit gleichem Anfang trifft. Dazu Hell/Dunkel
// dreistufig in js/theme.js und 44-px-Tippflaechen in app.css.

// v8: 30.09.2026 — Mietverwaltung K131: Nextcloud statt OneDrive. js/ablage.js
// (WebDAV) ersetzt js/graph.js, die Anmeldung ist Konto + App-Passwort, die
// Microsoft-Bibliothek ist entfallen. Die App liegt jetzt auf DERSELBEN
// Herkunft wie die Nextcloud — deshalb reicht „fremde Herkunft nie abfangen“
// nicht mehr: alles unter /remote.php/ wird ausdruecklich durchgereicht.

// v7: 28.09.2026 — Mietverwaltung K137: Eingaben und Fotos bleiben beim
// Nachladen der Zählerliste, ein Funkloch heilt von selbst (Zählerliste und
// Infobasis laden nach), unendliche Stände werden markiert, ein unlesbares
// Foto wird benannt. Keine neue Datei — der Versionsdreh holt js/app.js und
// js/zahl.js sofort statt beim übernächsten Öffnen.
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
const PRAEFIX = "ablese-pwa::";
const CACHE_NAME = PRAEFIX + "huelle-v10";
const ALT_PRAEFIXE = ["ablese-huelle-"];   // Huellen bis v8
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
  "js/ablage.js",
  "js/app.js",
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
    // v10: am HTTP-Cache des Browsers vorbei vorladen (cache:"reload") - sonst kann nach
    // einem Update noch eine frische alte Datei in die neue Huelle geraten.
    caches.open(CACHE_NAME).then((cache) => cache.addAll(HUELLE.map((u) => new Request(u, { cache: "reload" }))))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((namen) =>
      // Nur eigene Caches loeschen — niemals die der anderen Apps derselben
      // Herkunft (Q-1).
      Promise.all(namen
        .filter((n) => (n.startsWith(PRAEFIX) && n !== CACHE_NAME) ||
                       ALT_PRAEFIXE.some((a) => n.startsWith(a)))
        .map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Nur den eigenen Geltungsbereich abfangen — fremde Herkunft und die
  // anderen Apps auf derselben Herkunft nie (Q-1).
  if (!event.request.url.startsWith(self.registration.scope)) return;
  // K131: die Nextcloud teilt sich die Herkunft mit der App. Ihre Antworten
  // (zaehlerliste.json, Infobasis) duerfen nie aus dem Cache kommen.
  if (url.pathname.startsWith("/remote.php/")) return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    // v9: nur im EIGENEN Cache suchen — caches.match durchsuchte alle Apps.
    caches.open(CACHE_NAME).then((huelle) => huelle.match(event.request)).then((treffer) => {
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
      return nachladen.then((antwort) => antwort ||
        caches.open(CACHE_NAME).then((huelle) => huelle.match("index.html")));
    })
  );
});
