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
// 09.09.2026: so lange bleibt ein GESENDETER Eintrag noch liegen, bevor er
// beim naechsten Start weggeraeumt wird (AbleseQueue.aufraeumen). Bewusst
// deutlich laenger als die Mahnfrist: der Sinn ist Nachschauen-Koennen, nicht
// Sparen. Offene Eintraege sind davon nie betroffen.
const WARTESCHLANGE_SCHONFRIST_TAGE = 14;

// A5 (v0.49.169): drei eigene Cache-Schlüssel, ein Datenbereich kann ohne
// die anderen offline vorliegen (Muster ZAEHLERLISTE_CACHE_SCHLUESSEL).
// 09.09.2026: kein `render` mehr je Datei — die drei Bereiche werden nicht
// mehr getrennt untereinander gezeichnet, sondern zu EINER Navigation
// verwoben (nachsehenZeichnen). Jeder Teil legt seine Rohdaten in
// `infobasisDaten` ab und stösst ein Neuzeichnen an; welcher Teil gerade
// sichtbar wird, entscheidet die Ebene, auf der man steht.
const INFOBASIS_DATEIEN = {
  einheiten: {
    datei: "einheiten.json", cacheKey: "ablese_infobasis_einheiten_v1",
  },
  zaehlerstaende: {
    datei: "zaehlerstaende.json", cacheKey: "ablese_infobasis_zaehlerstaende_v1",
  },
  aufgaben: {
    datei: "aufgaben.json", cacheKey: "ablese_infobasis_aufgaben_v1",
  },
};
// Graph-Abruf erst beim ersten Wechsel auf "Nachsehen". 28.09.2026
// (Mietverwaltung K137/F193): `infobasisGeladen` wird erst nach ERFOLG
// gesetzt — vorher stand es vor dem Abruf auf true, und wer offline auf
// „Nachsehen“ tippte, bekam die Infobasis in dieser Sitzung nie mehr.
// `infobasisGewuenscht` merkt sich den Wunsch, damit `wiederOnline()` nachlädt.
let infobasisGeladen = false;
let infobasisGewuenscht = false;
let infobasisLaedt = false;
const OFFLINE_SATZ = "Offline — wird geladen, sobald wieder Netz da ist.";

// Die zuletzt geladenen Rohdaten je Bereich; null = für diesen Bereich liegt
// noch nichts vor. Bewusst EIN Speicher statt drei gerenderter Listen: die
// Detailseite einer Einheit braucht alle drei gleichzeitig (Mieter aus
// `einheiten`, Zähler aus `zaehlerstaende`, Offenes aus `aufgaben`) und
// verknüpft sie über `einheit_id`, die in allen dreien steht.
const infobasisDaten = { einheiten: null, zaehlerstaende: null, aufgaben: null };
// Warum ein Bereich fehlt — getrennt gehalten, damit ein fehlender Teil
// benannt wird, statt die anderen beiden mit auszublenden (Regel .109).
const infobasisFehler = { einheiten: null, zaehlerstaende: null, aufgaben: null };

// Wo im Nachsehen-Bereich man gerade steht. `ebene` ist eine von
// "objekte" (Liste der NK-Kreise), "kreis" (Einheiten EINES Kreises),
// "einheit" (Detailseite) und "aufgaben" (alle offenen Aufgaben).
let nachsehenOrt = { ebene: "objekte", kreis: null, einheitId: null };

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
  els.sendeFehler = q("sende-fehler");
  els.feldDatum = q("feld-datum");
  els.feldAnlass = q("feld-anlass");
  els.einheitenListe = q("einheiten-liste");

  els.reiterErfassen = q("reiter-erfassen");
  els.reiterNachsehen = q("reiter-nachsehen");
  els.erfassenBereich = q("erfassen-bereich");
  els.nachsehenBereich = q("nachsehen-bereich");
  els.nachsehenZurueck = q("nachsehen-zurueck");
  els.nachsehenTitel = q("nachsehen-titel");
  els.nachsehenUnterzeile = q("nachsehen-unterzeile");
  els.nachsehenStand = q("nachsehen-stand");
  els.nachsehenInhalt = q("nachsehen-inhalt");
  els.nachsehenZurueck.addEventListener("click", () => nachsehenZurueck());

  // UI-Uebernahme 31.08.2026: Symbole aus der Icon-Bank (js/icons.js) vor
  // die statischen Beschriftungen — derselbe Zeichenweg wie am Master
  // (currentColor, kein Farbwert im Symbol). Der Theme-Knopf existierte
  // beim fruehen Lauf von js/theme.js noch nicht; sein Zustand wird hier
  // nachgezogen.
  els.reiterErfassen.insertAdjacentHTML("afterbegin", icSvg("clipboard-list"));
  els.reiterNachsehen.insertAdjacentHTML("afterbegin", icSvg("eye"));
  els.btnJetztSenden.insertAdjacentHTML("afterbegin", icSvg("arrow-up-right") + " ");
  els.offlineHinweis.insertAdjacentHTML("afterbegin", icSvg("triangle-alert") + " ");
  themeZustandAnwenden(themeDunkelLesen());

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
  window.addEventListener("online", () => wiederOnline());

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
  // Vor der ersten Anzeige aufraeumen, damit die Zaehlung stimmt. Ein Fehler
  // hier darf den Start nicht aufhalten — die Erfassung ist wichtiger als
  // ein aufgeraeumter Speicher.
  try {
    await AbleseQueue.aufraeumen(WARTESCHLANGE_SCHONFRIST_TAGE);
  } catch (fehler) {
    console.warn("Warteschlange konnte nicht aufgeräumt werden:", fehler);
  }
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
  if (!erfassenAktiv) {
    // Der Ort bleibt erhalten: wer zum Erfassen wechselt und zurueckkommt,
    // steht wieder bei der Einheit, die er angesehen hat.
    nachsehenZeichnen();
    infobasisGewuenscht = true;
    if (!infobasisGeladen) infobasisVomGraphLaden();
  }
}

