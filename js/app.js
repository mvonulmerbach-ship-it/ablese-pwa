// Verdrahtung: Login, Formular aus der Zählerliste, Speichern in die
// Warteschlange, Sync. Ein Ablesegang ist klein (max. 4 Zähler je Einheit,
// Befund A1-Voruntersuchung) — keine Paginierung nötig.
"use strict";

// Wortlaut 1:1 aus frontend/js/zaehler.js (E_ANLAESSE) — derselbe Katalog,
// bewusst hier dupliziert statt geladen: die PWA spricht nie mit dem Server.
const ABLESE_ANLAESSE = [
  ["stichtag", "Stichtag (NK-Jahres-Ende)"],
  ["zwischenstand", "Zwischenstand"],
  ["einbau", "Einbau (Anfangsstand)"],
  ["ausbau", "Ausbau (Endstand)"],
  ["uebergabe-beginn", "Übergabe Mietbeginn"],
  ["uebergabe-ende", "Übergabe Mietende"],
];

const ZAEHLERLISTE_CACHE_SCHLUESSEL = "ablese_zaehlerliste_cache_v1";
// Puffer für den Ablesetag, kein Langzeitlager (Geräte-Realität) — ab hier
// mahnt die App sichtbar statt still weiter zu warten.
const WARTESCHLANGE_MAHN_TAGE = 3;

// A5 (v0.49.169): drei eigene Cache-Schlüssel, ein Datenbereich kann ohne
// die anderen offline vorliegen (Muster ZAEHLERLISTE_CACHE_SCHLUESSEL).
// `standEl`/`render` sind Funktionen statt direkter Referenzen: dieses
// Objekt wird beim Skriptstart ausgewertet, VOR `init()` -- zu dem
// Zeitpunkt existiert `els` noch nicht (verzoegerte Aufloesung noetig).
const INFOBASIS_DATEIEN = {
  einheiten: {
    datei: "einheiten.json", cacheKey: "ablese_infobasis_einheiten_v1",
    standEl: () => els.infoEinheitenStand, render: (d) => renderInfobasisEinheiten(d),
  },
  zaehlerstaende: {
    datei: "zaehlerstaende.json", cacheKey: "ablese_infobasis_zaehlerstaende_v1",
    standEl: () => els.infoZaehlerstaendeStand, render: (d) => renderInfobasisZaehlerstaende(d),
  },
  aufgaben: {
    datei: "aufgaben.json", cacheKey: "ablese_infobasis_aufgaben_v1",
    standEl: () => els.infoAufgabenStand, render: (d) => renderInfobasisAufgaben(d),
  },
};
let infobasisGeladen = false; // Graph-Abruf nur beim ersten Wechsel auf "Nachsehen"

const els = {};
let zaehlerlisteAktuell = null; // zuletzt geladene/gecachte Zählerliste
let heuteGespeichert = new Set(); // zaehler_id, die in dieser Sitzung schon erfasst wurden

function q(id) {
  return document.getElementById(id);
}

function feldDatumStandard() {
  const heute = new Date();
  const jjjj = heute.getFullYear();
  const mm = String(heute.getMonth() + 1).padStart(2, "0");
  const tt = String(heute.getDate()).padStart(2, "0");
  return `${jjjj}-${mm}-${tt}`;
}

function formatiereDatum(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE");
}

function zaehlerArtLabel(art) {
  return art || "Zähler";
}

