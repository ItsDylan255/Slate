// Unteraufgaben mit Google Tasks abgleichen.
// Slate legt in Google Tasks eine Liste "Slate" an. Jede Aufgabe mit Unteraufgaben wird dort eine
// Aufgabe, ihre Unteraufgaben werden Unteraufgaben in Google Tasks.
//  - Abhaken, Titel und Datum der Unteraufgaben gehen in beide Richtungen: die neuere Änderung gewinnt.
//  - In Google Tasks neu angelegte Unteraufgaben (unter einer Slate-Aufgabe) kommen nach Slate.
//  - Die übergeordnete Aufgabe spiegelt nur Slate (Titel, Datum, erledigt).
// Zuordnung über eine Kennung in den Notizen ("slate:<id>"), dadurch auch mit mehreren PCs ohne Doppelte.
import * as db from "./db";
import { fail, getGcalConfig, googleRequest, hasTasksScope } from "./gcal";
import { isDone, taskKey, useStore } from "../store";
import type { Subtask, Task } from "./types";

const API = "https://tasks.googleapis.com/tasks/v1";
const LIST_NAME = "Slate";
const SUB = "slate:";
const PARENT = "slate-task:";

export interface GtasksStatus {
  state: "off" | "idle" | "syncing" | "error" | "scope";
  last?: number;
  error?: string;
  count?: number; // abgeglichene Unteraufgaben
}

interface GTask {
  id: string;
  title?: string;
  notes?: string;
  status: "needsAction" | "completed";
  due?: string;
  updated: string;
  parent?: string;
  position: string;
}

