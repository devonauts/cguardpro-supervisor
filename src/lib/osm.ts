/**
 * Self-hosted OSM stack (LAN by default) — tiles, routing, geocoding.
 *
 * Defaults point at the local OSM services on 192.168.86.24. Override per build
 * with Vite env vars (e.g. VITE_OSM_HOST, VITE_OSM_TILE_URL) when the app runs
 * off-LAN behind a public relay. No API key — it's an internal service.
 */
const env = (import.meta as any).env || {};
const HOST: string = env.VITE_OSM_HOST || '192.168.86.24';

export const OSM = {
  host: HOST,
  /** Raster tiles — {z}/{x}/{y}.png. */
  tileUrl: env.VITE_OSM_TILE_URL || `http://${HOST}:8081/tile/{z}/{x}/{y}.png`,
  /** OSRM driving router base. */
  osrmUrl: env.VITE_OSM_OSRM_URL || `http://${HOST}:5000`,
  /** Nominatim geocode/reverse base. */
  nominatimUrl: env.VITE_OSM_NOMINATIM_URL || `http://${HOST}:8080`,
  /** Photon autocomplete base. */
  photonUrl: env.VITE_OSM_PHOTON_URL || `http://${HOST}:2322`,
};

/**
 * Purpose-built basemap styles for the polished maps (guard-detail patrol map).
 * Clean light + dark cartographic styles (not a CSS invert of raster OSM). Both
 * are `{s}`/`{z}/{x}/{y}` XYZ layers with `abcd` subdomains + retina `{r}`.
 * Override per build with VITE_MAP_TILE_URL / VITE_MAP_TILE_URL_DARK to point at
 * your own styled tile server. Attribution belongs to OpenStreetMap + CARTO.
 */
export const BASEMAP = {
  light:
    env.VITE_MAP_TILE_URL ||
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark:
    env.VITE_MAP_TILE_URL_DARK ||
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  /** Aerial/satellite imagery (Esri World Imagery — {z}/{y}/{x} order). */
  satellite:
    env.VITE_MAP_TILE_URL_SATELLITE ||
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  subdomains: 'abcd',
  maxZoom: 20,
};

/**
 * Driving route through the given stops. Input coords are [lat, lng]; OSRM wants
 * lng,lat. Returns the geometry as [lat, lng] pairs ready for a Leaflet polyline,
 * or [] if routing is unavailable (caller falls back to straight segments).
 */
export async function osrmRoute(
  latlngs: Array<[number, number]>,
): Promise<Array<[number, number]>> {
  if (latlngs.length < 2) return [];
  const path = latlngs.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const url = `${OSM.osrmUrl}/route/v1/driving/${path}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const json = await res.json();
  const coords: Array<[number, number]> =
    json?.routes?.[0]?.geometry?.coordinates || [];
  return coords.map(([lng, lat]) => [lat, lng] as [number, number]);
}
