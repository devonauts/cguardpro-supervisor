import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { IonPage, IonContent } from "@ionic/react";
import {
  Menu,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  User as UserIcon,
} from "lucide-react";
import brandLogo from "@/assets/brand-logo.png";
import { NavActions } from "@/components/shared/NavActions";
import { openAppMenu } from "@/components/shared/SideMenu";
import StationsMap, { type MapStation, type StationStatus } from "@/components/StationsMap";
import { RouteStartCard } from "./RouteStartCard";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { stationService, guardsService } from "@/lib/services";
import { useAuth } from "@/context/AuthContext";
import { useFileUrl } from "@/lib/fileUrl";
import { openAddressNavigation } from "@/lib/navigate";
import { useAsync } from "@/lib/useAsync";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import fb from "@/lib/feedback";

/* -------------------------------------------------------------- normalizers */

function toNum(v: any): number {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : NaN;
}

function asText(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object")
    return v.stationName || v.name || v.title || v.label || "";
  return String(v);
}

const STATUSES: StationStatus[] = ["on_duty", "late", "offline"];

/** Coerce the /supervisor/me/stations payload into map-ready stations. */
function normalizeStations(rows: any): MapStation[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((s: any): MapStation => {
      const status = STATUSES.includes(s?.status) ? s.status : "offline";
      return {
        id: String(s?.id ?? ""),
        name: asText(s?.name) || asText(s) || "—",
        lat: toNum(s?.lat ?? s?.latitude ?? s?.latitud),
        lng: toNum(s?.lng ?? s?.longitude ?? s?.longitud),
        status,
        address: asText(s?.address) || null,
      };
    })
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
}

interface Summary {
  total: number;
  onDuty: number;
  late: number;
  offline: number;
}

/* ------------------------------------------------------------------ header */

function Avatar() {
  const { user } = useAuth();
  const src = useFileUrl((user as any)?.avatars?.[0] || null);
  return (
    <span className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-full bg-surface-2 text-muted ring-1 ring-line">
      {src ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <img src={src} className="h-full w-full object-cover" />
      ) : (
        <UserIcon size={18} />
      )}
      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-online" />
    </span>
  );
}

/* --------------------------------------------------------------- stat card */

function StatCard({
  icon,
  tint,
  value,
  label,
  active,
  dim,
  onClick,
}: {
  icon: React.ReactNode;
  tint: string;
  value: React.ReactNode;
  label: string;
  active: boolean;
  dim: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`stnmap-statcard shrink-0 text-left ${dim ? "is-dim" : ""}`}
      style={active ? { boxShadow: `0 0 0 2px ${tint}, 0 8px 22px -10px rgba(15,23,42,.28)` } : undefined}
    >
      <span
        className="grid h-11 w-11 place-items-center rounded-[11px]"
        style={{ background: `${tint}1f`, color: tint }}
      >
        {icon}
      </span>
      <p className="mt-2 text-[26px] font-extrabold leading-none tabular-nums text-ink">
        {value}
      </p>
      <p className="mt-1 text-[12px] font-medium text-muted">{label}</p>
      <span
        className="mt-2 block h-1 w-9 rounded-full"
        style={{ background: tint }}
      />
    </button>
  );
}

/* --------------------------------------------------------------- component */