// 28.09.2026 (Mietverwaltung K137/F192): nach einem Funkloch lädt das
// `online`-Ereignis alles nach, was fehlt — bis dahin sendete es nur die
// Warteschlange, und „Zählerliste wird geladen …“ blieb stehen.
function wiederOnline() {
  synchronisieren();
  zaehlerlisteVomGraphLaden();
  if (infobasisGewuenscht && !infobasisGeladen) infobasisVomGraphLaden();
}

function ladeInfobasisAusCache() {
  for (const [key, teil] of Object.entries(INFOBASIS_DATEIEN)) {
    const roh = localStorage.getItem(teil.cacheKey);
    if (!roh) continue;
    try {
      infobasisDaten[key] = JSON.parse(roh);
    } catch {
      localStorage.removeItem(teil.cacheKey);
    }
  }
  nachsehenZeichnen();
}

async function infobasisVomGraphLaden() {
  if (!navigator.onLine) {
    // Offline ein Satz statt eines Leerlaufs — nur dort, wo nichts aus dem
    // Cache zu zeigen ist (K137/F193).
    for (const key of Object.keys(INFOBASIS_DATEIEN)) {
      if (!infobasisDaten[key]) infobasisFehler[key] = OFFLINE_SATZ;
    }
    nachsehenZeichnen();
    return;
  }
  if (infobasisLaedt) return;
  infobasisLaedt = true;
  try {
    let token;
    try {
      token = await AbleseAuth.tokenHolen();
    } catch {
      return; // Anmeldung abgelaufen -- Cache bleibt sichtbar, kein Absturz
    }
    const erfolge = await Promise.all(
      Object.entries(INFOBASIS_DATEIEN).map(([key, teil]) => ladeInfobasisTeil(token, key, teil))
    );
    infobasisGeladen = erfolge.every(Boolean);
  } finally {
    infobasisLaedt = false;
  }
}

// Gibt zurück, ob der Graph geantwortet hat — auch „noch kein Export“ ist
// eine Antwort; nur ein Fehler lässt den Teil beim nächsten Anlass nachladen.
async function ladeInfobasisTeil(token, key, teil) {
  try {
    const daten = await AbleseGraph.infobasisLesen(token, teil.datei);
    if (!daten) {
      infobasisFehler[key] =
        "Noch kein Export vorhanden — läuft am Master automatisch beim nächsten Backup (A5).";
      nachsehenZeichnen();
      return true;
    }
    localStorage.setItem(teil.cacheKey, JSON.stringify(daten));
    infobasisDaten[key] = daten;
    infobasisFehler[key] = null;
    nachsehenZeichnen();
    return true;
  } catch (fehler) {
    // Mit Cache im Ruecken bleibt der zuletzt geladene Stand sichtbar —
    // gemeldet wird nur, wenn dieser Bereich sonst gar nichts zu zeigen hat.
    if (!infobasisDaten[key]) {
      infobasisFehler[key] = `Konnte nicht geladen werden: ${fehler.message || fehler}`;
      nachsehenZeichnen();
    }
    return false;
  }
}

// --------------------------------------------------------------------------- #
// Nachsehen: Ebene fuer Ebene (09.09.2026)
//
// NK-Kreis -> Einheit -> Detail. Der Export liefert die Einheiten bereits
// nach `nk_kreis_id, bezeichnung` sortiert und traegt den Kreisnamen in
// `objekt`; verknuepft wird ueber `einheit_id`, die in allen drei Dateien
// steht. Unterwegs sucht man EINE Einheit — deshalb Antippen statt Scrollen.
// Weiterhin reines Lesen: keine Funktion hier legt an, rechnet oder bucht.
// --------------------------------------------------------------------------- #

// Einheiten ohne NK-Kreis verschwinden nicht, sie bekommen einen eigenen
// benannten Sammelpunkt am Ende der Liste (Regel .109).
const OHNE_OBJEKT = "Ohne Objekt";

function einheitenListe() { return infobasisDaten.einheiten?.einheiten || []; }
function zaehlerListe() { return infobasisDaten.zaehlerstaende?.zaehlerstaende || []; }
function aufgabenListe() { return infobasisDaten.aufgaben?.aufgaben || []; }

function einheitFinden(id) {
  return einheitenListe().find((e) => e.einheit_id === id) || null;
}
function zaehlerVonEinheit(id) {
  return zaehlerListe().filter((z) => z.einheit_id === id);
}
function aufgabenVonEinheit(id) {
  return aufgabenListe().filter((a) => a.einheit_id === id);
}
function einheitLabel(eh) {
  return [eh.bezeichnung, eh.typ].filter(Boolean).join(" · ");
}

