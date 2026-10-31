// NUR für Screenshots (npm run dev, Adresse mit ?demo):
// legt Beispieldaten an und öffnet die gewünschte Ansicht. Wird in der fertigen App nie geladen.
//   ?demo&view=board|list|calendar|gantt|home|my&lang=en&dark=1&open=<Titel>&settings=gcal&sidebar=0
import { addDays, format } from "date-fns";
import { useStore, type ProjectView } from "../store";

const day = (n: number) => format(addDays(new Date(), n), "yyyy-MM-dd");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runDemo(params: URLSearchParams) {
  while (!useStore.getState().loaded) await wait(50);
  const s = () => useStore.getState();

  s().setLang((params.get("lang") as "de" | "en") ?? "en");
  s().setDark(params.get("dark") !== "0");
  if (params.get("sidebar") === "0" && s().sidebarOpen) s().toggleSidebar();
  if (params.get("sidebar") !== "0" && !s().sidebarOpen) s().toggleSidebar();

  // Altes Testprojekt aus der Migration entfernen
  for (const p of [...s().data.projects]) await s().deleteProject(p.id);

  const label = async (name: string, color: string) => s().createLabel(name, color);
  const design = await label("Design", "#8b5cf6");
  const frontend = await label("Frontend", "#3b82f6");
  const bug = await label("Bug", "#ef4444");
  const content = await label("Content", "#f59e0b");
  const research = await label("Research", "#10b981");

  const web = await s().createProject({ name: "Website Relaunch", key: "WEB", color: "#71717a", icon: "", description: "New marketing site and pricing pages" });
  const app = await s().createProject({ name: "Mobile App", key: "APP", color: "#6366f1", icon: "", description: "" });
  await s().createProject({ name: "Homelab", key: "LAB", color: "#10b981", icon: "", description: "" });
  await s().createProject({ name: "Personal", key: "ME", color: "#f59e0b", icon: "", description: "" });

  const cols = (pid: string) => s().data.columns.filter((c) => c.project_id === pid).sort((a, b) => a.position - b.position);
  const [todo, doing, review, done] = cols(web).map((c) => c.id);

  type T = { col: string | null; title: string; prio?: "none" | "low" | "medium" | "high" | "urgent"; due?: number; start?: number; labels?: string[]; subs?: [string, boolean][]; desc?: string };
  const make = async (pid: string, t: T) => {
    const id = await s().createTask(pid, t.col, t.title, {
      priority: t.prio ?? "none",
      due_date: t.due === undefined ? null : day(t.due),
      start_date: t.start === undefined ? null : day(t.start),
      description: t.desc ?? "",
    });
    for (const l of t.labels ?? []) await s().toggleLabel(id, l, true);
    for (const [title, isDone] of t.subs ?? []) {
      await s().addSubtask(id, title);
      if (isDone) {
        const sub = s().data.subtasks.filter((x) => x.task_id === id).pop()!;
        await s().patch("subtasks", sub.id, { done: 1 });
      }
    }
    return id;
  };

  await make(web, { col: todo, title: "Redirect the old pricing links", prio: "high", due: -1, labels: [frontend, bug] });
  await make(web, { col: todo, title: "Draft the launch email", prio: "medium", due: 4, start: 2, labels: [content] });
  await make(web, { col: todo, title: "Competitor research", prio: "low", start: 1, due: 6, labels: [research] });
  await make(web, {
    col: doing,
    title: "Build the new homepage",
    prio: "high",
    start: -3,
    due: 2,
    labels: [design, frontend],
    subs: [["Hero section", true], ["Feature grid", true], ["Testimonials", false], ["Footer", false]],
    desc: "Implement the new homepage based on the approved designs.\n\n- [x] Responsive layout\n- [x] Dark mode\n- [ ] Animations\n- [ ] Lighthouse score > 95",
  });
  await make(web, { col: doing, title: "Safari: mobile menu stays open after navigation", prio: "urgent", due: 1, labels: [bug] });
  await make(web, { col: review, title: "Pricing copy – final review", prio: "high", due: 3, start: 0, labels: [content] });
  await make(web, { col: review, title: "Hero video under 2 MB", prio: "medium", due: 5, labels: [design] });
  await make(web, { col: done, title: "Pick the color palette", labels: [design] });
  await make(web, { col: done, title: "Set up analytics" });
  await make(web, { col: null, title: "Blog section", labels: [content] });
  await make(web, { col: null, title: "Newsletter sign-up", labels: [frontend] });

  const [atodo, adoing] = cols(app).map((c) => c.id);
  await make(app, { col: atodo, title: "Push notifications", prio: "medium", due: 9, start: 5 });
  await make(app, { col: adoing, title: "Onboarding screens", prio: "high", due: 3, start: -1, labels: [design] });

  const view = params.get("view") ?? "board";
  if (view === "home") s().go({ kind: "home" });
  else if (view === "my") s().go({ kind: "my" });
  else s().go({ kind: "project", projectId: web, tab: view as ProjectView });

  const open = params.get("open");
  if (open) {
    await wait(100);
    const task = s().data.tasks.find((x) => x.title === open);
    if (task) s().set({ openTaskId: task.id });
  }
  const settings = params.get("settings");
  if (settings) s().set({ settingsOpen: true });
  if (params.get("palette")) s().set({ paletteOpen: true });
  document.documentElement.dataset.demoReady = "1";
}
