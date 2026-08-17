// Konfiguration der Ablese-PWA (A2, MOBIL_KONZEPT_WEG_A_2026-08-11.md).
// Bewusst eine einzige Stelle für die drei Werte, die sich mit der
// Microsoft-App-Registrierung bzw. dem Postfach-Pfad ändern können.
"use strict";

const ABLESE_KONFIG = {
  // Anwendungs-ID (Client) aus der Microsoft-Entra-App-Registrierung.
  clientId: "b40ae3e8-6ebf-4332-9a16-6206b22084aa",
  // Muss exakt der als SPA-Redirect-URI registrierten Adresse entsprechen.
  redirectUri: "https://mvonulmerbach-ship-it.github.io/ablese-pwa/",
  // "consumers" statt "common": die Registrierung erlaubt ausdrücklich NUR
  // persönliche Microsoft-Konten (siehe Registrierungs-Entscheidung A2).
  authority: "https://login.microsoftonline.com/consumers",
  // Files.ReadWrite.All (NICHT .AppFolder) statt des schmaleren
  // Files.ReadWrite: seit A3 melden sich auch fremde Konten an, die den
  // Postfach-Ordner nur als Freigabe sehen ("mit mir geteilt") — dafür
  // reicht der eigene-Drive-Scope nicht. Deckt Max' eigenes Konto mit ab.
  scopes: ["Files.ReadWrite.All", "User.Read"],
  // Pfad relativ zum OneDrive-Root DES EIGENTÜMER-Kontos (Max), nicht
  // zwingend zum Root des angemeldeten Kontos — bei fremden Konten (A3)
  // wird dieser Name über "Für mich freigegeben" gesucht (graph.js).
  // Bestätigt A3-Session (14.08.2026); vorher A2-Namensvorschlag war
  // "Immobilien/Ablese-Postfach", inzwischen überholt.
  postfachPfad: "Immobilien/Verwaltung/Ablesewerte",
};
