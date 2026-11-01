// Windows-Integration: Autostart, Tray und Verhalten beim Schließen (siehe lib.rs)
import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

export type WindowPrefs = { closeToTray: boolean; startMinimized: boolean };

export const desktop = {
  getPrefs: () => invoke<WindowPrefs>("get_window_prefs"),
  setPrefs: (prefs: WindowPrefs) => invoke<void>("set_window_prefs", { prefs }),
  setTrayLabels: (show: string, quit: string) => invoke<void>("set_tray_labels", { show, quit }),
  autostartEnabled: () => isEnabled(),
  setAutostart: (on: boolean) => (on ? enable() : disable()),
};
