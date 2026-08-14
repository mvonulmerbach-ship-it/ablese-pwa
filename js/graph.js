// Microsoft-Graph-Zugriff auf den Ordner-Vertrag aus
// MOBIL_KONZEPT_WEG_A_2026-08-11.md: zaehlerliste.json lesen,
// eingang/ablesung_<uuid>.json schreiben (Format "ablesung-v1", exakt wie
// backend/ablese_postfach.py es erwartet — Pflichtfelder zaehler_id/datum/wert).
"use strict";

const AbleseGraph = (() => {
  const GRAPH_BASIS = "https://graph.microsoft.com/v1.0";

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

  async function ordnerVorhanden(token, pfad) {
    const resp = await fetch(`${GRAPH_BASIS}/me/drive/root:/${pfadKodieren(pfad)}`, {
      headers: kopfzeilen(token),
    });
    return resp.ok;
  }

  // Legt fehlende Ordner der Reihe nach an (Graph erstellt keine
  // Zwischenordner von selbst). "fail" + 409-Toleranz macht das
  // nebenläufigkeitssicher, falls zwei Geräte gleichzeitig anlegen.
  async function ordnerSicherstellen(token, pfad) {
    const teile = pfad.split("/").filter(Boolean);
    let bisher = "";
    for (const teil of teile) {
      const eltern = bisher;
      bisher = eltern ? `${eltern}/${teil}` : teil;
      if (await ordnerVorhanden(token, bisher)) continue;
      const zielUrl = eltern
        ? `${GRAPH_BASIS}/me/drive/root:/${pfadKodieren(eltern)}:/children`
        : `${GRAPH_BASIS}/me/drive/root/children`;
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
    const pfad = `${ABLESE_KONFIG.postfachPfad}/zaehlerliste.json`;
    const resp = await fetch(`${GRAPH_BASIS}/me/drive/root:/${pfadKodieren(pfad)}:/content`, {
      headers: kopfzeilen(token),
    });
    if (resp.status === 404) return null;
    if (!resp.ok) throw await graphFehler(resp);
    return resp.json();
  }

  function ableseDatensatz(eintrag) {
    // Exakt das Format aus dem Konzeptdokument (Abschnitt "Format je
    // Ablesung") — bewusst redundant um die Zählernummer.
    return {
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
  }

  async function ablesungHochladen(token, eintrag) {
    await ordnerSicherstellen(token, `${ABLESE_KONFIG.postfachPfad}/eingang`);
    const pfad = `${ABLESE_KONFIG.postfachPfad}/eingang/ablesung_${eintrag.id}.json`;
    const resp = await fetch(`${GRAPH_BASIS}/me/drive/root:/${pfadKodieren(pfad)}:/content`, {
      method: "PUT",
      headers: kopfzeilen(token, "application/json"),
      body: JSON.stringify(ableseDatensatz(eintrag)),
    });
    if (!resp.ok) throw await graphFehler(resp);
    return resp.json();
  }

  return { zaehlerlisteLesen, ablesungHochladen };
})();