async function init() {
  els.anmeldenBereich = q("anmelden-bereich");
  els.appBereich = q("app-bereich");
  els.ladeBereich = q("lade-bereich");
  els.btnAnmelden = q("btn-anmelden");
  els.anmeldenFehler = q("anmelden-fehler");
  els.kontoZeile = q("konto-zeile");
  els.zaehlerlisteStand = q("zaehlerliste-stand");
  els.warteschlangeText = q("warteschlange-text");
  els.btnJetztSenden = q("btn-jetzt-senden");
  els.offlineHinweis = q("offline-hinweis");
  els.feldDatum = q("feld-datum");
  els.feldAnlass = q("feld-anlass");
  els.einheitenListe = q("einheiten-liste");

  els.reiterErfassen = q("reiter-erfassen");
  els.reiterNachsehen = q("reiter-nachsehen");
  els.erfassenBereich = q("erfassen-bereich");
  els.nachsehenBereich = q("nachsehen-bereich");
  els.infoEinheitenStand = q("infobasis-einheiten-stand");
  els.infoEinheitenListe = q("infobasis-einheiten-liste");
  els.infoZaehlerstaendeStand = q("infobasis-zaehlerstaende-stand");
  els.infoZaehlerstaendeListe = q("infobasis-zaehlerstaende-liste");
  els.infoAufgabenStand = q("infobasis-aufgaben-stand");
  els.infoAufgabenListe = q("infobasis-aufgaben-liste");

  els.feldDatum.value = feldDatumStandard();
  els.feldAnlass.innerHTML = ABLESE_ANLAESSE
    .map(([wert, label]) => `<option value="${wert}">${label}</option>`)
    .join("");

  els.btnAnmelden.addEventListener("click", async () => {
    els.anmeldenFehler.hidden = true;
    try {
      await AbleseAuth.anmelden();
    } catch (fehler) {
      zeigeAnmeldenFehler(fehler);
    }
  });
  els.btnJetztSenden.addEventListener("click", () => synchronisieren());
  window.addEventListener("online", () => synchronisieren());

  els.reiterErfassen.addEventListener("click", () => zeigeReiter("erfassen"));
  els.reiterNachsehen.addEventListener("click", () => zeigeReiter("nachsehen"));

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Offline-Cache ist ein Komfort, kein Muss — ein Fehler hier blockiert
      // die eigentliche Erfassung nicht.
    });
  }

  try {
    await AbleseAuth.bereitstellen();
  } catch (fehler) {
    zeigeAnmeldenFehler(fehler);
    zeigeBereich("anmelden");
    return;
  }

  const konto = AbleseAuth.konto();
  if (!konto) {
    zeigeBereich("anmelden");
    return;
  }

  els.kontoZeile.hidden = false;
  els.kontoZeile.textContent = `Angemeldet als ${konto.name || konto.username}`;
  zeigeBereich("app");

  ladeZaehlerlisteAusCache();
  ladeInfobasisAusCache();
  await aktualisiereWarteschlangenAnzeige();
  await synchronisieren();
  await zaehlerlisteVomGraphLaden();
}

// --------------------------------------------------------------------------- #
// A5 (v0.49.169): Reiter Erfassen/Nachsehen -- "Nachsehen" ist reiner
// Lese-Bereich, laedt vom Graph erst beim ERSTEN Wechsel dorthin (kein
// unnoetiger Abruf, wenn die Sitzung nur zum Erfassen dient).
// --------------------------------------------------------------------------- #

function zeigeReiter(name) {
  const erfassenAktiv = name === "erfassen";
  els.reiterErfassen.classList.toggle("btn-reiter-aktiv", erfassenAktiv);
  els.reiterNachsehen.classList.toggle("btn-reiter-aktiv", !erfassenAktiv);
  els.erfassenBereich.hidden = !erfassenAktiv;
  els.nachsehenBereich.hidden = erfassenAktiv;
  if (!erfassenAktiv && !infobasisGeladen) {
    infobasisGeladen = true;
    infobasisVomGraphLaden();
  }
}

function ladeInfobasisAusCache() {
  for (const [key, teil] of Object.entries(INFOBASIS_DATEIEN)) {
    const roh = localStorage.getItem(teil.cacheKey);
    if (!roh) continue;
    try {
      teil.render(JSON.parse(roh));
    } catch {
      localStorage.removeItem(teil.cacheKey);
    }
  }
}

