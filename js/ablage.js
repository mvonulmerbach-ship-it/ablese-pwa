// WebDAV-Zugriff auf den Ordner-Vertrag in Max' Nextcloud (K131, ersetzt
// graph.js): zaehlerliste.json lesen, eingang/ablesung_<uuid>.json schreiben
// (Format "ablesung-v1", exakt wie backend/ablese_postfach.py es erwartet —
// Pflichtfelder zaehler_id/datum/wert) und die Infobasis lesen.
//
// Selbe Herkunft wie die Nextcloud (K131 §2 (3)): die App wird unter
// https://truenas.tailb74bbe.ts.net:8443/ablese/ ausgeliefert, deshalb gibt
// es kein CORS. Jede Anfrage traegt `Authorization: Basic …` und
// `credentials: "omit"` — ein Sitzungs-Cookie der Nextcloud-Oberflaeche im
// selben Browser wuerde WebDAV sonst mit CSRF-Pruefung beantworten.
//
// A3 (Mehrfach-Ableser): das Postfach liegt in Max' Konto. Meldet sich Max
// selbst an, liegt es unter `postfachPfad` im eigenen Baum; ein fremder
// Ableser sieht die Freigabe unter ihrem ORDNERNAMEN im Wurzelordner seines
// Kontos — das Gegenstueck zu "Für mich freigegeben" (sharedWithMe) in Graph.
// Die App probiert den eigenen Weg zuerst und faellt automatisch zurueck.
"use strict";