// Nach Kreisnamen sortiert; der Sammelpunkt ohne Kreis immer zuletzt.
function kreiseSammeln() {
  const map = new Map();
  for (const eh of einheitenListe()) {
    const k = eh.objekt || OHNE_OBJEKT;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(eh);
  }
  return [...map.entries()].sort((a, b) => {
    if (a[0] === OHNE_OBJEKT) return 1;
    if (b[0] === OHNE_OBJEKT) return -1;
    return a[0].localeCompare(b[0], "de");
  });
}

// "3 Jahre 2 Monate" — angebrochene Monate zaehlen nicht mit, damit die
// Angabe am Tag vor dem Jahrestag nicht schon aufrundet. Ein Vertrag, der
// erst beginnt, wird als solcher benannt statt mit "0 Monate".
function mietdauerText(beginn, ende) {
  if (!beginn) return null;
  const von = new Date(beginn);
  if (Number.isNaN(von.getTime())) return null;
  const bis = ende ? new Date(ende) : new Date();
  if (Number.isNaN(bis.getTime())) return null;
  if (bis < von) return null;
  let monate = (bis.getFullYear() - von.getFullYear()) * 12 + (bis.getMonth() - von.getMonth());
  if (bis.getDate() < von.getDate()) monate -= 1;
  if (monate < 0) monate = 0;
  const jahre = Math.floor(monate / 12);
  const rest = monate % 12;
  const teile = [];
  if (jahre) teile.push(jahre === 1 ? "1 Jahr" : `${jahre} Jahre`);
  if (rest) teile.push(rest === 1 ? "1 Monat" : `${rest} Monate`);
  return teile.length ? teile.join(" ") : "noch keinen vollen Monat";
}

function betragText(wert, bezeichnung) {
  if (wert == null) return null;
  const zahl = Number(wert);
  const formatiert = Number.isFinite(zahl)
    ? zahl.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : wert;
  return `${bezeichnung} ${formatiert} €`;
}

// --------------------------------------------------------------------------- #
// Bausteine
// --------------------------------------------------------------------------- #

// Eine antippbare Zeile. Bewusst ein <button>: grosse Flaeche, funktioniert
// mit Tastatur und Screenreader ohne Zusatzarbeit.
function navZeile({ icon, titel, unterzeile, hinweis, ziel }) {
  const knopf = document.createElement("button");
  knopf.type = "button";
  knopf.className = "nav-zeile";

  if (icon) {
    const links = document.createElement("span");
    links.className = "nav-zeile-icon";
    links.innerHTML = icSvg(icon);
    knopf.appendChild(links);
  }

  const mitte = document.createElement("span");
  mitte.className = "nav-zeile-text";
  const t = document.createElement("span");
  t.className = "nav-zeile-titel";
  t.textContent = titel;
  mitte.appendChild(t);
  if (unterzeile) {
    const u = document.createElement("span");
    u.className = "nav-zeile-unter";
    u.textContent = unterzeile;
    mitte.appendChild(u);
  }
  knopf.appendChild(mitte);

  if (hinweis) {
    const h = document.createElement("span");
    h.className = "nav-zeile-hinweis";
    h.textContent = hinweis;
    knopf.appendChild(h);
  }

  const pfeil = document.createElement("span");
  pfeil.className = "nav-zeile-pfeil";
  pfeil.innerHTML = icSvg("chevron-right");
  knopf.appendChild(pfeil);

  knopf.addEventListener("click", () => nachsehenGehe(ziel));
  return knopf;
}

function abschnittBauen(icon, titel) {
  const block = document.createElement("section");
  block.className = "detail-block";
  const kopf = document.createElement("h3");
  kopf.className = "detail-kopf";
  kopf.innerHTML = icSvg(icon) + " ";
  kopf.append(titel);
  block.appendChild(kopf);
  return block;
}

function zeileBauen(text, klasse) {
  const p = document.createElement("p");
  p.className = "info-zeile" + (klasse ? " " + klasse : "");
  p.textContent = text;
  return p;
}

// Telefonnummer und E-Mail als echte Links: unterwegs ist Antippen und
// Anrufen der eigentliche Zweck dieser Seite.
function kontaktZeile(icon, text, href) {
  const p = document.createElement("p");
  p.className = "info-zeile kontakt-zeile";
  p.innerHTML = icSvg(icon) + " ";
  const a = document.createElement("a");
  a.href = href;
  a.textContent = text;
  p.appendChild(a);
  return p;
}

function leerZeile(text) {
  const p = document.createElement("p");
  p.className = "info-leer";
  p.textContent = text;
  return p;
}

// --------------------------------------------------------------------------- #
// Navigation
// --------------------------------------------------------------------------- #

function nachsehenGehe(ziel) {
  nachsehenOrt = { ebene: "objekte", kreis: null, einheitId: null, ...(ziel || {}) };
  nachsehenZeichnen();
  // Eine neue Ebene faengt oben an — sonst landet man mitten in der Liste.
  window.scrollTo(0, 0);
}

function nachsehenZurueck() {
  const o = nachsehenOrt;
  if (o.ebene === "einheit") {
    const eh = einheitFinden(o.einheitId);
    nachsehenGehe({ ebene: "kreis", kreis: o.kreis || (eh ? eh.objekt || OHNE_OBJEKT : null) });
    return;
  }
  nachsehenGehe({ ebene: "objekte" });
}

