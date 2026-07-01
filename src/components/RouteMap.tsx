import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapPin } from "lucide-react";
import { loadGoogleMaps } from "@/lib/googleMaps";

/**
 * A stop plotted on the route map. Only `latitude`/`longitude` are required to
 * draw a marker; everything else is presentational.
 */
export interface RouteMapStop {
  id: string;
  latitude?: number | null;
  longitude?: number | null;
  /** Human label (post/site name) shown in the marker tooltip. */
  label?: string;
  /** 1-based order badge painted on the marker. */
  order?: number;
  /** Completed stops render in the "done" color. */
  done?: boolean;
}

/**
 * The lighter point shape used by the dashboard: `lat`/`lng` + a free-form
 * `status` (e.g. "done" | "current" | "pending") that maps to a marker color.
 */
export interface RoutePoint {
  lat: number;
  lng: number;
  label: string;
  order: number;
  status?: string;
}

/** Internal, fully-normalized marker the map actually draws. */
interface Plot {
  key: string;
  lat: number;
  lng: number;
  label: string;
  order: number;
  status?: string;
  done: boolean;
  raw: RoutePoint;
}

/** Read a design-token CSS var with a hex fallback (the Maps SDK needs real hex). */
function token(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

const DONE_STATES = ["done", "completed", "complete", "visited", "checked", "ok"];
const ACTIVE_STATES = ["current", "active", "in_progress", "next"];

function isDone(status?: string, done?: boolean): boolean {
  if (done) return true;
  return DONE_STATES.includes((status || "").toLowerCase());
}

/** Stop status → pin color (theme tokens with safe hex fallbacks). */
function pinColor(p: Plot): string {
  if (p.done) return token("--online", "#22c55e");
  if (ACTIVE_STATES.includes((p.status || "").toLowerCase()))
    return token("--info", "#38bdf8");
  return token("--gold", "#d4a017");
}

// Dark map theme to match the app surfaces.
const DARK_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#17191e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0b0c0e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9aa1ad" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1b2a1e" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2b2e35" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9aa1ad" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#383c44" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#202228" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0b0c0e" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#2b2e35" }] },
];

/**
 * RouteMap — plots an ordered list of stops on a Google Map (numbered markers +
 * a connecting polyline, auto-fit to bounds, dark theme).
 *
 * Accepts EITHER prop shape:
 *  • `stops` — {latitude, longitude, order, label, done} (route execution).
 *  • `points` — {lat, lng, order, label, status} (dashboard overview).
 *
 * It NEVER crashes when the Maps SDK is unavailable: `loadGoogleMaps()` resolves
 * null when `VITE_GOOGLE_MAPS_API_KEY` is unset (dev) or the script fails, and in
 * that case we render a styled placeholder that lists the stops instead. Stops
 * without coordinates are simply skipped.
 */
