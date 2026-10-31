// Google-Kalender-Verbindung.
// Slate legt im Google-Konto einen eigenen Kalender "Slate" an und hält dort alle Aufgaben mit Datum
// als ganztägige Termine aktuell. Jede Aufgabe bekommt eine feste Termin-ID ("slate" + Aufgaben-ID),
// dadurch entstehen auch mit mehreren PCs keine doppelten Termine.
// Anmeldung: OAuth 2.0 für Desktop-Apps (Browser + Rückleitung an 127.0.0.1, mit PKCE).
// Zugangsdaten (Client-ID/-Secret aus dem eigenen Google-Cloud-Projekt) und das Anmelde-Token
// liegen nur lokal in der Datenbank dieses PCs (Tabelle settings, wird nicht synchronisiert).
import * as db from "./db";
import { native } from "./native";
import { isDone, taskKey, useStore } from "../store";
import { addDays, format, parseISO } from "date-fns";

const API = "https://www.googleapis.com/calendar/v3";
const SCOPE = "https://www.googleapis.com/auth/calendar";
const CALENDAR_NAME = "Slate";

export interface GcalStatus {
  state: "off" | "idle" | "syncing" | "error";
  last?: number;
  error?: string;
  /** Anzahl Aufgaben, die gerade als Termin im Kalender stehen */
  count?: number;
}

let access: { token: string; expires: number } | null = null;
let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<(s: GcalStatus) => void>();
let status: GcalStatus = { state: "off" };

function setStatus(s: GcalStatus) {
  status = s;
  listeners.forEach((l) => l(s));
}
export const getGcalStatus = () => status;
export function onGcalStatus(fn: (s: GcalStatus) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function getGcalConfig() {
  return {
    clientId: (await db.getSetting("gcal_client_id")) ?? "",
    clientSecret: (await db.getSetting("gcal_client_secret")) ?? "",
    connected: !!(await db.getSetting("gcal_refresh_token")),
  };
}

// ---------- Anmeldung ----------

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

async function tokenRequest(params: Record<string, string>) {
  const body = new URLSearchParams(params).toString();
  const [code, text] = await native.httpRequest("POST", "https://oauth2.googleapis.com/token", [["Content-Type", "application/x-www-form-urlencoded"]], body);
  const json = JSON.parse(text || "{}");
  if (code !== 200) throw new Error(json.error_description || json.error || `Google: ${code}`);
  return json as { access_token: string; expires_in: number; refresh_token?: string };
}

/** Öffnet die Google-Anmeldung im Browser und speichert das Token. */
export async function connectGoogle(clientId: string, clientSecret: string) {
  clientId = clientId.trim();
  clientSecret = clientSecret.trim();
  await db.setSetting("gcal_client_id", clientId);
  await db.setSetting("gcal_client_secret", clientSecret);

  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      scope: SCOPE,
      code_challenge: challenge,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
    }).toString();

  const [code, redirectUri] = await native.oauthLoopback(authUrl);
  const tok = await tokenRequest({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: verifier,
  });
  if (!tok.refresh_token) throw new Error("Google hat kein Refresh-Token geliefert.");
  await db.setSetting("gcal_refresh_token", tok.refresh_token);
  access = { token: tok.access_token, expires: Date.now() + (tok.expires_in - 60) * 1000 };
  await syncCalendar();
}

export async function disconnectGoogle() {
  const token = await db.getSetting("gcal_refresh_token");
  if (token) {
    // Zugriff bei Google widerrufen (Fehler egal)
    await native
      .httpRequest("POST", "https://oauth2.googleapis.com/revoke", [["Content-Type", "application/x-www-form-urlencoded"]], `token=${encodeURIComponent(token)}`)
      .catch(() => {});
  }
  await db.setSetting("gcal_refresh_token", "");
  await db.setSetting("gcal_calendar_id", "");
  access = null;
  setStatus({ state: "off" });
}

