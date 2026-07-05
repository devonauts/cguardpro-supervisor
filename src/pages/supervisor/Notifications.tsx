import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import {
  Settings, SlidersHorizontal, MoreHorizontal, ChevronRight,
  AlertOctagon, Clock, MapPinOff, UserRound, CheckCircle2, ClipboardList,
  ShieldAlert, ShieldCheck, TrendingUp, LogOut, Bell,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { ErrorState, SkeletonList } from "@/components/ui";
import { useNotifications, type AppNotification } from "@/context/NotificationContext";
import { routeForNotification } from "@/components/NotificationCenter";
import { useAuth } from "@/context/AuthContext";
import fb from "@/lib/feedback";
import styles from "./Notifications.module.css";

type Cat = "all" | "alerts" | "sos" | "system";

function categoryOf(type: string): Exclude<Cat, "all"> {
  const t = (type || "").toLowerCase();
  if (t.includes("panic") || t.includes("sos")) return "sos";
  if (t.includes("late") || t.includes("missed") || t.includes("no_show") || t.includes("incident") ||
      t.includes("escalat") || t.includes("radio") || t.includes("geofence") || t.includes("mismatch")) return "alerts";
  return "system";
}

/** eventType → icon + accent color + priority. */
function meta(type: string): { Icon: any; color: string; prio: "high" | "medium" | "low" } {
  const t = (type || "").toLowerCase();
  const has = (...k: string[]) => k.some((x) => t.includes(x));
  if (has("panic", "sos")) return { Icon: AlertOctagon, color: "#ef4444", prio: "high" };
  if (has("missed", "no_show", "checkpoint")) return { Icon: MapPinOff, color: "#ef4444", prio: "high" };
  if (has("escalat")) return { Icon: TrendingUp, color: "#ef4444", prio: "high" };
  if (has("late", "attendance.late")) return { Icon: Clock, color: "#f59e0b", prio: "medium" };
  if (has("visitor")) return { Icon: UserRound, color: "#3b82f6", prio: "low" };
  if (has("task.completed")) return { Icon: CheckCircle2, color: "#22c55e", prio: "low" };
  if (has("task")) return { Icon: ClipboardList, color: "#f59e0b", prio: "low" };
  if (has("inspection")) return { Icon: ShieldCheck, color: "#8b5cf6", prio: "low" };
  if (has("incident")) return { Icon: ShieldAlert, color: "#8b5cf6", prio: "low" };
  if (has("checkin", "route.started", "shift")) return { Icon: ShieldCheck, color: "#3b82f6", prio: "low" };
  if (has("checkout", "route.finished")) return { Icon: LogOut, color: "#6b7280", prio: "low" };
  return { Icon: Bell, color: "#9aa3af", prio: "low" };
}

function dayKey(iso: string, t: any): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t("notif.earlier", "Anterior");
  const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return t("notif.today", "Hoy");
  if (same(d, y)) return t("notif.yesterday", "Ayer");
  return d.toLocaleDateString([], { day: "numeric", month: "long" });
}
function fmtTime(iso: string, key: string, t: any): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return key === t("notif.today", "Hoy") ? time : `${key}, ${time}`;
}

function locationOf(n: AppNotification): string | null {
  const d = n.data || {};
  return d.stationName || d.siteName || d.location || d.postSiteName || null;
}