async function infobasisVomGraphLaden() {
  if (!navigator.onLine) return;
  let token;
  try {
    token = await AbleseAuth.tokenHolen();
  } catch {
    return; // Anmeldung abgelaufen -- Cache bleibt sichtbar, kein Absturz
  }
  await Promise.all(
    Object.values(INFOBASIS_DATEIEN).map((teil) => ladeInfobasisTeil(token, teil))
  );
}

async function ladeInfobasisTeil(token, teil) {
  try {
    const daten = await AbleseGraph.infobasisLesen(token, teil.datei);
    if (!daten) {
      teil.standEl().textContent =
        "Noch kein Export vorhanden — läuft am Master automatisch beim nächsten Backup (A5).";
      return;
    }
    localStorage.setItem(teil.cacheKey, JSON.stringify(daten));
    teil.render(daten);
  } catch (fehler) {
    if (!localStorage.getItem(teil.cacheKey)) {
      teil.standEl().textContent = `Konnte nicht geladen werden: ${fehler.message || fehler}`;
    }
    // Mit Cache im Ruecken bleibt der zuletzt geladene Stand sichtbar.
  }
}

function renderInfobasisEinheiten(daten) {
  const stand = formatiereDatum(daten.erstellt_am);
  els.infoEinheitenStand.textContent = stand ? `Stand vom ${stand}` : "Stand unbekannt.";
  els.infoEinheitenListe.innerHTML = "";
  const einheiten = daten.einheiten || [];
  if (!einheiten.length) {
    els.infoEinheitenListe.innerHTML = '<p class="info-leer">Keine Einheiten.</p>';
    return;
  }
  for (const eh of einheiten) {
    const karte = document.createElement("div");
    karte.className = "info-karte";
    const kopf = document.createElement("h3");
    kopf.textContent = `${eh.objekt || "—"} · ${eh.bezeichnung}`;
    karte.appendChild(kopf);
    if (!eh.vertraege || !eh.vertraege.length) {
      const leer = document.createElement("p");
      leer.className = "info-leer";
      leer.textContent = "Leerstehend.";
      karte.appendChild(leer);
    } else {
      for (const v of eh.vertraege) {
        const kontaktZeile = document.createElement("p");
        kontaktZeile.className = "info-zeile";
        const kontakt = [v.mieter_telefon, v.mieter_email].filter(Boolean).join(" · ");
        kontaktZeile.innerHTML = `<strong>${v.mieter_name || "—"}</strong>${kontakt ? " · " + kontakt : ""}`;
        karte.appendChild(kontaktZeile);

        const eckdatenZeile = document.createElement("p");
        eckdatenZeile.className = "info-zeile";
        const eckdaten = [
          v.kaltmiete != null ? `Kaltmiete ${v.kaltmiete} €` : null,
          v.nk_vorauszahlung != null ? `NK-VZ ${v.nk_vorauszahlung} €` : null,
          v.kaution != null ? `Kaution ${v.kaution} €` : null,
        ].filter(Boolean);
        eckdatenZeile.textContent = eckdaten.length ? eckdaten.join(" · ") : "—";
        karte.appendChild(eckdatenZeile);
      }
    }
    els.infoEinheitenListe.appendChild(karte);
  }
}

function renderInfobasisZaehlerstaende(daten) {
  const stand = formatiereDatum(daten.erstellt_am);
  els.infoZaehlerstaendeStand.textContent = stand ? `Stand vom ${stand}` : "Stand unbekannt.";
  els.infoZaehlerstaendeListe.innerHTML = "";
  const items = daten.zaehlerstaende || [];
  if (!items.length) {
    els.infoZaehlerstaendeListe.innerHTML = '<p class="info-leer">Keine Zähler.</p>';
    return;
  }
  for (const item of items) {
    const karte = document.createElement("div");
    karte.className = "info-karte";
    const kopf = document.createElement("h3");
    kopf.textContent = item.einheit_bezeichnung_eindeutig || item.einheit_bezeichnung || "Ohne Einheit";
    karte.appendChild(kopf);
    const zeile = document.createElement("p");
    zeile.className = "info-zeile";
    const letzterStand = item.letzter_stand_wert != null
      ? `${item.letzter_stand_wert} (${formatiereDatum(item.letzter_stand_datum) || "?"})`
      : "noch kein Stand erfasst";
    zeile.textContent = `${zaehlerArtLabel(item.art)} · ${item.zaehlernummer || "ohne Nummer"} · ${letzterStand}`;
    karte.appendChild(zeile);
    els.infoZaehlerstaendeListe.appendChild(karte);
  }
}

