import { Capacitor } from "@capacitor/core";
import { rondasService } from "./rondas";
import { getDeviceIdentity } from "./device";
import { emitPush } from "./pushEvents";

/**
 * Show a heads-up banner for a push that arrived while the app is FOREGROUND.
 * Android's FCM SDK only auto-displays notification messages when the app is
 * backgrounded/killed; in the foreground nothing appears, so a supervisor with
 * the app open never saw incoming incidents/pases/messages. We render it via
 * LocalNotifications. Best-effort; never throws.
 */
async function showForegroundBanner(data: any): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform() || !data) return;
    const title = data.title || data.notificationTitle;
    const body = data.body || data.notificationBody || data.message;
    if (!title && !body) return; // data-only signal — no banner
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== "granted") await LocalNotifications.requestPermissions();
    } catch { /* schedule may still work */ }
    await LocalNotifications.schedule({
      notifications: [{
        id: Math.floor(Date.now() % 2147483647),
        title: title || "CGuardPro",
        body: body || "",
        channelId: "default",
        extra: data,
      }],
    });
  } catch (e) {
    console.warn("foreground banner skipped", e);
  }
}

/**
 * Report this device's identity to the backend (device management: bind/flag).
 * Best-effort and safe to call repeatedly — runs on web too (so the admin can
 * see the device even in browser testing). Guard-only endpoint; silently
 * ignored for other roles.
 */
export async function reportDevice(): Promise<void> {
  try {
    const identity = await getDeviceIdentity();
    if (!identity) return;
    await rondasService.registerDevice(identity);
  } catch (e) {
    console.warn("reportDevice skipped", e);
  }
}

/**
 * Register the device for push and send the FCM token to the backend.
 *
 * Uses @capacitor-firebase/messaging (NOT @capacitor/push-notifications) because
 * on iOS the latter yields the raw APNs token, which the backend's FCM send
 * (admin.messaging().sendEachForMulticast) cannot deliver to. The Firebase SDK
 * bridges the APNs token to a real FCM registration token on both platforms.
 *
 * Native (iOS/Android) only — no-op on web/dev. Safe to call repeatedly.
 * iOS also requires: the APNs Auth Key uploaded to Firebase → Cloud Messaging,
 * the Push Notifications capability, and a REAL device (never the simulator).
 */
// Cache the in-flight registration so concurrent callers (App.tsx auth change +
// GuardPermissions) share ONE run — prevents the race where a second call's
// removeAllListeners() wipes the first call's still-registering listeners, and
// prevents listener accumulation across auth cycles.
let registerPromise: Promise<void> | null = null;

export function registerPush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve();
  if (registerPromise) return registerPromise;
  registerPromise = doRegisterPush().finally(() => { registerPromise = null; });
  return registerPromise;
}

async function doRegisterPush(): Promise<void> {
  try {
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");

    let perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await FirebaseMessaging.requestPermissions();
    }
    if (perm.receive !== "granted") return;

    const register = async (token?: string | null) => {
      if (!token) return;
      // Send the stable install id so the backend attaches the token to the
      // guard's real device row (same key as reportDevice) instead of a
      // duplicate token-keyed row. Surface failures (don't swallow silently).
      let deviceId: string | null = null;
      try { deviceId = (await getDeviceIdentity())?.deviceId ?? null; } catch { /* optional */ }
      try {
        await rondasService.registerDeviceToken(token, deviceId);
      } catch (e) {
        console.warn("registerDeviceToken failed", e);
      }
    };

    await FirebaseMessaging.removeAllListeners();
    // Await each addListener so a concurrent removeAllListeners() can't wipe a
    // half-registered listener.
    // The FCM registration token (re-issued over time → keep the backend in sync).
    await FirebaseMessaging.addListener("tokenReceived", (e: any) => register(e?.token));
    // Foreground arrival → fan the payload out AND show a heads-up banner
    // (Android doesn't display FCM notifications while the app is foregrounded).
    await FirebaseMessaging.addListener("notificationReceived", (e: any) => {
      const n = e?.notification || {};
      const data = n.data || {};
      emitPush(data);
      showForegroundBanner({ ...data, title: data.title || n.title, body: data.body || n.body });
    });
    // User tapped a notification (app backgrounded/killed) → surface the payload
    // flagged as a tap so a listener can deep-link (e.g. open the radio screen).
    await FirebaseMessaging.addListener("notificationActionPerformed", (e: any) =>
      emitPush({ ...(e?.notification?.data || {}), _tapped: "1" }));
    // A tap on our foreground LOCAL notification must deep-link like an FCM tap.
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.removeAllListeners();
      await LocalNotifications.addListener("localNotificationActionPerformed", (e: any) =>
        emitPush({ ...(e?.notification?.extra || {}), _tapped: "1" }));
    } catch { /* plugin unavailable */ }

    // getToken() registers for remote notifications and returns the FCM token
    // (on iOS after the APNs token is bridged). The listener above covers refreshes.
    try {
      const { token } = await FirebaseMessaging.getToken();
      register(token);
    } catch (e) {
      console.warn("getToken pending (will arrive via tokenReceived)", e);
    }
  } catch (e) {
    // plugin not installed natively / unsupported platform
    console.warn("registerPush skipped", e);
  }
}
