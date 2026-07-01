/**
 * Google Maps JS SDK loader.
 *
 * Injects the Maps JS script once (idempotent) using the Vite env key
 * VITE_GOOGLE_MAPS_API_KEY and resolves the `google.maps` namespace. If there
 * is no key, or the SDK fails to load, it RESOLVES NULL — it never throws — so
 * callers can gracefully fall back (e.g. hide the map) without a crash.
 */

// Minimal ambient shim so this compiles without the @types/google.maps package.
// The real SDK attaches `google` to window at runtime.
declare global {
  // eslint-disable-next-line no-var
  var google: any;
  interface Window {
    google?: any;
    __cguardGmapsCb?: () => void;
  }
}

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

let loadPromise: Promise<typeof google.maps | null> | null = null;

export function loadGoogleMaps(): Promise<typeof google.maps | null> {
  // Already loaded.
  if (typeof window !== "undefined" && window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }
  // Load in flight / already attempted.
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<typeof google.maps | null>((resolve) => {
    try {
      if (typeof window === "undefined" || typeof document === "undefined") {
        resolve(null);
        return;
      }
      if (!API_KEY) {
        // No key configured — resolve null rather than injecting a broken script.
        resolve(null);
        return;
      }

      const finish = () => resolve(window.google?.maps ?? null);

      // Reuse an existing tag if one is already on the page.
      const existing = document.getElementById(
        "cguard-gmaps-sdk"
      ) as HTMLScriptElement | null;
      if (existing) {
        if (window.google?.maps) finish();
        else existing.addEventListener("load", finish, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.id = "cguard-gmaps-sdk";
      script.async = true;
      script.defer = true;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
        API_KEY
      )}&libraries=marker`;
      script.onload = finish;
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    } catch {
      resolve(null);
    }
  });

  return loadPromise;
}

export default loadGoogleMaps;
