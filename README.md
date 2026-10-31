# Slate

Schlanker, lokaler Projektmanager als Desktop-App (Tauri 2 + React + SQLite), Sync über Google Drive.
Design nach dem Vorbild von [Kaneo](https://github.com/usekaneo/kaneo) (MIT).

## Starten

```bash
npm install          # einmalig
npm run tauri dev    # Desktop-App im Entwicklungsmodus (Änderungen erscheinen sofort)
npm run dev          # nur im Browser testen – mit Test-Datenbank im Speicher
npm run tauri build  # fertige .exe + Installer -> src-tauri/target/release/bundle/
```

## Wo liegt was?

| Ort | Inhalt |
|---|---|
| `src-tauri/migrations/` | Datenbank-Tabellen (SQL) |
| `src-tauri/src/lib.rs` | Migrationen registrieren + Datei-Befehle (Sync, Anhänge) |
| `src/store.ts` | **Alle Daten und Aktionen** (anlegen, ändern, löschen, Wiederholung, Verlauf) |
| `src/lib/types.ts` | Datentypen = Tabellen |
| `src/lib/sync.ts` | Google-Drive-Sync |
| `src/lib/export.ts` | Backup, CSV, iCal |
| `src/lib/backup.ts` | Automatische Backups (4 Fächer) |
| `src/lib/reminders.ts` | Windows-Benachrichtigungen |
| `src/lib/shortcuts.ts` | Tastenkürzel |
| `src/i18n/de.ts`, `en.ts` | Alle Texte (Deutsch / Englisch) |
| `src/views/` | Ansichten: Übersicht, Meine Aufgaben, Board, Liste, Backlog, Kalender, Gantt, Archiv |
| `src/components/taskdialog/` | Detailansicht einer Aufgabe |
| `src/components/dialogs/` | Projekt-, Einstellungs-, Neue-Aufgabe-Dialog |
| `src/dev/mockTauri.ts` | Nur für Browser-Tests, nicht in der fertigen App |

## Daten

- Datenbank + Anhänge: `%APPDATA%\com.dylan.projektmanager\`
- Sync-Ordner (Standard): `G:\Meine Ablage\Slate\`
  - `devices\<Geräte-ID>.json` – jeder PC schreibt nur seine eigene Datei
  - `attachments\` – Anhänge
- Automatische Backups: `%APPDATA%\com.dylan.projektmanager\backups\` (immer genau vier: letzter Tag, 3 Tage, Woche, Monat)

## Sync auf einem zweiten PC einrichten

1. Google Drive für Desktop installieren und anmelden.
2. Slate installieren (`Slate_x.y.z_x64-setup.exe`).
3. Einstellungen → Google Drive Sync → denselben Ordner wählen → aktivieren.

## Neues Feld hinzufügen (Beispiel)

1. Neue Datei `src-tauri/migrations/003_....sql` mit z. B. `ALTER TABLE tasks ADD COLUMN estimate INTEGER;`
   und in `src-tauri/src/lib.rs` als `version: 3` eintragen. **Alte Migrationen nie ändern.**
2. Feld in `src/lib/types.ts` (Task) und ggf. `TaskPatch` in `src/store.ts` ergänzen.
3. Eingabe in `src/components/taskdialog/Properties.tsx`, Anzeige in `src/components/task/TaskCard.tsx`.
4. Texte in `src/i18n/de.ts` und `en.ts`.
