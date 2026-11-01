// Automatische Updates über GitHub Releases (tauri-plugin-updater).
// Slate lädt latest.json vom neuesten Release, vergleicht die Version und prüft die Signatur.
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { create } from "zustand";

type UpdateState = {
  state: "idle" | "checking" | "none" | "available" | "downloading" | "error";
  version?: string;
  progress?: number; // 0..1 beim Herunterladen
  error?: string;
};

export const useUpdate = create<UpdateState>(() => ({ state: "idle" }));

let pending: Update | null = null;

export async function checkForUpdate() {
  const s = useUpdate.getState().state;
  if (s === "checking" || s === "downloading") return;
  useUpdate.setState({ state: "checking", error: undefined });
  try {
    pending = await check();
    useUpdate.setState(pending ? { state: "available", version: pending.version } : { state: "none" });
  } catch (e) {
    useUpdate.setState({ state: "error", error: String(e) });
  }
}

/** Lädt das Update, installiert es und startet Slate neu. */
export async function installUpdate() {
  if (!pending) return;
  let total = 0;
  let done = 0;
  useUpdate.setState({ state: "downloading", progress: 0 });
  try {
    await pending.downloadAndInstall((e) => {
      if (e.event === "Started") total = e.data.contentLength ?? 0;
      if (e.event === "Progress") {
        done += e.data.chunkLength;
        if (total) useUpdate.setState({ progress: done / total });
      }
    });
    await relaunch();
  } catch (e) {
    useUpdate.setState({ state: "error", error: String(e) });
  }
}

/** Kurz nach dem Start und danach alle 6 Stunden nach Updates suchen. */
export function startUpdater() {
  const run = () => checkForUpdate().catch(() => {});
  setTimeout(run, 10_000);
  setInterval(run, 6 * 60 * 60 * 1000);
}
