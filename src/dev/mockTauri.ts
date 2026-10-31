// NUR für Tests im normalen Browser (npm run dev ohne Tauri):
// ersetzt die Rust-Seite durch eine SQLite-Datenbank im Speicher (sql.js), damit man die Oberfläche testen kann.
// In der echten Desktop-App wird diese Datei nie geladen.
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import migration2 from "../../src-tauri/migrations/002_sync_ready_schema.sql?raw";

const MIGRATION_1 = `
CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#6366f1', position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE columns (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0);
CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, column_id INTEGER NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', priority TEXT NOT NULL DEFAULT 'none', due_date TEXT, position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
INSERT INTO projects (name, color) VALUES ('Alt-Projekt', '#10b981');
INSERT INTO columns (project_id, name, position) VALUES (1, 'Zu erledigen', 0), (1, 'In Arbeit', 1), (1, 'Erledigt', 2);
INSERT INTO tasks (project_id, column_id, title, priority, due_date) VALUES (1, 1, 'Alte Aufgabe aus Version 1', 'high', date('now'));
`;

const files = new Map<string, string>();

// Nachgemachte Google-API (Token + Kalender), um den Abgleich im Browser zu testen
const fakeCal = { calendars: [] as { id: string; summary: string }[], events: new Map<string, Record<string, unknown>>(), calls: [] as string[] };
(window as unknown as { __fakeCal: typeof fakeCal }).__fakeCal = fakeCal;
function fakeGoogle(method: string, url: string, body: string | null): [number, string] {
  const u = new URL(url);
  fakeCal.calls.push(`${method} ${u.pathname}`);
  const json = (code: number, data: unknown): [number, string] => [code, JSON.stringify(data)];
  if (u.host === "oauth2.googleapis.com") return json(200, { access_token: "tok", expires_in: 3600, refresh_token: "refresh" });
  const path = u.pathname.replace("/calendar/v3", "");
  if (path === "/users/me/calendarList") return json(200, { items: fakeCal.calendars });
  if (path === "/calendars" && method === "POST") {
    const cal = { id: "cal" + (fakeCal.calendars.length + 1), summary: JSON.parse(body!).summary };
    fakeCal.calendars.push(cal);
    return json(200, cal);
  }
  const m = path.match(/^\/calendars\/([^/]+)(\/events(?:\/([^/]+))?)?$/);
  if (!m) return json(404, {});
  if (!m[2]) return json(fakeCal.calendars.some((c) => c.id === decodeURIComponent(m[1])) ? 200 : 404, {});
  const id = m[3];
  if (!id && method === "GET") return json(200, { items: [...fakeCal.events.values()] });
  if (!id && method === "POST") {
    const ev = JSON.parse(body!);
    if (fakeCal.events.has(ev.id)) return json(409, { error: { message: "duplicate" } });
    fakeCal.events.set(ev.id, ev);
    return json(200, ev);
  }
  const ev = fakeCal.events.get(id!);
  if (!ev) return json(404, {});
  if (method === "PATCH") {
    fakeCal.events.set(id!, { ...ev, ...JSON.parse(body!) });
    return json(200, fakeCal.events.get(id!));
  }
  if (method === "DELETE") {
    fakeCal.events.set(id!, { ...ev, status: "cancelled" });
    return [204, ""];
  }
  return json(200, ev);
}

export async function installMock() {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new SQL.Database();
  db.exec(MIGRATION_1);
  db.exec(migration2);

  const bind = (values: unknown[] = []) => Object.fromEntries(values.map((v, i) => [`$${i + 1}`, v as never]));

  mockWindows("main");
  mockIPC(
    (cmd, payload) => {
      const p = (payload ?? {}) as Record<string, unknown>;
      switch (cmd) {
        case "plugin:sql|load":
          return p.db;
        case "plugin:sql|execute": {
          db.run(p.query as string, bind(p.values as unknown[]));
          return [db.getRowsModified(), 0];
        }
        case "plugin:sql|select": {
          const stmt = db.prepare(p.query as string);
          stmt.bind(bind(p.values as unknown[]));
          const rows: unknown[] = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          stmt.free();
          return rows;
        }
        case "find_google_drive":
          return "G:\\Meine Ablage";
        case "app_data_path":
          return "C:\\mock\\appdata";
        case "read_json_files":
          return [...files.entries()]
            .filter(([k]) => k.startsWith(String(p.dir)))
            .map(([k, v]) => [k.split("\\").pop(), v]);
        case "write_text_file":
          files.set(String(p.path), String(p.content));
          return null;
        case "read_text_file":
          return files.get(String(p.path)) ?? "";
        case "list_files":
          return [];
        case "file_exists":
          return false;
        case "copy_file":
          return 1234;
        case "oauth_loopback":
          return ["test-code", "http://127.0.0.1:1"];
        case "http_request":
          return fakeGoogle(String(p.method), String(p.url), (p.body as string | null) ?? null);
        case "plugin:notification|is_permission_granted":
          return true;
        case "plugin:notification|notify":
          console.log("[mock] notification", p);
          return null;
        case "plugin:dialog|ask":
        case "plugin:dialog|confirm":
          return true;
        default:
          console.log("[mock] unhandled", cmd, p);
          return null;
      }
    },
    { shouldMockEvents: true },
  );
  (window as unknown as { __mockFiles: typeof files }).__mockFiles = files;
}
