# Ablese-Erfassung (PWA)

Handy-App zum Erfassen von Zählerständen — schreibt je Ablesung eine kleine
JSON-Datei ins Nextcloud-Postfach (`Arbeit/02 Immobilien/Verwaltung/Ablesewerte/eingang/`,
Pfad in `js/config.js`), das der Master (Etappe A1) einliest und per Klick
übernimmt. Spricht **nie** mit dem Master — nur per WebDAV mit Max' Nextcloud
(seit K131, 30.09.2026; vorher OneDrive über Microsoft Graph). Meldet sich
ein fremder Ableser an (A3), findet die App den freigegebenen Ordner
automatisch unter seinem Namen im eigenen Wurzelordner.

Quelldokument: `MOBIL_KONZEPT_WEG_A_2026-08-11.md` (Software-Root des
Haupt-Repos). Dieses Repo ist bewusst eigenständig, **kein** Bestandteil von
`mietverwaltung-git`.

## Einmalige Einrichtung (Nextcloud im Tailnet, K131)

Die Nextcloud läuft auf dem TrueNAS und ist **nur im Tailnet** erreichbar:
`https://truenas.tailb74bbe.ts.net:8443`. Die App muss von **derselben
Herkunft** ausgeliefert werden (Schema, Host **und Port**), sonst blockiert
der Browser die WebDAV-Anfragen (CORS):

1. Die Dateien dieses Repos unter `https://truenas.tailb74bbe.ts.net:8443/ablese/`
   ausliefern (z. B. Tailscale Serve mit Pfad oder eine Proxy-Regel vor der
   Nextcloud). Ein anderer Port wäre eine fremde Herkunft und funktioniert
   so nicht.
2. Je Ableser ein Nextcloud-Konto; in der Nextcloud unter **Einstellungen →
   Sicherheit** ein **App-Passwort** anlegen.
3. Den Ordner `Arbeit/02 Immobilien/Verwaltung/Ablesewerte` für fremde Ableser
   freigeben (Lesen + Schreiben). Die Infobasis wird **nie** freigegeben.
4. Auf dem Master die beiden Ordner auf die Nextcloud stellen
   (`tools/einrichten.py --postfach-ordner … --infobasis-ordner …`).

**GitHub Pages ist abgelöst.** Die alte Fassung unter
`https://mvonulmerbach-ship-it.github.io/ablese-pwa/` sprach Microsoft Graph
(Hülle v7). Sie wird erst abgeschaltet, wenn die Schritte oben erledigt sind
— bis dahin darf dieser Stand **nicht** nach GitHub Pages gepusht werden,
sonst verlieren die Handys die laufende Fassung.

## Auf dem Handy einrichten

Vorher: die **Tailscale-App** installieren und mit der Einladung ins Tailnet
kommen — ohne sie ist die Adresse nicht erreichbar.

**Android (Chrome):** `https://truenas.tailb74bbe.ts.net:8443/ablese/` öffnen → Chrome bietet unten „App
installieren" an → bestätigen. Alternativ: Menü (⋮) → „App installieren".

**iPhone (Safari, zu Fuß — Safari bietet hier keinen automatischen
Hinweis):** dieselbe Adresse öffnen → Teilen-Symbol (Quadrat mit Pfeil nach oben) →
„Zum Home-Bildschirm" → „Hinzufügen".

Danach startet die App wie eine normale App vom Home-Bildschirm, auch
offline (die App-Hülle ist gecacht).

## Benutzung

1. App öffnen, mit Nextcloud-Konto und App-Passwort anmelden (einmalig).
   Ist das App-Passwort abgelaufen, zeigt die App das Formular wieder —
   erfasste Stände bleiben in der Warteschlange.
2. Zählerliste lädt automatisch (zeigt ihr Datenalter — „Zählerliste vom
   TT.MM.JJJJ").
3. Datum und Anlass oben wählen (Vorgabe: heute / Stichtag).
4. Je Zähler den Stand eintragen — optional daneben 📷 antippen für ein
   Beleg-Foto (wird vor dem Senden automatisch verkleinert) — und
   „Erfassen" antippen.
5. Erfasste Stände werden sofort versucht zu senden; ohne Netz liegen sie in
   einer sichtbaren Warteschlange und gehen automatisch raus, sobald wieder
   Netz da ist (oder über „Jetzt senden").

**Kein automatisches Übernehmen:** die Werte erscheinen am Master als
Vorschlag und werden dort per Klick gebucht (Muster Bank-Wizard) —
Zählerstände korrigieren geht immer nur am Master.

## Nachsehen (Etappe A5, „Infobasis")

Reiter **„Nachsehen"** oben in der App: reiner Lese-Bereich, keine Funktion
legt an, rechnet oder bucht etwas. Zeigt drei täglich vom Master exportierte
Datenbereiche, jeweils mit „Stand vom TT.MM.JJJJ":

- **Einheiten & Mieter** — aktueller Mieter mit Telefon/E-Mail, Kaltmiete,
  NK-Vorauszahlung, Kaution; leerstehende Einheiten stehen als „Leerstehend"
  in der Liste statt zu fehlen.
- **Letzte Zählerstände** — dieselbe Liste wie die Ablese-Seite am Master.
- **Offene Aufgaben** — dieselbe Liste wie das Dashboard am Master.

Der Export liegt in einem eigenen, **nie freigegebenen** Nextcloud-Ordner
(`js/config.js::infobasisPfad`) — nur mit Max' eigenem Nextcloud-Konto
lesbar, ein fremder Ableser (A3) sieht ihn nicht. Läuft am
Master automatisch hinter jedem Backup (`backend/infobasis_export.py`),
kein Knopf nötig. Wie die Zählerliste wird jeder Bereich einzeln offline
vorgehalten (localStorage) — ein fehlender Export blockiert die anderen
beiden nicht.

## Rundgang-Test (Abnahme A2/A4)

Vor der ersten echten Nutzung: mit dem Handy tatsächlich in den Keller (oder
ein Netz-loses Zimmer), Flugmodus an, mehrere Zählerstände erfassen,
Flugmodus wieder aus, prüfen dass die Warteschlange sich automatisch leert,
und die Einträge am Master als Vorschlag auftauchen.

## Aufbau

```
index.html         Formular-Shell
app.css             Grosse, mobil-taugliche Bedienelemente
manifest.json        PWA-Manifest (Icons, Name, Start-URL)
sw.js                 Service Worker — cached NUR die App-Hülle, nie /remote.php/
js/config.js           Server (= eigene Herkunft), Postfach- und Infobasis-Pfad
js/auth.js              Anmeldung: Nextcloud-Konto + App-Passwort (im Gerät gespeichert)
js/ablage.js              WebDAV-Zugriff (Zählerliste lesen, Ablesung schreiben, Infobasis)
js/queue.js                 Offline-Warteschlange (IndexedDB)
js/app.js                    Verdrahtung
icons/                        App-Icons
```