let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let status: GtasksStatus = { state: "off" };
const listeners = new Set<(s: GtasksStatus) => void>();
function setStatus(s: GtasksStatus) {
  status = s;
  listeners.forEach((l) => l(s));
}
export const getGtasksStatus = () => status;
export function onGtasksStatus(fn: (s: GtasksStatus) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const gtasksEnabled = async () => (await db.getSetting("gtasks_enabled")) === "1";
export async function setGtasksEnabled(on: boolean) {
  await db.setSetting("gtasks_enabled", on ? "1" : "0");
  if (on) await syncGoogleTasks();
  else setStatus({ state: "off" });
}

const call = <T = unknown>(method: string, path: string, body?: unknown) => googleRequest<T>(method, API + path, body);

async function ensureList(): Promise<string> {
  const cached = await db.getSetting("gtasks_list_id");
  if (cached) {
    const r = await call("GET", `/users/@me/lists/${cached}`);
    if (r.status === 200) return cached;
  }
  const lists = await call<{ items?: { id: string; title: string }[] }>("GET", "/users/@me/lists?maxResults=100");
  if (lists.status !== 200) throw fail("Google Tasks", lists);
  let id = lists.data.items?.find((l) => l.title === LIST_NAME)?.id;
  if (!id) {
    const created = await call<{ id: string }>("POST", "/users/@me/lists", { title: LIST_NAME });
    if (created.status !== 200) throw fail("Liste anlegen", created);
    id = created.data.id;
  }
  await db.setSetting("gtasks_list_id", id);
  return id;
}

async function listAll(list: string): Promise<GTask[]> {
  const out: GTask[] = [];
  let page = "";
  do {
    const r = await call<{ items?: GTask[]; nextPageToken?: string }>(
      "GET",
      `/lists/${list}/tasks?maxResults=100&showCompleted=true&showHidden=true${page ? "&pageToken=" + page : ""}`,
    );
    if (r.status !== 200) throw fail("Google Tasks laden", r);
    out.push(...(r.data.items ?? []));
    page = r.data.nextPageToken ?? "";
  } while (page);
  return out;
}

/** Kennung aus den Notizen lesen */
const marker = (g: GTask, prefix: string) => g.notes?.split("\n").find((l) => l.startsWith(prefix))?.slice(prefix.length).trim();
const toDue = (date: string | null) => (date ? `${date}T00:00:00.000Z` : null);
const fromDue = (due?: string) => (due ? due.slice(0, 10) : null);

/** Gleicht ab. Läuft nur, wenn eingeschaltet und die Google-Verbindung Tasks erlaubt. */
export async function syncGoogleTasks() {
  if (running) {
    again = true;
    return;
  }
  if (!(await gtasksEnabled()) || !(await getGcalConfig()).connected) {
    setStatus({ state: "off" });
    return;
  }
  if (!(await hasTasksScope())) {
    setStatus({ state: "scope" });
    return;
  }
  running = true;
  setStatus({ ...status, state: "syncing" });
  try {
    const list = await ensureList();
    const path = `/lists/${list}/tasks`;
    const remote = await listAll(list);
    const store = useStore.getState();
    const d = store.data;

    // Remote nach Kennung ordnen, Doppelte entfernen
    const parents = new Map<string, GTask>();
    const children = new Map<string, GTask>();
    const extra: GTask[] = [];
    for (const g of remote) {
      const pid = marker(g, PARENT);
      const sid = marker(g, SUB);
      if (pid) parents.has(pid) ? extra.push(g) : parents.set(pid, g);
      else if (sid) children.has(sid) ? extra.push(g) : children.set(sid, g);
    }
    for (const g of extra) await call("DELETE", `${path}/${g.id}`);

    // Aufgaben mit Unteraufgaben (aktiv, Projekt nicht archiviert)
    // Immer den aktuellen Stand lesen (während des Abgleichs kommen evtl. Unteraufgaben aus Google dazu)
    const subsOf = (taskId: string) =>
      useStore.getState().data.subtasks.filter((s) => s.task_id === taskId).sort((a, b) => a.position - b.position);
    const eligible = d.tasks.filter((x) => {
      const p = d.projects.find((pr) => pr.id === x.project_id);
      return x.title && !x.archived && p && !p.archived && subsOf(x.id).length > 0;
    });
    const keepParents = new Set<string>();
    const keepChildren = new Set<string>();
    let count = 0;

    for (const task of eligible) {
      const parent = await syncParent(path, task, parents.get(task.id));
      keepParents.add(parent.id);

      // In Google angelegte Unteraufgaben (ohne Kennung) nach Slate holen
      for (const g of remote.filter((r) => r.parent === parent.id && !marker(r, SUB) && r.title?.trim())) {
        await store.addSubtask(task.id, g.title!.trim(), fromDue(g.due));
        const sub = useStore.getState().data.subtasks.filter((s) => s.task_id === task.id).pop()!;
        if (g.status === "completed") await store.patch("subtasks", sub.id, { done: 1 });
        const patched = await call<GTask>("PATCH", `${path}/${g.id}`, { notes: notesWith(g.notes, `${SUB}${sub.id}`) });
        if (patched.status === 200) children.set(sub.id, patched.data);
      }

      let previous = "";
      for (const sub of subsOf(task.id)) {
        const g = await syncChild(path, sub, children.get(sub.id), parent.id, previous);
        keepChildren.add(g.id);
        previous = g.id;
        count++;
      }
      await fixOrder(path, parent.id, subsOf(task.id), children, remote);
    }

    // Was es in Slate nicht (mehr) gibt, in Google löschen
    for (const g of children.values()) if (!keepChildren.has(g.id)) await call("DELETE", `${path}/${g.id}`);
    for (const g of parents.values()) if (!keepParents.has(g.id)) await call("DELETE", `${path}/${g.id}`);

    setStatus({ state: "idle", last: Date.now(), count });
  } catch (e) {
    setStatus({ state: "error", error: e instanceof Error ? e.message : String(e), last: status.last });
  } finally {
    running = false;
    if (again) {
      again = false;
      setTimeout(syncGoogleTasks, 1000);
    }
  }
}

const notesWith = (notes: string | undefined, line: string) => [...(notes ?? "").split("\n").filter((l) => l && !l.startsWith(SUB)), line].join("\n");

/** Übergeordnete Aufgabe: spiegelt nur Slate */
async function syncParent(path: string, task: Task, g: GTask | undefined): Promise<GTask> {
  const d = useStore.getState().data;
  const project = d.projects.find((p) => p.id === task.project_id);
  const done = isDone(task, d.columns);
  const body = {
    title: task.title,
    notes: `${taskKey(task, d.projects)} · ${project?.name ?? ""}\n${PARENT}${task.id}`,
    status: done ? "completed" : "needsAction",
    due: toDue(task.due_date),
    ...(done ? {} : { completed: null }),
  };
  if (!g) {
    const r = await call<GTask>("POST", path, body);
    if (r.status !== 200) throw fail("Aufgabe anlegen", r);
    return r.data;
  }
  if (g.parent) {
    // Wurde in Google unter eine andere Aufgabe geschoben -> wieder nach oben
    const m = await call<GTask>("POST", `${path}/${g.id}/move`);
    if (m.status === 200) g = m.data;
  }
  if (g.title !== body.title || g.notes !== body.notes || g.status !== body.status || fromDue(g.due) !== task.due_date) {
    const r = await call<GTask>("PATCH", `${path}/${g.id}`, body);
    if (r.status !== 200) throw fail("Aufgabe aktualisieren", r);
    return r.data;
  }
  return g;
}

/** Unteraufgabe: in beide Richtungen, die neuere Änderung gewinnt */
async function syncChild(path: string, sub: Subtask, g: GTask | undefined, parentId: string, previous: string): Promise<GTask> {
  const body = (s: Subtask) => ({
    title: s.title,
    notes: `${SUB}${s.id}`,
    status: s.done ? "completed" : "needsAction",
    due: toDue(s.due_date),
    ...(s.done ? {} : { completed: null }),
  });
  if (!g) {
    const q = `?parent=${parentId}${previous ? `&previous=${previous}` : ""}`;
    const r = await call<GTask>("POST", path + q, body(sub));
    if (r.status !== 200) throw fail("Unteraufgabe anlegen", r);
    return r.data;
  }
  if (g.parent !== parentId) {
    const m = await call<GTask>("POST", `${path}/${g.id}/move?parent=${parentId}${previous ? `&previous=${previous}` : ""}`);
    if (m.status === 200) g = m.data;
  }
  const remoteDone = g.status === "completed";
  const same = remoteDone === !!sub.done && (g.title ?? "") === sub.title && fromDue(g.due) === sub.due_date;
  if (same) return g;
  if (Date.parse(g.updated) > sub.updated_at) {
    // In Google geändert -> nach Slate übernehmen
    await useStore.getState().patch("subtasks", sub.id, {
      done: remoteDone ? 1 : 0,
      title: g.title?.trim() || sub.title,
      due_date: fromDue(g.due),
    });
    return g;
  }
  const r = await call<GTask>("PATCH", `${path}/${g.id}`, body(sub));
  if (r.status !== 200) throw fail("Unteraufgabe aktualisieren", r);
  return r.data;
}

/** Reihenfolge in Google an Slate anpassen (nur wenn sie abweicht) */
async function fixOrder(path: string, parentId: string, subs: Subtask[], children: Map<string, GTask>, remote: GTask[]) {
  const current = remote
    .filter((g) => g.parent === parentId && marker(g, SUB))
    .sort((a, b) => a.position.localeCompare(b.position))
    .map((g) => marker(g, SUB));
  const wanted = subs.map((s) => s.id);
  // Neue Einträge wurden schon an der richtigen Stelle angelegt -> nur bekannte vergleichen
  const known = wanted.filter((id) => current.includes(id));
  if (known.join() === current.filter((id) => wanted.includes(id!)).join()) return;
  let previous = "";
  for (const id of wanted) {
    const g = children.get(id);
    if (!g) continue;
    await call("POST", `${path}/${g.id}/move?parent=${parentId}${previous ? `&previous=${previous}` : ""}`);
    previous = g.id;
  }
}

/** Automatisch: beim Start, 5 s nach Änderungen, alle 5 Minuten und wenn das Fenster wieder aktiv wird. */
export async function startGtasks() {
  if (await gtasksEnabled()) setStatus({ state: "idle" });
  const soon = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(syncGoogleTasks, ms);
  };
  window.addEventListener("slate:changed", () => soon(5000));
  window.addEventListener("slate:google-connected", () => soon(500));
  window.addEventListener("focus", () => soon(1000));
  setInterval(syncGoogleTasks, 5 * 60_000);
  await syncGoogleTasks();
}