export default function Notifications() {
  const { t } = useTranslation();
  const history = useHistory();
  const { role } = useAuth();
  const { items, loading, error, refresh, markRead, markAllRead } = useNotifications();
  const [cat, setCat] = useState<Cat>("all");

  const counts = useMemo(() => {
    const c = { all: items.length, alerts: 0, sos: 0, system: 0 };
    items.forEach((n) => { c[categoryOf(n.type)]++; });
    return c;
  }, [items]);

  const shown = useMemo(
    () => (cat === "all" ? items : items.filter((n) => categoryOf(n.type) === cat)),
    [items, cat],
  );

  // Group by day (preserving the newest-first order from the feed).
  const groups = useMemo(() => {
    const out: { label: string; items: AppNotification[] }[] = [];
    shown.forEach((n) => {
      const label = dayKey(n.createdAt, t);
      const g = out[out.length - 1];
      if (g && g.label === label) g.items.push(n);
      else out.push({ label, items: [n] });
    });
    return out;
  }, [shown, t]);

  const open = (n: AppNotification) => {
    fb.tap();
    if (!n.read) markRead(n.id).catch(() => {});
    const route = routeForNotification(n as any, role as any);
    if (route) history.push(route);
  };

  const TABS: [Cat, string, number, string][] = [
    ["all", t("notif.all", "Todas"), counts.all, "#d4a017"],
    ["alerts", t("notif.alerts", "Alertas"), counts.alerts, "#ef4444"],
    ["sos", "SOS", counts.sos, "#ef4444"],
    ["system", t("notif.system", "Sistema"), counts.system, "#6b7280"],
  ];

  const right = (
    <div className="flex items-center gap-0.5">
      <button type="button" aria-label={t("notif.markAll", "Marcar todo")} onClick={() => { fb.tap(); markAllRead(); }} className="pressable grid h-11 w-11 place-items-center rounded-full text-ink active:bg-surface-2"><Settings size={20} /></button>
      <button type="button" aria-label={t("guards.filters", "Filtros")} onClick={() => fb.tap()} className="pressable grid h-11 w-11 place-items-center rounded-full text-ink active:bg-surface-2"><SlidersHorizontal size={20} /></button>
      <button type="button" aria-label={t("guards.more", "Más")} onClick={() => fb.tap()} className="pressable grid h-11 w-11 place-items-center rounded-full text-ink active:bg-surface-2"><MoreHorizontal size={20} /></button>
    </div>
  );

  return (
    <Screen largeTitle={t("notif.title", "Notificaciones")} right={right} back flush onRefresh={refresh}>
        {/* Tabs */}
        <div className={`${styles.tabs} mt-1`}>
          {TABS.map(([key, label, count, color]) => (
            <button key={key} type="button" onClick={() => { fb.select(); setCat(key); }} className={`${styles.tab} ${cat === key ? styles.tabActive : ""}`}>
              {label}
              <span className={styles.tabBadge} style={{ background: cat === key ? color : "var(--surface-2)", color: cat === key ? "#fff" : "var(--muted)" }}>{count}</span>
            </button>
          ))}
        </div>

        {loading && items.length === 0 ? (
          <div className="px-4 pt-4"><SkeletonList rows={6} /></div>
        ) : error && items.length === 0 ? (
          <div className="px-4 pt-8"><ErrorState onRetry={refresh} /></div>
        ) : shown.length === 0 ? (
          <div className="mt-20 flex flex-col items-center gap-2 text-center">
            <Bell size={30} className="text-faint" />
            <p className="text-sm text-muted">{t("notif.empty", "No hay notificaciones")}</p>
          </div>
        ) : (
          <div className="px-4 pb-28">
            {groups.map((g) => (
              <div key={g.label}>
                <p className={styles.dayLabel}>{g.label}</p>
                <div className="space-y-3 stagger">
                  {g.items.map((n) => {
                    const m = meta(n.type);
                    const loc = locationOf(n);
                    const prioColor = m.prio === "high" ? "#ef4444" : m.prio === "medium" ? "#f59e0b" : m.color;
                    const prioLabel = m.prio === "high" ? t("notif.high", "Alta") : m.prio === "medium" ? t("notif.medium", "Media") : t("notif.low", "Baja");
                    return (
                      <button key={n.id} type="button" onClick={() => open(n)} className={styles.card}>
                        <span className={styles.unreadDot} style={{ background: n.read ? "transparent" : m.color }} />
                        <span className={styles.iconWrap} style={{ background: `${m.color}22`, border: `1px solid ${m.color}55`, color: m.color }}>
                          <m.Icon size={22} />
                        </span>
                        <div className={styles.body}>
                          <p className={styles.title}>{n.title}</p>
                          {n.body && <p className={styles.text}>{n.body}</p>}
                          {loc && <p className={styles.loc}>{loc}</p>}
                          <p className={styles.time}>{fmtTime(n.createdAt, g.label, t)}</p>
                        </div>
                        <div className={styles.side}>
                          <span className={styles.prio} style={{ color: prioColor, background: `${prioColor}22` }}>{prioLabel}</span>
                          <ChevronRight size={18} className="text-muted" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
    </Screen>
  );
}