export function RouteMap({
  stops,
  points,
  onPinTap,
  className = "",
  height = 200,
}: {
  stops?: RouteMapStop[];
  points?: RoutePoint[];
  onPinTap?: (point: RoutePoint) => void;
  className?: string;
  height?: number;
}) {
  const { t } = useTranslation();
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const tapRef = useRef(onPinTap);
  tapRef.current = onPinTap;
  const [ready, setReady] = useState<boolean | null>(null); // null = still loading

  // Normalize both accepted shapes into one plottable list.
  const plots = useMemo<Plot[]>(() => {
    const out: Plot[] = [];
    (stops || []).forEach((s, i) => {
      const lat = typeof s.latitude === "number" ? s.latitude : NaN;
      const lng = typeof s.longitude === "number" ? s.longitude : NaN;
      if (Number.isNaN(lat) || Number.isNaN(lng)) return;
      const order = s.order ?? i + 1;
      const label = s.label || `#${order}`;
      const status = s.done ? "done" : undefined;
      out.push({
        key: `s-${s.id ?? i}`,
        lat,
        lng,
        label,
        order,
        status,
        done: !!s.done,
        raw: { lat, lng, label, order, status },
      });
    });
    (points || []).forEach((p, i) => {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return;
      out.push({
        key: `p-${p.order ?? i}`,
        lat: p.lat,
        lng: p.lng,
        label: p.label || `#${p.order ?? i + 1}`,
        order: p.order ?? i + 1,
        status: p.status,
        done: isDone(p.status),
        raw: p,
      });
    });
    return out;
  }, [stops, points]);

  // A stable signature so we only redraw when the plotted set actually changes.
  const sig = useMemo(
    () => plots.map((p) => `${p.key}:${p.lat},${p.lng}:${p.done ? 1 : 0}`).join("|"),
    [plots]
  );

  useEffect(() => {
    let cancelled = false;
    if (plots.length === 0) {
      setReady(false);
      return;
    }

    loadGoogleMaps().then((maps) => {
      if (cancelled || !maps || !elRef.current) {
        if (!cancelled) setReady(false);
        return;
      }

      const map =
        mapRef.current ??
        new maps.Map(elRef.current, {
          disableDefaultUI: true,
          gestureHandling: "greedy",
          clickableIcons: false,
          zoomControl: true,
          backgroundColor: token("--surface", "#17191e"),
          styles: DARK_MAP_STYLES,
        });
      mapRef.current = map;

      // Clear any previous overlays before repainting.
      overlaysRef.current.forEach((o) => o.setMap && o.setMap(null));
      overlaysRef.current = [];

      const bounds = new maps.LatLngBounds();
      const path: any[] = [];
      plots.forEach((p) => {
        const pos = { lat: p.lat, lng: p.lng };
        path.push(pos);
        bounds.extend(pos);
        const marker = new maps.Marker({
          position: pos,
          map,
          title: p.label,
          label: {
            text: String(p.order),
            color: token("--background", "#0b0c0e"),
            fontSize: "12px",
            fontWeight: "800",
          },
          icon: {
            path: maps.SymbolPath.CIRCLE,
            scale: 14,
            fillColor: pinColor(p),
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2.5,
          },
        });
        marker.addListener("click", () => tapRef.current?.(p.raw));
        overlaysRef.current.push(marker);
      });

      if (path.length > 1) {
        const line = new maps.Polyline({
          path,
          map,
          strokeColor: token("--gold", "#d4a017"),
          strokeOpacity: 0.85,
          strokeWeight: 3,
        });
        overlaysRef.current.push(line);
        map.fitBounds(bounds, 48);
      } else {
        map.setCenter(path[0]);
        map.setZoom(15);
      }

      setReady(true);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  // Tear down overlays + map on unmount.
  useEffect(
    () => () => {
      overlaysRef.current.forEach((o) => o.setMap && o.setMap(null));
      overlaysRef.current = [];
      mapRef.current = null;
    },
    []
  );

  const showFallback = ready === false || plots.length === 0;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-line bg-surface-2 ${className}`}
      style={{ height }}
    >
      {/* The live map canvas (hidden until it actually renders). */}
      <div ref={elRef} className="absolute inset-0" style={{ opacity: ready ? 1 : 0 }} />

      {showFallback && (
        <div className="absolute inset-0 flex flex-col bg-surface-2 px-4 py-4">
          <div className="mb-3 flex items-center gap-2 text-muted">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-gold/15 text-gold">
              <MapPin size={16} />
            </span>
            <p className="text-sm font-semibold text-ink">
              {t("supervisor.route.mapUnavailable", "Mapa no disponible")}
            </p>
          </div>
          {plots.length === 0 ? (
            <p className="text-xs text-muted">
              {t("supervisor.route.noCoords", "Sin ubicaciones para mostrar")}
            </p>
          ) : (
            <ul className="flex-1 space-y-2 overflow-y-auto">
              {plots.map((p) => (
                <li key={p.key} className="flex items-center gap-3">
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold text-on-accent"
                    style={{ background: pinColor(p) }}
                  >
                    {p.order}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {p.label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default RouteMap;
