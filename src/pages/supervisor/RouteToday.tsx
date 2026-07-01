import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import {
  Route as RouteIcon,
  MapPin,
  ChevronRight,
  CheckCircle2,
  Circle,
  Navigation,
  Clock,
  Building2,
  Loader2,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorState, SkeletonList, Skeleton } from "@/components/ui";
import { Button } from "@/components/ui/kit";
import { RouteMap, type RouteMapStop } from "@/components/RouteMap";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { useAsync } from "@/lib/useAsync";
import fb from "@/lib/feedback";

/* -------------------------------------------------------------- normalizers */

/** Pull a display string from a value that may be a string or an association object. */
function asText(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object")
    return (
      v.name ||
      v.title ||
      v.label ||
      v.postSiteName ||
      v.stationName ||
      v.address ||
      ""
    );
  return String(v);
}

function toNum(v: any): number | undefined {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && !Number.isNaN(n) ? n : undefined;
}

interface Stop {
  id: string;
  order: number;
  name: string;
  address: string;
  siteType: string;
  done: boolean;
  latitude?: number;
  longitude?: number;
  distance?: string;
  duration?: string;
}

interface NormalizedRoute {
  id: string;
  name: string;
  started: boolean;
  stops: Stop[];
}

function stopDone(p: any): boolean {
  const visit = p.visit ?? p.check ?? null;
  if (visit && typeof visit === "object") {
    if (typeof visit.status === "string")
      return ["completed", "done", "checked", "ok"].includes(visit.status);
    return true; // a visit record exists → visited
  }
  if (p.completed === true || p.done === true) return true;
  if (typeof p.status === "string")
    return ["completed", "done", "checked", "ok"].includes(p.status);
  return !!(p.checkedAt || p.visitedAt || p.completedAt);
}

function normalizeRoute(route: any): NormalizedRoute | null {
  if (!route || typeof route !== "object") return null;
  const rawStops: any[] = Array.isArray(route.points)
    ? route.points
    : Array.isArray(route.stops)
    ? route.stops
    : Array.isArray(route.routePoints)
    ? route.routePoints
    : [];

  const stops: Stop[] = rawStops.map((p, i) => {
    const site = p.postSite ?? p.site ?? p.station ?? null;
    return {
      id: String(p.id ?? p.pointId ?? p.postSiteId ?? i),
      order: Number(p.order ?? p.sequence ?? p.index ?? i + 1),
      name:
        asText(p.name) ||
        asText(p.postSite) ||
        asText(p.station) ||
        asText(site) ||
        `#${i + 1}`,
      address: asText(p.address) || asText(site) || "",
      siteType: asText(p.siteType) || asText(p.type) || asText(site?.type) || "",
      done: stopDone(p),
      latitude: toNum(p.latitude ?? p.lat ?? site?.latitude),
      longitude: toNum(p.longitude ?? p.lng ?? p.lon ?? site?.longitude),
      distance: p.distanceText || p.distanceHint || p.distance || undefined,
      duration: p.durationText || p.durationHint || p.eta || undefined,
    };
  });

  const started =
    ["in_progress", "started", "active", "running"].includes(
      String(route.status ?? "")
    ) || !!(route.startedAt || route.startTime);

  return {
    id: String(route.id ?? route.routeId ?? ""),
    name: asText(route.name) || asText(route.title) || "",
    started,
    stops,
  };
}

/* ---------------------------------------------------------------- component */