const AbleseAblage = (() => {
  let postfachBasisCache = null;

  function pfadKodieren(pfad) {
    return pfad.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  }

  // Wurzel des angemeldeten Kontos im WebDAV-Baum der Nextcloud.
  function kontoWurzel() {
    const konto = AbleseAuth.konto();
    if (!konto) throw new Error("nicht angemeldet");
    return `${ABLESE_KONFIG.server}/remote.php/dav/files/${encodeURIComponent(konto.username)}`;
  }

  function adresse(basis, unterpfad) {
    const rest = unterpfad ? `/${pfadKodieren(unterpfad)}` : "";
    return `${basis}${rest}`;
  }

  // EINE Stelle fuer Kopfzeilen und Cookie-Verzicht (K131 §2 (4)).
  function anfrage(token, url, methode, extra) {
    const headers = { Authorization: token };
    if (extra?.contentType) headers["Content-Type"] = extra.contentType;
    if (extra?.depth !== undefined) headers.Depth = String(extra.depth);
    return fetch(url, {
      method: methode,
      headers,
      body: extra?.body,
      credentials: "omit",
    });
  }

  // 401 heisst bei Basic-Anmeldung: das App-Passwort gilt nicht (mehr). Die
  // gespeicherte Anmeldung wird geloescht, damit die App beim naechsten
  // Anstoss das Formular zeigt; die Warteschlange bleibt unberuehrt.
  function fehler(resp) {
    if (resp.status === 401) {
      AbleseAuth.abmelden();
      const f = new Error("App-Passwort abgelaufen oder falsch — bitte neu anmelden");
      f.anmeldungNoetig = true;
      return f;
    }
    return new Error(`${resp.status} ${resp.statusText}`);
  }

  // PROPFIND Depth 0: gibt es das Element? 207 = ja, 404 = nein.
  async function vorhanden(token, url) {
    const resp = await anfrage(token, url, "PROPFIND", { depth: 0 });
    if (resp.status === 207 || resp.ok) return true;
    if (resp.status === 404) return false;
    throw fehler(resp);
  }

  async function postfachBasisAufloesen(token) {
    if (postfachBasisCache) return postfachBasisCache;
    const wurzel = kontoWurzel();
    const eigen = adresse(wurzel, ABLESE_KONFIG.postfachPfad);
    if (await vorhanden(token, eigen)) {
      postfachBasisCache = eigen;
      return postfachBasisCache;
    }
    const name = ABLESE_KONFIG.postfachPfad.split("/").filter(Boolean).pop();
    const geteilt = adresse(wurzel, name);
    if (await vorhanden(token, geteilt)) {
      postfachBasisCache = geteilt;
      return postfachBasisCache;
    }
    throw new Error(
      `Postfach-Ordner „${name}" wurde nicht gefunden — weder im eigenen Nextcloud-Ordner ` +
      `noch als Freigabe im Wurzelordner. Ist der Ordner für dieses Konto freigegeben?`
    );
  }

  // Legt fehlende Ordner der Reihe nach an (WebDAV erstellt keine
  // Zwischenordner von selbst). 201 = angelegt, 405 = war schon da — das
  // macht es nebenlaeufigkeitssicher, falls zwei Geraete gleichzeitig anlegen.
  async function ordnerSicherstellen(token, basis, unterpfad) {
    let bisher = "";
    for (const teil of unterpfad.split("/").filter(Boolean)) {
      bisher = bisher ? `${bisher}/${teil}` : teil;
      const resp = await anfrage(token, adresse(basis, bisher), "MKCOL");
      if (!resp.ok && resp.status !== 405) throw fehler(resp);
    }
  }

  // null = noch keine Zählerliste exportiert (A1 am Master noch nicht
  // gelaufen) — kein Fehler, sondern ein benannter Zustand fürs UI.
  async function zaehlerlisteLesen(token) {
    const basis = await postfachBasisAufloesen(token);
    const resp = await anfrage(token, adresse(basis, "zaehlerliste.json"), "GET");
    if (resp.status === 404) return null;
    if (!resp.ok) throw fehler(resp);
    return resp.json();
  }

  function ableseDatensatz(eintrag, fotoReferenz) {
    // Exakt das Format aus dem Konzeptdokument (Abschnitt "Format je
    // Ablesung") — bewusst redundant um die Zählernummer. "foto" NUR wenn
    // tatsächlich eins hochgeladen wurde (A4) — Muster wie beim Master
    // (ablese_postfach.gruppiere_fuer_uebernahme): kein erfundener Schlüssel.
    // K131: unverändert aus graph.js übernommen — der Ordner-Vertrag bleibt.
    const daten = {
      format: "ablesung-v1",
      id: eintrag.id,
      erfasst_am: eintrag.erstellt_am,
      erfasser: eintrag.erfasser,
      konto: eintrag.konto,
      zaehler_id: eintrag.zaehler_id,
      zaehlernummer: eintrag.zaehlernummer,
      datum: eintrag.datum,
      anlass: eintrag.anlass,
      wert: eintrag.wert,
    };
    if (fotoReferenz) daten.foto = fotoReferenz;
    return daten;
  }

  async function fotoHochladen(token, basis, dateiname, blob) {
    await ordnerSicherstellen(token, basis, "eingang/fotos");
    const resp = await anfrage(token, adresse(basis, `eingang/fotos/${dateiname}`), "PUT", {
      contentType: "image/jpeg",
      body: blob,
    });
    if (!resp.ok) throw fehler(resp);
  }

  async function ablesungHochladen(token, eintrag) {
    const basis = await postfachBasisAufloesen(token);
    await ordnerSicherstellen(token, basis, "eingang");

    // A4: erst das Foto (falls vorhanden), DANN die JSON-Datei, die es
    // referenziert — scheitert der Foto-Upload, bleibt der ganze Eintrag in
    // der Warteschlange und wird beim naechsten Versuch komplett wiederholt
    // (Ordner-Vertrag Regel 2: Wiederholung ist harmlos).
    let fotoReferenz = null;
    if (eintrag.fotoBlob) {
      const dateiname = `${eintrag.id}${eintrag.fotoErweiterung || ".jpg"}`;
      await fotoHochladen(token, basis, dateiname, eintrag.fotoBlob);
      fotoReferenz = `fotos/${dateiname}`;
    }

    const resp = await anfrage(token, adresse(basis, `eingang/ablesung_${eintrag.id}.json`), "PUT", {
      contentType: "application/json",
      body: JSON.stringify(ableseDatensatz(eintrag, fotoReferenz)),
    });
    if (!resp.ok) throw fehler(resp);
  }

  // A5 (v0.49.169): die Infobasis liegt in Max' EIGENEM Baum und wird NIE
  // freigegeben — anders als der Postfach-Zugriff oben also KEIN Rückfall
  // auf die Freigabe. Ein fremder Ableser (A3) bekommt hier schlicht 404.
  // null = noch kein Export gelaufen — ein benannter Zustand fürs UI.
  async function infobasisLesen(token, datei) {
    const url = adresse(kontoWurzel(), `${ABLESE_KONFIG.infobasisPfad}/${datei}`);
    const resp = await anfrage(token, url, "GET");
    if (resp.status === 404) return null;
    if (!resp.ok) throw fehler(resp);
    return resp.json();
  }

  return { zaehlerlisteLesen, ablesungHochladen, infobasisLesen };
})();
