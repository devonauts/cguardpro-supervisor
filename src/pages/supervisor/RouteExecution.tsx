import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory, useParams } from "react-router-dom";
import {
  Route as RouteIcon,
  MapPin,
  Building2,
  Navigation,
  CheckCircle2,
  Circle,
  Flag,
  Loader2,
  ClipboardCheck,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorState, Skeleton, ResultSheet } from "@/components/ui";
import { Button } from "@/components/ui/kit";
import { RouteMap, type RouteMapStop } from "@/components/RouteMap";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { openNativeNavigation } from "@/lib/navigate";
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
}

interface NormalizedRoute {
  id: string;
  name: string;
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
    };
  });

  return {
    id: String(route.id ?? route.routeId ?? ""),
    name: asText(route.name) || asText(route.title) || "",
    stops,
  };
}

/* ---------------------------------------------------------------- component */

export default function RouteExecution() {
  const { t } = useTranslation();
  const history = useHistory();
  const { routeId } = useParams<{ routeId: string }>();

  const { data, loading, error, reload } = useAsync(
    () => supervisorRoute.routeDetail(routeId),
    [routeId]
  );

  const [finishing, setFinishing] = useState(false);
  const [finished, setFinished] = useState(false);
  const [finishError, setFinishError] = useState(false);

  const route = useMemo(() => normalizeRoute(data), [data]);

  const goDashboard = () => history.push("/supervisor/dashboard");

  const openStop = (pointId: string) =>
    history.push(`/supervisor/route/${routeId}/stop/${pointId}`);

  const currentStop = route?.stops.find((s) => !s.done) || null;

  const navigateTo = (s: Stop) => {
    if (typeof s.latitude !== "number" || typeof s.longitude !== "number") return;
    fb.tap();
    openNativeNavigation(s.latitude, s.longitude, s.name);
  };

  const onFinish = async () => {
    if (finishing) return;
    setFinishing(true);
    setFinishError(false);
    try {
      await supervisorRoute.finish(routeId);
      fb.success();
      setFinished(true);
    } catch {
      fb.error();
      setFinishError(true);
    } finally {
      setFinishing(false);
    }
  };

  /* --------------------------------------------------------- loading state */
  if (loading && !data) {
    return (
      <Screen
        title={t("supervisor.route.execTitle", "En ruta")}
        backHref="/supervisor/route"
      >
        <Skeleton className="h-[220px] w-full rounded-2xl" />
        <Skeleton className="mt-4 h-24 w-full rounded-2xl" />
        <Skeleton className="mt-4 h-16 w-full rounded-2xl" />
      </Screen>
    );
  }

  /* ----------------------------------------------------------- error state */
  if ((error && !data) || !route || route.stops.length === 0) {
    return (
      <Screen
        title={t("supervisor.route.execTitle", "En ruta")}
        backHref="/supervisor/route"
        onRefresh={reload}
      >
        {error ? (
          <ErrorState onRetry={reload} />
        ) : (
          <EmptyState
            icon={<RouteIcon size={26} />}
            title={t("supervisor.route.none", "Sin ruta asignada hoy")}
          />
        )}
      </Screen>
    );
  }

  const total = route.stops.length;
  const completed = route.stops.filter((s) => s.done).length;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const allDone = completed >= total;

  // Center the map on the current stop (or the whole route when finished).
  const mapStops: RouteMapStop[] = (currentStop
    ? route.stops.filter((s) => s.id === currentStop.id || s.done)
    : route.stops
  ).map((s) => ({
    id: s.id,
    latitude: s.latitude,
    longitude: s.longitude,
    label: s.name,
    order: s.order,
    done: s.done,
  }));

  const hasCoords =
    !!currentStop &&
    typeof currentStop.latitude === "number" &&
    typeof currentStop.longitude === "number";

  return (
    <Screen
      title={t("supervisor.route.execTitle", "En ruta")}
      subtitle={route.name || undefined}
      backHref="/supervisor/route"
      onRefresh={reload}
    >
      {/* Focused map — centered on the current stop */}
      <RouteMap stops={mapStops} height={220} />

      {/* Progress summary */}
      <div className="mt-4 card-elev p-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="label-eyebrow">
              {t("supervisor.route.progress", "Progreso")}
            </p>
            <p className="mt-1 truncate text-lg font-bold text-ink">
              {allDone
                ? t("supervisor.route.allDone", "Ruta completada")
                : t("supervisor.route.stopOf", "Parada {{n}} de {{total}}", {
                    n: completed + 1,
                    total,
                  })}
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

      {/* Current stop — the focused "next up" card */}
      {currentStop && (
        <div className="mt-5">
          <p className="mb-2.5 label-eyebrow">
            {t("supervisor.route.currentStop", "Parada actual")}
          </p>
          <div className="card-elev p-5">
            <div className="flex items-start gap-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold/15 text-base font-bold text-gold">
                {currentStop.order}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold leading-tight text-ink">
                  {currentStop.name}
                </p>
                {currentStop.address && (
                  <p className="mt-1 flex items-start gap-1.5 text-sm text-muted">
                    <MapPin size={14} className="mt-0.5 shrink-0" />
                    <span>{currentStop.address}</span>
                  </p>
                )}
                {currentStop.siteType && (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted">
                    <Building2 size={12} />
                    {currentStop.siteType}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-5 space-y-2.5">
              <Button
                full
                variant="outline"
                disabled={!hasCoords}
                onClick={() => navigateTo(currentStop)}
              >
                <span className="inline-flex items-center gap-2">
                  <Navigation size={18} />
                  {t("supervisor.navigate", "Navegar")}
                </span>
              </Button>
              <Button full onClick={() => openStop(currentStop.id)}>
                <span className="inline-flex items-center gap-2">
                  <ClipboardCheck size={18} />
                  {t("supervisor.route.arriveCheck", "Llegué / Revisar parada")}
                </span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* All stops — compact progress list */}
      <p className="mb-2.5 mt-5 label-eyebrow">
        {t("supervisor.route.stopsTitle", "Paradas")}
      </p>
      <div className="flex flex-col gap-2.5 pb-28">
        {route.stops.map((s) => {
          const isCurrent = currentStop?.id === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => openStop(s.id)}
              className={`pressable flex w-full items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left active:bg-surface-2 [@media(hover:hover)]:hover:bg-surface-2 ${
                isCurrent
                  ? "border-gold/50 bg-gold/5"
                  : "border-line bg-surface"
              }`}
            >
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${
                  s.done ? "bg-online/15 text-online" : "bg-gold/15 text-gold"
                }`}
              >
                {s.done ? <CheckCircle2 size={18} /> : s.order}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-ink">
                  {s.name}
                </p>
                <span
                  className={`mt-1 inline-flex items-center gap-1 text-[12px] font-medium ${
                    s.done ? "text-online" : "text-muted"
                  }`}
                >
                  {s.done ? (
                    <>
                      <CheckCircle2 size={12} />
                      {t("supervisor.route.completed", "Completado")}
                    </>
                  ) : (
                    <>
                      <Circle size={12} />
                      {t("supervisor.route.pending", "Pendiente")}
                    </>
                  )}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Sticky finish action — only when every stop is done */}
      {allDone && (
        <div className="pointer-events-none sticky bottom-0 -mx-4 mt-2 px-4 pb-2 pt-3 safe-bottom">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[-24px] bg-gradient-to-t from-background via-background to-transparent" />
          <div className="pointer-events-auto relative">
            <Button full onClick={onFinish} disabled={finishing}>
              {finishing ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={18} className="animate-spin" />
                  {t("supervisor.route.finishing", "Finalizando…")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Flag size={18} />
                  {t("supervisor.finishRoute", "Finalizar ruta")}
                </span>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Success sheet → back to dashboard */}
      <ResultSheet
        open={finished}
        onClose={goDashboard}
        variant="success"
        title={t("supervisor.route.finishedTitle", "Ruta finalizada")}
        lines={[
          t("supervisor.route.finishedLine", "Completaste {{n}} paradas.", {
            n: total,
          }),
        ]}
        primaryLabel={t("supervisor.route.backToDashboard", "Volver al inicio")}
        onPrimary={goDashboard}
      />

      {/* Error sheet → retry */}
      <ResultSheet
        open={finishError}
        onClose={() => setFinishError(false)}
        variant="error"
        title={t("supervisor.route.finishError", "No se pudo finalizar")}
        lines={[
          t(
            "supervisor.route.finishErrorHint",
            "Revisa tu conexión e inténtalo de nuevo."
          ),
        ]}
        primaryLabel={t("app.retry", "Reintentar")}
        onPrimary={() => {
          setFinishError(false);
          onFinish();
        }}
        secondaryLabel={t("common.close", "Cerrar")}
        onSecondary={() => setFinishError(false)}
      />
    </Screen>
  );
}
