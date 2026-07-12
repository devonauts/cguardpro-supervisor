import { useEffect, useState } from "react";
import { IonApp, IonSpinner } from "@ionic/react";
import { IonReactRouter } from "@ionic/react-router";
import { App as CapApp } from "@capacitor/app";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { registerPush } from "./lib/push";
import AnimatedSplash from "./components/AnimatedSplash";
import { StatusBanner } from "./components/StatusBanner";
import { startDeviceStatus, stopDeviceStatus } from "./lib/deviceStatus";
import { startLocationReporter } from "./lib/locationReporter";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import SupervisorApp from "./pages/supervisor/SupervisorApp";

/**
 * Extract a password-reset token from a deep link. Handles both the custom
 * scheme (cguardpro://reset-password?token=…) and the universal/web link
 * (https://app.cguardpro.com/guard-reset?token=…).
 */
function parseResetToken(url?: string | null): string | null {
  if (!url) return null;
  if (!/reset-password|guard-reset/i.test(url)) return null;
  try {
    const u = new URL(url);
    const token = u.searchParams.get("token");
    if (token) return token;
  } catch {
    /* custom-scheme URLs may not parse in all engines — fall through */
  }
  const m = /[?&]token=([^&#]+)/.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
}

function Gate() {
  const { loading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;
    // Register the push token for this device. This is the supervisor app, so
    // every authenticated user is a supervisor — no guard branch.
    (async () => {
      await registerPush();
    })();
  }, [isAuthenticated]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <IonSpinner name="crescent" className="text-gold" />
      </div>
    );
  }

  if (!isAuthenticated) return <Login />;

  // Supervisor-only app: any authenticated user gets the supervisor root.
  return <SupervisorApp />;
}

export default function App() {
  const [resetToken, setResetToken] = useState<string | null>(null);

  // Start network + battery monitoring once for the whole app; tear it down on
  // app unmount (StrictMode-safe — start/stop are idempotent).
  useEffect(() => { startDeviceStatus(); return () => stopDeviceStatus(); }, []);

  // Continuous live-telemetry (background-capable) while the supervisor is on
  // duty — self-manages start/stop on duty changes; runs once for the app.
  useEffect(() => { startLocationReporter(); }, []);

  // Android hardware back button: navigate back through the router history when a
  // stack exists, otherwise minimize instead of dumping the user out of the app.
  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    (async () => {
      try {
        sub = await CapApp.addListener("backButton", ({ canGoBack }: { canGoBack: boolean }) => {
          if (canGoBack) window.history.back();
          else CapApp.minimizeApp?.();
        });
      } catch { /* not native */ }
    })();
    return () => { try { sub?.remove(); } catch { /* ignore */ } };
  }, []);

  // Listen for reset deep links (cold start + while running) and the web URL.
  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    (async () => {
      try {
        const launch = await CapApp.getLaunchUrl();
        const tk = parseResetToken(launch?.url);
        if (tk) setResetToken(tk);
      } catch {
        /* not native / no launch url */
      }
      try {
        sub = await CapApp.addListener("appUrlOpen", (data: { url: string }) => {
          const tk = parseResetToken(data?.url);
          if (tk) setResetToken(tk);
        });
      } catch {
        /* listener unavailable on web */
      }
    })();
    // Web/PWA fallback (opened in a browser with ?token=).
    try {
      const tk = parseResetToken(window.location.href);
      if (tk) setResetToken(tk);
    } catch {
      /* ignore */
    }
    return () => {
      try {
        sub?.remove();
      } catch {
        /* ignore */
      }
    };
  }, []);

  return (
    <ThemeProvider>
      <IonApp>
        <AnimatedSplash />
        <StatusBanner />
        <ErrorBoundary>
          <AuthProvider>
            <NotificationProvider>
              <IonReactRouter>
                {resetToken ? (
                  <ResetPassword token={resetToken} onDone={() => setResetToken(null)} />
                ) : (
                  <Gate />
                )}
              </IonReactRouter>
            </NotificationProvider>
          </AuthProvider>
        </ErrorBoundary>
      </IonApp>
    </ThemeProvider>
  );
}
