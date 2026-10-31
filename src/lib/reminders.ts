// Windows-Benachrichtigungen: Erinnerungen zur eingestellten Uhrzeit + einmal täglich eine Zusammenfassung.
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { format } from "date-fns";
import { isDone, saveLocal, taskKey, useStore } from "../store";
import { daysUntil, todayIso } from "./dates";
import { translate } from "../i18n";

const loadMap = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem("notified") ?? "{}");
  } catch {
    return {};
  }
};

async function allowed() {
  if (await isPermissionGranted()) return true;
  return (await requestPermission()) === "granted";
}

function check() {
  const { data: d, lang } = useStore.getState();
  const notified = loadMap();
  const nowStr = format(new Date(), "yyyy-MM-dd'T'HH:mm");
  let changed = false;

  for (const x of d.tasks) {
    if (!x.reminder_at || x.archived || isDone(x, d.columns)) continue;
    if (x.reminder_at > nowStr || notified[x.id] === x.reminder_at) continue;
    notified[x.id] = x.reminder_at;
    changed = true;
    sendNotification({
      title: translate(lang, "notify.reminder"),
      body: `${taskKey(x, d.projects)} · ${x.title}`,
    });
  }

  // Tägliche Zusammenfassung (einmal pro Tag beim ersten Check)
  const today = todayIso();
  if (notified.__daily !== today) {
    const open = d.tasks.filter((x) => !x.archived && x.due_date && !isDone(x, d.columns));
    const dueToday = open.filter((x) => daysUntil(x.due_date!) === 0).length;
    const overdue = open.filter((x) => daysUntil(x.due_date!) < 0).length;
    if (dueToday || overdue) {
      sendNotification({
        title: translate(lang, "app.name"),
        body: translate(lang, "notify.daily", { today: dueToday, overdue }),
      });
    }
    notified.__daily = today;
    changed = true;
  }

  if (changed) saveLocal("notified", notified);
}

export async function startReminders() {
  if (!(await allowed())) return;
  check();
  setInterval(check, 30_000);
}