export default function RouteToday() {
  const { t } = useTranslation();
  const history = useHistory();
  const [starting, setStarting] = useState(false);

  const { data, loading, error, reload } = useAsync(
    () => supervisorRoute.today(),
    []
  );

  const rawRoute = Array.isArray(data) ? data[0] : (data as any);
  const route = normalizeRoute(rawRoute);

  const openStop = (pointId: string) => {
    if (!route) return;
    history.push(`/supervisor/route/${route.id}/stop/${pointId}`);
  };

  const goExecute = () => {
    if (route) history.push(`/supervisor/route/${route.id}`);
  };

  const onStart = async () => {
    if (!route || starting) return;
    if (route.started) {
      goExecute();
      return;
    }
    setStarting(true);
    try {
      await supervisorRoute.start(route.id);
      fb.success();
      goExecute();
    } catch {
      fb.error();
      setStarting(false);
    }
  };

  /* --------------------------------------------------------- loading state */
  if (loading && !data) {
    return (
      <Screen root title={t("supervisor.todayRoute", "Ruta del día")}>
        <Skeleton className="h-[200px] w-full rounded-2xl" />
        <div className="mt-4">
          <SkeletonList rows={4} />
        </div>
      </Screen>
    );
  }

  /* ----------------------------------------------------------- error state */
  if (error && !data) {
    return (
      <Screen
        root
        title={t("supervisor.todayRoute", "Ruta del día")}
        onRefresh={reload}
      >
        <ErrorState onRetry={reload} />
      </Screen>
    );
  }

  /* ----------------------------------------------------------- empty state */
  if (!route || route.stops.length === 0) {
    return (
      <Screen
        root
        title={t("supervisor.todayRoute", "Ruta del día")}
        onRefresh={reload}
      >
        <EmptyState
          icon={<RouteIcon size={26} />}
          title={t("supervisor.route.none", "Sin ruta asignada hoy")}
          hint={t(
            "supervisor.route.noneHint",
            "No tienes una ruta de rondas programada para hoy."
          )}
        />
      </Screen>
    );
  }

  const total = route.stops.length;
  const completed = route.stops.filter((s) => s.done).length;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const mapStops: RouteMapStop[] = route.stops.map((s) => ({
    id: s.id,
    latitude: s.latitude,
    longitude: s.longitude,
    label: s.name,
    order: s.order,
    done: s.done,
  }));

  return (
    <Screen
      root
      title={t("supervisor.todayRoute", "Ruta del día")}
      subtitle={route.name || undefined}
      onRefresh={reload}
    >
      {/* Map overview */}
      <RouteMap stops={mapStops} height={200} />

      {/* Progress summary */}
      <div className="mt-4 card-elev p-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="label-eyebrow">
              {t("supervisor.route.progress", "Progreso")}
            </p>
            <p className="mt-1 truncate text-lg font-bold text-ink">
              {route.name || t("supervisor.route.today", "Ruta de hoy")}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-bold tabular-nums text-ink">
              {completed}
              <span className="text-muted">/{total}</span>
            </p>
            <p className="text-[11px] uppercase tracking-wide text-muted">
              {t("supervisor.route.stops", "paradas")}
            </p>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-gold"
            style={{ width: `${pct}%`, transition: "width 500ms ease" }}
          />
        </div>
      </div>

      {/* Stops list */}
      <p className="mb-2.5 mt-5 label-eyebrow">
        {t("supervisor.route.stopsTitle", "Paradas")}
      </p>
      <div className="stagger flex flex-col gap-2.5 pb-24">
        {route.stops.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => openStop(s.id)}
            className="pressable flex w-full items-center gap-3.5 rounded-2xl border border-line bg-surface px-4 py-4 text-left active:bg-surface-2 [@media(hover:hover)]:hover:bg-surface-2"
          >
            {/* Order + status badge */}
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${
                s.done
                  ? "bg-online/15 text-online"
                  : "bg-gold/15 text-gold"
              }`}
            >
              {s.done ? <CheckCircle2 size={18} /> : s.order}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-ink">
                {s.name}
              </p>
              {s.address && (
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
                  <MapPin size={12} className="shrink-0" />
                  <span className="truncate">{s.address}</span>
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {s.siteType && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
                    <Building2 size={11} />
                    {s.siteType}
                  </span>
                )}
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    s.done
                      ? "bg-online/15 text-online"
                      : "bg-surface-2 text-muted"
                  }`}
                >
                  {s.done ? (
                    <>
                      <CheckCircle2 size={11} />
                      {t("supervisor.route.completed", "Completado")}
                    </>
                  ) : (
                    <>
                      <Circle size={11} />
                      {t("supervisor.route.pending", "Pendiente")}
                    </>
                  )}
                </span>
                {s.distance && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-faint">
                    <Navigation size={11} />
                    {s.distance}
                  </span>
                )}
                {s.duration && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-faint">
                    <Clock size={11} />
                    {s.duration}
                  </span>
                )}
              </div>
            </div>

            <ChevronRight size={18} className="shrink-0 text-faint" />
          </button>
        ))}
      </div>

      {/* Sticky start / continue action */}
      <div className="pointer-events-none sticky bottom-0 -mx-4 mt-2 px-4 pb-2 pt-3 safe-bottom">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[-24px] bg-gradient-to-t from-background via-background to-transparent" />
        <div className="pointer-events-auto relative">
          <Button full onClick={onStart} disabled={starting}>
            {starting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 size={18} className="animate-spin" />
                {t("supervisor.route.starting", "Iniciando…")}
              </span>
            ) : route.started ? (
              <span className="inline-flex items-center gap-2">
                <Navigation size={18} />
                {t("supervisor.route.continue", "Continuar")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <Navigation size={18} />
                {t("supervisor.route.start", "Iniciar ruta")}
              </span>
            )}
          </Button>
        </div>
      </div>
    </Screen>
  );
}
