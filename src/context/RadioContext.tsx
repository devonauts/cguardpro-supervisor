import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiOrigin, getToken, getTenantId } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { VoiceChannel, type VoiceMember, type VoiceSpeaker, type VoiceState } from "@/lib/voiceChannel";
import { ensureMicPermission } from "@/lib/micPermission";
import { getDuty, subscribeDuty, setDuty } from "@/lib/dutyState";
import { supervisorRoute, isSupervisorClockedIn } from "@/lib/supervisorRoute";
import { startBackgroundAudio, stopBackgroundAudio } from "@/lib/backgroundAudio";
import { App as CapApp } from "@capacitor/app";

interface RadioContextValue {
  onDuty: boolean;
  state: VoiceState;
  roster: VoiceMember[];
  speaker: VoiceSpeaker;
  talking: boolean;
  hint: string | null;
  myId?: string;
  someoneElseTalking: boolean;
  /** True while the full radio screen is mounted — the floating button hides then. */
  screenActive: boolean;
  setScreenActive: (v: boolean) => void;
  resume: () => void;
  pressTalk: () => void;
  releaseTalk: () => void;
}

const RadioContext = createContext<RadioContextValue | null>(null);

/**
 * App-level live-radio (Canal abierto) provider. Owns a SINGLE VoiceChannel that
 * connects + joins ONLY while the guard is on duty, and stays connected across
 * screen changes — so the guard keeps hearing the channel and can push-to-talk
 * from the floating button without opening the radio screen. Off duty it fully
 * disconnects (no audio, no presence). The radio screen consumes this same
 * context so there's never a second connection for the same user.
 */
