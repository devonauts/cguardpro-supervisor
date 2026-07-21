import i18n from "@/i18n";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { useIonToast } from "@ionic/react";
import {
  MessageSquare,
  Phone,
  MoreVertical,
  MapPin,
  Clock,
  Battery,
  BatteryWarning,
  SignalHigh,
  SignalMedium,
  SignalLow,
  Gauge,
  Navigation,
  MessageCircle,
  AlertOctagon,
  ClipboardCheck,
  FileText,
  Video,
  MoreHorizontal,
  Flag,
  CheckCircle2,
  User as UserIcon,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { Skeleton, ErrorState } from "@/components/ui";
import { PatrolMap, type Checkpoint } from "@/components/PatrolMap";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { fileUrlFromFile } from "@/lib/fileUrl";
import { openNativeNavigation } from "@/lib/navigate";
import { useAsync } from "@/lib/useAsync";
import fb from "@/lib/feedback";

/* --------------------------------------------------------------- format */

function toNum(v: any): number | null {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function elapsed(fromISO: string | null, nowMs: number): string {
  if (!fromISO) return "--:--:--";
  const start = new Date(fromISO).getTime();
  if (!Number.isFinite(start)) return "--:--:--";
  let s = Math.max(0, Math.floor((nowMs - start) / 1000));
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function clockTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(i18n.language?.startsWith("en") ? "en-US" : "es-ES", { hour: "numeric", minute: "2-digit" });
}

function ago(iso: string | null, nowMs: number, t: any): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const mins = Math.floor((nowMs - then) / 60000);
  if (mins <= 0) return t("guards.justNow", "Justo ahora");
  if (mins < 60) return t("guards.minAgo", "hace {{n}} min", { n: mins });
  return t("guards.hAgo", "hace {{n}} h", { n: Math.floor(mins / 60) });
}

function distanceLabel(m: number | null): string {
  if (m == null) return "—";
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

/* GPS-signal proxy from last-update recency (no live signal source yet). */
function gpsSignal(lastUpdateAt: string | null, status: string, nowMs: number) {
  if (status !== "on_duty" || !lastUpdateAt)
    return { Icon: SignalLow, tone: "text-faint", key: "guardDetail.gpsNone", def: "Sin GPS" };
  const mins = (nowMs - new Date(lastUpdateAt).getTime()) / 60000;
  if (mins < 2) return { Icon: SignalHigh, tone: "text-online", key: "guardDetail.gpsStrong", def: "GPS fuerte" };
  if (mins < 10) return { Icon: SignalMedium, tone: "text-gold", key: "guardDetail.gpsFair", def: "GPS medio" };
  return { Icon: SignalLow, tone: "text-muted", key: "guardDetail.gpsWeak", def: "GPS débil" };
}

/* --------------------------------------------------------------- ring */

function ProgressRing({ pct, size = 48 }: { pct: number; size?: number }) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--online)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        style={{ transition: "stroke-dashoffset 600ms ease" }}
      />
    </svg>
  );
}

/* --------------------------------------------------------------- pieces */

