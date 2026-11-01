// NUR für Tests im normalen Browser (npm run dev ohne Tauri):
// ersetzt die Rust-Seite durch eine SQLite-Datenbank im Speicher (sql.js), damit man die Oberfläche testen kann.
// In der echten Desktop-App wird diese Datei nie geladen.
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import migration2 from "../../src-tauri/migrations/002_sync_ready_schema.sql?raw";
import migration3 from "../../src-tauri/migrations/003_subtask_dates_project_labels_favorites.sql?raw";
import migration4 from "../../src-tauri/migrations/004_templates.sql?raw";

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
// Nachgemachtes Google Tasks
const fakeTasks = { lists: [] as { id: string; title: string }[], tasks: new Map<string, Record<string, unknown>>(), n: 0 };
(window as unknown as { __fakeTasks: typeof fakeTasks }).__fakeTasks = fakeTasks;
function fakeTasksApi(method: string, u: URL, body: string | null, json: (c: number, d: unknown) => [number, string]): [number, string] {
  const path = u.pathname.replace("/tasks/v1", "");
  const now = () => new Date(Date.now() + 1).toISOString();
  if (path === "/users/@me/lists" && method === "GET") return json(200, { items: fakeTasks.lists });
  if (path === "/users/@me/lists" && method === "POST") {
    const l = { id: "list" + (fakeTasks.lists.length + 1), title: JSON.parse(body!).title };
    fakeTasks.lists.push(l);
    return json(200, l);
  }
  let m = path.match(/^\/users\/@me\/lists\/([^/]+)$/);
  if (m) return json(fakeTasks.lists.some((l) => l.id === m![1]) ? 200 : 404, {});
  const pos = (prev: string | null) => {
    const p = prev ? (fakeTasks.tasks.get(prev)?.position as string) : null;
    return p ? p + "m" : String(++fakeTasks.n).padStart(10, "0");
  };
  m = path.match(/^\/lists\/[^/]+\/tasks(?:\/([^/]+))?(\/move)?$/);
  if (!m) return json(404, {});
  const [, id, move] = m;
  if (!id && method === "GET") return json(200, { items: [...fakeTasks.tasks.values()] });
  if (!id && method === "POST") {
    const t = { status: "needsAction", ...JSON.parse(body!), id: "g" + ++fakeTasks.n, updated: now(), parent: u.searchParams.get("parent") ?? undefined, position: pos(u.searchParams.get("previous")) };
    fakeTasks.tasks.set(t.id, t);
    return json(200, t);
  }
  const t = fakeTasks.tasks.get(id!);
  if (!t) return json(404, {});
  if (move) {
    Object.assign(t, { parent: u.searchParams.get("parent") ?? undefined, position: pos(u.searchParams.get("previous")), updated: now() });
    return json(200, t);
  }
  if (method === "PATCH") {
    Object.assign(t, JSON.parse(body!), { updated: now() });
    return json(200, t);
  }
  if (method === "DELETE") {
    fakeTasks.tasks.delete(id!);
    for (const [k, c] of fakeTasks.tasks) if (c.parent === id) fakeTasks.tasks.delete(k);
    return [204, ""];
  }
  return json(200, t);
}

function fakeGoogle(method: string, url: string, body: string | null): [number, string] {
  const u = new URL(url);
  fakeCal.calls.push(`${method} ${u.pathname}`);
  const json = (code: number, data: unknown): [number, string] => [code, JSON.stringify(data)];
  if (u.host === "oauth2.googleapis.com")
    return json(200, { access_token: "tok", expires_in: 3600, refresh_token: "refresh", scope: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/tasks" });
  if (u.host === "tasks.googleapis.com") return fakeTasksApi(method, u, body, json);
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
  db.exec(migration3);
  db.exec(migration4);

  const bind = (values: unknown[] = []) => Object.fromEntries(values.map((v, i) => [`$${i + 1}`, v as never]));

  let windowPrefs = { closeToTray: true, startMinimized: true };
  let autostart = false;
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
        case "get_window_prefs":
          return windowPrefs;
        case "set_window_prefs":
          windowPrefs = p.prefs as typeof windowPrefs;
          return null;
        case "plugin:autostart|is_enabled":
          return autostart;
        case "plugin:autostart|enable":
        case "plugin:autostart|disable":
          autostart = cmd.endsWith("enable") && !cmd.endsWith("disable");
          return null;
        case "plugin:app|version":
          return "1.0.1";
        case "plugin:updater|check":
          return null;
        default:
          console.log("[mock] unhandled", cmd, p);
          return null;
      }
    },
    { shouldMockEvents: true },
  );
  (window as unknown as { __mockFiles: typeof files }).__mockFiles = files;
}
