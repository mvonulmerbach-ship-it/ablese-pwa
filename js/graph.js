// Microsoft-Graph-Zugriff auf den Ordner-Vertrag aus
// MOBIL_KONZEPT_WEG_A_2026-08-11.md: zaehlerliste.json lesen,
// eingang/ablesung_<uuid>.json schreiben (Format "ablesung-v1", exakt wie
// backend/ablese_postfach.py es erwartet — Pflichtfelder zaehler_id/datum/wert).
//
// A3 (Mehrfach-Ableser): der Postfach-Ordner liegt in Max' OneDrive. Meldet
// sich Max selbst an, ist er dort direkt unter dem eigenen Drive-Root zu
// finden; meldet sich ein fremder Ableser an, sieht er ihn nur unter "Für
// mich freigegeben" (sharedWithMe) — ein anderer Adressierungsweg in Graph
// (ueber drives/{driveId}/items/{itemId} statt me/drive/root:/{pfad}).
// Die App probiert den eigenen Weg zuerst und faellt automatisch auf die
// Freigabe zurueck — kein manueller "bin ich Max oder Ableser"-Schalter.
"use strict";

const AbleseGraph = (() => {
  const GRAPH_BASIS = "https://graph.microsoft.com/v1.0";
  let postfachBasisCache = null;

  function pfadKodieren(pfad) {
    return pfad.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  }

  function kopfzeilen(token, contentType) {
    const h = { Authorization: `Bearer ${token}` };
    if (contentType) h["Content-Type"] = contentType;
    return h;
  }

  async function graphFehler(resp) {
    let text = `${resp.status} ${resp.statusText}`;
    try {
      const body = await resp.json();
      if (body?.error?.message) text = `${text}: ${body.error.message}`;
    } catch {
      // Antwort war kein JSON — Statuszeile reicht als Meldung.
    }
    return new Error(text);
  }

  // Praefix (VOR dem Pfad-Doppelpunkt) und ggf. bereits feststehender
  // Pfadanteil je Zugriffsweg. Graph erlaubt genau EINEN Pfad-Doppelpunkt
  // je Adresse — "root:/a:/b" waere ungueltig, deshalb wird der Postfach-
  // Pfad (eigenes Drive) mit dem Unterpfad zu EINEM Segment verschmolzen,
  // statt zwei Colon-Segmente zu verketten.
  function basisSegment(basis) {
    return basis.typ === "eigen"
      ? { praefix: `${GRAPH_BASIS}/me/drive/root`, wurzelPfad: ABLESE_KONFIG.postfachPfad }
      : { praefix: `${GRAPH_BASIS}/drives/${basis.driveId}/items/${basis.itemId}`, wurzelPfad: "" };
  }

  // Adresse EINES Elements unterhalb der Postfach-Wurzel (leerer/fehlender
  // Unterpfad = die Wurzel selbst).
  function elementUrl(basis, unterpfad) {
    const { praefix, wurzelPfad } = basisSegment(basis);
    const vollerPfad = [wurzelPfad, unterpfad].filter(Boolean).join("/");
    return vollerPfad ? `${praefix}:/${pfadKodieren(vollerPfad)}` : praefix;
  }

  async function elementVorhanden(token, basis, unterpfad) {
    const resp = await fetch(elementUrl(basis, unterpfad), { headers: kopfzeilen(token) });
    return resp.ok;
  }

  // Findet den Postfach-Ordner unter "Für mich freigegeben" — Fall A3,
  // fremdes Konto. `remoteItem` traegt drive-/item-ID des ECHTEN Ordners
  // in Max' OneDrive; genau diese Referenz wird ab hier als Wurzel benutzt.
  async function geteilteBasisSuchen(token) {
    const name = ABLESE_KONFIG.postfachPfad.split("/").filter(Boolean).pop();
    const resp = await fetch(`${GRAPH_BASIS}/me/drive/sharedWithMe`, {
      headers: kopfzeilen(token),
    });
    if (!resp.ok) throw await graphFehler(resp);
    const liste = await resp.json();
    const treffer = (liste.value || []).find((e) => e.name === name && e.remoteItem);
    if (!treffer) {
      throw new Error(
        `Postfach-Ordner „${name}" wurde nicht gefunden — weder im eigenen OneDrive ` +
        `noch unter „Für mich freigegeben". Ist der Ordner für dieses Konto freigegeben?`
      );
    }
    return {
      typ: "geteilt",
      driveId: treffer.remoteItem.parentReference.driveId,
      itemId: treffer.remoteItem.id,
    };
  }

  async function postfachBasisAufloesen(token) {
    if (postfachBasisCache) return postfachBasisCache;
    const eigen = { typ: "eigen" };
    if (await elementVorhanden(token, eigen, null)) {
      postfachBasisCache = eigen;
      return postfachBasisCache;
    }
    postfachBasisCache = await geteilteBasisSuchen(token);
    return postfachBasisCache;
  }

  // Legt fehlende Ordner der Reihe nach an (Graph erstellt keine
  // Zwischenordner von selbst). "fail" + 409-Toleranz macht das
  // nebenläufigkeitssicher, falls zwei Geräte gleichzeitig anlegen.
  async function ordnerSicherstellen(token, basis, unterpfad) {
    const teile = unterpfad.split("/").filter(Boolean);
    let bisher = "";
    for (const teil of teile) {
      const eltern = bisher;
      bisher = eltern ? `${eltern}/${teil}` : teil;
      if (await elementVorhanden(token, basis, bisher)) continue;
      const zielUrl = `${elementUrl(basis, eltern || null)}/children`;
      const resp = await fetch(zielUrl, {
        method: "POST",
        headers: kopfzeilen(token, "application/json"),
        body: JSON.stringify({
          name: teil,
          folder: {},
          "@microsoft.graph.conflictBehavior": "fail",
        }),
      });
      if (!resp.ok && resp.status !== 409) throw await graphFehler(resp);
    }
  }

  // null = noch keine Zählerliste exportiert (A1 am Master noch nicht
  // gelaufen) — kein Fehler, sondern ein benannter Zustand fürs UI.
  async function zaehlerlisteLesen(token) {
    const basis = await postfachBasisAufloesen(token);
    const resp = await fetch(`${elementUrl(basis, "zaehlerliste.json")}:/content`, {
      headers: kopfzeilen(token),
    });
    if (resp.status === 404) return null;
    if (!resp.ok) throw await graphFehler(resp);
    return resp.json();
  }

  function ableseDatensatz(eintrag, fotoReferenz) {
    // Exakt das Format aus dem Konzeptdokument (Abschnitt "Format je
    // Ablesung") — bewusst redundant um die Zählernummer. "foto" NUR wenn
    // tatsächlich eins hochgeladen wurde (A4) — Muster wie beim Master
    // (ablese_postfach.gruppiere_fuer_uebernahme): kein erfundener Schlüssel.
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
    const zielUrl = `${elementUrl(basis, `eingang/fotos/${dateiname}`)}:/content`;
    const resp = await fetch(zielUrl, {
      method: "PUT",
      headers: kopfzeilen(token, "image/jpeg"),
      body: blob,
    });
    if (!resp.ok) throw await graphFehler(resp);
    return resp.json();
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

    const zielUrl = `${elementUrl(basis, `eingang/ablesung_${eintrag.id}.json`)}:/content`;
    const resp = await fetch(zielUrl, {
      method: "PUT",
      headers: kopfzeilen(token, "application/json"),
      body: JSON.stringify(ableseDatensatz(eintrag, fotoReferenz)),
    });
    if (!resp.ok) throw await graphFehler(resp);
    return resp.json();
  }

  return { zaehlerlisteLesen, ablesungHochladen };
})();