function renderInfobasisAufgaben(daten) {
  const stand = formatiereDatum(daten.erstellt_am);
  els.infoAufgabenStand.textContent = stand ? `Stand vom ${stand}` : "Stand unbekannt.";
  els.infoAufgabenListe.innerHTML = "";
  const items = daten.aufgaben || [];
  if (!items.length) {
    els.infoAufgabenListe.innerHTML = '<p class="info-leer">Keine offenen Aufgaben.</p>';
    return;
  }
  for (const a of items) {
    const dringend = a.severity === "urgent";
    const karte = document.createElement("div");
    karte.className = "info-karte aufgabe-karte" + (dringend ? " severity-urgent" : "");
    const kopf = document.createElement("h3");
    kopf.textContent = a.titel || a.kategorie || "Aufgabe";
    karte.appendChild(kopf);
    const zeile = document.createElement("p");
    zeile.className = "info-zeile" + (dringend ? " severity-urgent-text" : "");
    zeile.textContent = [a.details, a.due_text].filter(Boolean).join(" · ");
    karte.appendChild(zeile);
    els.infoAufgabenListe.appendChild(karte);
  }
}

function zeigeBereich(name) {
  els.anmeldenBereich.hidden = name !== "anmelden";
  els.appBereich.hidden = name !== "app";
  els.ladeBereich.hidden = true;
}

function zeigeAnmeldenFehler(fehler) {
  els.anmeldenFehler.hidden = false;
  els.anmeldenFehler.textContent = `Anmeldung fehlgeschlagen: ${fehler.message || fehler}`;
}

function ladeZaehlerlisteAusCache() {
  const roh = localStorage.getItem(ZAEHLERLISTE_CACHE_SCHLUESSEL);
  if (!roh) return;
  try {
    zaehlerlisteAktuell = JSON.parse(roh);
    renderZaehlerliste();
  } catch {
    localStorage.removeItem(ZAEHLERLISTE_CACHE_SCHLUESSEL);
  }
}

async function zaehlerlisteVomGraphLaden() {
  if (!navigator.onLine) return;
  try {
    const token = await AbleseAuth.tokenHolen();
    const daten = await AbleseGraph.zaehlerlisteLesen(token);
    if (!daten) {
      els.zaehlerlisteStand.textContent =
        "Noch keine Zählerliste im Postfach — am Master exportieren (A1).";
      return;
    }
    zaehlerlisteAktuell = daten;
    localStorage.setItem(ZAEHLERLISTE_CACHE_SCHLUESSEL, JSON.stringify(daten));
    renderZaehlerliste();
  } catch (fehler) {
    if (!zaehlerlisteAktuell) {
      els.zaehlerlisteStand.textContent = `Zählerliste konnte nicht geladen werden: ${fehler.message || fehler}`;
    }
    // Mit Cache im Rücken bleibt die zuletzt geladene Liste sichtbar — ein
    // einzelner fehlgeschlagener Abruf blockiert die Erfassung nicht.
  }
}

