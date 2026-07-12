// Live-telemetry reporter for the SUPERVISOR app. While the supervisor is on
// duty, this pings /supervisor/me/location so the Control Center live map + the
// walked-trail show real movement. Previously the supervisor app had NO
// continuous telemetry at all (only one-shot fixes on manual actions), so the
// supervisor's dot never moved on the map.
//
// BACKGROUND: uses @capacitor-community/background-geolocation on native so the
// trail keeps recording when the screen sleeps / the app is backgrounded. Falls
// back to a foreground setInterval on web or when the plugin is unavailable.
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { api, tenantPath, unwrap } from "./api";
import { getDeviceStatus } from "./deviceStatus";
import { subscribeDuty, getDuty } from "./dutyState";

interface BgLocation {
  latitude: number; longitude: number; accuracy?: number | null;
  speed?: number | null; bearing?: number | null;
}
interface BackgroundGeolocationPlugin {
  addWatcher(
    options: {
      backgroundMessage?: string; backgroundTitle?: string;
      requestPermissions?: boolean; stale?: boolean; distanceFilter?: number;
    },
    callback: (location?: BgLocation, error?: { code?: string; message?: string }) => void,
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
}
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

const INTERVAL_MS = 45_000;
const MIN_SEND_GAP_MS = 30_000;

interface FullCoords {
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
}

async function readPosition(): Promise<FullCoords | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 });
      const c = pos.coords;
      return {
        latitude: c.latitude,
        longitude: c.longitude,
        speed: typeof c.speed === "number" ? c.speed : null,
        heading: typeof c.heading === "number" ? c.heading : null,
        accuracy: typeof c.accuracy === "number" ? c.accuracy : null,
      };
    }
    return await new Promise<FullCoords | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          speed: typeof p.coords.speed === "number" ? p.coords.speed : null,
          heading: typeof p.coords.heading === "number" ? p.coords.heading : null,
          accuracy: typeof p.coords.accuracy === "number" ? p.coords.accuracy : null,
        }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 },
      );
    });
  } catch {
    return null;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;
let watcherId: string | null = null;
let lastSentAt = 0;

async function send(pos: FullCoords) {
  if (inFlight) return;
  inFlight = true;
  try {
    const bl = getDeviceStatus().batteryLevel;
    await api
      .post(tenantPath("/supervisor/me/location"), {
        data: {
          latitude: pos.latitude,
          longitude: pos.longitude,
          speed: pos.speed,
          heading: pos.heading,
          accuracy: pos.accuracy,
          battery: bl == null ? null : Math.round(bl * 100),
        },
      })
      .then(unwrap);
    lastSentAt = Date.now();
  } catch {
    /* best-effort */
  } finally {
    inFlight = false;
  }
}

async function tick() {
  if (!getDuty()) return;
  const pos = await readPosition();
  if (pos) await send(pos);
}

async function startBackgroundWatcher(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || watcherId) return watcherId != null;
  try {
    watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundMessage: "Tu ubicación se comparte con la central mientras estás en turno.",
        backgroundTitle: "Turno activo",
        requestPermissions: true,
        stale: false,
        distanceFilter: 25,
      },
      (location, error) => {
        if (error || !location || !getDuty()) return;
        if (Date.now() - lastSentAt < MIN_SEND_GAP_MS) return;
        void send({
          latitude: location.latitude,
          longitude: location.longitude,
          speed: typeof location.speed === "number" ? location.speed : null,
          heading: typeof location.bearing === "number" ? location.bearing : null,
          accuracy: typeof location.accuracy === "number" ? location.accuracy : null,
        });
      },
    );
    return true;
  } catch {
    watcherId = null;
    return false;
  }
}

async function stopBackgroundWatcher() {
  if (watcherId) {
    try { await BackgroundGeolocation.removeWatcher({ id: watcherId }); } catch { /* ignore */ }
    watcherId = null;
  }
}

async function run() {
  if (timer || watcherId) return;
  const bg = await startBackgroundWatcher();
  if (bg) { void tick(); return; }
  void tick();
  timer = setInterval(tick, INTERVAL_MS);
}
function halt() {
  if (timer) { clearInterval(timer); timer = null; }
  void stopBackgroundWatcher();
}

let started = false;
/** Init once at app startup; self-manages start/stop on duty changes. */
export function startLocationReporter() {
  if (started) return;
  started = true;
  if (getDuty()) void run();
  subscribeDuty((onDuty) => { if (onDuty) void run(); else halt(); });
}
