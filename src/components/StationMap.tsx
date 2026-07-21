import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Maximize2, Layers, Navigation } from "lucide-react";
import { BASEMAP } from "@/lib/osm";
import { openNativeNavigation } from "@/lib/navigate";
import styles from "./StationMap.module.css";

export interface StationMapPoint {
  lat: number;
  lng: number;
  name?: string;
  scanned?: boolean;
}

interface Props {
  lat: number | null;
  lng: number | null;
  name?: string;
  geofence?: Array<{ lat: number; lng: number }>;
  geofenceRadius?: number | null;
  checkpoints?: StationMapPoint[];
  height?: number;
}

const GOLD = "#d4a017";

const buildingIcon = L.divIcon({
  className: "",
  html: `<div class="${styles.stationMarker}"><svg viewBox="0 0 24 24" fill="none" stroke="${GOLD}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/></svg></div>`,
  iconSize: [46, 46],
  iconAnchor: [23, 23],
});

function checkpointIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="${styles.checkpoint}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

/**
 * Station geofence map for the Station Details screen. Satellite basemap (Esri
 * World Imagery, configurable via BASEMAP.satellite) with the station's geofence
 * polygon (gold), its ronda checkpoints (gold nodes) and a central building
 * marker + name label. Falls back to a radius circle when there's no polygon.
 * Controls: fullscreen-fit, layer toggle (satellite/street), navigate.
 */
export function StationMap({
  lat,
  lng,
  name,
  geofence = [],
  geofenceRadius = null,
  checkpoints = [],
  height = 240,
}: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const [sat, setSat] = useState(true);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const center: [number, number] =
      lat != null && lng != null ? [lat, lng] : [-2.1709, -79.9224];
    const map = L.map(elRef.current, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
    }).setView(center, 17);
    mapRef.current = map;
    // Honor the current layer choice: if the effect re-runs after the user toggled
    // to street view (data change recreates the map), don't silently snap back to
    // satellite while the toggle still reads "street".
    tileRef.current = L.tileLayer(sat ? BASEMAP.satellite : BASEMAP.dark, {
      subdomains: BASEMAP.subdomains,
      maxZoom: BASEMAP.maxZoom,
    }).addTo(map);

    const layers: L.Layer[] = [];
    const bounds = L.latLngBounds([]);

    const poly = (geofence || []).filter(
      (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng),
    );
    if (poly.length >= 3) {
      const latlngs = poly.map((p) => [p.lat, p.lng]) as [number, number][];
      const shape = L.polygon(latlngs, {
        color: GOLD,
        weight: 2.5,
        opacity: 0.95,
        fillColor: GOLD,
        fillOpacity: 0.08,
      }).addTo(map);
      layers.push(shape);
      // vertex nodes
      latlngs.forEach((ll) => {
        const node = L.marker(ll, { icon: checkpointIcon(), keyboard: false }).addTo(map);
        layers.push(node);
        bounds.extend(ll);
      });
    } else if (lat != null && lng != null && geofenceRadius) {
      const circle = L.circle([lat, lng], {
        radius: geofenceRadius,
        color: GOLD,
        weight: 2,
        opacity: 0.9,
        fillColor: GOLD,
        fillOpacity: 0.08,
      }).addTo(map);
      layers.push(circle);
      bounds.extend(circle.getBounds());
    }

    (checkpoints || [])
      .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng))
      .forEach((c) => {
        const node = L.marker([c.lat, c.lng], { icon: checkpointIcon(), keyboard: false }).addTo(map);
        layers.push(node);
        bounds.extend([c.lat, c.lng]);
      });

    if (lat != null && lng != null) {
      const marker = L.marker([lat, lng], { icon: buildingIcon, keyboard: false, zIndexOffset: 1000 }).addTo(map);
      layers.push(marker);
      if (name) {
        const label = L.tooltip({
          permanent: true,
          direction: "bottom",
          offset: [0, 18],
          className: styles.stationLabel,
        })
          .setLatLng([lat, lng])
          .setContent(name);
        map.addLayer(label);
        layers.push(label);
      }
      bounds.extend([lat, lng]);
    }

    if (bounds.isValid()) map.fitBounds(bounds.pad(0.35), { animate: false, maxZoom: 18 });
    const t = setTimeout(() => map.invalidateSize(), 200);

    return () => {
      clearTimeout(t);
      layers.forEach((l) => l.remove());
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, JSON.stringify(geofence), JSON.stringify(checkpoints)]);

  const toggleLayer = () => {
    const map = mapRef.current;
    if (!map) return;
    const next = !sat;
    setSat(next);
    if (tileRef.current) tileRef.current.remove();
    tileRef.current = L.tileLayer(next ? BASEMAP.satellite : BASEMAP.dark, {
      subdomains: BASEMAP.subdomains,
      maxZoom: BASEMAP.maxZoom,
    }).addTo(map);
    tileRef.current.bringToBack();
  };

  const fit = () => {
    const map = mapRef.current;
    if (!map || lat == null || lng == null) return;
    map.setView([lat, lng], 17, { animate: true });
  };

  return (
    <div className={styles.wrap} style={{ height }}>
      <div ref={elRef} className="h-full w-full" />
      <div className={styles.controls}>
        <button type="button" aria-label="Ajustar" className={styles.ctrl} onClick={fit}>
          <Maximize2 size={18} />
        </button>
        <button type="button" aria-label="Capa" className={styles.ctrl} onClick={toggleLayer}>
          <Layers size={18} />
        </button>
        <button
          type="button"
          aria-label="Navegar"
          className={styles.ctrl}
          onClick={() => lat != null && lng != null && openNativeNavigation(lat, lng, name)}
        >
          <Navigation size={18} />
        </button>
      </div>
    </div>
  );
}

export default StationMap;
