-- Projektvorlagen (Spalten, Labels, eigene Felder, Aufgaben) – werden wie alles andere synchronisiert
CREATE TABLE templates (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    data        TEXT NOT NULL DEFAULT '{}',
    position    INTEGER NOT NULL DEFAULT 0,
    updated_at  INTEGER NOT NULL DEFAULT 0,
    deleted     INTEGER NOT NULL DEFAULT 0
);