export function RadioProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const myId = user?.id;

  const [onDuty, setOnDuty] = useState<boolean>(getDuty());
  const [state, setState] = useState<VoiceState>("idle");
  const [roster, setRoster] = useState<VoiceMember[]>([]);
  const [speaker, setSpeaker] = useState<VoiceSpeaker>(null);
  const [talking, setTalking] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [screenActive, setScreenActive] = useState(false);

  const vcRef = useRef<VoiceChannel | null>(null);
  const pressedRef = useRef(false);
  const speakerRef = useRef<VoiceSpeaker>(null);
  speakerRef.current = speaker;

  // Full-restart reconnect: livekit-client retries transient drops itself, but
  // once it gives up (long background suspension, network handoff) it emits
  // Disconnected and STAYS down — and its internal retries reuse the original
  // join token, which the backend only signs for a few hours. Bumping this tick
  // re-runs the connect effect: a brand-new VoiceChannel that fetches a FRESH
  // token. Delay doubles 2s→30s between dead attempts, resets once connected.
  const [reconnectTick, setReconnectTick] = useState(0);
  const reconnectDelayRef = useRef(2000);

  // Track duty changes (clock in/out publishes here).
  useEffect(() => {
    setOnDuty(getDuty());
    return subscribeDuty((v) => setOnDuty(v));
  }, []);

  // Boot reconcile: the supervisor's true on-duty state lives in supervisorShift
  // (their clock-in), NOT in the guard `guard.onDuty` flag. Without this, duty
  // stays whatever localStorage last held (usually false), so the radio mic is
  // permanently disabled. Fetch the real clock status once and publish it.
  useEffect(() => {
    if (!myId) return;
    let cancelled = false;
    supervisorRoute
      .clockStatus()
      .then((s) => { if (!cancelled) setDuty(isSupervisorClockedIn(s)); })
      .catch(() => { /* leave whatever duty state is persisted */ });
    return () => { cancelled = true; };
  }, [myId]);

  // Connect + join while on duty; tear everything down off duty.
  useEffect(() => {
    if (!myId || !onDuty) {
      if (vcRef.current) {
        try { vcRef.current.disconnect(); } catch { /* ignore */ }
        vcRef.current = null;
      }
      // Off duty: release the native keep-alive (no reason to drain battery /
      // hold the mic when there's no channel to keep alive).
      stopBackgroundAudio();
      setState("idle");
      setRoster([]);
      setSpeaker(null);
      setTalking(false);
      return;
    }

    let alive = true;
    let vc: VoiceChannel | null = null;
    let id: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReconnect = () => {
      if (!alive || reconnectTimer) return;
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(30000, delay * 2);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (alive) setReconnectTick((t) => t + 1);
      }, delay);
    };

    // Defer connect a tick so a synchronous cleanup (React StrictMode double-
    // mount, or a rapid duty toggle) cancels it BEFORE the WS handshake starts —
    // avoids "WebSocket is closed before the connection is established".
    const timer = setTimeout(() => {
      if (!alive) return;
      vc = new VoiceChannel();
      vcRef.current = vc;
      vc.connect(
        { url: apiOrigin, path: "/api/socket.io", token: getToken() || "", tenantId: getTenantId(), selfId: myId },
        {
          // Every callback checks `alive`: after a reconnect restarts the effect,
          // the OLD room's async Disconnected event must not clobber the state of
          // the NEW channel that replaced it.
          onState: (s) => {
            if (!alive) return;
            setState(s);
            if (s === "connected") reconnectDelayRef.current = 2000;
            // "idle"/"error" while we should still be on the channel means LiveKit
            // gave up (or the initial connect failed) — restart from scratch.
            if (s === "idle" || s === "error") scheduleReconnect();
          },
          onPresence: (r) => { if (alive) setRoster(r); },
          onSpeaker: (sp) => { if (alive) setSpeaker(sp); },
          onError: (m) => { if (alive) setHint(m); },
        },
      );
      // Keep the app alive in the background (iOS suspends a backgrounded WebView,
      // which would freeze the socket + Web Audio). The native silent loop holds the
      // process running so the radio keeps receiving when the guard is in another
      // app or the screen is locked. Runs only while connected (on duty).
      startBackgroundAudio();

      const tryJoin = () => {
        vc!.join()
          .then(({ roster, speaker }) => {
            if (alive) { setRoster(roster); setSpeaker(speaker); }
            if (id !== null) { clearInterval(id); id = null; }
          })
          .catch(() => {});
      };
      id = setInterval(() => { if (vc!.connected && !vc!.joined) tryJoin(); }, 400);
    }, 60);

    return () => {
      alive = false;
      clearTimeout(timer);
      if (id !== null) clearInterval(id);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { vc?.disconnect(); } catch { /* ignore */ }
      stopBackgroundAudio();
      vcRef.current = null;
    };
  }, [myId, onDuty, reconnectTick]);

  // Returning to the foreground after iOS throttled the WebView: the AudioContext
  // is often left "suspended" (silence) and socket.io may be mid-reconnect. Resume
  // the context so playback flows again the instant the guard re-opens the app.
  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    (async () => {
      try {
        sub = await CapApp.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) return;
          try { vcRef.current?.resume(); } catch { /* ignore */ }
          // If the room died while backgrounded (iOS suspension outlives LiveKit's
          // reconnect window; timers were frozen so the backoff never ran),
          // restart NOW with a fresh token instead of waiting for a stale timer.
          const vc = vcRef.current;
          if (vc && !vc.connected) {
            reconnectDelayRef.current = 2000;
            setReconnectTick((t) => t + 1);
          }
        });
      } catch { /* not native / no listener */ }
    })();
    return () => { try { sub?.remove(); } catch { /* ignore */ } };
  }, []);

  const resume = useCallback(() => { vcRef.current?.resume(); }, []);

  const pressTalk = useCallback(async () => {
    const vc = vcRef.current;
    if (!vc || state === "connecting") return;
    const sp = speakerRef.current;
    if (sp && sp.userId !== myId) {
      setHint(`${sp.name} está hablando`);
      return;
    }
    pressedRef.current = true;
    setHint(null);
    if (!(await ensureMicPermission())) {
      pressedRef.current = false;
      setHint("Activa el permiso de micrófono en Perfil → Permisos.");
      return;
    }
    if (!pressedRef.current) return; // released during the permission prompt
    const r = await vc.startTalk();
    if (!pressedRef.current) { vc.stopTalk(); return; } // released mid-acquire
    if (r?.ok) setTalking(true);
    else if (r?.busyWith) setHint(`${r.busyWith} está hablando`);
    else setHint(r?.error || "No se pudo acceder al micrófono.");
  }, [state, myId]);

  const releaseTalk = useCallback(() => {
    pressedRef.current = false;
    vcRef.current?.stopTalk();
    setTalking(false);
  }, []);

  const someoneElseTalking = !!speaker && speaker.userId !== myId;

  // Memoize so a roster/speaker/talking tick doesn't re-render every useRadio()
  // consumer (FloatingRadioButton reads 12 props off this).
  const value = useMemo(
    () => ({ onDuty, state, roster, speaker, talking, hint, myId, someoneElseTalking, screenActive, setScreenActive, resume, pressTalk, releaseTalk }),
    [onDuty, state, roster, speaker, talking, hint, myId, someoneElseTalking, screenActive, setScreenActive, resume, pressTalk, releaseTalk],
  );

  return (
    <RadioContext.Provider value={value}>
      {children}
    </RadioContext.Provider>
  );
}

export function useRadio(): RadioContextValue {
  const ctx = useContext(RadioContext);
  if (!ctx) throw new Error("useRadio must be used within <RadioProvider>");
  return ctx;
}
