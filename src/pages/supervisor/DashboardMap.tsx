import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import {
  Route as RouteIcon,
  MapPin,
  Clock,
  ChevronRight,
  PlayCircle,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorState, SkeletonList, Skeleton } from "@/components/ui";
import { Button } from "@/components/ui/kit";
import { type RoutePoint } from "@/components/RouteMap";
import { OsmMap } from "@/components/OsmMap";
import NotificationBell from "@/components/NotificationBell";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { operationsService } from "@/lib/services";
import { useAuth } from "@/context/AuthContext";
import { useAsync } from "@/lib/useAsync";

/** Small matte stat tile for the dashboard header row. */
function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="card-elev px-2 py-3 text-center">
      <p
        className="text-xl font-bold tabular-nums text-ink"
        style={accent ? { color: "#ef4444" } : undefined}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------- normalizers */

/** Pull a display string from a value that may be a string or an association object. */
function asText(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object")
    return v.name || v.title || v.label || v.postSiteName || v.address || "";
  return String(v);
}

function toNum(v: any): number | undefined {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && !Number.isNaN(n) ? n : undefined;
}

function stopDone(p: any): boolean {
  const visit = p.visit ?? p.check ?? null;
  if (visit && typeof visit === "object") {
    if (typeof visit.status === "string")
      return ["completed", "done", "checked", "ok"].includes(visit.status);
    return true;
  }
  if (p.completed === true || p.done === true) return true;
  if (typeof p.status === "string")
    return ["completed", "done", "checked", "ok"].includes(p.status);
  return !!(p.checkedAt || p.visitedAt || p.completedAt);
}

interface DashRoute {
  id: string;
  name: string;
  started: boolean;
  points: RoutePoint[];
  total: number;
  completed: number;
}

function normalizeRoute(route: any): DashRoute | null {
  if (!route || typeof route !== "object") return null;
  const raw: any[] = Array.isArray(route.points)
    ? route.points
    : Array.isArray(route.stops)
    ? route.stops
    : Array.isArray(route.routePoints)
    ? route.routePoints
    : [];

  const points: RoutePoint[] = raw.map((p, i) => {
    const site = p.postSite ?? p.site ?? p.station ?? null;
    const order = Number(p.order ?? p.sequence ?? p.index ?? i + 1);
    const done = stopDone(p);
    return {
      lat: toNum(p.latitude ?? p.lat ?? site?.latitude) ?? NaN,
      lng: toNum(p.longitude ?? p.lng ?? p.lon ?? site?.longitude) ?? NaN,
      label:
        asText(p.name) ||
        asText(p.postSite) ||
        asText(site) ||
        asText(p.address) ||
        `#${order}`,
      order,
      status: done ? "done" : undefined,
    };
  });

  const started =
    ["in_progress", "started", "active", "running"].includes(
      String(route.status ?? "")
    ) || !!(route.startedAt || route.startTime);

  const total = points.length;
  const completed = raw.filter(stopDone).length;

  return {
    id: String(route.id ?? route.routeId ?? ""),
    name: asText(route.name) || asText(route.title) || "",
    started: started || completed > 0,
    points,
    total,
    completed,
  };
}

/** Best-effort read of a clock-status payload → is the supervisor on duty? */
function isClockedIn(clock: any): boolean {
  if (!clock || typeof clock !== "object") return false;
  if (typeof clock.clockedIn === "boolean") return clock.clockedIn;
  if (typeof clock.onDuty === "boolean") return clock.onDuty;
  if (typeof clock.active === "boolean") return clock.active;
  if (clock.activeShift || clock.shift || clock.clockInAt || clock.startedAt)
    return true;
  const s = String(clock.status ?? clock.state ?? "").toLowerCase();
  if (!s) return false;
  return ["in", "on", "on_duty", "active", "clocked_in", "working"].includes(s);
}

/* ---------------------------------------------------------------- greeting */

function greetingKey(): { key: string; def: string } {
  const h = new Date().getHours();
  if (h < 12) return { key: "supervisor.goodMorning", def: "Buenos días" };
  if (h < 19) return { key: "supervisor.goodAfternoon", def: "Buenas tardes" };
  return { key: "supervisor.goodEvening", def: "Buenas noches" };
}

/* ---------------------------------------------------------------- component */

