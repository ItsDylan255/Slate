import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CalendarCheck, ChevronRight, ExternalLink, Loader2, RefreshCw, Unplug } from "lucide-react";
import { useStore } from "../../store";
import { connectGoogle, disconnectGoogle, getGcalConfig, getGcalStatus, onGcalStatus, syncCalendar, type GcalStatus } from "../../lib/gcal";
import { formatDateTime } from "../../lib/dates";
import { useT, type TKey } from "../../i18n";

const STEPS: TKey[] = ["gcal.step1", "gcal.step2", "gcal.step3", "gcal.step4", "gcal.step5", "gcal.step6"];

/** Einstellungen → Google Kalender: Anleitung, Zugangsdaten, Verbinden/Trennen, Status. */
export function GoogleCalendarSettings() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [connected, setConnected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<GcalStatus>(getGcalStatus());
  const [guide, setGuide] = useState(false);

  useEffect(() => {
    getGcalConfig().then((c) => {
      setClientId(c.clientId);
      setSecret(c.clientSecret);
      setConnected(c.connected);
      setGuide(!c.connected);
      setLoaded(true);
    });
    const off = onGcalStatus(setStatus);
    return () => {
      off();
    };
  }, []);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await connectGoogle(clientId, secret);
      setConnected(true);
      setGuide(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return null;

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">{t("gcal.howTitle")}</p>
        <p>{t("gcal.howText")}</p>
      </div>

      {connected ? (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CalendarCheck className="size-4 text-success" /> {t("gcal.connected")}
          </div>
          <p className="text-xs text-muted-foreground">
            {status.state === "syncing"
              ? t("sync.syncing")
              : status.state === "error"
                ? `${t("sync.error")}: ${status.error}`
                : status.last
                  ? `${t("sync.last", { time: formatDateTime(status.last, lang) })} · ${t("gcal.count", { n: status.count ?? 0 })}`
                  : ""}
          </p>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => syncCalendar()} disabled={status.state === "syncing"}>
              <RefreshCw className={`size-3.5 ${status.state === "syncing" ? "animate-spin" : ""}`} /> {t("sync.now")}
            </button>
            <button className="btn-outline" onClick={() => openUrl("https://calendar.google.com")}>
              <ExternalLink className="size-3.5" /> {t("gcal.open")}
            </button>
            <button
              className="btn-danger ml-auto"
              onClick={async () => {
                await disconnectGoogle();
                setConnected(false);
              }}
            >
              <Unplug className="size-3.5" /> {t("gcal.disconnect")}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="label">{t("gcal.clientId")}</label>
            <input className="input font-mono text-xs" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="1234567890-abc….apps.googleusercontent.com" />
          </div>
          <div>
            <label className="label">{t("gcal.clientSecret")}</label>
            <input className="input font-mono text-xs" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="GOCSPX-…" />
          </div>
          <button className="btn-primary" disabled={busy || !clientId.trim() || !secret.trim()} onClick={connect}>
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            {busy ? t("gcal.waiting") : t("gcal.connect")}
          </button>
          {error && <p className="selectable text-xs text-destructive-foreground">{error}</p>}
        </div>
      )}

      <div className="rounded-lg border border-border">
        <button className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left text-sm font-medium" onClick={() => setGuide(!guide)}>
          <ChevronRight className={`size-4 text-muted-foreground transition-transform ${guide ? "rotate-90" : ""}`} />
          {t("gcal.guideTitle")}
        </button>
        {guide && (
          <ol className="selectable list-decimal space-y-2 px-4 pb-4 pl-9 text-[13px] text-muted-foreground marker:text-foreground">
            {STEPS.map((s) => (
              <li key={s} className="whitespace-pre-line">
                {t(s)}
              </li>
            ))}
            <li className="list-none pt-1">
              <button className="btn-outline h-7 text-xs" onClick={() => openUrl("https://console.cloud.google.com/")}>
                <ExternalLink className="size-3.5" /> Google Cloud Console
              </button>
            </li>
          </ol>
        )}
      </div>
    </div>
  );
}
