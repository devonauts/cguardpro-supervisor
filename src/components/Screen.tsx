import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  IonPage,
  IonContent,
  IonRefresher,
  IonRefresherContent,
  isPlatform,
} from "@ionic/react";
import { useHistory } from "react-router-dom";
import { TopBar } from "./shared/TopBar";

// The app runs in Material mode globally (setupIonicReact mode: "md"), but the
// MD pull-to-refresh is unreliable and non-native inside the iOS WKWebView. On
// iOS we render the refresher in "ios" mode so it uses the native rubber-band
// pull + the chevron→crescent spinner. md everywhere else.
const REFRESH_MODE: "ios" | "md" = isPlatform("ios") ? "ios" : "md";

/**
 * Standard screen scaffold: an Ionic page with a dark, custom header and a
 * scrollable navy content area. Optional pull-to-refresh.
 *
 * Two header modes:
 *  • Default — a compact title bar (used by most screens).
 *  • Large title — pass `largeTitle` for an iOS-style collapsing large title:
 *    a big title at rest that shrinks into a blurred sticky bar as you scroll
 *    (reproduced with CSS so it behaves the same on iOS, Android and web).
 *
 * Screen DEPTH MODEL (one consistent hierarchy across the app):
 *  • TAB ROOTS — the bottom-tab destinations (Dashboard, Patrol/Training,
 *    Schedule, Messages, Profile). Pass `root` → NO back button (you switch
 *    roots via the tab bar, you never "go back" from one).
 *  • DETAIL / SUB-PAGES — anything pushed on top of a root (a thread, a course,
 *    an incident, the shift detail…). These show a back button by DEFAULT, so a
 *    pushed screen always has a way back. `back` forces it explicitly.
 * Rule of thumb: if it's reachable from the tab bar it's a root; if it's pushed
 * via history.push it's a detail. Never both.
 */
