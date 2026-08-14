# Ablese-Erfassung (PWA)

Handy-App zum Erfassen von Zählerständen — schreibt je Ablesung eine kleine
JSON-Datei ins OneDrive-Postfach (`Immobilien/Ablese-Postfach/eingang/`),
das der Master (Etappe A1) einliest und per Klick übernimmt. Spricht **nie**
mit dem Server — nur mit OneDrive über Microsoft Graph.

Quelldokument: `MOBIL_KONZEPT_WEG_A_2026-08-11.md` (Software-Root des
Haupt-Repos). Dieses Repo ist bewusst eigenständig, **kein** Bestandteil von
`mietverwaltung-git`.

## Einmalige Einrichtung (GitHub Pages)

1. Auf GitHub: **Settings → Pages**.
2. **Source:** „Deploy from a branch".
3. **Branch:** `main`, Ordner `/ (root)`.
4. Speichern — nach ein bis zwei Minuten ist die Seite erreichbar unter:
   `https://mvonulmerbach-ship-it.github.io/ablese-pwa/`

Diese Adresse muss exakt der Redirect-URI der Microsoft-App-Registrierung
entsprechen (bereits so eingetragen, A2-Session).

## Auf dem Handy einrichten

**Android (Chrome):** Adresse öffnen → Chrome bietet unten „App
installieren" an → bestätigen. Alternativ: Menü (⋮) → „App installieren".

**iPhone (Safari, zu Fuß — Safari bietet hier keinen automatischen
Hinweis):** Adresse öffnen → Teilen-Symbol (Quadrat mit Pfeil nach oben) →
„Zum Home-Bildschirm" → „Hinzufügen".

Danach startet die App wie eine normale App vom Home-Bildschirm, auch
offline (die App-Hülle ist gecacht).

## Benutzung

1. App öffnen, mit dem persönlichen Microsoft-Konto anmelden (einmalig).
2. Zählerliste lädt automatisch (zeigt ihr Datenalter — „Zählerliste vom
   TT.MM.JJJJ").
3. Datum und Anlass oben wählen (Vorgabe: heute / Stichtag).
4. Je Zähler den Stand eintragen und „Erfassen" antippen.
5. Erfasste Stände werden sofort versucht zu senden; ohne Netz liegen sie in
   einer sichtbaren Warteschlange und gehen automatisch raus, sobald wieder
   Netz da ist (oder über „Jetzt senden").

**Kein automatisches Übernehmen:** die Werte erscheinen am Master als
Vorschlag und werden dort per Klick gebucht (Muster Bank-Wizard) —
Zählerstände korrigieren geht immer nur am Master.

## Rundgang-Test (Abnahme A2)

Vor der ersten echten Nutzung: mit dem Handy tatsächlich in den Keller (oder
ein Netz-loses Zimmer), Flugmodus an, mehrere Zählerstände erfassen,
Flugmodus wieder aus, prüfen dass die Warteschlange sich automatisch leert,
und die Einträge am Master als Vorschlag auftauchen.

## Aufbau

```
index.html         Formular-Shell
app.css             Grosse, mobil-taugliche Bedienelemente
manifest.json        PWA-Manifest (Icons, Name, Start-URL)
sw.js                 Service Worker — cached NUR die App-Hülle, nie Graph-Antworten
js/config.js           Client-ID, Redirect-URI, Postfach-Pfad — die eine Stelle
js/auth.js              MSAL-Anmeldung (PKCE, Redirect-Flow)
js/graph.js               Microsoft-Graph-Zugriff (Zählerliste lesen, Ablesung schreiben)
js/queue.js                 Offline-Warteschlange (IndexedDB)
js/app.js                    Verdrahtung
vendor/msal/                 @azure/msal-browser, lokal vendorisiert (kein CDN)
icons/                        App-Icons
```
