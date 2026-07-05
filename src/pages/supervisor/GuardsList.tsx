import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { Screen } from "@/components/Screen";
import {
  MapPin,
  Clock,
  ShieldCheck,
  Crosshair,
  Star,
  Phone,
  MessageCircle,
  Navigation,
  User as UserIcon,
  Battery,
  BatteryWarning,
  SignalHigh,
  SignalMedium,
  SignalLow,
  Plus,
  Users,
} from "lucide-react";
import brandLogo from "@/assets/brand-logo.png";
import { NavActions } from "@/components/shared/NavActions";
import { openAppMenu } from "@/components/shared/SideMenu";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { guardsService } from "@/lib/services";
import { fileUrlFromFile } from "@/lib/fileUrl";
import { openNativeNavigation } from "@/lib/navigate";
import { useAsync } from "@/lib/useAsync";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import fb from "@/lib/feedback";

/* ------------------------------------------------------------------ types */

type GuardStatus = "on_duty" | "off_duty" | "offline";

interface GuardVM {
  id: string;
  name: string;
  status: GuardStatus;
  stationName: string | null;
  shiftStartAt: string | null;
  lastUpdateAt: string | null;
  battery: number | null;
  rating: number | null;
  patrolProgress: number | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  avatarUrl: string | null;
}

type Filter = "all" | GuardStatus;

/* ------------------------------------------------------------ normalizers */

function toNum(v: any): number | null {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function normalize(rows: any): GuardVM[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((g: any): GuardVM => {
    const status: GuardStatus = ["on_duty", "off_duty", "offline"].includes(g?.status)
      ? g.status
      : "off_duty";
    return {
      id: String(g?.id ?? ""),
      name: g?.name || g?.fullName || "—",
      status,
      stationName: g?.stationName ?? g?.station?.stationName ?? null,
      shiftStartAt: g?.shiftStartAt ?? null,
      lastUpdateAt: g?.lastUpdateAt ?? null,
      battery: toNum(g?.battery),
      rating: toNum(g?.rating),
      patrolProgress: toNum(g?.patrolProgress),
      phone: g?.phone ?? null,
      lat: toNum(g?.lat),
      lng: toNum(g?.lng),
      avatarUrl: fileUrlFromFile(g?.avatar) ?? null,
    };
  });
}

/* --------------------------------------------------------------- format */

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

function ago(fromISO: string | null, nowMs: number, t: (k: string, d: string, o?: any) => string): string {
  if (!fromISO) return "—";
  const then = new Date(fromISO).getTime();
  if (!Number.isFinite(then)) return "—";
  const mins = Math.floor((nowMs - then) / 60000);
  if (mins <= 0) return t("guards.justNow", "Justo ahora");
  if (mins < 60) return t("guards.minAgo", "hace {{n}} min", { n: mins });
  const h = Math.floor(mins / 60);
  return t("guards.hAgo", "hace {{n}} h", { n: h });
}

/** Signal proxy from last-update recency (no live signal source yet). */
function signalOf(g: GuardVM, nowMs: number): { level: "high" | "medium" | "low" | null; label: string; tone: string } {
  if (g.status !== "on_duty" || !g.lastUpdateAt) return { level: null, label: "--", tone: "text-faint" };
  const mins = (nowMs - new Date(g.lastUpdateAt).getTime()) / 60000;
  if (mins < 2) return { level: "high", label: "High", tone: "text-online" };
  if (mins < 10) return { level: "medium", label: "Medium", tone: "text-gold" };
  return { level: "low", label: "Low", tone: "text-muted" };
}

/* ----------------------------------------------------------- status pill */

const STATUS_META: Record<GuardStatus, { key: string; def: string; text: string; ring: string; dot: string }> = {
  on_duty: { key: "guards.onDuty", def: "On Duty", text: "text-online", ring: "border-online/40", dot: "bg-online" },
  off_duty: { key: "guards.offDuty", def: "Off Duty", text: "text-muted", ring: "border-line-2", dot: "bg-low" },
  offline: { key: "guards.offline", def: "Offline", text: "text-critical", ring: "border-critical/40", dot: "bg-critical" },
};

/* ------------------------------------------------------------- avatar */

function GuardAvatar({ g, size = 56 }: { g: GuardVM; size?: number }) {
  const meta = STATUS_META[g.status];
  const initials = g.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <span
        className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-surface-2 text-sm font-bold text-muted ring-2 ring-line"
      >
        {g.avatarUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img src={g.avatarUrl} className="h-full w-full object-cover" />
        ) : (
          initials || <UserIcon size={size * 0.4} />
        )}
      </span>
      <span
        className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-surface ${meta.dot}`}
      />
    </span>
  );
}

/* -------------------------------------------------------------- metric */

function Metric({
  icon,
  label,
  value,
  bar,
  divider,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  bar?: number | null;
  divider?: boolean;
}) {
  return (
    <div className={`flex flex-1 items-start gap-2 ${divider ? "border-l border-line pl-3" : ""}`}>
      <span className="mt-0.5 shrink-0 text-gold">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] leading-tight text-muted">{label}</p>
        <p className="mt-0.5 truncate text-[13px] font-bold tabular-nums text-ink">{value}</p>
        {bar != null && (
          <div className="mt-1.5 h-1 w-14 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-gold" style={{ width: `${Math.max(0, Math.min(100, bar))}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- action btn */

function ActionBtn({
  icon,
  label,
  tone,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tone: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        fb.tap();
        onClick?.();
      }}
      className="pressable flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-2 py-3.5 text-[13px] font-semibold text-ink disabled:opacity-40"
    >
      <span className={tone}>{icon}</span>
      {label}
    </button>
  );
}

