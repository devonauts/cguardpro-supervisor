import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, Layers, Navigation } from "lucide-react";
import { BASEMAP } from "@/lib/osm";
import { getCurrentPosition } from "@/lib/geo";
import { useTheme } from "@/context/ThemeContext";

export type StationStatus = "on_duty" | "late" | "offline";

export interface MapStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: StationStatus;
  address?: string | null;
}

interface Props {
  stations: MapStation[];
  /** Only paint pins whose status is in this set (null = all). */
  filter?: StationStatus | null;
  onSelect?: (station: MapStation) => void;
  /** Popup action: open the station's detail screen. */
  onOpenDetail?: (station: MapStation) => void;
  /** Popup action: navigate to the station's address. */
  onNavigate?: (station: MapStation) => void;
  className?: string;
}

const POP_DETAIL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M14 8h3"/><path d="M14 12h3"/></svg>`;
const POP_NAV = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>`;

/* ---- inline glyphs (leaflet HTML can't host React icons) --------------- */
const ICON: Record<string, string> = {
  // building-2 (station)
  on_duty: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/></svg>`,
  // clock (late)
  late: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>`,
  // alert-circle (offline)
  offline: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><circle cx="12" cy="12" r="9"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`,
  // user (you)
  you: `<svg viewBox="0 0 24 24" fill="#fff" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0" fill="#fff"/></svg>`,
};

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c),
  );

function pinIcon(status: StationStatus | "you", label: string): L.DivIcon {
  const kind = status === "you" ? "you" : status;
  return L.divIcon({
    className: "stn-pin-wrap",
    html: `<div class="stn-pin stn-pin--${kind}"><div class="stn-pin__head">${ICON[kind]}</div><div class="stn-pin__label">${esc(label)}</div></div>`,
    iconSize: [150, 58],
    iconAnchor: [75, 42],
  });
}

// Guayaquil, EC — sensible default when nothing has coordinates yet.
const DEFAULT_CENTER: [number, number] = [-2.1709, -79.9224];

/**
 * Full-screen light monitor map for the supervisor Inicio dashboard. Renders the
 * tenant's stations as status-colored teardrop pins (green on-duty / amber late /
 * red offline) over the self-hosted OSM light tiles, plus a blue "You" marker
 * with an accuracy halo. Floating controls: recenter-on-me, grayscale toggle,
 * fit-all-stations. No API key — tiles come from the internal OSM server.
 */
