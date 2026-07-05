import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, Layers } from "lucide-react";
import { BASEMAP, osrmRoute } from "@/lib/osm";
import { useTheme } from "@/context/ThemeContext";

export interface Checkpoint {
  lat: number;
  lng: number;
  name?: string;
  status: "done" | "next" | "pending";
}

export interface GuardLoc {
  lat: number;
  lng: number;
  name?: string;
  avatarUrl?: string | null;
}

interface Props {
  checkpoints: Checkpoint[];
  guard?: GuardLoc | null;
  height?: number;
  className?: string;
}

const CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>`;
const DOT = `<span style="width:8px;height:8px;border-radius:9999px;background:#fff;display:block"></span>`;

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));

function pinIcon(cp: Checkpoint): L.DivIcon {
  const glyph = cp.status === "done" ? CHECK : DOT;
  const label = cp.name ? `<div class="cp-pin__label">${esc(cp.name)}</div>` : "";
  return L.divIcon({
    className: "cp-pin-wrap",
    html: `<div class="cp-pin cp-pin--${cp.status}"><div class="cp-pin__head">${glyph}</div>${label}</div>`,
    iconSize: [132, 46],
    iconAnchor: [66, 35],
  });
}

function guardIcon(g: GuardLoc): L.DivIcon {
  const inner = g.avatarUrl
    ? `<img src="${esc(g.avatarUrl)}" alt="" />`
    : `<svg viewBox="0 0 24 24" fill="#fff" width="16" height="16"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg>`;
  return L.divIcon({
    className: "guard-mk-wrap",
    html: `<div class="guard-mk">${inner}</div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
}

/**
 * Polished patrol map for the Guard Detail screen. Uses a purpose-built
 * cartographic basemap (CARTO voyager / dark_matter, configurable via
 * BASEMAP env) that follows the app theme — not a CSS-inverted raster.
 * Renders checkpoints as status pins (green ✓ done / blue next / gray pending),
 * threads a blue OSRM route through them (straight-leg fallback), and drops a
 * ringed guard-location marker. Floating recenter + light/dark toggle controls.
 */
export function PatrolMap({ checkpoints, guard = null, height = 220, className = "" }: Props) {
  const { theme } = useTheme();
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  // Local override of the basemap (the "layers" control); defaults to app theme.
  const [dark, setDark] = useState(theme !== "light");

  const valid = checkpoints.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));

  /* ------------------------------------------------------------- init */
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
    }).setView([-2.1709, -79.9224], 14);
    mapRef.current = map;
    tileRef.current = L.tileLayer(dark ? BASEMAP.dark : BASEMAP.light, {
      subdomains: BASEMAP.subdomains,
      maxZoom: BASEMAP.maxZoom,
      detectRetina: true,
      crossOrigin: true,
    }).addTo(map);
    const t = setTimeout(() => map.invalidateSize(), 200);
    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------------------------------- swap basemap */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileRef.current) tileRef.current.remove();
    tileRef.current = L.tileLayer(dark ? BASEMAP.dark : BASEMAP.light, {
      subdomains: BASEMAP.subdomains,
      maxZoom: BASEMAP.maxZoom,
      detectRetina: true,
      crossOrigin: true,
    }).addTo(map);
    tileRef.current.bringToBack();
  }, [dark]);

  // Follow the app theme when it changes.
  useEffect(() => setDark(theme !== "light"), [theme]);

  /* ------------------------------------------------ markers + route */
  const layersRef = useRef<L.Layer[]>([]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    layersRef.current.forEach((l) => l.remove());
    layersRef.current = [];

    const bounds = L.latLngBounds([]);

    // Route line through checkpoints (blue). OSRM if available, else straight.
    if (valid.length >= 2) {
      const legs: Array<[number, number]> = valid.map((c) => [c.lat, c.lng]);
      osrmRoute(legs)
        .then((line) => {
          if (!mapRef.current || !line.length) throw new Error("empty");
          const glow = L.polyline(line, { color: "#3b82f6", weight: 9, opacity: 0.16 }).addTo(map);
          const main = L.polyline(line, { color: "#3b82f6", weight: 4, opacity: 0.95 }).addTo(map);
          layersRef.current.push(glow, main);
        })
        .catch(() => {
          if (!mapRef.current) return;
          const dash = L.polyline(legs, {
            color: "#3b82f6",
            weight: 3,
            opacity: 0.8,
            dashArray: "3 8",
          }).addTo(map);
          layersRef.current.push(dash);
        });
    }

    // Checkpoint pins.
    valid.forEach((c) => {
      const m = L.marker([c.lat, c.lng], { icon: pinIcon(c), keyboard: false }).addTo(map);
      layersRef.current.push(m);
      bounds.extend([c.lat, c.lng]);
    });

    // Guard marker.
    if (guard && Number.isFinite(guard.lat) && Number.isFinite(guard.lng)) {
      const gm = L.marker([guard.lat, guard.lng], {
        icon: guardIcon(guard),
        keyboard: false,
        zIndexOffset: 1000,
      }).addTo(map);
      layersRef.current.push(gm);
      bounds.extend([guard.lat, guard.lng]);
    }

    if (bounds.isValid()) map.fitBounds(bounds.pad(0.28), { animate: false, maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(valid.map((c) => [c.lat, c.lng, c.status])), guard?.lat, guard?.lng]);

  const fitAll = () => {
    const map = mapRef.current;
    if (!map) return;
    const b = L.latLngBounds([]);
    valid.forEach((c) => b.extend([c.lat, c.lng]));
    if (guard) b.extend([guard.lat, guard.lng]);
    if (b.isValid()) map.fitBounds(b.pad(0.28), { animate: true, maxZoom: 16 });
  };

  return (
    <div className={`patmap-wrap ${dark ? "" : "is-light"} ${className}`} style={{ height }}>
      <div ref={elRef} className="h-full w-full" />
      <div className="absolute bottom-3 right-3 z-[500] flex flex-col gap-2.5">
        <button type="button" aria-label="Centrar" className="stnmap-ctrl" onClick={fitAll}>
          <Crosshair size={19} />
        </button>
        <button
          type="button"
          aria-label="Estilo del mapa"
          className={`stnmap-ctrl ${dark ? "stnmap-ctrl--on" : ""}`}
          onClick={() => setDark((v) => !v)}
        >
          <Layers size={19} />
        </button>
      </div>
    </div>
  );
}

export default PatrolMap;