export default function DashboardMap() {
  const { t } = useTranslation();
  const history = useHistory();
  const { user } = useAuth();

  const firstName = useMemo(() => {
    const full = user?.fullName || user?.name || user?.firstName || "";
    return String(full).trim().split(/\s+/)[0] || "";
  }, [user]);

  const g = greetingKey();
  const greeting = firstName
    ? `${t(g.key, g.def)}, ${firstName}`
    : t(g.key, g.def);

  const { data, loading, error, reload } = useAsync(async () => {
    const [routes, clock, kpis] = await Promise.all([
      supervisorRoute.today().catch(() => []),
      supervisorRoute.clockStatus().catch(() => null),
      operationsService.kpis().catch(() => []),
    ]);
    const first = Array.isArray(routes) ? routes[0] : (routes as any);
    let detail: any = first;
    const id = first?.id ?? first?.routeId;
    if (id) detail = await supervisorRoute.routeDetail(String(id)).catch(() => first);
    return {
      route: normalizeRoute(detail),
      clockedIn: isClockedIn(clock),
      kpis: Array.isArray(kpis) ? kpis : [],
    };
  }, []);

  const route = data?.route ?? null;
  const kpis = data?.kpis ?? [];
  const kpiVal = (...ids: string[]) => {
    for (const id of ids) {
      const k = (kpis as any[]).find((x) => x?.id === id);
      if (k != null && k.value != null) return k.value;
    }
    return null;
  };

  const bell = <NotificationBell />;

  /* --------------------------------------------------------- loading state */
  if (loading && !data) {
    return (
      <Screen root largeTitle={greeting} title={greeting} right={bell}>
        <Skeleton className="h-[260px] w-full rounded-2xl" />
        <div className="mt-4">
          <SkeletonList rows={3} />
        </div>
      </Screen>
    );
  }

  /* ----------------------------------------------------------- error state */
  if (error && !data) {
    return (
      <Screen root largeTitle={greeting} title={greeting} right={bell} onRefresh={reload}>
        <ErrorState onRetry={reload} />
      </Screen>
    );
  }

  const clockedIn = data?.clockedIn ?? false;
  const hasRoute = !!route && route.total > 0;
  const pct = hasRoute
    ? Math.round((route!.completed / route!.total) * 100)
    : 0;
  const onDuty = kpiVal("guardsOnDuty", "activeGuards", "guardsActive", "onDutyGuards");
  const openInc = kpiVal("openIncidents", "incidentsOpen", "activeIncidents");

  const clockPrompt = !clockedIn && (
    <button
      type="button"
      onClick={() => history.push("/supervisor/clock-in")}
      className="pressable mb-4 flex w-full items-center gap-3 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3.5 text-left"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold/15 text-gold">
        <Clock size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-ink">
          {t("supervisor.notClockedIn", "No has marcado entrada")}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted">
          {t("supervisor.clockInPrompt", "Marca tu entrada para iniciar tu jornada")}
        </p>
      </div>
      <ChevronRight size={18} className="shrink-0 text-faint" />
    </button>
  );

  return (
    <Screen root largeTitle={greeting} title={greeting} right={bell} onRefresh={reload}>
      {clockPrompt}

      {/* Futuristic map — self-hosted OSM tiles, live route */}
      <OsmMap points={route?.points ?? []} height={260} showRoute />

      {/* Live stats */}
      <div className="mt-4 grid grid-cols-3 gap-2.5">
        <StatTile
          label={t("supervisor.stat.stops", "Paradas")}
          value={hasRoute ? `${route!.completed}/${route!.total}` : "—"}
        />
        <StatTile
          label={t("supervisor.stat.onDuty", "En servicio")}
          value={onDuty ?? "—"}
        />
        <StatTile
          label={t("supervisor.stat.incidents", "Novedades")}
          value={openInc ?? "—"}
          accent={Number(openInc) > 0}
        />
      </div>

      {hasRoute ? (
        <>
          {/* Route summary */}
          <div className="mt-4 card-elev p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="label-eyebrow">{t("supervisor.todayRoute", "Ruta de hoy")}</p>
                <p className="mt-1 truncate text-lg font-bold text-ink">
                  {route!.name || t("supervisor.route.today", "Ruta de hoy")}
                </p>
                <div className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                  <MapPin size={14} className="text-gold" />
                  <span>
                    {t("supervisor.stopsCount", "{{count}} paradas", {
                      count: route!.total,
                    })}
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-2xl font-bold tabular-nums text-ink">
                  {route!.completed}
                  <span className="text-muted">/{route!.total}</span>
                </p>
                <p className="text-[11px] uppercase tracking-wide text-muted">
                  {t("supervisor.route.progress", "Progreso")}
                </p>
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-gold"
                style={{ width: `${pct}%`, transition: "width 500ms ease" }}
              />
            </div>
          </div>

          <div className="mt-4">
            <Button full onClick={() => history.push("/supervisor/route")}>
              <span className="inline-flex items-center gap-2">
                <PlayCircle size={20} />
                {route!.started
                  ? t("supervisor.continueRoute", "Continuar ruta")
                  : t("supervisor.startRoute", "Iniciar ruta")}
              </span>
            </Button>
          </div>
        </>
      ) : (
        <div className="mt-4">
          <EmptyState
            icon={<RouteIcon size={26} />}
            title={t("supervisor.route.none", "Sin ruta asignada hoy")}
            hint={t(
              "supervisor.route.noneHint",
              "No tienes una ruta de rondas programada para hoy."
            )}
          />
        </div>
      )}
    </Screen>
  );
}