export function StationsMap({ stations, filter = null, onSelect, onOpenDetail, onNavigate, className = "" }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  // Keep the latest callbacks in a ref so popup listeners never go stale.
  const cbRef = useRef({ onSelect, onOpenDetail, onNavigate });
  cbRef.current = { onSelect, onOpenDetail, onNavigate };
  const meRef = useRef<{ marker: L.Marker; halo: L.Circle } | null>(null);
  const meCoordsRef = useRef<[number, number] | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const { theme } = useTheme();
  const [dark, setDark] = useState(theme !== "light");

  const visible = stations.filter(
    (s) =>
      Number.isFinite(s.lat) &&
      Number.isFinite(s.lng) &&
      (!filter || s.status === filter),
  );

  /* ----------------------------------------------------------- init map */
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: false,
    }).setView(DEFAULT_CENTER, 13);
    mapRef.current = map;

    tileRef.current = L.tileLayer(dark ? BASEMAP.dark : BASEMAP.light, {
      subdomains: BASEMAP.subdomains,
      maxZoom: BASEMAP.maxZoom,
      detectRetina: true,
      crossOrigin: true,
    }).addTo(map);

    const t = setTimeout(() => map.invalidateSize(), 200);

    // Best-effort one-shot fix on my location.
    getCurrentPosition()
      .then((c) => {
        meCoordsRef.current = [c.latitude, c.longitude];
        drawMe(c.latitude, c.longitude, c.accuracy);
      })
      .catch(() => {});

    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
      meRef.current = null;
      tileRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----------------------------------------------------- swap basemap */
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

  /* --------------------------------------------------------- draw pins */
  const markersRef = useRef<L.Marker[]>([]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const bounds = L.latLngBounds([]);
    visible.forEach((s) => {
      const m = L.marker([s.lat, s.lng], {
        icon: pinIcon(s.status, s.name),
        keyboard: false,
        riseOnHover: true,
      }).addTo(map);

      // Anchored popup with 2 quick actions: open detail + navigate (by address).
      const pop = document.createElement("div");
      pop.className = "stn-pop";
      pop.innerHTML =
        `<div class="stn-pop-name">${esc(s.name)}</div>` +
        `<div class="stn-pop-row">` +
        `<button type="button" class="stn-pop-btn primary" data-act="detail">${POP_DETAIL}<span>Detalle</span></button>` +
        `<button type="button" class="stn-pop-btn" data-act="nav">${POP_NAV}<span>Navegar</span></button>` +
        `</div>`;
      pop.querySelector('[data-act="detail"]')?.addEventListener("click", (e) => {
        e.stopPropagation();
        map.closePopup();
        cbRef.current.onOpenDetail?.(s);
      });
      pop.querySelector('[data-act="nav"]')?.addEventListener("click", (e) => {
        e.stopPropagation();
        map.closePopup();
        cbRef.current.onNavigate?.(s);
      });
      m.bindPopup(pop, { className: "stn-popup", closeButton: false, offset: [0, -34] });

      m.on("click", () => {
        map.panTo([s.lat, s.lng], { animate: true });
        cbRef.current.onSelect?.(s);
      });
      markersRef.current.push(m);
      bounds.extend([s.lat, s.lng]);
    });
    if (meCoordsRef.current) bounds.extend(meCoordsRef.current);

    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.25), { animate: false, maxZoom: 16 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(visible.map((s) => [s.id, s.status, s.lat, s.lng]))]);

  /* --------------------------------------------------------- helpers */
  function drawMe(lat: number, lng: number, accuracy?: number) {
    const map = mapRef.current;
    if (!map) return;
    if (meRef.current) {
      meRef.current.marker.setLatLng([lat, lng]);
      meRef.current.halo.setLatLng([lat, lng]);
      if (accuracy) meRef.current.halo.setRadius(Math.min(accuracy, 400));
    } else {
      const halo = L.circle([lat, lng], {
        radius: Math.min(accuracy || 180, 400),
        color: "#2563eb",
        weight: 1,
        opacity: 0.35,
        fillColor: "#2563eb",
        fillOpacity: 0.12,
      }).addTo(map);
      const marker = L.marker([lat, lng], {
        icon: pinIcon("you", "Tú"),
        keyboard: false,
        zIndexOffset: 1000,
      }).addTo(map);
      meRef.current = { marker, halo };
    }
  }

  const recenterMe = async () => {
    try {
      const c = await getCurrentPosition();
      meCoordsRef.current = [c.latitude, c.longitude];
      drawMe(c.latitude, c.longitude, c.accuracy);
      mapRef.current?.setView([c.latitude, c.longitude], 15, { animate: true });
    } catch {
      if (meCoordsRef.current)
        mapRef.current?.setView(meCoordsRef.current, 15, { animate: true });
    }
  };

  const fitAll = () => {
    const map = mapRef.current;
    if (!map) return;
    const b = L.latLngBounds([]);
    visible.forEach((s) => b.extend([s.lat, s.lng]));
    if (meCoordsRef.current) b.extend(meCoordsRef.current);
    if (b.isValid()) map.fitBounds(b.pad(0.25), { animate: true, maxZoom: 16 });
  };

  return (
    <div ref={wrapRef} className={`stnmap-wrap ${dark ? "is-dark" : ""} ${className}`}>
      <div ref={elRef} className="h-full w-full" />

      {/* floating controls, bottom-right (cleared above the tab bar by the page) */}
      <div className="absolute bottom-4 right-4 z-[500] flex flex-col gap-3">
        <button type="button" aria-label="Centrar en mi ubicación" className="stnmap-ctrl" onClick={recenterMe}>
          <Crosshair size={20} />
        </button>
        <button
          type="button"
          aria-label="Cambiar estilo del mapa"
          className={`stnmap-ctrl ${dark ? "stnmap-ctrl--on" : ""}`}
          onClick={() => setDark((v) => !v)}
        >
          <Layers size={20} />
        </button>
        <button type="button" aria-label="Ver todas las estaciones" className="stnmap-ctrl" onClick={fitAll}>
          <Navigation size={20} />
        </button>
      </div>
    </div>
  );
}

export default StationsMap;
