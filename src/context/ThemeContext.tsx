import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";

/**
 * Theme system — the single runtime switch for the whole app.
 *
 * The app ships two themes driven entirely by CSS tokens (see
 * theme/variables.css): LIGHT is the default; DARK = matte black + neutral dark gray
 * and LIGHT (white background, crisp white components). Switching is a single
 * class toggle on <html>: `theme-light` present → LIGHT, absent → DARK. Every
 * `bg-*`/`text-*`/`border-*` utility resolves to a runtime var, so the entire
 * UI re-skins instantly with no per-component logic.
 *
 * Persistence: localStorage key `wa.theme` ('dark' | 'light'), default 'light'.
 * main.tsx applies the persisted class to <html> BEFORE React renders to avoid
 * a flash; this provider keeps React state and the DOM class in sync after.
 */

export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "wa.theme";

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/** Read the persisted theme, defaulting to LIGHT. Safe to call pre-render. */
export function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark"
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

/** Toggle the `theme-light` class on <html> to match the given theme. */
export function applyThemeClass(theme: Theme): void {
  const el = document.documentElement;
  el.classList.toggle("theme-light", theme === "light");
}

/**
 * Sync the NATIVE status bar to the theme so it's readable in both modes.
 * Style.Dark = dark text (for a light background); Style.Light = light text (for
 * a dark background). Android also gets a matching background color. No-op on web.
 */
export function syncNativeStatusBar(theme: Theme): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Capacitor } = require("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    import("@capacitor/status-bar").then(({ StatusBar, Style }) => {
      StatusBar.setStyle({ style: theme === "light" ? Style.Dark : Style.Light }).catch(() => {});
      StatusBar.setBackgroundColor?.({ color: theme === "light" ? "#ffffff" : "#0d0d0d" }).catch(() => {});
    }).catch(() => {});
  } catch { /* plugin unavailable */ }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());

  const firstRun = useRef(true);
  // Keep the DOM class + storage + native status bar in sync with the theme.
  useEffect(() => {
    applyThemeClass(theme);
    syncNativeStatusBar(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* storage unavailable — class is still applied for this session */
    }
    // Smooth color cross-fade on a user toggle (not on the initial mount). The
    // `theme-animating` class enables a brief color transition, then is removed
    // so normal interactions stay instant.
    if (firstRun.current) { firstRun.current = false; return; }
    const el = document.documentElement;
    el.classList.add("theme-animating");
    const id = window.setTimeout(() => el.classList.remove("theme-animating"), 360);
    return () => window.clearTimeout(id);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggle = useCallback(
    () => setThemeState((prev) => (prev === "dark" ? "light" : "dark")),
    [],
  );

  const value = useMemo(
    () => ({ theme, setTheme, toggle }),
    [theme, setTheme, toggle],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