function nachsehenStandText() {
  const zeiten = ["einheiten", "zaehlerstaende", "aufgaben"]
    .map((k) => infobasisDaten[k]?.erstellt_am)
    .filter(Boolean)
    .map((s) => new Date(s))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (!zeiten.length) return null;
  // Ein Backup schreibt alle drei zugleich; weichen sie doch ab, ist der
  // aelteste Teil der ehrlichere Stand fuer die Seite als Ganzes.
  const aeltester = zeiten.reduce((a, b) => (a < b ? a : b));
  return `Stand vom ${aeltester.toLocaleDateString("de-DE")}`;
}

function nachsehenZeichnen() {
  if (!els.nachsehenInhalt) return; // vor init() -- nichts zu zeichnen
  const o = nachsehenOrt;
  els.nachsehenInhalt.innerHTML = "";
  els.nachsehenZurueck.hidden = o.ebene === "objekte";
  els.nachsehenZurueck.innerHTML = icSvg("chevron-left") + " Zurück";

  const stand = nachsehenStandText();
  els.nachsehenStand.hidden = !stand;
  if (stand) els.nachsehenStand.textContent = stand;

  if (o.ebene === "kreis") zeichneKreis(o.kreis);
  else if (o.ebene === "einheit") zeichneEinheit(o.einheitId);
  else if (o.ebene === "aufgaben") zeichneAufgaben();
  else zeichneObjekte();
}

// Ebene 1 -- die NK-Kreise, darunter der Einstieg in alle offenen Aufgaben.
function zeichneObjekte() {
  els.nachsehenTitel.textContent = "Objekte";
  els.nachsehenUnterzeile.textContent = "";

  const kreise = kreiseSammeln();

  // Solange am Master noch kein Backup gelaufen ist, fehlen ALLE drei
  // Bereiche. Dann steht hier EINE Erklaerung — nicht dieselbe Meldung
  // zweimal, und kein Aufgaben-Knopf, der in eine leere Ebene fuehrt.
  if (!kreise.length && !aufgabenListe().length) {
    els.nachsehenInhalt.appendChild(leerZeile(
      infobasisFehler.einheiten || infobasisFehler.aufgaben ||
      "Noch nichts zum Nachsehen da."));
    return;
  }

  if (!kreise.length) {
    els.nachsehenInhalt.appendChild(
      leerZeile(infobasisFehler.einheiten || "Keine Einheiten im Export."));
  }
  for (const [kreis, einheiten] of kreise) {
    const frei = einheiten.filter((e) => !(e.vertraege || []).length).length;
    const teile = [einheiten.length === 1 ? "1 Einheit" : `${einheiten.length} Einheiten`];
    if (frei) teile.push(frei === 1 ? "1 leerstehend" : `${frei} leerstehend`);
    els.nachsehenInhalt.appendChild(navZeile({
      icon: "house", titel: kreis, unterzeile: teile.join(" · "),
      ziel: { ebene: "kreis", kreis },
    }));
  }

  const offene = aufgabenListe();
  const dringend = offene.filter((a) => a.severity === "urgent").length;
  els.nachsehenInhalt.appendChild(navZeile({
    icon: "triangle-alert",
    titel: "Offene Aufgaben",
    unterzeile: infobasisFehler.aufgaben
      ? infobasisFehler.aufgaben
      : (offene.length ? `${offene.length} offen${dringend ? ` · ${dringend} dringend` : ""}` : "nichts offen"),
    ziel: { ebene: "aufgaben" },
  }));
}

// Ebene 2 -- die Einheiten EINES Kreises.
function zeichneKreis(kreis) {
  els.nachsehenTitel.textContent = kreis || OHNE_OBJEKT;
  const einheiten = (kreiseSammeln().find(([k]) => k === kreis) || [null, []])[1];
  els.nachsehenUnterzeile.textContent =
    einheiten.length === 1 ? "1 Einheit" : `${einheiten.length} Einheiten`;

  if (!einheiten.length) {
    els.nachsehenInhalt.appendChild(leerZeile("Keine Einheiten in diesem Objekt."));
    return;
  }
  for (const eh of einheiten) {
    const v = (eh.vertraege || [])[0];
    const zaehlerN = zaehlerVonEinheit(eh.einheit_id).length;
    const offenN = aufgabenVonEinheit(eh.einheit_id).length;
    const zusatz = [];
    if (zaehlerN) zusatz.push(zaehlerN === 1 ? "1 Zähler" : `${zaehlerN} Zähler`);
    if (offenN) zusatz.push(offenN === 1 ? "1 Aufgabe" : `${offenN} Aufgaben`);
    els.nachsehenInhalt.appendChild(navZeile({
      icon: v ? "user" : "house",
      titel: einheitLabel(eh),
      unterzeile: v ? (v.mieter_name || "Mieter ohne Namen") : "Leerstehend",
      hinweis: zusatz.join(" · ") || null,
      ziel: { ebene: "einheit", kreis, einheitId: eh.einheit_id },
    }));
  }
}

