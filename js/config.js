// Konfiguration der Ablese-PWA (A2, MOBIL_KONZEPT_WEG_A_2026-08-11.md).
// Bewusst eine einzige Stelle fuer die Werte, die sich mit dem Ablageort
// aendern koennen.
//
// K131 (Mietverwaltung, 30.09.2026): die Ablage ist Max' Nextcloud statt
// OneDrive. Die App wird von DERSELBEN Herkunft ausgeliefert wie die
// Nextcloud (https://truenas.tailb74bbe.ts.net:8443/ablese/) — deshalb ist
// der Server einfach `location.origin`, und es gibt kein CORS. Die
// Microsoft-Werte (clientId, redirectUri, authority, scopes) sind entfallen.
"use strict";

const ABLESE_KONFIG = {
  server: location.origin,
  // Pfad relativ zum Nextcloud-Wurzelordner DES EIGENTUEMER-Kontos (Max).
  // Ein fremder Ableser (A3) findet den freigegebenen Ordner unter seinem
  // Namen ("Ablesewerte") im eigenen Wurzelordner (ablage.js).
  postfachPfad: "Arbeit/02 Immobilien/Verwaltung/Ablesewerte",
  // A5 (v0.49.169): eigener, NIE freigegebener Ordner — nur Max' eigenes
  // Konto liest ihn (ablage.js::infobasisLesen), ein fremder Ableser nie.
  infobasisPfad: "Arbeit/02 Immobilien/Infobasis",
};
