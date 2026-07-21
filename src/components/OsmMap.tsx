import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { OSM, osrmRoute } from "@/lib/osm";

export interface OsmPoint {
  lat: number;
  lng: number;
  label?: string;
  order?: number;
  status?: "done" | "current" | "pending" | string;
}

interface Props {
  points?: OsmPoint[];
  height?: number;
  /** Draw the driving route (OSRM) through the stops. */
  showRoute?: boolean;
  className?: string;
}

const STATUS_COLOR: Record<string, string> = {
  done: "#22c55e",
  current: "#d4a017",
  pending: "#8a8f98",
};

// Guayaquil, EC — sensible default when no stops have coordinates yet.
const DEFAULT_CENTER: [number, number] = [-2.1709, -79.9224];

/**
 * Futuristic dark map built on the self-hosted OSM tile server (see lib/osm).
 * Raster tiles are inverted to a night palette via CSS (.osm-dark-tiles); stops
 * render as glowing gold/green nodes and the OSRM driving line threads them.
 * Degrades gracefully: no coords → default view; OSRM down → dashed straight legs.
 */
export function OsmMap({
  points = [],
  height = 260,
  showRoute = true,
  className = "",
}: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.Layer[]>([]);

  /* --------------------------------------------------------- init once */
  // Build the map + tile layer a SINGLE time. Previously the whole map was torn
  // down and recreated (new tile layer → refetched tiles, visible flash) on every
  // `points` change; now overlays are diffed on a separate effect below.
  useEffect(() => {
    const el = elRef.current;
    if (!el || mapRef.current) return;
    if ((el as any)._leaflet_id) { try { delete (el as any)._leaflet_id; } catch { /* ignore */ } }
    let map: L.Map;
    try {
      map = L.map(el, {
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: false,
      }).setView(DEFAULT_CENTER, 14);
    } catch {
      return;
    }
    mapRef.current = map;

    L.tileLayer(OSM.tileUrl, {
      maxZoom: 19,
      className: "osm-dark-tiles",
      crossOrigin: true,
    }).addTo(map);

    // Leaflet needs a size recalc once the container has laid out.
    const t = setTimeout(() => { try { map.invalidateSize(); } catch { /* detached */ } }, 200);

    return () => {
      clearTimeout(t);
      try { map.remove(); } catch { /* already gone */ }
      mapRef.current = null;
      layersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------- draw / diff overlays */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      layersRef.current.forEach((l) => l.remove());
      layersRef.current = [];

      const valid = points.filter(
        (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng),
      );

      const bounds = L.latLngBounds([]);
      valid.forEach((p, i) => {
        const color = STATUS_COLOR[p.status || "pending"] || "#d4a017";
        const m = L.marker([p.lat, p.lng], {
          icon: L.divIcon({
            className: "osm-pin",
            html: `<span class="osm-pin-dot" style="--c:${color}">${p.order ?? i + 1}</span>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
          keyboard: false,
        }).addTo(map);
        layersRef.current.push(m);
        bounds.extend([p.lat, p.lng]);
      });

      if (showRoute && valid.length >= 2) {
        const legs: Array<[number, number]> = valid.map((p) => [p.lat, p.lng]);
        osrmRoute(legs)
          .then((line) => {
            if (!mapRef.current || !line.length) throw new Error("empty");
            const glow = L.polyline(line, { color: "#d4a017", weight: 9, opacity: 0.14 }).addTo(map);
            const main = L.polyline(line, { color: "#e8c14a", weight: 3.5, opacity: 0.95 }).addTo(map);
            layersRef.current.push(glow, main);
          })
          .catch(() => {
            if (!mapRef.current) return;
            const dash = L.polyline(legs, {
              color: "#d4a017",
              weight: 3,
              opacity: 0.7,
              dashArray: "2 8",
            }).addTo(map);
            layersRef.current.push(dash);
          });
      }

      if (valid.length > 1) map.fitBounds(bounds.pad(0.3));
      else if (valid.length === 1) map.setView([valid[0].lat, valid[0].lng], 15);
    } catch { /* map torn down mid-update */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(points), showRoute]);

  return (
    <div className={`osm-map-wrap ${className}`} style={{ height }}>
      <div ref={elRef} className="h-full w-full" />
      <div className="osm-map-vignette" aria-hidden="true" />
    </div>
  );
}

export default OsmMap;
