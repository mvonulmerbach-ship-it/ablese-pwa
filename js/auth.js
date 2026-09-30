// Anmeldung an Max' Nextcloud (K131, ersetzt die Microsoft-Anmeldung): je Ableser ein
// Nextcloud-Konto mit App-Passwort (Einstellungen → Sicherheit). Die Fassade
// bleibt dieselbe wie zu Microsoft-Zeiten — `bereitstellen`, `konto`, `anmelden`,
// `abmelden`, `tokenHolen` —, damit app.js nur die Formular-Werte uebergibt.
//
// Gespeichert wird im Geraet: IndexedDB wie die Warteschlange (queue.js),
// sonst localStorage. Die Anmeldung soll den Neustart der installierten PWA
// ueberleben — genau wie vorher der Microsoft-Anmeldecache in localStorage.
"use strict";

const AbleseAuth = (() => {
  const DB_NAME = "ablese-anmeldung";
  const STORE = "konto";
  const SCHLUESSEL = "aktiv";
  const LS_SCHLUESSEL = "ablese_anmeldung_v1";
  let aktiv = null;
  let bereitPromise = null;

  function dbOeffnen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbAufruf(modus, arbeit) {
    const db = await dbOeffnen();
    return new Promise((resolve, reject) => {
      const req = arbeit(db.transaction(STORE, modus).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function laden() {
    try {
      return (await dbAufruf("readonly", (s) => s.get(SCHLUESSEL))) || null;
    } catch {
      try {
        return JSON.parse(localStorage.getItem(LS_SCHLUESSEL) || "null");
      } catch {
        return null;
      }
    }
  }

  async function speichern(wert) {
    try {
      await dbAufruf("readwrite", (s) => (wert ? s.put(wert, SCHLUESSEL) : s.delete(SCHLUESSEL)));
    } catch {
      try {
        if (wert) localStorage.setItem(LS_SCHLUESSEL, JSON.stringify(wert));
        else localStorage.removeItem(LS_SCHLUESSEL);
      } catch {
        // Kein Speicher im Geraet: die Anmeldung gilt dann nur bis zum
        // naechsten Start — die Erfassung selbst haengt nicht daran.
      }
    }
  }

  // UTF-8 vor Base64: ein Umlaut im Kontonamen braeche `btoa` sonst.
  function basisWert(benutzer, passwort) {
    const bytes = new TextEncoder().encode(`${benutzer}:${passwort}`);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return `Basic ${btoa(bin)}`;
  }

  async function bereitstellen() {
    if (bereitPromise) return bereitPromise;
    bereitPromise = (async () => {
      aktiv = await laden();
      return aktiv;
    })();
    return bereitPromise;
  }

  // Dieselbe Form wie das fruehere Microsoft-Konto, das app.js liest (`name`, `username`).
  function konto() {
    return aktiv ? { name: aktiv.benutzer, username: aktiv.benutzer } : null;
  }

  // Prueft die Werte einmal gegen die Nextcloud (PROPFIND auf die eigene
  // Wurzel), bevor sie gespeichert werden — ein Tippfehler faellt sofort
  // auf und nicht erst beim ersten Senden im Keller.
  async function anmelden(benutzer, passwort) {
    benutzer = (benutzer || "").trim();
    passwort = (passwort || "").trim();
    if (!benutzer || !passwort) {
      throw new Error("Bitte Konto und App-Passwort eintragen.");
    }
    const token = basisWert(benutzer, passwort);
    const url = `${ABLESE_KONFIG.server}/remote.php/dav/files/${encodeURIComponent(benutzer)}`;
    const resp = await fetch(url, {
      method: "PROPFIND",
      headers: { Authorization: token, Depth: "0" },
      credentials: "omit",
    });
    if (resp.status === 401) {
      throw new Error("Konto oder App-Passwort falsch — bitte in der Nextcloud unter Einstellungen → Sicherheit ein App-Passwort anlegen.");
    }
    if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
    aktiv = { benutzer, token };
    await speichern(aktiv);
  }

  async function abmelden() {
    aktiv = null;
    await speichern(null);
  }

  async function tokenHolen() {
    await bereitstellen();
    if (!aktiv) throw new Error("nicht angemeldet");
    return aktiv.token;
  }

  return { bereitstellen, konto, anmelden, abmelden, tokenHolen };
})();
