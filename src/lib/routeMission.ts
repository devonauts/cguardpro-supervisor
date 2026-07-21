import i18n from "@/i18n";
// Shared helpers for the multi-step route mission flow. Normalizes the
// /supervisor/me/routes payloads (which vary in shape) and computes sequential
// arrival ETAs for the timeline.

const TRAVEL_MIN = 12; // assumed travel time per leg when no routing data exists

export interface StopTask {
  id: string;
  label: string;
}

export interface Stop {
  id: string;
  order: number;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  duration: number | null; // minutes on-site
  siteType: string | null;
  tasks: StopTask[];
  done: boolean;
}

function asText(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return v.name || v.stationName || v.title || v.address || "";
  return String(v);
}
function toNum(v: any): number | null {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Pull the ordered stops out of a route payload (points | stops). */
export function normalizeStops(routeData: any): Stop[] {
  const raw: any[] = Array.isArray(routeData?.points)
    ? routeData.points
    : Array.isArray(routeData?.stops)
    ? routeData.stops
    : [];
  return raw
    .map((p: any, i: number): Stop => {
      const site = p.postSite ?? p.site ?? p.station ?? null;
      const rawTasks: any[] = Array.isArray(p.tasks) ? p.tasks : Array.isArray(p.checklist) ? p.checklist : [];
      return {
        id: String(p.id ?? p.pointId ?? i),
        order: Number(p.order ?? p.sequence ?? p.index ?? i + 1),
        name: asText(p.name) || asText(p.station) || asText(site) || `Parada ${i + 1}`,
        address: asText(p.address) || asText(site) || "",
        lat: toNum(p.lat ?? p.latitude),
        lng: toNum(p.lng ?? p.longitude),
        duration: toNum(p.duration ?? p.scheduledHits) ?? null,
        siteType: p.siteType ?? null,
        tasks: rawTasks.map((tk: any, k: number) => ({ id: String(tk?.id ?? tk?.taskId ?? k), label: asText(tk) || `#${k + 1}` })),
        done: p.visit?.status === "completed" || p.status === "completed" || Boolean(p.completedAt),
      };
    })
    .sort((a, b) => a.order - b.order);
}

/** Index of the next not-yet-completed stop at or after `from` (−1 if all done). */
export function nextIncompleteIndex(stops: Stop[], from = 0): number {
  for (let i = Math.max(0, from); i < stops.length; i++) if (!stops[i].done) return i;
  return -1;
}

/** The route id + name from a `today()` row or a `routeDetail()` payload. */
export function routeIdName(data: any): { id: string; name: string } {
  const r = data?.route ?? data;
  return { id: String(r?.id ?? ""), name: asText(r?.name) || asText(r?.title) || "Ruta" };
}

/** Whether the route's run is already in progress. */
export function isRunActive(data: any): boolean {
  const st = String(data?.run?.status ?? data?.status ?? "").toLowerCase();
  return st === "in_progress" || st === "started" || st === "active";
}

/** Cumulative arrival Date for each stop, starting `from` (default now). */
export function computeEtas(stops: Stop[], from: Date = new Date()): Date[] {
  const out: Date[] = [];
  let t = from.getTime();
  stops.forEach((s, i) => {
    t += TRAVEL_MIN * 60000; // travel to this stop
    out.push(new Date(t));
    t += (s.duration ?? 5) * 60000; // on-site time before the next leg
    void i;
  });
  return out;
}

export function fmtTime(d: Date): string {
  return d.toLocaleTimeString(i18n.language?.startsWith("en") ? "en-US" : "es-ES", { hour: "numeric", minute: "2-digit" });
}
export function minutesUntil(d: Date): number {
  return Math.max(1, Math.round((d.getTime() - Date.now()) / 60000));
}
