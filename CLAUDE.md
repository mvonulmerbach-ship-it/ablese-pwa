# CLAUDE.md – Ablese-Erfassung (PWA) (`ablese-pwa`)

@~/Nextcloud/Claude/Projekte/MiniApps/REGELN.md

Die Regeln oben (REGELN.md) gelten für jede Session in diesem Repo, dazu das Mini-App-Muster aus den CLAUDE-Anweisungen. Hier steht nur, was **diese** App betrifft.

## Diese App

- **Live:** https://mvonulmerbach-ship-it.github.io/ablese-pwa/ · Beschreibung und Abweichungen: `README.md`
- **Familie:** Teil der Mietverwaltung
- **Version:** `CACHE_NAME` in `sw.js` – bei jeder Änderung hochzählen; die Zahl steht nur dort.
- Gehört zur Mietverwaltung (Zählerstände → Nextcloud-Postfach per WebDAV). Design-Tokens kommen aus der Mietverwaltung (`ui-tokens*.css`), dort nicht abweichend ändern.
- Ein Mietverwaltungs-Test liest `sw.js`: Form `CACHE_NAME = PRAEFIX + "huelle-v<N>"` beibehalten, nur N hochzählen.
- `ui_pruefen.py` sieht ohne Anmeldung nur die Anmeldeseite; die Erfassungsansichten nach Prüfliste von Hand prüfen.

## Abschluss (DoD nach REGELN §2)

UI-Prüfung im Repo-Ordner, erwartet „UI-PRUEFUNG GRUEN“ (kein Befund der Schwere ≥ 2), danach die Bildschirmfotos aus dem genannten Ordner ansehen:

```powershell
& "$env:LOCALAPPDATA\Mietverwaltung\venv\Scripts\python.exe" "$env:USERPROFILE\Nextcloud\Claude\Projekte\App-Design-Datenbank\Werkzeuge\ui_pruefen.py" .
```

Am Ende Summary und Description für dieses Repo als eigene Codeblöcke; committet und gepusht wird von Max.
