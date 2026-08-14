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
  // Files.ReadWrite (NICHT .AppFolder) — normaler OneDrive-Zugriff auf den
  // Postfach-Pfad, siehe Scope-Entscheidung im Konzeptdokument.
  scopes: ["Files.ReadWrite", "User.Read"],
  // Pfad relativ zum OneDrive-Root des angemeldeten Kontos (Max' Bestätigung
  // A2-Session). Ändert sich das, ist dies die einzige Stelle.
  postfachPfad: "Immobilien/Ablese-Postfach",
};
