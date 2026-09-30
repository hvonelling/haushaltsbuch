# Haushaltsbuch

Gemeinsames Haushaltsbuch für zwei Personen, gedacht für iPhone und Rechner.
Buchungen, Budgets, Fixkosten, Töpfe und eine Vermögensplanung mit Elterngeld- und Krankengeld-Szenarien.

**Eure Daten liegen nie in diesem Repository.** Die App speichert im Browser des Geräts.
Abgeglichen wird automatisch über eine verschlüsselte Datei in einem eigenen, privaten GitHub-Repo
(Mehr → GitHub-Abgleich). Zugangsschlüssel und Passwort bleiben auf dem jeweiligen Gerät.
Alternativ geht der Abgleich per Datei über iCloud Drive.

## Nutzung

1. In iCloud Drive einen Ordner „Haushaltsbuch“ anlegen und für die andere Person freigeben.
2. App in Safari öffnen, Teilen → „Zum Home-Bildschirm“.
3. Mehr → **Abgleichen**: Datei aus dem Ordner wählen, danach **Zurück in iCloud sichern** → Ersetzen.
4. Am Rechner: Datei auf icloud.com herunterladen, abgleichen, neue Datei hochladen und ersetzen.

Beim Zusammenführen gewinnt pro Buchung die zuletzt bearbeitete Fassung; gelöschte Buchungen bleiben gelöscht.
Für Einstellungen (Fixkosten, Konten, Budgets, Einkommen) gilt der zuletzt geänderte Stand.

## Verschlüsselte Sicherung

Für die Ablage in einem privaten Git-Repo lässt sich die Sicherung verschlüsseln
(PBKDF2-SHA-256 mit 600.000 Runden, gzip, AES-256-GCM; Format in `src/storage/crypto.ts`):

```
npm run encrypt -- haushaltsbuch.json haushaltsbuch.enc.json --neues-passwort passwort.txt
npm run decrypt -- haushaltsbuch.enc.json haushaltsbuch.json
```

Ohne `--neues-passwort` wird das Passwort verdeckt abgefragt (oder aus `HB_PASSWORD` gelesen).
Nach dem Verschlüsseln prüft das Skript per Entschlüsseln, dass der Inhalt exakt übereinstimmt.

## Entwicklung

```
npm install
npm run dev      # lokal starten
npm test         # Tests
npm run build    # nach dist/
npm run deploy   # testen, bauen, auf GitHub Pages veröffentlichen
```

Aufbau:

- `src/domain` – Rechenlogik ohne Oberfläche (Kategorien, CSV-Import, Fixkosten, Töpfe, Einkommen, Planung, Zusammenführen)
- `src/screens` – die Bildschirme
- `src/app` – App-Zustand, Aktionen, gemeinsamer Rechenkontext
- `src/storage` – Speicherung auf dem Gerät, GitHub-Abgleich (`github.ts`), Verschlüsselung (`crypto.ts`), Datei-Abgleich

Die Bank-Anbindung (Enable Banking über einen eigenen Abrufdienst) ist vorbereitet,
aber in `src/app/features.ts` ausgeschaltet, bis der Dienst existiert.

Veröffentlichen: `npm run deploy` testet, baut und schiebt `dist/` auf den Zweig `gh-pages` (GitHub Pages).