export default function DashboardMap() {
  const { t } = useTranslation();
  const history = useHistory();
  const [filter, setFilter] = useState<StationStatus | null>(null);

  const { data, reload } = useAsync(async () => {
    try {
      const res: any = await supervisorRoute.stations();
      const stations = normalizeStations(res?.stations);
      const summary: Summary =
        res?.summary && typeof res.summary === "object"
          ? {
              total: Number(res.summary.total) || stations.length,
              onDuty: Number(res.summary.onDuty) || 0,
              late: Number(res.summary.late) || 0,
              offline: Number(res.summary.offline) || 0,
            }
          : summarize(stations);
      return { stations, summary };
    } catch (e) {
      // Surfaces on-device in Safari Web Inspector so a failed monitor request
      // isn't mistaken for "no stations".
      console.warn("[dashboard] /supervisor/me/stations failed:", e);
      // Pre-deploy fallback: pins from the station list; status unknown.
      const [rows, active] = await Promise.all([
        stationService.list().catch(() => []),
        guardsService.activeLocations().catch(() => []),
      ]);
      const stations = normalizeStations(
        (Array.isArray(rows) ? rows : []).map((r: any) => ({
          id: r.id,
          name: r.stationName ?? r.name,
          lat: r.latitud ?? r.latitude,
          lng: r.longitud ?? r.longitude,
          status: "on_duty",
        })),
      );
      const summary: Summary = {
        total: stations.length,
        onDuty: Array.isArray(active) ? active.length : 0,
        late: 0,
        offline: 0,
      };
      return { stations, summary };
    }
  }, []);
  // Live-refresh the station monitor when a guard/supervisor clocks in/out.
  useLiveRefresh(reload, ["guard.check", "supervisor.check"]);

  const stations = data?.stations ?? [];
  const summary = data?.summary ?? { total: 0, onDuty: 0, late: 0, offline: 0 };

  const toggle = (s: StationStatus) => {
    fb.select();
    setFilter((cur) => (cur === s ? null : s));
  };

  return (
    <IonPage>
      <IonContent fullscreen scrollY={false}>
        <div className="relative h-full w-full">
          {/* Full-bleed monitor map */}
          <StationsMap
            stations={stations}
            filter={filter}
            onSelect={() => fb.tap()}
            onOpenDetail={(st) => {
              fb.tap();
              history.push(`/supervisor/stations/${st.id}`);
            }}
            onNavigate={(st) => {
              fb.tap();
              openAddressNavigation(st.address || st.name);
            }}
          />

          {/* Top bar (nav row only) */}
          <div className="stnmap-header absolute inset-x-0 top-0 z-[600] safe-top">
            <div className="flex h-14 items-center gap-2.5 px-3">
              <button
                type="button"
                aria-label={t("nav.menu", "Menú")}
                onClick={() => { fb.tap(); openAppMenu(); }}
                className="pressable grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink active:bg-black/5"
              >
                <Menu size={22} />
              </button>

              <img src={brandLogo} alt="" className="h-8 w-8 shrink-0 rounded-lg object-contain" />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[15px] font-extrabold text-ink">C-GuardPro</p>
                <p className="-mt-0.5 truncate text-[12px] font-semibold" style={{ color: "#2563eb" }}>
                  {t("supervisor.role", "Supervisor")}
                </p>
              </div>

              <div className="ml-auto shrink-0">
                <NavActions />
              </div>
            </div>
          </div>

          {/* Stat cards — float over the map, below the top bar (not part of it) */}
          <div
            className="absolute inset-x-0 z-[600] px-3"
            style={{ top: "calc(env(safe-area-inset-top) + 3.5rem)" }}
          >
            <div className="no-scrollbar flex gap-2.5 overflow-x-auto pb-1 pt-2">
              <StatCard
                icon={<ShieldCheck size={18} />}
                tint="#2563eb"
                value={summary.total}
                label={t("supervisor.stat.totalStations", "Estaciones")}
                active={false}
                dim={false}
                onClick={() => {
                  fb.select();
                  setFilter(null);
                }}
              />
              <StatCard
                icon={<CheckCircle2 size={18} />}
                tint="#22c55e"
                value={summary.onDuty}
                label={t("supervisor.stat.onDutyStations", "En servicio")}
                active={filter === "on_duty"}
                dim={!!filter && filter !== "on_duty"}
                onClick={() => toggle("on_duty")}
              />
              <StatCard
                icon={<Clock size={18} />}
                tint="#f59e0b"
                value={summary.late}
                label={t("supervisor.stat.late", "Retrasadas")}
                active={filter === "late"}
                dim={!!filter && filter !== "late"}
                onClick={() => toggle("late")}
              />
              <StatCard
                icon={<AlertCircle size={18} />}
                tint="#ef4444"
                value={summary.offline}
                label={t("supervisor.stat.offline", "Sin conexión")}
                active={filter === "offline"}
                dim={!!filter && filter !== "offline"}
                onClick={() => toggle("offline")}
              />
            </div>
          </div>

          {/* Route mission entry — floats above the tab bar. */}
          <RouteStartCard />

          {/* Hidden refresh affordance: tapping the logo area reloads (pull-to-
              refresh is disabled on the non-scrolling map page). */}
          <button
            type="button"
            aria-label={t("common.refresh", "Actualizar")}
            onClick={() => {
              fb.tap();
              reload();
            }}
            className="sr-only"
          />
        </div>
      </IonContent>
    </IonPage>
  );
}

/* --------------------------------------------------------------- helpers */

function summarize(stations: MapStation[]): Summary {
  return {
    total: stations.length,
    onDuty: stations.filter((s) => s.status === "on_duty").length,
    late: stations.filter((s) => s.status === "late").length,
    offline: stations.filter((s) => s.status === "offline").length,
  };
}