async function accessToken() {
  if (access && access.expires > Date.now()) return access.token;
  const { clientId, clientSecret } = await getGcalConfig();
  const refresh = await db.getSetting("gcal_refresh_token");
  if (!refresh) throw new Error("Nicht mit Google verbunden.");
  try {
    const tok = await tokenRequest({ client_id: clientId, client_secret: clientSecret, refresh_token: refresh, grant_type: "refresh_token" });
    access = { token: tok.access_token, expires: Date.now() + (tok.expires_in - 60) * 1000 };
    return access.token;
  } catch (e) {
    // Anmeldung abgelaufen oder widerrufen -> neu verbinden lassen (Client-ID/-Secret bleiben gespeichert)
    if (String(e).includes("invalid_grant") || String(e).toLowerCase().includes("expired") || String(e).includes("revoked")) {
      await db.setSetting("gcal_refresh_token", "");
      throw new Error("Die Google-Anmeldung ist abgelaufen. Bitte unter Einstellungen → Google Kalender neu verbinden.");
    }
    throw e;
  }
}

async function api<T = unknown>(method: string, path: string, body?: unknown, retry = true): Promise<{ status: number; data: T }> {
  const token = await accessToken();
  const [code, text] = await native.httpRequest(
    method,
    API + path,
    [
      ["Authorization", `Bearer ${token}`],
      ["Content-Type", "application/json"],
    ],
    body === undefined ? undefined : JSON.stringify(body),
  );
  if (code === 401 && retry) {
    access = null;
    return api(method, path, body, false);
  }
  return { status: code, data: (text ? JSON.parse(text) : {}) as T };
}

const fail = (what: string, r: { status: number; data: unknown }) =>
  new Error(`${what}: ${r.status} ${(r.data as { error?: { message?: string } })?.error?.message ?? ""}`);

// ---------- Kalender ----------

/** Kalender in Google Kalender sichtbar schalten (neu angelegte Kalender sind sonst evtl. ausgeblendet). */
let visibilityChecked = false;
async function makeVisible(id: string) {
  if (visibilityChecked) return;
  const r = await api("PATCH", `/users/me/calendarList/${encodeURIComponent(id)}`, { selected: true, hidden: false });
  if (r.status === 200) visibilityChecked = true;
}

