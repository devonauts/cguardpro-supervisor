import { isPlatform } from "@ionic/react";

/**
 * Open the device's maps app to navigate to a coordinate.
 *
 * - iOS: Apple Maps via the `maps://` scheme (`daddr` = destination).
 * - Everywhere else: Google Maps / the `geo:` intent.
 *
 * Uses `window.open` as a safe fallback and never throws — turn-by-turn
 * navigation is a best-effort hand-off to the OS.
 */
export function openNativeNavigation(
  lat: number,
  lng: number,
  label?: string
): void {
  const dest = `${lat},${lng}`;
  const q = label ? encodeURIComponent(label) : dest;
  try {
    let url: string;
    if (isPlatform("ios")) {
      // Apple Maps — daddr drives directions to the destination.
      url = `maps://?daddr=${dest}&q=${q}`;
    } else if (isPlatform("android")) {
      // Android geo intent with an optional label.
      url = `geo:${dest}?q=${dest}(${q})`;
    } else {
      // Web / desktop — Google Maps directions.
      url = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
    }
    const win = window.open(url, "_system");
    if (!win) {
      // Fallback to the universal Google Maps web URL if the scheme was blocked.
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${dest}`,
        "_blank"
      );
    }
  } catch {
    try {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${dest}`,
        "_blank"
      );
    } catch {
      /* give up silently — navigation is best-effort */
    }
  }
}

/**
 * Open the device's maps app with directions to a text ADDRESS (not coords).
 * Used by the dashboard station-pin popup — the destination is the station's
 * postal address, resolved by the maps app itself.
 */
export function openAddressNavigation(address: string): void {
  const q = encodeURIComponent(address);
  try {
    let url: string;
    if (isPlatform("ios")) {
      url = `maps://?daddr=${q}`;
    } else if (isPlatform("android")) {
      url = `geo:0,0?q=${q}`;
    } else {
      url = `https://www.google.com/maps/dir/?api=1&destination=${q}`;
    }
    const win = window.open(url, "_system");
    if (!win) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${q}`, "_blank");
    }
  } catch {
    try {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${q}`, "_blank");
    } catch {
      /* best-effort */
    }
  }
}

export default openNativeNavigation;
