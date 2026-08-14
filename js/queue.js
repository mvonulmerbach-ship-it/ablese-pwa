// Offline-Warteschlange (IndexedDB) — ein Puffer für den Ablesetag, kein
// Langzeitlager (Geräte-Realität, MOBIL_KONZEPT_WEG_A_2026-08-11.md).
"use strict";

const AbleseQueue = (() => {
  const DB_NAME = "ablese-warteschlange";
  const DB_VERSION = 1;
  const STORE = "eintraege";
  let dbPromise = null;

  function oeffnen() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: "id" });
          os.createIndex("gesendet", "gesendet", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function transaktion(modus) {
    const db = await oeffnen();
    return db.transaction(STORE, modus).objectStore(STORE);
  }

  async function hinzufuegen(eintrag) {
    const store = await transaktion("readwrite");
    return new Promise((resolve, reject) => {
      const req = store.add(eintrag);
      req.onsuccess = () => resolve(eintrag);
      req.onerror = () => reject(req.error);
    });
  }

  async function alle() {
    const store = await transaktion("readonly");
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function offene() {
    return (await alle()).filter((e) => !e.gesendet);
  }

  async function alsGesendetMarkieren(id) {
    const store = await transaktion("readwrite");
    return new Promise((resolve, reject) => {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const eintrag = getReq.result;
        if (!eintrag) return resolve(null);
        eintrag.gesendet = true;
        eintrag.gesendet_am = new Date().toISOString();
        const putReq = store.put(eintrag);
        putReq.onsuccess = () => resolve(eintrag);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  async function aeltesterOffenerEintrag() {
    const offen = await offene();
    if (!offen.length) return null;
    return offen.reduce((a, b) => (a.erstellt_am < b.erstellt_am ? a : b));
  }

  return { hinzufuegen, alle, offene, alsGesendetMarkieren, aeltesterOffenerEintrag };
})();