// Ebene 3 -- alles zu EINER Einheit auf einer Seite.
function zeichneEinheit(einheitId) {
  const eh = einheitFinden(einheitId);
  if (!eh) {
    els.nachsehenTitel.textContent = "Einheit";
    els.nachsehenUnterzeile.textContent = "";
    els.nachsehenInhalt.appendChild(
      leerZeile("Diese Einheit steht nicht (mehr) im Export."));
    return;
  }
  els.nachsehenTitel.textContent = einheitLabel(eh);
  els.nachsehenUnterzeile.textContent = eh.objekt || OHNE_OBJEKT;

  // --- Mieter (je aktivem Vertrag ein Block) ---
  const vertraege = eh.vertraege || [];
  const mieterBlock = abschnittBauen("user", vertraege.length > 1 ? "Mieter" : "Mieter");
  if (!vertraege.length) {
    mieterBlock.appendChild(leerZeile("Leerstehend."));
  } else {
    for (const v of vertraege) {
      const name = document.createElement("p");
      name.className = "info-zeile detail-name";
      name.textContent = v.mieter_name || "Mieter ohne Namen";
      mieterBlock.appendChild(name);

      if (v.mieter_telefon) {
        mieterBlock.appendChild(kontaktZeile(
          "phone", v.mieter_telefon, `tel:${String(v.mieter_telefon).replace(/[^+\d]/g, "")}`));
      }
      if (v.mieter_email) {
        mieterBlock.appendChild(kontaktZeile("mail", v.mieter_email, `mailto:${v.mieter_email}`));
      }

      const seit = formatiereDatum(v.beginn);
      const bis = formatiereDatum(v.ende);
      const dauer = mietdauerText(v.beginn, v.ende);
      if (seit) {
        const wohnt = bis
          ? `${seit} bis ${bis}${dauer ? ` · ${dauer}` : ""}`
          : `seit ${seit}${dauer ? ` · ${dauer}` : ""}`;
        mieterBlock.appendChild(kontaktZeileErsatz("calendar-1", wohnt));
      }
    }
  }
  els.nachsehenInhalt.appendChild(mieterBlock);

  // --- Vertrags-Eckdaten ---
  if (vertraege.length) {
    const geldBlock = abschnittBauen("euro", "Vertrag");
    for (const v of vertraege) {
      const posten = [
        betragText(v.kaltmiete, "Kaltmiete"),
        betragText(v.nk_vorauszahlung, "NK-Vorauszahlung"),
        betragText(v.kaution, "Kaution"),
      ].filter(Boolean);
      if (!posten.length) {
        geldBlock.appendChild(leerZeile("Keine Beträge hinterlegt."));
      } else {
        for (const p of posten) geldBlock.appendChild(zeileBauen(p));
      }
      const warm = [v.kaltmiete, v.nk_vorauszahlung]
        .every((x) => x != null && Number.isFinite(Number(x)))
        ? Number(v.kaltmiete) + Number(v.nk_vorauszahlung)
        : null;
      if (warm != null) {
        geldBlock.appendChild(zeileBauen(betragText(warm, "Monatlich gesamt"), "detail-summe"));
      }
    }
    els.nachsehenInhalt.appendChild(geldBlock);
  }

  // --- Zaehler dieser Einheit ---
  const zaehler = zaehlerVonEinheit(einheitId);
  const zBlock = abschnittBauen("clipboard-list", "Zähler");
  if (!zaehlerListe().length && infobasisFehler.zaehlerstaende) {
    zBlock.appendChild(leerZeile(infobasisFehler.zaehlerstaende));
  } else if (!zaehler.length) {
    zBlock.appendChild(leerZeile("Keine Zähler zu dieser Einheit."));
  } else {
    for (const z of zaehler) {
      const stand = z.letzter_stand_wert != null
        ? `${z.letzter_stand_wert} (${formatiereDatum(z.letzter_stand_datum) || "?"})`
        : "noch kein Stand erfasst";
      zBlock.appendChild(zeileBauen(
        `${zaehlerArtLabel(z.art)} · ${z.zaehlernummer || "ohne Nummer"} · ${stand}`));
    }
  }
  els.nachsehenInhalt.appendChild(zBlock);

  // --- Offene Aufgaben dieser Einheit ---
  const aufgaben = aufgabenVonEinheit(einheitId);
  const aBlock = abschnittBauen("triangle-alert", "Offene Aufgaben");
  if (!aufgabenListe().length && infobasisFehler.aufgaben) {
    aBlock.appendChild(leerZeile(infobasisFehler.aufgaben));
  } else if (!aufgaben.length) {
    aBlock.appendChild(leerZeile("Nichts offen."));
  } else {
    for (const a of aufgaben) aBlock.appendChild(aufgabeKarte(a));
  }
  els.nachsehenInhalt.appendChild(aBlock);
}

// Datum-/Dauerzeile: gleiche Bauart wie kontaktZeile, nur ohne Link.
function kontaktZeileErsatz(icon, text) {
  const p = document.createElement("p");
  p.className = "info-zeile kontakt-zeile";
  p.innerHTML = icSvg(icon) + " ";
  p.append(text);
  return p;
}

function aufgabeKarte(a) {
  const dringend = a.severity === "urgent";
  const karte = document.createElement("div");
  karte.className = "info-karte aufgabe-karte" + (dringend ? " severity-urgent" : "");
  const kopf = document.createElement("h4");
  kopf.className = "aufgabe-titel";
  kopf.textContent = a.titel || a.kategorie || "Aufgabe";
  karte.appendChild(kopf);
  const text = [a.details, a.due_text].filter(Boolean).join(" · ");
  if (text) {
    karte.appendChild(zeileBauen(text, dringend ? "severity-urgent-text" : null));
  }
  return karte;
}

