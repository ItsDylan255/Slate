-- Version 2: Alle Tabellen bekommen Text-IDs (UUIDs), updated_at und deleted,
-- damit mehrere PCs ihre Daten über Google Drive zusammenführen können.
-- Bestehende Daten aus Version 1 werden übernommen.

CREATE TABLE projects_new (
    id          TEXT PRIMARY KEY,
    name        TEXT    NOT NULL,
    key         TEXT    NOT NULL DEFAULT '',
    description TEXT    NOT NULL DEFAULT '',
    icon        TEXT    NOT NULL DEFAULT '',
    color       TEXT    NOT NULL DEFAULT '#6366f1',
    position    REAL    NOT NULL DEFAULT 0,
    archived    INTEGER NOT NULL DEFAULT 0,
    updated_at  INTEGER NOT NULL,
    deleted     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE columns_new (
    id          TEXT PRIMARY KEY,
    project_id  TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    position    REAL    NOT NULL DEFAULT 0,
    is_done     INTEGER NOT NULL DEFAULT 0,
    updated_at  INTEGER NOT NULL,
    deleted     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE tasks_new (
    id          TEXT PRIMARY KEY,
    project_id  TEXT    NOT NULL,
    column_id   TEXT,               -- NULL = Backlog
    number      INTEGER NOT NULL DEFAULT 0,
    title       TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    priority    TEXT    NOT NULL DEFAULT 'none',
    start_date  TEXT,
    due_date    TEXT,
    reminder_at TEXT,               -- "YYYY-MM-DDTHH:MM"
    recurrence  TEXT,               -- JSON, siehe src/lib/recurrence.ts
    position    REAL    NOT NULL DEFAULT 0,
    archived    INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    deleted     INTEGER NOT NULL DEFAULT 0
);

INSERT INTO projects_new (id, name, key, color, position, updated_at)
SELECT 'l' || id, name, upper(substr(replace(name, ' ', ''), 1, 3)), color, position,
       CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM projects;

INSERT INTO columns_new (id, project_id, name, position, is_done, updated_at)
SELECT 'l' || id, 'l' || project_id, name, position, name = 'Erledigt',
       CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM columns;

INSERT INTO tasks_new (id, project_id, column_id, number, title, description, priority, due_date, position, created_at, updated_at)
SELECT 'l' || id, 'l' || project_id, 'l' || column_id,
       ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY id),
       title, description, priority, due_date, position,
       CAST(strftime('%s', 'now') AS INTEGER) * 1000,
       CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM tasks;

DROP TABLE tasks;
DROP TABLE columns;
DROP TABLE projects;
ALTER TABLE projects_new RENAME TO projects;
ALTER TABLE columns_new RENAME TO columns;
ALTER TABLE tasks_new RENAME TO tasks;

CREATE TABLE labels (
    id          TEXT PRIMARY KEY,
    name        TEXT    NOT NULL,
    color       TEXT    NOT NULL,
    updated_at  INTEGER NOT NULL,
    deleted     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE task_labels (
    id          TEXT PRIMARY KEY,   -- "<task_id>:<label_id>"
    task_id     TEXT    NOT NULL,
    label_id    TEXT    NOT NULL,
    updated_at  INTEGER NOT NULL,
    deleted     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE subtasks (
    id          TEXT PRIMARY KEY,
    task_id     TEXT    NOT NULL,
    title       TEXT    NOT NULL,
    done        INTEGER NOT NULL DEFAULT 0,
    position    REAL    NOT NULL DEFAULT 0,
    updated_at  INTEGER NOT NULL,
    deleted     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE attachments (
    id          TEXT PRIMARY KEY,
    task_id     TEXT    NOT NULL,
    name        TEXT    NOT NULL,   -- Originalname
    file        TEXT    NOT NULL,   -- Dateiname im Anhänge-Ordner
    size        INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    deleted     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE relations (
    id          TEXT PRIMARY KEY,
    task_id     TEXT    NOT NULL,
    other_id    TEXT    NOT NULL,
    kind        TEXT    NOT NULL,   -- blocks | relates | duplicates
    updated_at  INTEGER NOT NULL,
    deleted     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE comments (
    id          TEXT PRIMARY KEY,
    task_id     TEXT    NOT NULL,
    body        TEXT    NOT NULL,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    deleted     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE activity (
    id          TEXT PRIMARY KEY,
    task_id     TEXT    NOT NULL,
    action      TEXT    NOT NULL,
    detail      TEXT    NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    deleted     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE links (
    id          TEXT PRIMARY KEY,
    task_id     TEXT    NOT NULL,
    url         TEXT    NOT NULL,
    title       TEXT    NOT NULL DEFAULT '',
    updated_at  INTEGER NOT NULL,
    deleted     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE fields (
    id           TEXT PRIMARY KEY,
    project_id   TEXT    NOT NULL,
    name         TEXT    NOT NULL,
    type         TEXT    NOT NULL,  -- text | number | date | select | checkbox
    options      TEXT    NOT NULL DEFAULT '[]',
    position     REAL    NOT NULL DEFAULT 0,
    show_on_card INTEGER NOT NULL DEFAULT 0,
    updated_at   INTEGER NOT NULL,
    deleted      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE field_values (
    id          TEXT PRIMARY KEY,   -- "<task_id>:<field_id>"
    task_id     TEXT    NOT NULL,
    field_id    TEXT    NOT NULL,
    value       TEXT    NOT NULL DEFAULT '',
    updated_at  INTEGER NOT NULL,
    deleted     INTEGER NOT NULL DEFAULT 0
);

-- Nur lokale Einstellungen dieses PCs (werden NICHT synchronisiert)
CREATE TABLE settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL
);
