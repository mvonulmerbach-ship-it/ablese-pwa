// Zählerstand aus dem Eingabefeld lesen — deutsche Schreibweise.
//
// 15.09.2026 (Mietverwaltung W68/F64): das Feld war `type="number"` und der
// Wert lief durch `parseFloat`. „12.345“ (zwölftausend…) kam als 12,345 an,
// ohne Markierung — am Master sogar vorausgewählt. Jetzt ist das Feld Text
// mit Dezimal-Tastatur, und der Wert wird HIER gelesen:
//
//   * Komma vorhanden: Punkte sind Tausender, das Komma trennt die Dezimalen
//     („12.345,5“ → 12345.5, „12,5“ → 12.5).
//   * kein Komma, Punkte nur in Tausender-Stellung („12.345“, „1.234.567“)
//     → Tausender.
//   * jeder andere Punkt („1.5“, „12.34“) ist mehrdeutig → `pruefen: true`,
//     kein Wert. Das Feld wird markiert, statt still falsch zu speichern.
//
// Dieselbe Tausender-Regel wie `parseDeZahl` im Master, nur strenger beim
// einzelnen Punkt: am Handy tippt man Stände, keine Beträge mit Cent-Punkt.
"use strict";

const AbleseZahl = (() => {
  const TAUSENDER = /^\d{1,3}(\.\d{3})+$/;

  function leseStand(text) {
    const s = String(text ?? "").replace(/[\s ]/g, "");
    if (s === "") return { wert: null, pruefen: false, leer: true };
    if (!/^[0-9.,]+$/.test(s)) return { wert: null, pruefen: true, leer: false };
    if (s.includes(",")) {
      if ((s.match(/,/g) || []).length > 1) return { wert: null, pruefen: true, leer: false };
      const [ganzRoh, nach] = s.split(",");
      if (ganzRoh.includes(".") && !TAUSENDER.test(ganzRoh)) {
        return { wert: null, pruefen: true, leer: false };
      }
      const ganz = ganzRoh.replace(/\./g, "");
      if (ganz === "" && nach === "") return { wert: null, pruefen: true, leer: false };
      return { wert: parseFloat(`${ganz || "0"}.${nach || "0"}`), pruefen: false, leer: false };
    }
    if (!s.includes(".")) return { wert: parseFloat(s), pruefen: false, leer: false };
    if (TAUSENDER.test(s)) return { wert: parseFloat(s.replace(/\./g, "")), pruefen: false, leer: false };
    return { wert: null, pruefen: true, leer: false };
  }

  return { leseStand };
})();

if (typeof module !== "undefined" && module.exports) module.exports = AbleseZahl;
