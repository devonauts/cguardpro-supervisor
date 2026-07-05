import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { IonModal, IonContent } from "@ionic/react";
import { Radio as RadioIcon, ChevronDown, Maximize2, Mic, Users, Volume2 } from "lucide-react";
import Emergency from "@/pages/supervisor/Emergency";
import { useRadio } from "@/context/RadioContext";
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
        if (st.key === "sos" || st.key === "radio") {
          fb.press();
          setOpenKey(st.key);
        }
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

      <IonModal isOpen={openKey === "radio"} onDidDismiss={close} breakpoints={[0, 1]} initialBreakpoint={1} handle className={styles.sheetDark}>
        {openKey === "radio" && <RadioSheet onClose={close} t={t} />}
      </IonModal>
    </>
  );
}

/** Compact push-to-talk panel shown in the Radio FAB's sheet (live shared channel). */
function RadioSheet({ onClose, t }: { onClose: () => void; t: (k: string, d: string) => string }) {
  const history = useHistory();
  const { state, roster, speaker, talking, hint, myId, someoneElseTalking, onDuty, setScreenActive, resume, pressTalk, releaseTalk } = useRadio();

  useEffect(() => { setScreenActive(true); return () => setScreenActive(false); }, [setScreenActive]);

  const connecting = state === "connecting";
  const onDown = (e: React.PointerEvent) => {
    resume();
    if (connecting || someoneElseTalking) return;
    try { (e.currentTarget as any).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    pressTalk();
  };
  const onUp = (e: React.PointerEvent) => {
    try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
    releaseTalk();
  };

  return (
    <IonContent onPointerDown={resume}>
      <div className="safe-top flex h-14 items-center gap-2 border-b border-line px-3">
        <button type="button" aria-label={t("app.close", "Cerrar")} onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full text-ink active:bg-surface-2"><ChevronDown size={24} /></button>
        <p className="flex-1 text-center text-[17px] font-extrabold text-ink">{t("nav.radio", "Radio")}</p>
        <button type="button" aria-label={t("radio.openFull", "Abrir radio")} onClick={() => { onClose(); history.push("/supervisor/radio"); }} className="grid h-11 w-11 place-items-center rounded-full text-gold active:bg-surface-2"><Maximize2 size={19} /></button>
      </div>

      <div className="px-5 pb-10 pt-5">
        {!onDuty ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Volume2 size={28} className="text-muted" />
            <p className="text-sm font-semibold text-ink">{t("radio.offDutyTitle", "Radio disponible en servicio")}</p>
            <p className="text-[12px] text-muted">{t("radio.offDutyHint", "Marca tu entrada para conectarte al canal.")}</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full" style={{ background: state === "connected" ? "var(--online)" : "var(--muted)" }} />
              <span className="font-semibold text-ink">{connecting ? t("radio.connecting", "Conectando…") : state === "connected" ? t("radio.live", "En vivo") : t("radio.offline", "Sin conexión")}</span>
              <span className="ml-2 flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-muted"><Users size={12} />{roster.length}</span>
            </div>

            <div className={`mx-auto mt-4 flex min-h-11 max-w-xs items-center justify-center rounded-xl border p-3 text-center text-sm font-semibold ${speaker ? "border-gold/40 bg-gold/10 text-gold" : "border-line bg-surface-2 text-muted"}`}>
              {speaker
                ? `${speaker.userId === myId ? t("radio.youTalking", "Estás hablando") : `${speaker.name} ${t("radio.isTalking", "está hablando")}`}…`
                : t("radio.channelClear", "Canal libre")}
            </div>

            <div className="flex flex-col items-center py-7">
              <button
                onPointerDown={onDown}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                onContextMenu={(e) => e.preventDefault()}
                disabled={connecting || someoneElseTalking}
                style={{ touchAction: "none" }}
                className="no-press relative grid h-44 w-44 place-items-center rounded-full disabled:opacity-50"
                aria-label={t("radio.holdToTalk", "Mantén para hablar")}
              >
                <span className={`absolute inset-0 rounded-full ${talking ? "bg-critical/20 animate-ping" : "bg-gold/15"}`} />
                <span className="absolute inset-4 rounded-full border border-gold/30" />
                <span className={`relative grid h-32 w-32 place-items-center rounded-full text-on-accent shadow-[0_8px_40px_-8px_rgba(212,160,23,0.7)] ${talking ? "scale-105 bg-critical text-white" : "bg-gold"} transition-transform`}>
                  <Mic size={46} strokeWidth={2.2} />
                </span>
              </button>
              <p className="mt-4 text-sm font-semibold text-ink">
                {talking ? t("radio.transmitting", "Transmitiendo…") : someoneElseTalking ? t("radio.channelBusy", "Canal ocupado") : t("radio.holdToTalk", "Mantén para hablar")}
              </p>
              {hint && <p className="mt-1 line-clamp-2 text-center text-[11px] text-muted">{hint}</p>}
            </div>
          </>
        )}
      </div>
    </IonContent>
  );
}

export default FloatingFabs;
