// MSAL-Anmeldung (persönliches Microsoft-Konto, PKCE) — vendorisiertes
// @azure/msal-browser (vendor/msal/), kein CDN (Muster Leaflet/U9).
"use strict";

const AbleseAuth = (() => {
  let msalApp = null;
  let bereitPromise = null;

  function konfiguration() {
    return {
      auth: {
        clientId: ABLESE_KONFIG.clientId,
        authority: ABLESE_KONFIG.authority,
        redirectUri: ABLESE_KONFIG.redirectUri,
        // "consumers"-Authority + fremder Kontotyp würde sonst mit einem
        // Cross-Cloud-Fehler abgewiesen statt sauber zur Anmeldung zu führen.
        navigateToLoginRequestUrl: true,
      },
      cache: {
        // localStorage statt sessionStorage: die Anmeldung soll den
        // Neustart der (ggf. installierten) PWA überleben.
        cacheLocation: "localStorage",
        storeAuthStateInCookie: false,
      },
    };
  }

  async function bereitstellen() {
    if (bereitPromise) return bereitPromise;
    bereitPromise = (async () => {
      msalApp = new msal.PublicClientApplication(konfiguration());
      await msalApp.initialize();
      // Schliesst einen laufenden Redirect-Login ab (No-Op ohne Redirect).
      const ergebnis = await msalApp.handleRedirectPromise();
      return ergebnis;
    })();
    return bereitPromise;
  }

  function konto() {
    if (!msalApp) return null;
    const konten = msalApp.getAllAccounts();
    return konten.length ? konten[0] : null;
  }

  async function anmelden() {
    await bereitstellen();
    // Redirect statt Popup: in einer installierten Standalone-PWA (Home-
    // Bildschirm, v. a. iOS) sind Popup-Fenster unzuverlässig.
    await msalApp.loginRedirect({ scopes: ABLESE_KONFIG.scopes });
  }

  async function abmelden() {
    await bereitstellen();
    const account = konto();
    await msalApp.logoutRedirect({ account });
  }

  async function tokenHolen() {
    await bereitstellen();
    const account = konto();
    if (!account) throw new Error("nicht angemeldet");
    const anfrage = { scopes: ABLESE_KONFIG.scopes, account };
    try {
      const ergebnis = await msalApp.acquireTokenSilent(anfrage);
      return ergebnis.accessToken;
    } catch (fehler) {
      // Stiller Token-Bezug scheitert typischerweise, wenn die Zustimmung
      // erneut nötig ist (z. B. abgelaufene Sitzung) — dann interaktiv.
      await msalApp.acquireTokenRedirect(anfrage);
      // acquireTokenRedirect verlässt die Seite; dieser Rückgabewert wird
      // praktisch nie erreicht.
      return null;
    }
  }

  return { bereitstellen, konto, anmelden, abmelden, tokenHolen };
})();
