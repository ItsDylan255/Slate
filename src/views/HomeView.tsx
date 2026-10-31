import { addDays, format } from "date-fns";
import { SidebarTrigger } from "../components/Sidebar";
import { Layout, AlertTriangle, CalendarCheck, CheckCircle2, ListTodo } from "lucide-react";
import { isDone, useStore } from "../store";
import type { Task } from "../lib/types";
import { daysUntil, isoDate, locale } from "../lib/dates";
import { TaskRow } from "../components/task/TaskRow";
import { useTaskClick } from "../components/task/useTaskClick";
import { useT } from "../i18n";

/** Startseite: was steht an, Wochenüberblick, Projektfortschritt. */
export function HomeView() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const d = useStore((s) => s.data);
  const go = useStore((s) => s.go);

  const projects = d.projects.filter((p) => !p.archived);
  const activeProjectIds = new Set(projects.map((p) => p.id));
  const tasks = d.tasks.filter((x) => !x.archived && x.title && activeProjectIds.has(x.project_id));
  const open = tasks.filter((x) => !isDone(x, d.columns));
  const overdue = open.filter((x) => x.due_date && daysUntil(x.due_date) < 0);
  const today = open.filter((x) => x.due_date && daysUntil(x.due_date) === 0);
  const upcoming = open
    .filter((x) => x.due_date && daysUntil(x.due_date) > 0 && daysUntil(x.due_date) <= 7)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const doneCount = tasks.length - open.length;

  const hour = new Date().getHours();
  const greeting = hour < 11 ? t("home.morning") : hour < 18 ? t("home.day") : t("home.evening");
  const week = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i));

  const allListed = [...overdue, ...today, ...upcoming];
  const click = useTaskClick(allListed.map((x) => x.id));

  const Section = ({ title, list, tone }: { title: string; list: Task[]; tone?: string }) =>
    list.length === 0 ? null : (
      <section>
        <h3 className={`mb-2 text-xs font-semibold tracking-wide uppercase ${tone ?? "text-muted-foreground"}`}>
          {title} · {list.length}
        </h3>
        <div className="overflow-hidden rounded-lg border border-border">
          {list.map((x) => (
            <TaskRow
              key={x.id}
              task={x}
              showProject
              onClick={(e) => click.onClick(e, x.id)}
              onContextMenu={(e) => click.onContextMenu(e, x.id)}
            />
          ))}
        </div>
      </section>
    );

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <SidebarTrigger />
        <h1 className="text-sm font-medium">{t("nav.home")}</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-8 p-8">
        <div>
          <h1 className="text-2xl font-semibold">{greeting}</h1>
          <p className="mt-1 text-sm text-muted-foreground capitalize">
            {format(new Date(), lang === "de" ? "EEEE, d. MMMM yyyy" : "EEEE, MMMM d, yyyy", { locale: locale(lang) })}
          </p>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <Stat icon={<ListTodo size={16} />} label={t("home.open")} value={open.length} />
          <Stat icon={<CalendarCheck size={16} />} label={t("home.dueToday")} value={today.length} tone="text-warning" />
          <Stat icon={<AlertTriangle size={16} />} label={t("home.overdue")} value={overdue.length} tone="text-due-overdue" />
          <Stat icon={<CheckCircle2 size={16} />} label={t("home.done")} value={doneCount} tone="text-success" />
        </div>

        <div className="grid grid-cols-7 gap-2">
          {week.map((day, i) => {
            const iso = isoDate(day);
            const n = open.filter((x) => x.due_date === iso).length;
            return (
              <div
                key={iso}
                className={`rounded-lg border p-3 text-center ${
                  i === 0
                    ? "border-foreground/20 bg-accent"
                    : "border-border"
                }`}
              >
                <div className="text-xs text-muted-foreground capitalize">{format(day, "EEE", { locale: locale(lang) })}</div>
                <div className="text-lg font-semibold">{format(day, "d")}</div>
                <div className={`text-xs ${n ? "font-medium text-foreground" : "text-muted-foreground/70"}`}>
                  {n ? t("home.nTasks", { n }) : "–"}
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-6">
          <Section title={t("home.overdue")} list={overdue} tone="text-due-overdue" />
          <Section title={t("home.today")} list={today} tone="text-warning" />
          <Section title={t("home.next7")} list={upcoming} />
          {allListed.length === 0 && (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {t("home.nothingDue")}
            </p>
          )}
        </div>

        {projects.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("nav.projects")}</h3>
            <div className="grid grid-cols-3 gap-3">
              {projects.map((p) => {
                const pt = tasks.filter((x) => x.project_id === p.id);
                const done = pt.filter((x) => isDone(x, d.columns)).length;
                const pct = pt.length ? Math.round((done / pt.length) * 100) : 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => go({ kind: "project", projectId: p.id, tab: "board" })}
                    className="rounded-lg border border-border p-4 text-left transition hover:border-board-card-border-hover hover:shadow-sm "
                  >
                    <div className="flex items-center gap-2">
                      <Layout className="size-4 text-muted-foreground" />
                      <span className="truncate font-medium">{p.name}</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-accent">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: p.color }} />
                    </div>
                    <div className="mt-1.5 text-xs text-muted-foreground">
                      {t("home.progress", { done, total: pt.length, pct })}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border p-4 ">
      <div className={`flex items-center gap-2 text-xs text-muted-foreground`}>
        <span className={tone}>{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
