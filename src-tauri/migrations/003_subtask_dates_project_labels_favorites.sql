-- Unteraufgaben mit Fälligkeitsdatum, Labels pro Projekt, Favoriten-Projekte, Google-Tasks-Verknüpfung
ALTER TABLE subtasks ADD COLUMN due_date TEXT;
ALTER TABLE labels ADD COLUMN project_id TEXT;
ALTER TABLE projects ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;