/* --------------------------------------------------------------- card */

function GuardCard({
  g,
  nowMs,
  onOpen,
}: {
  g: GuardVM;
  nowMs: number;
  onOpen: (g: GuardVM) => void;
}) {
  const { t } = useTranslation();
  const meta = STATUS_META[g.status];
  const sig = signalOf(g, nowMs);
  const batteryLow = g.battery != null && g.battery <= 20;
  const hasCoords = g.lat != null && g.lng != null;

  const SignalIcon =
    sig.level === "high" ? SignalHigh : sig.level === "medium" ? SignalMedium : SignalLow;

  return (
    <div className="card-elev overflow-hidden rounded-2xl">
      {/* header (tap → guard detail) */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          fb.tap();
          onOpen(g);
        }}
        className="pressable flex items-start gap-3 p-4"
      >
        <GuardAvatar g={g} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-bold leading-tight text-ink">{g.name}</p>
          <p className="mt-0.5 truncate text-[13px] text-muted">
            {t("guards.role", "Oficial de Seguridad")}
          </p>
          <div className="mt-1 flex items-center gap-1 text-[13px] text-ink/80">
            <MapPin size={13} className="shrink-0 text-gold" />
            <span className="truncate">{g.stationName || t("guards.noStation", "Sin puesto")}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${meta.ring} ${meta.text}`}
          >
            {t(meta.key, meta.def)}
          </span>
          <span className="flex items-center gap-1 text-[12px] font-semibold">
            {batteryLow ? (
              <BatteryWarning size={16} className="text-critical" />
            ) : (
              <Battery size={16} className={g.battery == null ? "text-faint" : "text-ink"} />
            )}
            <span className={g.battery == null ? "text-faint" : batteryLow ? "text-critical" : "text-ink"}>
              {g.battery == null ? "--" : `${g.battery}%`}
            </span>
          </span>
          <span className="flex items-center gap-1 text-[12px] font-semibold">
            <SignalIcon size={16} className={sig.tone} />
            <span className={sig.tone}>{sig.label}</span>
          </span>
        </div>
      </div>

      <div className="mx-4 border-t border-line" />

      {/* metrics */}
      <div className="flex items-stretch gap-3 px-4 py-3.5">
        <Metric
          icon={<Clock size={16} />}
          label={t("guards.shiftTime", "Tiempo turno")}
          value={elapsed(g.shiftStartAt, nowMs)}
        />
        <Metric
          divider
          icon={<ShieldCheck size={16} />}
          label={t("guards.patrol", "Ronda")}
          value={g.patrolProgress == null ? "—" : `${g.patrolProgress}%`}
          bar={g.patrolProgress}
        />
        <Metric
          divider
          icon={<Crosshair size={16} />}
          label={t("guards.lastUpdate", "Últ. reporte")}
          value={ago(g.lastUpdateAt, nowMs, t as any)}
        />
        <Metric
          divider
          icon={<Star size={16} />}
          label={t("guards.rating", "Rating")}
          value={g.rating == null ? "—" : g.rating.toFixed(1)}
        />
      </div>

      <div className="mx-4 border-t border-line" />

      {/* actions */}
      <div className="flex gap-2 p-3">
        <ActionBtn
          icon={<Phone size={16} />}
          tone="text-online"
          label={t("guards.call", "Llamar")}
          disabled={!g.phone}
          onClick={() => g.phone && window.open(`tel:${g.phone}`, "_system")}
        />
        <ActionBtn
          icon={<MessageCircle size={16} />}
          tone="text-info"
          label={t("guards.chat", "Chat")}
          disabled={!g.phone}
          onClick={() => g.phone && window.open(`sms:${g.phone}`, "_system")}
        />
        <ActionBtn
          icon={<Navigation size={16} />}
          tone="text-gold"
          label={t("guards.navigate", "Navegar")}
          disabled={!hasCoords}
          onClick={() => hasCoords && openNativeNavigation(g.lat as number, g.lng as number, g.name)}
        />
        <ActionBtn
          icon={<UserIcon size={16} />}
          tone="text-muted"
          label={t("guards.profile", "Perfil")}
          onClick={() => onOpen(g)}
        />
      </div>
    </div>
  );
}

/* ---------------------------------------------------- segmented filter */

interface SegOpt {
  value: Filter;
  label: string;
  count?: number;
}

/**
 * Native-style segmented control: a single sliding gold pill glides under the
 * active segment (iOS-like), rather than four separate underline tabs.
 */
function SegmentedFilter({
  options,
  value,
  onChange,
}: {
  options: SegOpt[];
  value: Filter;
  onChange: (v: Filter) => void;
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="relative flex rounded-xl bg-surface-2 p-1">
      {/* sliding indicator */}
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
            className={`relative z-10 flex min-h-11 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-lg py-3 text-[13px] font-semibold transition-colors duration-200 ${
              active ? "text-on-accent" : "text-muted"
            }`}
          >
            {o.label}
            {o.count != null && (
              <span
                className={`rounded-full px-1.5 text-[11px] font-bold tabular-nums ${
                  active ? "bg-black/15 text-on-accent" : "bg-surface text-ink"
                }`}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- screen */

export default function GuardsList() {
  const { t } = useTranslation();
  const history = useHistory();
  const [filter, setFilter] = useState<Filter>("all");
  const [nowMs, setNowMs] = useState(() => Date.now());

  // One shared 1s tick drives every card's shift timer + "x min ago".
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { data, reload } = useAsync(async () => {
    try {
      const res: any = await supervisorRoute.guards();
      const guards = normalize(res?.guards);
      const summary =
        res?.summary && typeof res.summary === "object"
          ? {
              all: Number(res.summary.all) || guards.length,
              onDuty: Number(res.summary.onDuty) || 0,
              offDuty: Number(res.summary.offDuty) || 0,
              offline: Number(res.summary.offline) || 0,
            }
          : summarize(guards);
      return { guards, summary };
    } catch {
      // Pre-deploy fallback: roster + active set, telemetry unknown.
      const [roster, active] = await Promise.all([
        guardsService.list({ limit: 500 }).catch(() => ({ rows: [] })),
        guardsService.activeLocations().catch(() => []),
      ]);
      const activeIds = new Set(
        (Array.isArray(active) ? active : []).map((a: any) => String(a.guardId ?? a.id)),
      );
      const guards = normalize(
        (roster?.rows || []).map((r: any) => ({
          id: r.id,
          name: r.fullName ?? r.name,
          status: activeIds.has(String(r.id)) ? "on_duty" : r.isOnDuty ? "offline" : "off_duty",
          stationName: r.stationName ?? r.station?.stationName ?? null,
          phone: r.guard?.phoneNumber ?? r.phone ?? null,
        })),
      );
      return { guards, summary: summarize(guards) };
    }
  }, []);
  // Live-refresh the guard roster when a guard clocks in/out.
  useLiveRefresh(reload, ["guard.check", "supervisor.check"]);

  const guards = data?.guards ?? [];
  const summary = data?.summary ?? { all: 0, onDuty: 0, offDuty: 0, offline: 0 };

  const shown = useMemo(
    () => (filter === "all" ? guards : guards.filter((g) => g.status === filter)),
    [guards, filter],
  );

  return (
    <Screen
      largeTitle={t("guards.title", "Vigilantes")}
      right={<NavActions />}
      onMenu={openAppMenu}
      avatar={<img src={brandLogo} alt="" className="h-7 w-7 rounded-lg object-contain" />}
      root
      flush
      onRefresh={reload}
    >
        {/* Segmented filter (native multiswitch) */}
        <div className="sticky top-14 z-20 bg-background/95 px-4 pb-2 pt-1 backdrop-blur">
          <SegmentedFilter
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: t("guards.tabAll", "Todos") },
              { value: "on_duty", label: t("guards.tabOnDuty", "Servicio"), count: summary.onDuty },
              { value: "off_duty", label: t("guards.tabOffDuty", "Fuera"), count: summary.offDuty },
              { value: "offline", label: t("guards.tabOffline", "Offline"), count: summary.offline },
            ]}
          />
        </div>

        {/* Cards */}
        <div className="stagger space-y-4 px-4 pb-28 pt-4">
          {shown.length === 0 ? (
            <div className="mt-16 flex flex-col items-center gap-2 text-center">
              <Users size={30} className="text-faint" />
              <p className="text-sm text-muted">{t("guards.empty", "No hay vigilantes que mostrar")}</p>
            </div>
          ) : (
            shown.map((g) => (
              <GuardCard
                key={g.id}
                g={g}
                nowMs={nowMs}
                onOpen={(gg) => history.push(`/supervisor/guards/${gg.id}`)}
              />
            ))
          )}
        </div>

        {/* FAB */}
        <button
          type="button"
          aria-label={t("guards.quickActions", "Acciones")}
          onClick={() => {
            fb.press();
            reload();
          }}
          className="pressable fixed bottom-24 right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-gold text-on-accent shadow-lg shadow-black/30"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <Plus size={26} />
        </button>
    </Screen>
  );
}

/* --------------------------------------------------------------- helpers */

function summarize(guards: GuardVM[]) {
  return {
    all: guards.length,
    onDuty: guards.filter((g) => g.status === "on_duty").length,
    offDuty: guards.filter((g) => g.status === "off_duty").length,
    offline: guards.filter((g) => g.status === "offline").length,
  };
}