export function Screen({
  title,
  titleClassName = "truncate text-xl",
  subtitle,
  right,
  children,
  onRefresh,
  back,
  backHref,
  onClose,
  root,
  largeTitle,
  largeSubtitle,
  compactTitle,
  avatar,
  header,
  fill,
  flush,
  onPointerDown,
  onMenu,
}: {
  title?: string;
  titleClassName?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  onRefresh?: () => Promise<void> | void;
  back?: boolean;
  backHref?: string;
  /** When set, the leading nav item becomes a close chevron that calls this
   *  instead of navigating back — for screens presented as a bottom-sheet modal. */
  onClose?: () => void;
  /**
   * Tab-root screens (the bottom-tab destinations) pass `root` to HIDE the back
   * button. Every other screen is a pushed sub-page and shows a back button by
   * default — so navigation always has a way back.
   */
  root?: boolean;
  /** Full-height, non-scrolling page (the child owns its own scroll/layout — e.g. chat). */
  fill?: boolean;
  /** Large-title mode only: skip the default px-4 child padding (the screen manages
   *  its own horizontal padding / sticky sub-headers). */
  flush?: boolean;
  /** Forwarded to the scrollable IonContent (e.g. resume audio on tap — radio). */
  onPointerDown?: (e: React.PointerEvent) => void;
  /** Leading hamburger on root screens (shows when there's no back button). */
  onMenu?: () => void;
  /** When set, renders the collapsing iOS-style large title instead of `title`. */
  largeTitle?: string;
  largeSubtitle?: string;
  /** Title shown in the collapsed sticky bar (defaults to `largeTitle`). */
  compactTitle?: string;
  /** Optional leading element (e.g. avatar) shown in the collapsed bar. */
  avatar?: ReactNode;
  /** Fully custom header node (takes precedence over title/largeTitle). */
  header?: ReactNode;
}) {
  const history = useHistory();
  // Sub-pages show a back button by default; only tab roots opt out via `root`.
  // A modal-presented screen (`onClose`) always shows a (close) leading item.
  const showBack = back === true || !!onClose || !root;
  const goBack = () => {
    if (onClose) return onClose();
    if (backHref) history.push(backHref);
    else if (history.length > 1) history.goBack();
    else history.push("/supervisor/dashboard");
  };

  // Large-title collapse only needs the 0..52px range; clamp + rAF-throttle so we
  // re-render at most once per frame and never once the header is fully collapsed.
  const COLLAPSE = 52; // px of scroll over which the large title collapses
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRafRef = useRef<number | null>(null);
  const onScroll = useCallback((e: CustomEvent<{ scrollTop: number }>) => {
    const next = Math.min(COLLAPSE, Math.max(0, e.detail.scrollTop));
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      setScrollTop((prev) => (prev === next ? prev : next));
    });
  }, []);
  useEffect(() => () => {
    if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current);
  }, []);

  const refresher = onRefresh && (
    <IonRefresher
      slot="fixed"
      mode={REFRESH_MODE}
      pullFactor={0.6}
      pullMin={70}
      pullMax={180}
      onIonRefresh={async (e) => {
        try {
          await onRefresh();
        } finally {
          e.detail.complete();
        }
      }}
    >
      <IonRefresherContent
        pullingIcon={REFRESH_MODE === "ios" ? "lines" : "circular"}
        refreshingSpinner={REFRESH_MODE === "ios" ? "lines" : "circular"}
      />
    </IonRefresher>
  );

  // -------------------------------------------------- Custom header mode
  if (header) {
    return (
      <IonPage>
        <IonContent forceOverscroll={REFRESH_MODE === "ios"}>
          {refresher}
          <div className="safe-top">{header}</div>
          <div className="px-4 pb-6 pt-1 safe-bottom">{children}</div>
        </IonContent>
      </IonPage>
    );
  }

  // -------------------------------------------------- Large-title mode
  if (largeTitle) {
    const p = Math.min(1, Math.max(0, scrollTop / COLLAPSE)); // 0 open → 1 collapsed
    return (
      <IonPage>
        <IonContent
          scrollEvents
          forceOverscroll={REFRESH_MODE === "ios"}
          onIonScroll={onScroll}
          onPointerDown={onPointerDown}
        >
          {refresher}

          <TopBar
            variant="large"
            onMenu={onMenu}
            largeTitle={largeTitle}
            compactTitle={compactTitle}
            largeSubtitle={largeSubtitle}
            right={right}
            avatar={avatar}
            showBack={showBack}
            onBack={goBack}
            closeVariant={!!onClose}
            progress={p}
          />

          <div className={`${flush ? "" : "px-4 pt-1"} pb-6 safe-bottom`}>{children}</div>
        </IonContent>
      </IonPage>
    );
  }

  // -------------------------------------------------- Fill mode (full-height, child owns scroll — e.g. chat)
  // IonContent's scroll part is made a flex column via `.chat-fill::part(scroll)`
  // in index.css, so the header sits at the top and the content (flex-1) fills the
  // rest reliably. A plain height:100% child of IonContent does NOT resolve, which
  // is what previously collapsed the chat to zero height.
  if (fill) {
    return (
      <IonPage>
        <IonContent className="chat-fill" forceOverscroll={false}>
          <TopBar variant="bar" onMenu={onMenu} elevated title={title} titleClassName={titleClassName} subtitle={subtitle} right={right} showBack={showBack} onBack={goBack} closeVariant={!!onClose} />
          <div className="flex min-h-0 flex-1 flex-col bg-background">{children}</div>
        </IonContent>
      </IonPage>
    );
  }

  // -------------------------------------------------- Default compact header
  return (
    <IonPage>
      <IonContent forceOverscroll={REFRESH_MODE === "ios"}>
        <TopBar variant="bar" onMenu={onMenu} title={title} titleClassName={titleClassName} subtitle={subtitle} right={right} showBack={showBack} onBack={goBack} closeVariant={!!onClose} />

        {refresher}

        <div className="px-4 py-4 safe-bottom">{children}</div>
      </IonContent>
    </IonPage>
  );
}
