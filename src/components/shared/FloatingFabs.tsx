import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IonModal } from "@ionic/react";
import { Radio as RadioIcon } from "lucide-react";
import Emergency from "@/pages/supervisor/Emergency";
import SupervisorRadio from "@/pages/supervisor/SupervisorRadio";
import fb from "@/lib/feedback";
import styles from "./FloatingFabs.module.css";

const SIZE = 62;
const MARGIN = 14;
const KEY = "fab-cluster-pos";

// The bottom tab bar (~56px) + its safe-area padding is always visible, so no
// floating control may be parked over it. Read the real safe-area inset.
function safeAreaBottomPx() {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--ion-safe-area-bottom");
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
function tabBarClearance() {
  return 64 + safeAreaBottomPx() + MARGIN;
}

function clampX(x: number) {
  return Math.max(MARGIN, Math.min(window.innerWidth - SIZE - MARGIN, x));
}
function clampY(y: number, h: number) {
  return Math.max(MARGIN + 48, Math.min(window.innerHeight - h - tabBarClearance(), y));
}

/**
 * One draggable cluster holding the Radio + SOS floating buttons. The whole
 * cluster drags together (native pointer listeners + direct style writes, snaps
 * to the nearest side, position persists), so the two buttons never overlap.
 * Tapping a button (no drag) opens its own swipe-down-to-dismiss sheet.
 */
export function FloatingFabs() {
  const { t } = useTranslation();
  const [openKey, setOpenKey] = useState<null | "sos" | "radio">(null);
  const elRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<{ x: number; y: number }>(
    (() => {
      try {
        const s = JSON.parse(localStorage.getItem(KEY) || "null");
        if (s && typeof s.x === "number" && typeof s.y === "number") return { x: clampX(s.x), y: clampY(s.y, 148) };
      } catch { /* ignore */ }
      return { x: window.innerWidth - SIZE - MARGIN, y: window.innerHeight - 148 - 96 };
    })(),
  );

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    el.style.left = `${posRef.current.x}px`;
    el.style.top = `${posRef.current.y}px`;

    const st = { active: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0, key: null as null | string };
    const H = () => el.offsetHeight || 148;

    const move = (e: PointerEvent) => {
      if (!st.active) return;
      e.preventDefault();
      const dx = e.clientX - st.sx;
      const dy = e.clientY - st.sy;
      if (!st.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) st.moved = true;
      if (!st.moved) return;
      const np = { x: clampX(st.ox + dx), y: clampY(st.oy + dy, H()) };
      posRef.current = np;
      el.style.left = `${np.x}px`;
      el.style.top = `${np.y}px`;
    };

    const up = (e: PointerEvent) => {
      if (!st.active) return;
      st.active = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      if (!st.moved) {
        if (st.key === "sos" || st.key === "radio") { fb.press(); setOpenKey(st.key); }
        return;
      }
      const snapX = posRef.current.x + SIZE / 2 < window.innerWidth / 2 ? MARGIN : window.innerWidth - SIZE - MARGIN;
      const np = { x: snapX, y: clampY(posRef.current.y, H()) };
      posRef.current = np;
      el.style.transition = "left 220ms cubic-bezier(.22,1,.36,1), top 220ms cubic-bezier(.22,1,.36,1)";
      el.style.left = `${np.x}px`;
      el.style.top = `${np.y}px`;
      window.setTimeout(() => { el.style.transition = ""; }, 240);
      try { localStorage.setItem(KEY, JSON.stringify(np)); } catch { /* ignore */ }
    };

    const down = (e: PointerEvent) => {
      const target = (e.target as HTMLElement)?.closest?.("[data-fab]") as HTMLElement | null;
      st.key = target?.getAttribute("data-fab") || null;
      st.active = true;
      st.moved = false;
      st.sx = e.clientX;
      st.sy = e.clientY;
      st.ox = posRef.current.x;
      st.oy = posRef.current.y;
      el.style.transition = "none";
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
      e.preventDefault();
    };

    const onResize = () => {
      const np = { x: clampX(posRef.current.x), y: clampY(posRef.current.y, H()) };
      posRef.current = np;
      el.style.left = `${np.x}px`;
      el.style.top = `${np.y}px`;
    };

    el.addEventListener("pointerdown", down);
    window.addEventListener("resize", onResize);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const close = () => setOpenKey(null);

  return (
    <>
      <div ref={elRef} className={styles.cluster} style={{ left: posRef.current.x, top: posRef.current.y }}>
        <div data-fab="radio" role="button" aria-label="Radio" className={`${styles.fab} ${styles.radio}`}>
          <RadioIcon size={26} />
        </div>
        <div data-fab="sos" role="button" aria-label="SOS" className={`${styles.fab} ${styles.sos}`}>
          SOS
        </div>
      </div>

      <IonModal isOpen={openKey === "sos"} onDidDismiss={close} breakpoints={[0, 1]} initialBreakpoint={1} handle className={styles.sheet}>
        {openKey === "sos" && <Emergency onClose={close} />}
      </IonModal>

      <IonModal isOpen={openKey === "radio"} onDidDismiss={close} breakpoints={[0, 1]} initialBreakpoint={1} handle className={styles.sheet}>
        {openKey === "radio" && <SupervisorRadio onClose={close} />}
      </IonModal>
    </>
  );
}


export default FloatingFabs;