function renderZaehlerliste() {
  if (!zaehlerlisteAktuell) return;
  const stand = formatiereDatum(zaehlerlisteAktuell.erstellt_am);
  els.zaehlerlisteStand.textContent = stand
    ? `Zählerliste vom ${stand}`
    : "Zählerliste geladen.";

  const gruppen = new Map();
  for (const item of zaehlerlisteAktuell.zaehler || []) {
    const schluessel = item.einheit_bezeichnung_eindeutig || item.einheit_bezeichnung || "Ohne Einheit";
    if (!gruppen.has(schluessel)) gruppen.set(schluessel, []);
    gruppen.get(schluessel).push(item);
  }

  els.einheitenListe.innerHTML = "";
  for (const [einheit, items] of gruppen) {
    const karte = document.createElement("section");
    karte.className = "einheit-karte";
    const titel = document.createElement("h2");
    titel.textContent = einheit;
    karte.appendChild(titel);

    for (const item of items) {
      karte.appendChild(baueZaehlerZeile(item));
    }
    els.einheitenListe.appendChild(karte);
  }
}

function baueZaehlerZeile(item) {
  const zeile = document.createElement("div");
  zeile.className = "zaehler-zeile";

  const kopf = document.createElement("div");
  kopf.className = "zaehler-kopf";
  const letzterStand = item.letzter_stand_wert != null
    ? `letzter Stand ${item.letzter_stand_wert} (${formatiereDatum(item.letzter_stand_datum) || "?"})`
    : "noch kein Stand erfasst";
  kopf.innerHTML = `<strong>${zaehlerArtLabel(item.art)}</strong> · ${item.zaehlernummer || "ohne Nummer"}
    <span class="hinweis-klein">${letzterStand}</span>`;

  const eingabe = document.createElement("div");
  eingabe.className = "zaehler-eingabe";
  const input = document.createElement("input");
  input.type = "number";
  input.step = "0.001";
  input.inputMode = "decimal";
  input.placeholder = "Zählerstand";
  input.id = `wert-${item.zaehler_id}`;

  // A4: Beleg-Foto ist optional — ein reines <input type=file capture> statt
  // der MediaDevices-API, funktioniert identisch auf Android/iOS ohne
  // Kamera-Berechtigungsdialog der App selbst (Geräte-Realität, Konzept).
  const fotoInput = document.createElement("input");
  fotoInput.type = "file";
  fotoInput.accept = "image/*";
  fotoInput.capture = "environment";
  fotoInput.className = "foto-input-versteckt";
  fotoInput.id = `foto-${item.zaehler_id}`;

  const fotoBtn = document.createElement("button");
  fotoBtn.type = "button";
  fotoBtn.className = "btn-foto";
  fotoBtn.textContent = "📷";
  fotoBtn.title = "Beleg-Foto aufnehmen (optional)";
  fotoBtn.addEventListener("click", () => fotoInput.click());
  fotoInput.addEventListener("change", () => {
    fotoBtn.textContent = fotoInput.files.length ? "📷✓" : "📷";
  });

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = heuteGespeichert.has(item.zaehler_id) ? "Erneut erfassen" : "Erfassen";
  btn.addEventListener("click", () => erfassenKlick(item, input, btn, fotoInput, fotoBtn));

  eingabe.appendChild(input);
  eingabe.appendChild(fotoBtn);
  eingabe.appendChild(fotoInput);
  eingabe.appendChild(btn);

  zeile.appendChild(kopf);
  zeile.appendChild(eingabe);
  return zeile;
}

// Vorschaugröße statt Archivbild (Konzept A4) — die Kamera liefert sonst
// leicht 4000×3000 px, unnötig für einen Beleg und langsam zu übertragen.
const FOTO_MAX_KANTE = 1600;
const FOTO_JPEG_QUALITAET = 0.75;

async function fotoKomprimieren(datei) {
  const bitmap = await createImageBitmap(datei);
  const skala = Math.min(1, FOTO_MAX_KANTE / Math.max(bitmap.width, bitmap.height));
  const breite = Math.round(bitmap.width * skala);
  const hoehe = Math.round(bitmap.height * skala);
  const canvas = document.createElement("canvas");
  canvas.width = breite;
  canvas.height = hoehe;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, breite, hoehe);
  bitmap.close?.();
  return new Promise((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", FOTO_JPEG_QUALITAET);
  });
}

