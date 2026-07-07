import { Component, type ErrorInfo, type ReactNode } from "react";
import { logError } from "@/lib/errorLog";

/**
 * App-wide React error boundary. window.onerror/unhandledrejection don't catch
 * render/lifecycle errors, so without this a single bad render white-screens the
 * whole native app. Logs to the diagnostics buffer + shows a recover UI.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try { logError("react.errorBoundary", error, { componentStack: info?.componentStack }); } catch { /* ignore */ }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 16, minHeight: "100vh", padding: 24, textAlign: "center",
            paddingTop: "calc(env(safe-area-inset-top) + 24px)",
            paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
            background: "#0d0d0d", color: "#fff",
          }}
        >
          <div style={{ fontSize: 40 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Algo salió mal</div>
          <div style={{ fontSize: 14, opacity: 0.7, maxWidth: 320 }}>
            La app encontró un error inesperado. Vuelve a intentarlo.
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8, padding: "12px 24px", borderRadius: 12, border: "none",
              background: "#d4af37", color: "#000", fontWeight: 700, fontSize: 15,
            }}
          >
            Reiniciar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
