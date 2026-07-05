import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronDown, Menu } from "lucide-react";

/**
 * Shared navigation bar — the app's single top-bar, used by every screen through
 * the `Screen` scaffold (never hand-rolled per screen). Modeled on the iOS
 * UINavigationBar:
 *
 *  • variant "large" — the iOS large-title style. A big bold title at rest that
 *    collapses into a compact, blurred sticky bar as the page scrolls
 *    (`progress` 0→1). The back button + right actions live in the top nav row
 *    and stay put; the inline title fades in as the large title scrolls away.
 *  • variant "bar" — a solid compact bar (detail/sub-pages, chat, forms).
 *
 * The back button is driven by the navigation stack (the `Screen` depth model):
 * tab roots hide it, pushed sub-pages show it — exactly like a
 * UINavigationController pushing a child controller.
 */
export interface TopBarProps {
  variant?: "large" | "bar";
  /** Inline / compact title (the collapsed large-title text, or the bar title). */
  title?: string;
  titleClassName?: string;
  /** Large-title text (variant "large"). */
  largeTitle?: string;
  /** Title shown in the collapsed bar (defaults to largeTitle/title). */
  compactTitle?: string;
  subtitle?: string;
  largeSubtitle?: string;
  right?: ReactNode;
  /** Leading element (e.g. avatar) shown next to the collapsed / bar title. */
  avatar?: ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  /** Leading item is a close chevron (▼) instead of a back arrow — for screens
   *  presented as a bottom-sheet modal (dismiss vs. navigate back). */
  closeVariant?: boolean;
  /** Leading hamburger (root screens without a back button). */
  onMenu?: () => void;
  /** Collapse progress 0 (expanded) → 1 (collapsed). Large variant only. */
  progress?: number;
  /** Solid elevated background (used by chat/fill screens). */
  elevated?: boolean;
}

export function TopBar({
  variant = "bar",
  title,
  titleClassName = "truncate text-xl",
  largeTitle,
  compactTitle,
  subtitle,
  largeSubtitle,
  right,
  avatar,
  showBack,
  onBack,
  closeVariant,
  onMenu,
  progress = 0,
  elevated,
}: TopBarProps) {
  const { t } = useTranslation();

  // Leading nav-bar item: a back (or close, in a sheet) button on pushed pages,
  // otherwise the hamburger (root screens) — exactly one, like iOS's leading item.
  const leading = showBack ? (
    <button
      onClick={onBack}
      aria-label={closeVariant ? t("app.close", "Cerrar") : t("aria.back", "Atrás")}
      className="pressable -ml-1 shrink-0 rounded-full p-2 text-ink active:bg-surface-2"
    >
      {closeVariant ? <ChevronDown size={27} /> : <ChevronLeft size={27} />}
    </button>
  ) : onMenu ? (
    <button
      onClick={onMenu}
      aria-label={t("nav.menu", "Menú")}
      className="pressable -ml-1 shrink-0 rounded-full p-2 text-ink active:bg-surface-2"
    >
      <Menu size={27} />
    </button>
  ) : null;

  // ---------------------------------------------------------------- large title
  if (variant === "large") {
    const p = Math.min(1, Math.max(0, progress));
    return (
      <>
        {/* Sticky nav row — back + right stay put; inline title fades in on collapse. */}
        <div
          className="safe-top sticky top-0 z-30"
          style={{
            background: `color-mix(in srgb, var(--background) ${(0.55 + 0.4 * p) * 100}%, transparent)`,
            backdropFilter: p > 0.02 ? "blur(14px)" : "none",
            WebkitBackdropFilter: p > 0.02 ? "blur(14px)" : "none",
            borderBottom: `1px solid color-mix(in srgb, var(--line) ${p * 100}%, transparent)`,
          }}
        >
          <div className="flex h-[3.625rem] items-center gap-2 px-4">
            {leading}
            <div
              className="flex min-w-0 flex-1 items-center gap-2.5"
              style={{ opacity: p, transform: `translateY(${(1 - p) * 6}px)`, pointerEvents: p < 0.5 ? "none" : "auto" }}
            >
              {avatar}
              <span className="truncate text-[17px] font-semibold text-ink">{compactTitle || largeTitle || title}</span>
            </div>
            {right && <div className="shrink-0">{right}</div>}
          </div>
        </div>

        {/* Large title — scrolls away as you scroll up. */}
        <div className="px-4 pb-2 pt-1" style={{ opacity: 1 - p, transform: `translateY(${-p * 6}px)` }}>
          <h1 className="text-[32px] font-extrabold leading-[1.08] tracking-tight text-ink">{largeTitle}</h1>
          {largeSubtitle && <p className="mt-1.5 text-sm text-muted">{largeSubtitle}</p>}
        </div>
      </>
    );
  }

  // ---------------------------------------------------------------- solid bar
  return (
    <div className={`safe-top border-b border-line ${elevated ? "bg-surface-2 shrink-0" : "bg-surface-2"}`}>
      <div className="flex items-start justify-between gap-3 px-4 pb-[17px] pt-[17px]">
        <div className="flex min-w-0 items-start gap-1.5">
          {leading}
          <div className="min-w-0">
            <h1 className={`font-bold text-ink ${titleClassName}`}>{title}</h1>
            {subtitle && <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>}
          </div>
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </div>
  );
}

export default TopBar;
