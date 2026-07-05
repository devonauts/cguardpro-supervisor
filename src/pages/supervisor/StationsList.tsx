import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { Screen } from "@/components/Screen";
import {
  Building2,
  ShieldCheck,
  AlertTriangle,
  Circle,
  MapPin,
  Car,
  ShieldAlert,
  ClipboardList,
  ChevronRight,
  LayoutGrid,
  List as ListIcon,
  ArrowUpDown,
  User as UserIcon,
} from "lucide-react";
import brandLogo from "@/assets/brand-logo.png";
import { NavActions } from "@/components/shared/NavActions";
import { openAppMenu } from "@/components/shared/SideMenu";
import styles from "./StationsList.module.css";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { stationService } from "@/lib/services";
import { fileUrlFromFile } from "@/lib/fileUrl";
import { distanceMeters, getCurrentPosition } from "@/lib/geo";
import { useAsync } from "@/lib/useAsync";
import fb from "@/lib/feedback";

/* ------------------------------------------------------------------ types */

type StationStatus = "active" | "attention" | "offline";
type Filter = "all" | StationStatus;
type SortKey = "az" | "za" | "status";

interface GuardMini {
  id: string;
  name: string;
  avatarUrl: string | null;
}
interface StationVM {
  id: string;
  name: string;
  address: string | null;
  logoUrl: string | null;
  status: StationStatus;
  lat: number | null;
  lng: number | null;
  guards: GuardMini[];
  guardsTotal: number;
  incidentsToday: number;
  tasksPending: number;
}

/* ------------------------------------------------------------ normalizers */

function toNum(v: any): number | null {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function normalize(rows: any): StationVM[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((s: any): StationVM => {
    const status: StationStatus = ["active", "attention", "offline"].includes(s?.status)
      ? s.status
      : "offline";
    const guards: GuardMini[] = Array.isArray(s?.guards)
      ? s.guards.map((g: any) => ({
          id: String(g?.id ?? ""),
          name: g?.name || "—",
          avatarUrl: g?.avatarUrl || fileUrlFromFile(g?.avatar) || null,
        }))
      : [];
    return {
      id: String(s?.id ?? ""),
      name: s?.name || s?.stationName || "—",
      address: s?.address ?? null,
      logoUrl: fileUrlFromFile(s?.logo) ?? null,
      status,
      lat: toNum(s?.lat ?? s?.latitud),
      lng: toNum(s?.lng ?? s?.longitud),
      guards,
      guardsTotal: Number(s?.guardsTotal) || guards.length,
      incidentsToday: Number(s?.incidentsToday) || 0,
      tasksPending: Number(s?.tasksPending) || 0,
    };
  });
}

/* --------------------------------------------------------- ETA (client) */

/** Rough driving ETA from the supervisor's location to a station (~28 km/h). */
function etaMin(me: [number, number] | null, s: StationVM): number | null {
  if (!me || s.lat == null || s.lng == null) return null;
  const m = distanceMeters(me[0], me[1], s.lat, s.lng);
  const min = Math.round((m / 1000 / 28) * 60);
  return Math.max(1, min);
}

/* --------------------------------------------------------------- status */

const STATUS_META: Record<StationStatus, { key: string; def: string; text: string; ring: string; dot: string }> = {
  active: { key: "stations.active", def: "Active", text: "text-online", ring: "border-online/40", dot: "bg-online" },
  attention: { key: "stations.attention", def: "Attention", text: "text-gold", ring: "border-gold/40", dot: "bg-gold" },
  offline: { key: "stations.offline", def: "Offline", text: "text-muted", ring: "border-line-2", dot: "bg-low" },
};

/* --------------------------------------------------------------- pieces */

function Logo({ url, name, size = 68 }: { url: string | null; name: string; size?: number }) {
  const initials = name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-2xl border border-line bg-white"
      style={{ width: size, height: size }}
    >
      {url ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <img src={url} className="h-full w-full object-contain p-1.5" />
      ) : (
        <span className="text-sm font-bold text-slate-400">{initials || <Building2 size={22} />}</span>
      )}
    </span>
  );
}

function StatusPill({ status }: { status: StationStatus }) {
  const { t } = useTranslation();
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-bold ${m.ring} ${m.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {t(m.key, m.def)}
    </span>
  );
}

function AvatarStack({ guards, total }: { guards: GuardMini[]; total: number }) {
  const show = guards.slice(0, 3);
  const extra = total - show.length;
  if (total === 0) return <span className="text-[15px] font-semibold text-muted">—</span>;
  return (
    <div className="flex items-center">
      {show.map((g, i) => (
        <span
          key={g.id || i}
          className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-surface-2 text-[10px] font-bold text-muted ring-2 ring-surface"
          style={{ marginLeft: i === 0 ? 0 : -10, zIndex: 10 - i }}
        >
          {g.avatarUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <img src={g.avatarUrl} className="h-full w-full object-cover" />
          ) : (
            g.name.slice(0, 1).toUpperCase() || <UserIcon size={14} />
          )}
        </span>
      ))}
      {extra > 0 && (
        <span
          className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-[11px] font-bold text-ink ring-2 ring-surface"
          style={{ marginLeft: -10 }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

function StatCard({
  icon,
  tint,
  label,
  value,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  tint: string;
  label: string;
  value: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        fb.select();
        onClick();
      }}
      className={styles.statCard}
      style={{ borderColor: active ? tint : "var(--line)" }}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `${tint}1f`, color: tint }}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium" style={{ color: active ? tint : "var(--muted)" }}>
          {label}
        </p>
        <p className="text-[22px] font-extrabold leading-none tabular-nums" style={{ color: active ? tint : "var(--ink)" }}>
          {value}
        </p>
      </div>
    </button>
  );
}