function StatusPill({ status, t }: { status: string; t: any }) {
  const meta: Record<string, { def: string; key: string; text: string; ring: string }> = {
    on_duty: { def: "On Duty", key: "guards.onDuty", text: "text-online", ring: "border-online/40" },
    off_duty: { def: "Off Duty", key: "guards.offDuty", text: "text-muted", ring: "border-line-2" },
    offline: { def: "Offline", key: "guards.offline", text: "text-critical", ring: "border-critical/40" },
  };
  const m = meta[status] || meta.off_duty;
  return (
    <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-[12px] font-bold ${m.ring} ${m.text}`}>
      {t(m.key, m.def)}
    </span>
  );
}

function TeleRow({ icon, tone, children }: { icon: React.ReactNode; tone?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-1.5 text-[13px] font-semibold">
      <span className={tone || "text-muted"}>{icon}</span>
      <span className="text-ink">{children}</span>
    </div>
  );
}

function MetricCol({
  icon,
  label,
  value,
  sub,
  subTone,
  ring,
  divider,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  subTone?: string;
  ring?: React.ReactNode;
  divider?: boolean;
}) {
  return (
    <div className={`flex flex-1 flex-col gap-1 ${divider ? "border-l border-line pl-3" : ""}`}>
      <div className="flex items-center gap-1 text-muted">
        {icon}
        <span className="truncate text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {ring}
        <div className="min-w-0">
          <p className="truncate text-[17px] font-bold tabular-nums text-ink">{value}</p>
          {sub != null && <p className={`truncate text-[11px] ${subTone || "text-muted"}`}>{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function ActionTile({
  icon,
  label,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tone: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        fb.tap();
        onClick?.();
      }}
      className="pressable flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-surface py-4"
    >
      <span className={tone}>{icon}</span>
      <span className="text-[12px] font-semibold text-ink">{label}</span>
    </button>
  );
}

/* --------------------------------------------------------------- avatar */

function DetailAvatar({ name, url, status, size = 72 }: { name: string; url: string | null; status: string; size?: number }) {
  const dot = status === "on_duty" ? "bg-online" : status === "offline" ? "bg-critical" : "bg-low";
  const initials = name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <span className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-surface-2 text-base font-bold text-muted ring-2 ring-line">
        {url ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img src={url} className="h-full w-full object-cover" decoding="async" loading="lazy" />
        ) : (
          initials || <UserIcon size={size * 0.4} />
        )}
      </span>
      <span className={`absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full border-2 border-surface ${dot}`} />
    </span>
  );
}

/* -------------------------------------------------------------- timeline */

const TL_META: Record<string, { tone: string; icon: React.ReactNode }> = {
  checkpoint: { tone: "bg-online text-white", icon: <CheckCircle2 size={16} /> },
  patrol_started: { tone: "bg-info text-white", icon: <MapPin size={16} /> },
  task: { tone: "bg-route text-white", icon: <ClipboardCheck size={16} /> },
};

function TimelineItem({
  item,
  last,
  t,
}: {
  item: any;
  last: boolean;
  t: any;
}) {
  const meta = TL_META[item.type] || TL_META.task;
  const title =
    item.title === "checkpointScanned"
      ? t("guardDetail.checkpointScanned", "Punto escaneado")
      : item.title === "patrolStarted"
      ? t("guardDetail.patrolStarted", "Ronda iniciada")
      : item.title;
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${meta.tone}`}>{meta.icon}</span>
        {!last && <span className="my-1 w-px flex-1 bg-line" />}
      </div>
      <div className="min-w-0 flex-1 pb-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[15px] font-bold text-ink">{title}</p>
          <span className="shrink-0 text-[12px] text-muted">{clockTime(item.at)}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          {item.subtitle && <p className="truncate text-[13px] text-muted">{item.subtitle}</p>}
          {item.method && (
            <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted">
              {item.method}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------- segmented tabs */

type Tab = "activity" | "tasks" | "reports";

/** Native-style segmented multiswitch with a sliding gold pill. */
function SegTabs({
  options,
  value,
  onChange,
}: {
  options: { value: Tab; label: string }[];
  value: Tab;
  onChange: (v: Tab) => void;
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="relative flex rounded-xl bg-surface-2 p-1">
      <span
        aria-hidden
        className="absolute bottom-1 left-1 top-1 rounded-lg bg-gold shadow-sm"
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${idx * 100}%)`,
          transition: "transform 280ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => {
              fb.select();
              onChange(o.value);
            }}
            className={`relative z-10 flex min-h-12 flex-1 items-center justify-center whitespace-nowrap rounded-lg py-3 text-[13px] font-semibold transition-colors duration-200 ${
              active ? "text-on-accent" : "text-muted"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- screen */

export default function GuardDetail() {
  const { t } = useTranslation();
  const { guardId } = useParams<{ guardId: string }>();
  const [present] = useIonToast();
  const [tab, setTab] = useState<Tab>("activity");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { data, loading, error, reload } = useAsync(
    async () => supervisorRoute.guardDetail(guardId).then((r: any) => r?.guard ?? r),
    [guardId],
  );

  const soon = () =>
    present({ message: t("guardDetail.soon", "Próximamente"), duration: 1400, position: "bottom" });

  const g = data;
  const avatarUrl = g ? fileUrlFromFile(g.avatar) : null;

  // Stable identity for the map's guard marker so the 1-second telemetry clock
  // (which re-renders this screen every tick) doesn't re-render the map.
  const gLat = toNum(g?.lat);
  const gLng = toNum(g?.lng);
  const mapGuard = useMemo(
    () => (gLat != null && gLng != null ? { lat: gLat, lng: gLng, name: g?.name, avatarUrl } : null),
    [gLat, gLng, g?.name, avatarUrl],
  );

  const mapPoints: Checkpoint[] = useMemo(() => {
    const cps: any[] = Array.isArray(g?.checkpoints) ? g.checkpoints : [];
    let markedNext = false;
    return cps
      .filter((c) => toNum(c.lat) != null && toNum(c.lng) != null)
      .map((c) => {
        let status: Checkpoint["status"] = c.scanned ? "done" : "pending";
        if (!c.scanned && !markedNext) {
          status = "next";
          markedNext = true;
        }
        return {
          lat: toNum(c.lat) as number,
          lng: toNum(c.lng) as number,
          name: c.name,
          status,
        };
      });
  }, [g]);

  const right = g && (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        aria-label={t("guards.chat", "Chat")}
        onClick={() => g.phone && window.open(`sms:${g.phone}`, "_system")}
        className="pressable relative grid h-11 w-11 place-items-center rounded-full text-ink active:bg-surface-2"
      >
        <MessageSquare size={20} />
        {!!g.tasksCount && g.tasksCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-[16px] place-items-center rounded-full bg-critical px-1 text-[10px] font-bold leading-4 text-white">
            {g.tasksCount > 9 ? "9+" : g.tasksCount}
          </span>
        )}
      </button>
      <button
        type="button"
        aria-label={t("guards.call", "Llamar")}
        onClick={() => g.phone && window.open(`tel:${g.phone}`, "_system")}
        className="pressable grid h-11 w-11 place-items-center rounded-full text-ink active:bg-surface-2"
      >
        <Phone size={20} />
      </button>
      <button
        type="button"
        aria-label={t("guards.more", "Más")}
        onClick={soon}
        className="pressable grid h-11 w-11 place-items-center rounded-full text-ink active:bg-surface-2"
      >
        <MoreVertical size={20} />
      </button>
    </div>
  );

  if (loading && !data) {
    return (
      <Screen title={t("guardDetail.title", "Detalle del vigilante")}>
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="mt-4 h-56 w-full rounded-2xl" />
      </Screen>
    );
  }
  if ((error && !data) || !g) {
    return (
      <Screen title={t("guardDetail.title", "Detalle del vigilante")} onRefresh={reload}>
        <ErrorState onRetry={reload} />
      </Screen>
    );
  }

  const shiftWindow =
    g.scheduledStart && g.scheduledEnd
      ? `${clockTime(g.scheduledStart)} – ${clockTime(g.scheduledEnd)}`
      : null;
  const batteryLow = g.battery != null && g.battery <= 20;
  const sig = gpsSignal(g.lastUpdateAt, g.status, nowMs);
  const prog = g.progress || { done: 0, total: 0, pct: 0 };
  const hasCoords = toNum(g.lat) != null && toNum(g.lng) != null;
  const activity: any[] = Array.isArray(g.activity) ? g.activity : [];

  return (
    <Screen title={t("guardDetail.title", "Detalle del vigilante")} right={right} onRefresh={reload}>
      {/* Profile + patrol card */}
      <div className="card-elev overflow-hidden rounded-2xl">
        <div className="flex items-start gap-3 p-4">
          <DetailAvatar name={g.name} url={avatarUrl} status={g.status} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[20px] font-bold leading-tight text-ink">{g.name}</p>
            <p className="mt-0.5 text-[13px] text-muted">{t("guards.role", "Oficial de Seguridad")}</p>
            <div className="mt-1.5">
              <StatusPill status={g.status} t={t} />
            </div>
            <div className="mt-2 flex items-center gap-1 text-[13px] text-ink/85">
              <MapPin size={14} className="shrink-0 text-gold" />
              <span className="truncate">{g.stationName || t("guards.noStation", "Sin puesto")}</span>
            </div>
            {shiftWindow && (
              <p className="mt-0.5 text-[12px] text-muted">
                {t("guardDetail.shift", "Turno")}: {shiftWindow}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-1.5">
            <TeleRow icon={batteryLow ? <BatteryWarning size={16} className="text-critical" /> : <Battery size={16} className={g.battery == null ? "text-faint" : "text-ink"} />}>
              {g.battery == null ? "--" : `${g.battery}%`}
            </TeleRow>
            <TeleRow icon={<sig.Icon size={16} className={sig.tone} />}>{t(sig.key, sig.def)}</TeleRow>
            <TeleRow icon={<Gauge size={16} className="text-muted" />}>
              {g.speed == null ? "—" : `${Math.max(0, Math.round(toNum(g.speed) as number * 3.6))} km/h`}
            </TeleRow>
            <TeleRow icon={<Clock size={16} className="text-muted" />}>{ago(g.lastUpdateAt, nowMs, t)}</TeleRow>
          </div>
        </div>

        <div className="mx-4 border-t border-line" />

        {/* Patrol metrics strip */}
        <div className="flex items-stretch gap-3 px-4 py-4">
          <MetricCol
            icon={<Flag size={12} />}
            label={t("guardDetail.patrolProgress", "Progreso ronda")}
            ring={<ProgressRing pct={prog.pct} />}
            value={`${prog.pct}%`}
            sub={t("guardDetail.checkpointsCount", "{{d}} / {{tot}} puntos", { d: prog.done, tot: prog.total })}
          />
          <MetricCol
            divider
            icon={<Clock size={12} />}
            label={t("guards.shiftTime", "Tiempo turno")}
            value={elapsed(g.shiftStartAt, nowMs)}
            sub={g.shiftStartAt ? `${t("guardDetail.started", "Inició")} ${clockTime(g.shiftStartAt)}` : undefined}
          />
          <MetricCol
            divider
            icon={<MapPin size={12} />}
            label={t("guardDetail.lastCheckpoint", "Último punto")}
            value={<span className="text-[15px]">{g.lastCheckpoint?.name || "—"}</span>}
            sub={g.lastCheckpoint?.at ? ago(g.lastCheckpoint.at, nowMs, t) : undefined}
            subTone="text-online"
          />
          <MetricCol
            divider
            icon={<Navigation size={12} />}
            label={t("guardDetail.nextCheckpoint", "Próximo punto")}
            value={<span className="text-[15px]">{g.nextCheckpoint?.name || "—"}</span>}
            sub={g.nextCheckpoint ? distanceLabel(g.nextCheckpoint.distanceM) : undefined}
            subTone="text-info"
          />
        </div>
      </div>

      {/* Map */}
      <div className="mt-4">
        <PatrolMap checkpoints={mapPoints} guard={mapGuard} height={220} />
      </div>

      {/* Action grid */}
      <div className="mt-4 grid grid-cols-4 gap-2.5">
        <ActionTile icon={<Phone size={20} />} tone="text-online" label={t("guards.call", "Llamar")} onClick={() => g.phone && window.open(`tel:${g.phone}`, "_system")} />
        <ActionTile icon={<MessageCircle size={20} />} tone="text-info" label={t("guardDetail.message", "Mensaje")} onClick={() => g.phone && window.open(`sms:${g.phone}`, "_system")} />
        <ActionTile icon={<Navigation size={20} />} tone="text-gold" label={t("guards.navigate", "Navegar")} onClick={() => hasCoords && openNativeNavigation(toNum(g.lat) as number, toNum(g.lng) as number, g.name)} />
        <ActionTile icon={<AlertOctagon size={20} />} tone="text-critical" label={t("guardDetail.panic", "Pánico")} onClick={soon} />
        <ActionTile icon={<ClipboardCheck size={20} />} tone="text-route" label={t("guardDetail.assignTask", "Asignar tarea")} onClick={soon} />
        <ActionTile icon={<FileText size={20} />} tone="text-gold" label={t("guardDetail.requestReport", "Pedir reporte")} onClick={soon} />
        <ActionTile icon={<Video size={20} />} tone="text-info" label={t("guardDetail.videoCall", "Videollamada")} onClick={soon} />
        <ActionTile icon={<MoreHorizontal size={20} />} tone="text-muted" label={t("guards.more", "Más")} onClick={soon} />
      </div>

      {/* Tabs (native multiswitch) */}
      <div className="mt-5">
        <SegTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "activity", label: t("guardDetail.tabActivity", "Actividad") },
            { value: "tasks", label: `${t("guardDetail.tasks", "Tareas")} (${g.tasksCount || 0})` },
            { value: "reports", label: `${t("guardDetail.reports", "Reportes")} (${g.reportsCount || 0})` },
          ]}
        />
      </div>

      {/* Tab content */}
      <div className="pt-4">
        {tab === "activity" &&
          (activity.length ? (
            <div>
              {activity.map((it, i) => (
                <TimelineItem key={i} item={it} last={i === activity.length - 1} t={t} />
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted">
              {t("guardDetail.noActivity", "Sin actividad reciente")}
            </p>
          ))}
        {tab === "tasks" && (
          <p className="py-8 text-center text-sm text-muted">
            {g.tasksCount
              ? t("guardDetail.tasksSummary", "{{n}} tareas en su puesto", { n: g.tasksCount })
              : t("guardDetail.noTasks", "Sin tareas")}
          </p>
        )}
        {tab === "reports" && (
          <p className="py-8 text-center text-sm text-muted">
            {g.reportsCount
              ? t("guardDetail.reportsSummary", "{{n}} reportes generados", { n: g.reportsCount })
              : t("guardDetail.noReports", "Sin reportes")}
          </p>
        )}
      </div>
    </Screen>
  );
}
