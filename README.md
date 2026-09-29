# Haushaltsbuch

Gemeinsames Haushaltsbuch für zwei Personen, gedacht für iPhone und Rechner.
Buchungen, Budgets, Fixkosten, Töpfe und eine Vermögensplanung mit Elterngeld- und Krankengeld-Szenarien.

**Eure Daten liegen nie in diesem Repository.** Die App speichert im Browser des Geräts.
Abgeglichen wird über eine gemeinsame Datei `haushaltsbuch.json` in iCloud Drive.

## Nutzung

1. In iCloud Drive einen Ordner „Haushaltsbuch“ anlegen und für die andere Person freigeben.
2. App in Safari öffnen, Teilen → „Zum Home-Bildschirm“.
3. Mehr → **Abgleichen**: Datei aus dem Ordner wählen, danach **Zurück in iCloud sichern** → Ersetzen.
4. Am Rechner: Datei auf icloud.com herunterladen, abgleichen, neue Datei hochladen und ersetzen.

Beim Zusammenführen gewinnt pro Buchung die zuletzt bearbeitete Fassung; gelöschte Buchungen bleiben gelöscht.
Für Einstellungen (Fixkosten, Konten, Budgets, Einkommen) gilt der zuletzt geänderte Stand.

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
- `src/storage` – Speicherung auf dem Gerät und Datei-Abgleich (austauschbar für einen späteren Server)

Die Bank-Anbindung (Enable Banking über einen eigenen Abrufdienst) ist vorbereitet,
aber in `src/app/features.ts` ausgeschaltet, bis der Dienst existiert.

Veröffentlichen: `npm run deploy` testet, baut und schiebt `dist/` auf den Zweig `gh-pages` (GitHub Pages).