async function ensureCalendar(): Promise<string> {
  const cached = await db.getSetting("gcal_calendar_id");
  if (cached) {
    const r = await api("GET", `/calendars/${encodeURIComponent(cached)}`);
    if (r.status === 200) {
      await makeVisible(cached);
      return cached;
    }
  }
  // Vorhandenen "Slate"-Kalender suchen (z. B. vom anderen PC angelegt)
  const list = await api<{ items?: { id: string; summary: string }[] }>("GET", "/users/me/calendarList?minAccessRole=owner&maxResults=250");
  if (list.status !== 200) throw fail("Kalenderliste", list);
  let id = list.data.items?.find((c) => c.summary === CALENDAR_NAME)?.id;
  if (!id) {
    const created = await api<{ id: string }>("POST", "/calendars", {
      summary: CALENDAR_NAME,
      description: "Aufgaben aus Slate (wird automatisch aktualisiert)",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (created.status !== 200) throw fail("Kalender anlegen", created);
    id = created.data.id;
  }
  await db.setSetting("gcal_calendar_id", id);
  await makeVisible(id);
  return id;
}

const eventId = (taskId: string) => "slate" + taskId.toLowerCase().replace(/[^a-v0-9]/g, "");

interface EventBody {
  id: string;
  summary: string;
  description: string;
  start: { date: string };
  end: { date: string };
  status: "confirmed";
  transparency: "transparent";
  extendedProperties: { private: { slateHash: string; slateTask: string } };
}

/** Termine, die es laut Slate geben soll (alle aktiven Aufgaben mit Datum). */
function desiredEvents(): Map<string, EventBody> {
  const { data: d } = useStore.getState();
  const out = new Map<string, EventBody>();
  for (const x of d.tasks) {
    if (x.archived || (!x.due_date && !x.start_date)) continue;
    const project = d.projects.find((p) => p.id === x.project_id);
    if (!project || project.archived) continue;
    const start = x.start_date ?? x.due_date!;
    const end = x.due_date ?? x.start_date!;
    const done = isDone(x, d.columns);
    const column = d.columns.find((c) => c.id === x.column_id)?.name ?? "Backlog";
    const summary = `${done ? "✓ " : ""}${x.title}`;
    const description = `${taskKey(x, d.projects)} · ${project.name} · ${column}${x.description ? "\n\n" + x.description.slice(0, 4000) : ""}`;
    const endExclusive = format(addDays(parseISO(end < start ? start : end), 1), "yyyy-MM-dd");
    const hash = JSON.stringify([summary, description, start, endExclusive]);
    const id = eventId(x.id);
    out.set(id, {
      id,
      summary,
      description,
      start: { date: start },
      end: { date: endExclusive },
      status: "confirmed",
      transparency: "transparent",
      extendedProperties: { private: { slateHash: hash, slateTask: x.id } },
    });
  }
  return out;
}

interface RemoteEvent {
  id: string;
  status: string;
  extendedProperties?: { private?: { slateHash?: string } };
}

async function listRemote(cal: string): Promise<Map<string, RemoteEvent>> {
  const out = new Map<string, RemoteEvent>();
  let page = "";
  do {
    const q = `?maxResults=2500&showDeleted=true&fields=${encodeURIComponent("items(id,status,extendedProperties),nextPageToken")}${page ? "&pageToken=" + page : ""}`;
    const r = await api<{ items?: RemoteEvent[]; nextPageToken?: string }>("GET", `/calendars/${encodeURIComponent(cal)}/events${q}`);
    if (r.status !== 200) throw fail("Termine laden", r);
    for (const e of r.data.items ?? []) out.set(e.id, e);
    page = r.data.nextPageToken ?? "";
  } while (page);
  return out;
}

/** Gleicht den Google-Kalender mit den Aufgaben ab (nur Änderungen werden gesendet). */
export async function syncCalendar() {
  if (running) {
    again = true;
    return;
  }
  if (!(await getGcalConfig()).connected) {
    setStatus({ state: "off" });
    return;
  }
  running = true;
  setStatus({ ...status, state: "syncing" });
  try {
    const cal = await ensureCalendar();
    const path = `/calendars/${encodeURIComponent(cal)}/events`;
    const remote = await listRemote(cal);
    const desired = desiredEvents();

    for (const [id, body] of desired) {
      const r = remote.get(id);
      if (!r) {
        const res = await api("POST", path, body);
        if (res.status === 409) {
          // Gibt es schon (z. B. gelöscht oder vom anderen PC) -> überschreiben
          const p = await api("PATCH", `${path}/${id}`, body);
          if (p.status >= 300) throw fail("Termin aktualisieren", p);
        } else if (res.status >= 300) throw fail("Termin anlegen", res);
      } else if (r.status === "cancelled" || r.extendedProperties?.private?.slateHash !== body.extendedProperties.private.slateHash) {
        const p = await api("PATCH", `${path}/${id}`, body);
        if (p.status >= 300) throw fail("Termin aktualisieren", p);
      }
    }
    for (const [id, r] of remote) {
      if (desired.has(id) || r.status === "cancelled" || !id.startsWith("slate")) continue;
      const res = await api("DELETE", `${path}/${id}`);
      if (res.status >= 300 && res.status !== 404 && res.status !== 410) throw fail("Termin löschen", res);
    }
    setStatus({ state: "idle", last: Date.now(), count: desired.size });
  } catch (e) {
    setStatus({ state: "error", error: e instanceof Error ? e.message : String(e), last: status.last });
  } finally {
    running = false;
    if (again) {
      again = false;
      setTimeout(syncCalendar, 1000);
    }
  }
}

/** Automatisch abgleichen: beim Start, 5 s nach jeder Änderung und alle 5 Minuten. */
export async function startGcal() {
  if ((await getGcalConfig()).connected) setStatus({ state: "idle" });
  window.addEventListener("slate:changed", () => {
    clearTimeout(timer);
    timer = setTimeout(syncCalendar, 5000);
  });
  setInterval(syncCalendar, 5 * 60_000);
  await syncCalendar();
}