async function erfassenKlick(item, input, btn, fotoInput, fotoBtn) {
  const wertText = input.value.trim();
  const wert = parseFloat(wertText);
  if (!wertText || Number.isNaN(wert)) {
    input.focus();
    input.classList.add("feld-fehler");
    return;
  }
  input.classList.remove("feld-fehler");

  const konto = AbleseAuth.konto();
  const eintrag = {
    id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
    erstellt_am: new Date().toISOString(),
    erfasser: konto?.name || konto?.username || "unbekannt",
    konto: konto?.username || "",
    zaehler_id: item.zaehler_id,
    zaehlernummer: item.zaehlernummer,
    datum: els.feldDatum.value || feldDatumStandard(),
    anlass: els.feldAnlass.value || "stichtag",
    wert,
    gesendet: false,
  };

  if (fotoInput?.files?.[0]) {
    try {
      eintrag.fotoBlob = await fotoKomprimieren(fotoInput.files[0]);
      eintrag.fotoErweiterung = ".jpg";
    } catch {
      // Kompression fehlgeschlagen -> Ablesung trotzdem speichern, nur ohne
      // Foto (die Zahlenerfassung darf daran nicht scheitern, Regel .109).
    }
  }

  await AbleseQueue.hinzufuegen(eintrag);
  heuteGespeichert.add(item.zaehler_id);
  input.value = "";
  if (fotoInput) fotoInput.value = "";
  if (fotoBtn) fotoBtn.textContent = "📷";
  btn.textContent = "Erneut erfassen";
  await aktualisiereWarteschlangenAnzeige();
  synchronisieren();
}

async function aktualisiereWarteschlangenAnzeige() {
  const offen = await AbleseQueue.offene();
  if (!offen.length) {
    els.warteschlangeText.textContent = "Keine Einträge in der Warteschlange.";
    els.btnJetztSenden.hidden = true;
  } else {
    els.warteschlangeText.textContent = offen.length === 1
      ? "1 Eintrag wartet auf Übertragung."
      : `${offen.length} Einträge warten auf Übertragung.`;
    els.btnJetztSenden.hidden = false;
  }

  const aeltester = await AbleseQueue.aeltesterOffenerEintrag();
  if (aeltester) {
    const alterTage = (Date.now() - new Date(aeltester.erstellt_am).getTime()) / 86400000;
    if (alterTage >= WARTESCHLANGE_MAHN_TAGE) {
      els.warteschlangeText.textContent +=
        ` Achtung: der älteste Eintrag ist schon ${Math.floor(alterTage)} Tage alt — bitte bei Netz senden.`;
    }
  }

  els.offlineHinweis.hidden = navigator.onLine;
}

let synchronisierungLaeuft = false;

async function synchronisieren() {
  if (synchronisierungLaeuft) return;
  if (!navigator.onLine) {
    await aktualisiereWarteschlangenAnzeige();
    return;
  }
  synchronisierungLaeuft = true;
  els.btnJetztSenden.disabled = true;
  try {
    const offen = await AbleseQueue.offene();
    if (!offen.length) return;
    const token = await AbleseAuth.tokenHolen();
    for (const eintrag of offen) {
      try {
        await AbleseGraph.ablesungHochladen(token, eintrag);
        await AbleseQueue.alsGesendetMarkieren(eintrag.id);
      } catch (fehler) {
        // Ein einzelner fehlgeschlagener Eintrag bricht die Sitzung nicht
        // ab — er bleibt in der Warteschlange und wird beim nächsten
        // Versuch erneut probiert.
        console.warn("Ablesung konnte nicht gesendet werden:", eintrag.id, fehler);
      }
    }
  } catch (fehler) {
    console.warn("Synchronisierung übersprungen:", fehler);
  } finally {
    synchronisierungLaeuft = false;
    els.btnJetztSenden.disabled = false;
    await aktualisiereWarteschlangenAnzeige();
  }
}

document.addEventListener("DOMContentLoaded", init);
