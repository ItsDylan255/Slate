# Datenschutzerklärung – Slate

*Stand: 31. Oktober 2026*

Slate ist eine Desktop-App zur persönlichen Projekt- und Aufgabenverwaltung. Sie wird privat entwickelt und von ihrem Entwickler selbst genutzt.

## Welche Daten verarbeitet Slate?

- **Aufgaben und Projekte** werden ausschließlich lokal auf deinem Computer gespeichert (SQLite-Datenbank im Benutzerordner).
- **Google Drive Sync (optional):** Wenn du ihn aktivierst, schreibt Slate deine Daten als Datei in einen Ordner deines eigenen Google Drive. Slate selbst sendet dabei nichts an andere Server.
- **Google Kalender (optional):** Wenn du Slate mit Google verbindest, legt Slate in deinem Google-Konto einen Kalender namens „Slate“ an und trägt dort deine Aufgaben mit Datum als Termine ein (Titel, Beschreibung, Datum, Projektname). Slate liest nur diesen eigenen Kalender aus; andere Kalender werden nicht verändert.

## Google-Nutzerdaten

- Slate fordert Zugriff auf die Google Calendar API (`https://www.googleapis.com/auth/calendar`) an, ausschließlich um den Kalender „Slate“ anzulegen und zu aktualisieren.
- Das Anmelde-Token wird nur lokal auf deinem Computer gespeichert.
- Es werden **keine Daten an den Entwickler oder an Dritte übertragen**, verkauft oder für Werbung genutzt. Die Kommunikation findet direkt zwischen deinem Computer und Google statt.
- Die Nutzung von Google-Nutzerdaten entspricht der [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), einschließlich der Anforderungen zur eingeschränkten Nutzung (Limited Use).
- Du kannst den Zugriff jederzeit in Slate (Einstellungen → Google Kalender → Trennen) oder unter [myaccount.google.com/permissions](https://myaccount.google.com/permissions) widerrufen.

## Kontakt

Fragen: über die Issues dieses Repositorys auf GitHub.

---

# Privacy Policy – Slate

Slate is a desktop app for personal project and task management. All tasks are stored locally on your computer. If you connect Google Calendar, Slate creates a calendar named "Slate" in your Google account and keeps your dated tasks in it as events. The sign-in token is stored only on your computer. No data is sent to the developer or any third party, sold, or used for advertising; communication happens directly between your computer and Google. Use of Google user data complies with the Google API Services User Data Policy, including the Limited Use requirements. You can revoke access at any time in Slate (Settings → Google Calendar → Disconnect) or at myaccount.google.com/permissions.