// Ebene "aufgaben" -- alle offenen Aufgaben, dringende zuerst.
function zeichneAufgaben() {
  els.nachsehenTitel.textContent = "Offene Aufgaben";
  const items = [...aufgabenListe()].sort(
    (a, b) => (b.severity === "urgent") - (a.severity === "urgent"));
  els.nachsehenUnterzeile.textContent =
    items.length === 1 ? "1 Aufgabe" : `${items.length} Aufgaben`;

  if (!items.length) {
    els.nachsehenInhalt.appendChild(
      leerZeile(infobasisFehler.aufgaben || "Nichts offen."));
    return;
  }
  for (const a of items) {
    const karte = aufgabeKarte(a);
    // Woher die Aufgabe kommt, steht in der Gesamtliste nicht im Titel —
    // ohne die Einheit muesste man raten, welche Wohnung gemeint ist.
    const eh = a.einheit_id != null ? einheitFinden(a.einheit_id) : null;
    if (eh) {
      karte.appendChild(zeileBauen(
        `${eh.objekt || OHNE_OBJEKT} · ${einheitLabel(eh)}`, "aufgabe-herkunft"));
    }
    els.nachsehenInhalt.appendChild(karte);
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
  if (!navigator.onLine) {
    // K137/F192: ohne Liste aus dem Cache steht ein Satz da, kein
    // „wird geladen …“, das nie endet; `wiederOnline()` lädt nach.
    if (!zaehlerlisteAktuell) els.zaehlerlisteStand.textContent = OFFLINE_SATZ;
    return;
  }
  try {
    const token = await AbleseAuth.tokenHolen();
    const daten = await AbleseGraph.zaehlerlisteLesen(token);
    if (!daten) {
      els.zaehlerlisteStand.textContent =
        "Noch keine Zählerliste im Postfach — am Master exportieren (A1).";
      return;
    }
    // K137/F191: die Liste steht meist schon aus dem Cache, und wer tippt,
    // während der Graph antwortet, verlor Stand und Foto beim Neuzeichnen.
    // Unverändert → nichts zeichnen; geändert → `renderZaehlerliste`
    // nimmt die offenen Eingaben mit.
    const roh = JSON.stringify(daten);
    if (zaehlerlisteAktuell && roh === JSON.stringify(zaehlerlisteAktuell)) return;
    zaehlerlisteAktuell = daten;
    localStorage.setItem(ZAEHLERLISTE_CACHE_SCHLUESSEL, roh);
    renderZaehlerliste();
  } catch (fehler) {
    if (!zaehlerlisteAktuell) {
      els.zaehlerlisteStand.textContent = `Zählerliste konnte nicht geladen werden: ${fehler.message || fehler}`;
    }
    // Mit Cache im Rücken bleibt die zuletzt geladene Liste sichtbar — ein
    // einzelner fehlgeschlagener Abruf blockiert die Erfassung nicht.
  }
}

// K137/F191: was in den Zeilen schon getippt oder fotografiert ist, je
// `zaehler_id` — ein Neuzeichnen legt die Felder neu an.
function offeneEingabenMerken() {
  const offen = new Map();
  if (!els.einheitenListe) return offen;
  for (const input of els.einheitenListe.querySelectorAll('input[id^="wert-"]')) {
    const id = String(input.id).slice("wert-".length);
    const foto = document.getElementById(`foto-${id}`);
    const dateien = foto?.files?.length ? foto.files : null;
    if (input.value !== "" || dateien) offen.set(id, { wert: input.value, dateien });
  }
  return offen;
}

function offeneEingabenZurueck(offen) {
  for (const [id, e] of offen) {
    const input = document.getElementById(`wert-${id}`);
    if (input && e.wert) input.value = e.wert;
    const foto = document.getElementById(`foto-${id}`);
    if (!foto || !e.dateien) continue;
    try {
      foto.files = e.dateien;
      foto.dispatchEvent(new Event("change"));   // Haken am Kamera-Knopf
    } catch {
      // Ein Browser, der `files` nicht setzen lässt: der Stand bleibt, das
      // Foto muss neu gewählt werden — die Zahl ist das Wichtigere.
    }
  }
}

function renderZaehlerliste() {
  if (!zaehlerlisteAktuell) return;
  const stand = formatiereDatum(zaehlerlisteAktuell.erstellt_am);
  els.zaehlerlisteStand.textContent = stand
    ? `Zählerliste vom ${stand}`
    : "Zählerliste geladen.";

  // 09.09.2026: ZWEI Ebenen statt einer — NK-Kreis, darunter die Einheiten.
  // Eine durchgehende Einheitenliste half beim Ablesegang nicht: man steht
  // in EINEM Objekt und will dessen Zähler beisammen haben.
  //
  // `nk_kreis_name` und `vermieter_name` liefert die zaehlerliste.json
  // längst mit (backend/ablesung.py::baue_ablese_liste) — auch einem
  // fremden Ableser (A3), der die Infobasis nie zu sehen bekommt.
  //
  // NICHT neu sortiert: die Reihenfolge des Exports (Vermieter, Einheit,
  // Art) bleibt, wie sie ist, und die Gruppen erscheinen in der Reihenfolge
  // ihres ersten Auftretens. So steht am Handy dieselbe Ordnung wie in der
  // Ableseliste am Master — eine eigene Sortierung hier würde genau die
  // Vertrautheit zerstören, wegen der man sich am Papier orientiert.
  const kreise = new Map();
  for (const item of zaehlerlisteAktuell.zaehler || []) {
    const kreisName = item.nk_kreis_name || OHNE_OBJEKT;
    if (!kreise.has(kreisName)) {
      kreise.set(kreisName, { vermieter: item.vermieter_name || null, einheiten: new Map() });
    }
    const kreis = kreise.get(kreisName);
    const einheitName =
      item.einheit_bezeichnung_eindeutig || item.einheit_bezeichnung || "Ohne Einheit";
    if (!kreis.einheiten.has(einheitName)) kreis.einheiten.set(einheitName, []);
    kreis.einheiten.get(einheitName).push(item);
  }

  // Zähler ohne NK-Kreis ans Ende — benannt, nicht weggelassen (Regel .109).
  const geordnet = [...kreise.entries()].sort((a, b) => {
    if (a[0] === OHNE_OBJEKT) return 1;
    if (b[0] === OHNE_OBJEKT) return -1;
    return 0;                                   // sonst: Export-Reihenfolge
  });

  const offen = offeneEingabenMerken();
  els.einheitenListe.innerHTML = "";
  for (const [kreisName, kreis] of geordnet) {
    const gruppe = document.createElement("section");
    gruppe.className = "kreis-gruppe";

    const kopf = document.createElement("h2");
    kopf.className = "kreis-kopf";
    kopf.innerHTML = icSvg("house") + " ";
    kopf.append(kreisName);
    if (kreis.vermieter) {
      const v = document.createElement("span");
      v.className = "kreis-vermieter";
      v.textContent = kreis.vermieter;
      kopf.appendChild(v);
    }
    gruppe.appendChild(kopf);

    for (const [einheit, items] of kreis.einheiten) {
      const karte = document.createElement("section");
      karte.className = "einheit-karte";
      const titel = document.createElement("h3");
      titel.textContent = einheit;
      karte.appendChild(titel);
      for (const item of items) {
        karte.appendChild(baueZaehlerZeile(item));
      }
      gruppe.appendChild(karte);
    }
    els.einheitenListe.appendChild(gruppe);
  }
  offeneEingabenZurueck(offen);
}

function baueZaehlerZeile(item) {
  const zeile = document.createElement("div");
  zeile.className = "zaehler-zeile";

  const kopf = document.createElement("div");
  kopf.className = "zaehler-kopf";
  const letzterStand = item.letzter_stand_wert != null
    ? `letzter Stand ${item.letzter_stand_wert} (${formatiereDatum(item.letzter_stand_datum) || "?"})`
    : "noch kein Stand erfasst";
  // 15.09.2026 (W68/F69): Zählernummer und Stand kommen aus der Zählerliste
  // — als Text gesetzt, nicht als HTML.
  const kopfArt = document.createElement("strong");
  kopfArt.textContent = zaehlerArtLabel(item.art);
  const kopfStand = document.createElement("span");
  kopfStand.className = "hinweis-klein";
  kopfStand.textContent = letzterStand;
  kopf.append(kopfArt, ` · ${item.zaehlernummer || "ohne Nummer"} `, kopfStand);

  const eingabe = document.createElement("div");
  eingabe.className = "zaehler-eingabe";
  const input = document.createElement("input");
  // 15.09.2026 (W68/F64): Text mit Dezimal-Tastatur statt `type="number"` —
  // gelesen wird mit der deutschen Regel in js/zahl.js.
  input.type = "text";
  input.inputMode = "decimal";
  input.autocomplete = "off";
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
  fotoBtn.innerHTML = icSvg("camera");
  fotoBtn.title = "Beleg-Foto aufnehmen (optional)";
  fotoBtn.addEventListener("click", () => fotoInput.click());
  fotoInput.addEventListener("change", () => {
    // Gewaehltes Foto: Haken statt Kamera, positive Textfarbe (Token).
    fotoBtn.innerHTML = icSvg(fotoInput.files.length ? "circle-check" : "camera");
    fotoBtn.classList.toggle("foto-gewaehlt", !!fotoInput.files.length);
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

const FOTO_NICHT_LESBAR_TEXT = "Foto nicht lesbar — Stand ohne Foto gespeichert.";

// Ein Satz unter der Zeile des Zählers, zu dem `btn` gehört — ohne Text
// verschwindet er wieder.
function zeileHinweisSetzen(btn, text) {
  const zeile = btn?.closest?.(".zaehler-zeile");
  if (!zeile) return;
  let hinweis = zeile.querySelector(".zeile-hinweis");
  if (!text) { hinweis?.remove(); return; }
  if (!hinweis) {
    hinweis = document.createElement("div");
    hinweis.className = "hinweis-klein zeile-hinweis";
    zeile.appendChild(hinweis);
  }
  hinweis.textContent = text;
}

const STAND_PRUEFEN_TEXT =
  "Bitte prüfen: Punkt nur als Tausender (12.345), Dezimalstellen mit Komma (12,5).";

async function erfassenKlick(item, input, btn, fotoInput, fotoBtn) {
  // 15.09.2026 (W68/F65): ein Doppel-Tipp erzeugte zwei Dateien — der Knopf
  // blieb während der Foto-Kompression und des Speicherns bedienbar, und am
  // Master endeten zwei Ablesungen desselben Zählers am selben Tag im 500.
  if (btn.disabled) return;
  const gelesen = AbleseZahl.leseStand(input.value);
  const wert = gelesen.wert;
  if (wert == null || Number.isNaN(wert)) {
    input.focus();
    input.classList.add("feld-fehler");
    input.title = gelesen.pruefen ? STAND_PRUEFEN_TEXT : "";
    input.setCustomValidity?.(gelesen.pruefen ? STAND_PRUEFEN_TEXT : "");
    input.reportValidity?.();
    return;
  }
  input.classList.remove("feld-fehler");
  input.title = "";
  input.setCustomValidity?.("");
  btn.disabled = true;
  try {
    await erfassenSpeichern(item, input, btn, fotoInput, fotoBtn, wert);
  } finally {
    btn.disabled = false;
  }
}

async function erfassenSpeichern(item, input, btn, fotoInput, fotoBtn, wert) {
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

  // Kompression fehlgeschlagen -> Ablesung trotzdem speichern, nur ohne Foto
  // (die Zahlenerfassung darf daran nicht scheitern). 28.09.2026
  // (Mietverwaltung K137/F196): das Foto verschwand dabei still — jetzt
  // steht es in der Zeile (Regel .109: benannt statt weggelassen). Ein
  // leeres `toBlob` ist derselbe Fall.
  let fotoNichtLesbar = false;
  if (fotoInput?.files?.[0]) {
    try {
      const blob = await fotoKomprimieren(fotoInput.files[0]);
      if (!blob) throw new Error("leeres Bild");
      eintrag.fotoBlob = blob;
      eintrag.fotoErweiterung = ".jpg";
    } catch {
      fotoNichtLesbar = true;
    }
  }

  await AbleseQueue.hinzufuegen(eintrag);
  if (fotoNichtLesbar) zeileHinweisSetzen(btn, FOTO_NICHT_LESBAR_TEXT);
  heuteGespeichert.add(item.zaehler_id);
  input.value = "";
  if (fotoInput) fotoInput.value = "";
  if (fotoBtn) { fotoBtn.innerHTML = icSvg("camera"); fotoBtn.classList.remove("foto-gewaehlt"); }
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
  zeigeSendeFehler();
}

let synchronisierungLaeuft = false;
// 09.09.2026: der letzte Grund, warum ein Senden nicht durchkam. Vorher lief
// jeder Fehlschlag NUR in console.warn — am Handy war ein "Jetzt senden", das
// nichts tut, von einem erfolgreichen Senden nicht zu unterscheiden, und die
// Warteschlange mahnte erst nach WARTESCHLANGE_MAHN_TAGE. Genau der Fall im
// Keller (abgelaufene Anmeldung, Ordner nicht freigegeben, Pfad falsch).
let letzterSendeFehler = null;

// Die Graph-/MSAL-Meldungen sind englisch und technisch; die drei Fälle, die
// am Handy wirklich vorkommen, bekommen deshalb Klartext. Alles andere wird
// unverändert durchgereicht — lieber eine rohe Meldung als gar keine.
function sendeFehlerText(fehler) {
  const roh = fehler?.message || String(fehler);
  if (/nicht angemeldet/i.test(roh)) {
    return "Nicht (mehr) angemeldet — bitte oben neu anmelden, dann „Jetzt senden“.";
  }
  if (/^40[13]\b/.test(roh) || /accessDenied|unauthenticated/i.test(roh)) {
    return `Keine Berechtigung für das Postfach: ${roh}`;
  }
  if (/nicht gefunden|itemNotFound|^404\b/i.test(roh)) {
    return `Postfach-Ordner nicht gefunden: ${roh}`;
  }
  return `Senden fehlgeschlagen: ${roh}`;
}

function zeigeSendeFehler() {
  // Ohne Netz erklärt der Offline-Hinweis die Lage schon — dann wäre eine
  // zweite rote Zeile nur Lärm.
  const zeigen = !!letzterSendeFehler && navigator.onLine;
  els.sendeFehler.hidden = !zeigen;
  if (zeigen) {
    els.sendeFehler.textContent = "";
    els.sendeFehler.insertAdjacentHTML("afterbegin", icSvg("triangle-alert") + " ");
    els.sendeFehler.append(sendeFehlerText(letzterSendeFehler));
  }
}

// 15.09.2026 (W68/F68): wer während einer laufenden Übertragung erfasst,
// wartete bis zum nächsten Anstoß — der zweite Aufruf kehrte einfach um.
// Jetzt merkt er sich den Wunsch, und der laufende Lauf hängt einen an.
let synchronisierungNachlauf = false;

async function synchronisieren() {
  if (synchronisierungLaeuft) {
    synchronisierungNachlauf = true;
    return;
  }
  if (!navigator.onLine) {
    await aktualisiereWarteschlangenAnzeige();
    return;
  }
  synchronisierungLaeuft = true;
  els.btnJetztSenden.disabled = true;
  let fehlerDiesesLaufs = null;
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
        fehlerDiesesLaufs = fehler;
      }
    }
  } catch (fehler) {
    console.warn("Synchronisierung übersprungen:", fehler);
    fehlerDiesesLaufs = fehler;
  } finally {
    // `return` bei leerer Warteschlange läuft auch hier durch — dann ist
    // nichts schiefgegangen und eine alte Meldung darf nicht stehenbleiben.
    letzterSendeFehler = fehlerDiesesLaufs;
    synchronisierungLaeuft = false;
    els.btnJetztSenden.disabled = false;
    await aktualisiereWarteschlangenAnzeige();
    if (synchronisierungNachlauf) {
      synchronisierungNachlauf = false;
      synchronisieren();
    }
  }
}

document.addEventListener("DOMContentLoaded", init);