/* --------------------------------------------------------------- card */

function StationCard({ s, me, onOpen }: { s: StationVM; me: [number, number] | null; onOpen: () => void }) {
  const { t } = useTranslation();
  const eta = etaMin(me, s);
  return (
    <button
      type="button"
      onClick={() => {
        fb.tap();
        onOpen();
      }}
      className="card-elev block w-full overflow-hidden rounded-2xl text-left"
    >
      <div className="flex items-start gap-3 p-4">
        <Logo url={s.logoUrl} name={s.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-bold leading-tight text-ink">{s.name}</p>
          <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">
            {s.address || t("stations.noAddress", "Sin dirección")}
          </p>
          <div className="mt-1.5">
            <StatusPill status={s.status} />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="text-right">
            <p className="text-[11px] text-muted">{t("stations.guards", "Vigilantes")}</p>
            <div className="mt-1 flex justify-end">
              <AvatarStack guards={s.guards} total={s.guardsTotal} />
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted">{t("stations.eta", "ETA supervisor")}</p>
            <p className="mt-0.5 flex items-center justify-end gap-1 text-[14px] font-bold text-info">
              <Car size={15} />
              {eta == null ? "—" : t("stations.minShort", "{{n}} min", { n: eta })}
            </p>
          </div>
        </div>
        <ChevronRight size={18} className="mt-1 shrink-0 text-faint" />
      </div>

      <div className="mx-4 border-t border-line" />

      <div className="flex items-center gap-4 px-4 py-3">
        <div className="flex flex-1 items-center gap-2">
          <ShieldAlert size={16} className={s.incidentsToday > 0 ? "text-critical" : "text-online"} />
          <span className="text-[12px] text-muted">{t("stations.incidentsToday", "Incidentes hoy")}</span>
          <span className={`ml-auto text-[15px] font-bold tabular-nums ${s.incidentsToday > 0 ? "text-critical" : "text-online"}`}>
            {s.incidentsToday}
          </span>
        </div>
        <div className="h-6 w-px bg-line" />
        <div className="flex flex-1 items-center gap-2">
          <ClipboardList size={16} className={s.tasksPending > 0 ? "text-gold" : "text-muted"} />
          <span className="text-[12px] text-muted">{t("stations.tasksPending", "Tareas pend.")}</span>
          <span className={`ml-auto text-[15px] font-bold tabular-nums ${s.tasksPending > 0 ? "text-gold" : "text-muted"}`}>
            {s.tasksPending}
          </span>
        </div>
      </div>
    </button>
  );
}

/* --------------------------------------------------------- grid card */

function StationGridCard({ s, onOpen }: { s: StationVM; onOpen: () => void }) {
  const m = STATUS_META[s.status];
  return (
    <button
      type="button"
      onClick={() => {
        fb.tap();
        onOpen();
      }}
      className={`card-elev ${styles.gridCard}`}
    >
      <div className="relative">
        <Logo url={s.logoUrl} name={s.name} size={60} />
        <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface ${m.dot}`} />
      </div>
      <p className="mt-1 line-clamp-1 text-[14px] font-bold text-ink">{s.name}</p>
      <div className="flex items-center gap-3 text-[12px]">
        <span className="flex items-center gap-1 text-muted">
          <UserIcon size={13} /> {s.guardsTotal}
        </span>
        <span className={`flex items-center gap-1 ${s.incidentsToday > 0 ? "text-critical" : "text-online"}`}>
          <ShieldAlert size={13} /> {s.incidentsToday}
        </span>
      </div>
    </button>
  );
}

/* --------------------------------------------------------------- screen */

export default function StationsList() {
  const { t } = useTranslation();
  const history = useHistory();
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<"list" | "grid">("list");
  const [sort, setSort] = useState<SortKey>("az");
  const [me, setMe] = useState<[number, number] | null>(null);

  useEffect(() => {
    getCurrentPosition()
      .then((c) => setMe([c.latitude, c.longitude]))
      .catch(() => {});
  }, []);

  const { data, reload } = useAsync(async () => {
    try {
      const res: any = await supervisorRoute.stationsList();
      const stations = normalize(res?.stations);
      const summary =
        res?.summary && typeof res.summary === "object"
          ? {
              all: Number(res.summary.all) || stations.length,
              active: Number(res.summary.active) || 0,
              attention: Number(res.summary.attention) || 0,
              offline: Number(res.summary.offline) || 0,
            }
          : summarize(stations);
      return { stations, summary };
    } catch {
      const rows = await stationService.list().catch(() => []);
      const stations = normalize(
        (Array.isArray(rows) ? rows : []).map((r: any) => ({
          id: r.id,
          name: r.stationName ?? r.name,
          lat: r.latitud,
          lng: r.longitud,
          status: "offline",
        })),
      );
      return { stations, summary: summarize(stations) };
    }
  }, []);

  const stations = data?.stations ?? [];
  const summary = data?.summary ?? { all: 0, active: 0, attention: 0, offline: 0 };

  const shown = useMemo(() => {
    let list = filter === "all" ? stations : stations.filter((s) => s.status === filter);
    const rank: Record<StationStatus, number> = { attention: 0, offline: 1, active: 2 };
    list = [...list].sort((a, b) => {
      if (sort === "status") return rank[a.status] - rank[b.status] || a.name.localeCompare(b.name);
      const cmp = a.name.localeCompare(b.name);
      return sort === "za" ? -cmp : cmp;
    });
    return list;
  }, [stations, filter, sort]);

  const sortLabel =
    sort === "az" ? "A–Z" : sort === "za" ? "Z–A" : t("stations.byStatus", "Estado");
  const cycleSort = () => {
    fb.select();
    setSort((s) => (s === "az" ? "za" : s === "za" ? "status" : "az"));
  };

  return (
    <Screen
      largeTitle={t("stations.title", "Estaciones")}
      largeSubtitle={t("stations.subtitle", "Todas las ubicaciones")}
      right={<NavActions />}
      onMenu={openAppMenu}
      avatar={<img src={brandLogo} alt="" className="h-7 w-7 rounded-lg object-contain" />}
      root
      flush
      onRefresh={reload}
    >
        {/* Stat cards */}
        <div className="no-scrollbar flex gap-3 overflow-x-auto px-5 pb-1 pt-3">
          <StatCard icon={<Building2 size={18} />} tint="#d4a017" label={t("stations.all", "Estaciones")} value={summary.all} active={filter === "all"} onClick={() => setFilter("all")} />
          <StatCard icon={<ShieldCheck size={18} />} tint="#22c55e" label={t("stations.active", "Activas")} value={summary.active} active={filter === "active"} onClick={() => setFilter(filter === "active" ? "all" : "active")} />
          <StatCard icon={<AlertTriangle size={18} />} tint="#f59e0b" label={t("stations.attention", "Atención")} value={summary.attention} active={filter === "attention"} onClick={() => setFilter(filter === "attention" ? "all" : "attention")} />
          <StatCard icon={<Circle size={18} />} tint="#9aa3af" label={t("stations.offline", "Sin conexión")} value={summary.offline} active={filter === "offline"} onClick={() => setFilter(filter === "offline" ? "all" : "offline")} />
        </div>

        {/* View toggle + sort */}
        <div className="flex items-center justify-between px-5 py-3">
          <div className={styles.viewSwitch}>
            <button
              type="button"
              onClick={() => { fb.select(); setView("grid"); }}
              className={`pressable ${styles.viewSeg} ${view === "grid" ? styles.viewSegActive : ""}`}
            >
              <LayoutGrid size={18} /> {t("stations.grid", "Cuadrícula")}
            </button>
            <button
              type="button"
              onClick={() => { fb.select(); setView("list"); }}
              className={`pressable ${styles.viewSeg} ${view === "list" ? styles.viewSegActive : ""}`}
            >
              <ListIcon size={18} /> {t("stations.list", "Lista")}
            </button>
          </div>
          <button type="button" onClick={cycleSort} className={`pressable ${styles.sortBtn}`}>
            <ArrowUpDown size={16} className={styles.sortIcon} />
            {t("stations.sortBy", "Ordenar")}: {sortLabel}
          </button>
        </div>

        {/* Content */}
        <div className="stagger px-5 pb-28">
          {shown.length === 0 ? (
            <div className="mt-16 flex flex-col items-center gap-2 text-center">
              <Building2 size={30} className="text-faint" />
              <p className="text-sm text-muted">{t("stations.empty", "No hay estaciones que mostrar")}</p>
            </div>
          ) : view === "list" ? (
            <div className="space-y-4">
              {shown.map((s) => (
                <StationCard key={s.id} s={s} me={me} onOpen={() => history.push(`/supervisor/stations/${s.id}`)} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {shown.map((s) => (
                <StationGridCard key={s.id} s={s} onOpen={() => history.push(`/supervisor/stations/${s.id}`)} />
              ))}
            </div>
          )}
        </div>
    </Screen>
  );
}

/* --------------------------------------------------------------- helpers */

function summarize(stations: StationVM[]) {
  return {
    all: stations.length,
    active: stations.filter((s) => s.status === "active").length,
    attention: stations.filter((s) => s.status === "attention").length,
    offline: stations.filter((s) => s.status === "offline").length,
  };
}
