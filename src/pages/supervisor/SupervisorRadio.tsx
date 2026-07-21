import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIonViewWillEnter, useIonViewWillLeave, useIonToast } from "@ionic/react";
import {
  Building2, ShieldCheck, Users, Plus,
  Mic, Volume2, AudioLines, Settings, Play, PhoneOff, UserCircle2, Radio as RadioIcon,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { NavActions } from "@/components/shared/NavActions";
import { useRadio } from "@/context/RadioContext";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { useAsync } from "@/lib/useAsync";
import fb from "@/lib/feedback";
import styles from "./SupervisorRadio.module.css";

type Tab = "channels" | "recent" | "contacts" | "scan";

interface Tx { id: string; userId: string; name: string; at: number; you: boolean }

/** Channel icon from its backend `type`. */
function iconFor(type: string) {
  if (type === "site") return ShieldCheck;
  if (type === "group" || type === "supervisors") return Users;
  if (type === "operations") return Building2;
  return RadioIcon;
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function SupervisorRadio({ onClose }: { onClose?: () => void } = {}) {
  const { t } = useTranslation();
  const [present] = useIonToast();
  const { state, roster, speaker, talking, hint, myId, someoneElseTalking, onDuty, setScreenActive, resume, pressTalk, releaseTalk } = useRadio();

  // Channels come from the backend (single live "Operaciones" room today,
  // shared with guards + CRM RadioDispatch) — never hardcoded in the app.
  const { data: chData } = useAsync(() => supervisorRoute.radioChannels(), []);
  const channels: any[] = Array.isArray(chData?.channels) ? chData.channels : [];

  const [tab, setTab] = useState<Tab>("channels");
  const [channel, setChannel] = useState<string | null>(null);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [monitor, setMonitor] = useState(false);
  const [txs, setTxs] = useState<Tx[]>([]);
  // Local held-state so the PTT button turns red the instant the finger goes
  // down, without waiting on the async LiveKit `talking` flag (which lags the
  // physical press and could leave the button un-red while transmitting).
  const [pressed, setPressed] = useState(false);
  const lastSpeaker = useRef<string | null>(null);
  // Mirror `pressed` in a ref so the unmount cleanup can read the latest value
  // without re-subscribing every press.
  const pressedRef = useRef(false);
  pressedRef.current = pressed;

  useIonViewWillEnter(() => setScreenActive(true));
  useIonViewWillLeave(() => setScreenActive(false));
  useEffect(() => { setScreenActive(true); return () => setScreenActive(false); }, [setScreenActive]);

  // If the screen unmounts while the finger is still on PTT (a route change or
  // tab switch mid-transmission), release talk so the mic never sticks open.
  // Guarded by `pressedRef` so we only stop a transmission this screen started —
  // never one driven by the app-level floating radio button.
  useEffect(() => () => { if (pressedRef.current) releaseTalk(); }, [releaseTalk]);

  // Build a live transmission log from speaker changes (audio isn't recorded).
  useEffect(() => {
    const sid = speaker?.userId || null;
    if (sid && sid !== lastSpeaker.current) {
      lastSpeaker.current = sid;
      setTxs((prev) => [
        { id: `${sid}-${Date.now()}`, userId: sid, name: speaker!.name, at: Date.now(), you: sid === myId },
        ...prev,
      ].slice(0, 30));
    }
    if (!sid) lastSpeaker.current = null;
  }, [speaker, myId]);

  // Default to the first (live) channel once loaded.
  useEffect(() => { if (!channel && channels.length) setChannel(channels[0].key); }, [channels, channel]);

  const connecting = state === "connecting";
  const activeCh = channels.find((c) => c.key === channel) || channels[0] || null;
  const ActiveIcon = iconFor(activeCh?.type || "");
  const onlineCount = activeCh?.live ? roster.length : (activeCh?.online ?? 0);

  const onPttDown = (e: React.PointerEvent) => {
    resume();
    if (!activeCh?.live) { present({ message: t("radio.channelSoon", "Canal disponible próximamente"), duration: 1300, position: "top" }); return; }
    if (connecting || someoneElseTalking) return;
    try { (e.currentTarget as any).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    fb.press();
    setPressed(true);
    pressTalk();
  };
  const onPttUp = (e: React.PointerEvent) => {
    try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
    setPressed(false);
    releaseTalk();
  };

  return (
    <Screen largeTitle={t("nav.radio", "Radio")} right={onClose ? undefined : <NavActions />} onClose={onClose} back flush onPointerDown={resume}>
        {/* Tabs */}
        <div className={`${styles.tabs} mt-3`}>
          {([["channels", t("radio.tabChannels", "Canales")], ["recent", t("radio.tabRecent", "Recientes")], ["contacts", t("radio.tabContacts", "Contactos")], ["scan", t("radio.tabScan", "Escanear")]] as [Tab, string][]).map(([k, l]) => (
            <button key={k} type="button" onClick={() => { fb.select(); setTab(k); }} className={`${styles.tab} ${tab === k ? styles.tabActive : ""}`}>{l}</button>
          ))}
        </div>

        {tab === "channels" && (
          <>
            {/* Channel selector (dynamic — from the backend) */}
            <div className={styles.chScroll} style={{ paddingTop: "10px" }}>
              {channels.map((c) => {
                const active = channel === c.key;
                const Icon = iconFor(c.type);
                const online = c.live ? roster.length : (c.online ?? 0);
                return (
                  <button key={c.key} type="button" onClick={() => { fb.select(); setChannel(c.key); }} className={`${styles.chCard} ${active ? styles.chCardActive : ""}`} style={active ? { color: "var(--gold)" } : undefined}>
                    <Icon size={26} style={active ? { color: "var(--gold)" } : undefined} />
                    <span className={styles.chName} style={active ? { color: "var(--ink)" } : undefined}>{c.name}</span>
                    <span className={styles.chOnline}>{online} {t("radio.online", "en línea")}</span>
                  </button>
                );
              })}
              <button type="button" onClick={() => present({ message: t("radio.channelSoon", "Canal disponible próximamente"), duration: 1300, position: "top" })} className={styles.chCard}>
                <Plus size={24} /><span className={styles.chName}>{t("radio.addChannel", "Agregar")}</span>
              </button>
            </div>

            {/* Active channel panel */}
            {activeCh && (
            <div className="px-4 pt-4">
              <div className={styles.panel}>
                <div className="flex items-start gap-3">
                  <span className={styles.hex}><ActiveIcon size={26} /></span>
                  <div className="min-w-0 flex-1">
                    <p className={styles.panelTitle}>{activeCh.name} {t("radio.channel", "Canal")}</p>
                    <p className={styles.membersOnline}><span className="h-2 w-2 rounded-full" style={{ background: activeCh.live && state === "connected" ? "var(--online)" : "var(--muted)" }} />{onlineCount} {t("radio.membersOnline", "miembros en línea")}</p>
                  </div>
                  <div className="flex gap-2">
                    <span className={styles.panelIconBtn}><Users size={18} />{onlineCount}</span>
                    <button type="button" onClick={() => fb.tap()} className={styles.panelIconBtn}><Settings size={18} /></button>
                  </div>
                </div>
                <p className={styles.desc}>{activeCh.description || t("radio.opsDesc", "Comunicaciones de operaciones y avisos críticos de toda la empresa.")}</p>

                {/* PTT */}
                <div className="flex items-center justify-between px-2">
                  <button type="button" onClick={() => { fb.tap(); setSpeakerOn((v) => !v); }} className={styles.sideBtn}>
                    <span className={`${styles.sideCircle} ${speakerOn ? styles.sideCircleOn : ""}`}><Volume2 size={22} /></span>
                    <span className={styles.sideLabel}>{t("radio.speaker", "Altavoz")}</span>
                  </button>

                  <div className={styles.pttWrap}>
                    <button
                      onPointerDown={onPttDown} onPointerUp={onPttUp} onPointerCancel={onPttUp}
                      onContextMenu={(e) => e.preventDefault()}
                      disabled={!onDuty || connecting || someoneElseTalking}
                      className={`no-press ${styles.pttBtn} ${talking || pressed ? styles.pttTalking : ""}`}
                      aria-label={t("radio.holdToTalk", "Mantén para hablar")}
                    >
                      <Mic size={54} strokeWidth={2.2} />
                    </button>
                  </div>

                  <button type="button" onClick={() => { fb.tap(); setMonitor((v) => !v); }} className={styles.sideBtn}>
                    <span className={`${styles.sideCircle} ${monitor ? styles.sideCircleOn : ""}`}><AudioLines size={22} /></span>
                    <span className={styles.sideLabel}>{t("radio.monitor", "Monitor")}</span>
                  </button>
                </div>
                <div className="mt-2 text-center">
                  <p className={styles.pttLabel}>{talking || pressed ? t("radio.transmitting", "Transmitiendo…") : someoneElseTalking ? t("radio.channelBusy", "Canal ocupado") : t("radio.pushToTalk", "Presiona para hablar")}</p>
                  <p className={styles.pttHint}>{!onDuty ? t("radio.offDutyHint", "Marca tu entrada para conectarte") : connecting ? t("radio.connecting", "Conectando…") : hint || t("radio.holdToSpeak", "Mantén para hablar")}</p>
                </div>
              </div>
            </div>
            )}

            {/* Recent transmissions */}
            <div className="px-4 pt-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[16px] font-bold text-ink">{t("radio.recent", "Transmisiones recientes")}</p>
                <button type="button" onClick={() => setTab("recent")} className="text-[13px] font-semibold text-gold">{t("app.viewAll", "Ver todo")}</button>
              </div>
              <TxList txs={txs} roster={roster} t={t} />
            </div>
          </>
        )}

        {tab === "recent" && <div className="px-4 pt-4"><TxList txs={txs} roster={roster} t={t} /></div>}

        {tab === "contacts" && (
          <div className="px-4 pt-4">
            {roster.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">{t("radio.noContacts", "Nadie en el canal")}</p>
            ) : (
              <div className="space-y-2">
                {roster.map((m) => (
                  <div key={m.userId} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-muted"><UserCircle2 size={20} /></span>
                    <span className="flex-1 truncate text-[15px] font-semibold text-ink">{m.name}{m.userId === myId ? ` (${t("radio.you", "tú")})` : ""}</span>
                    {speaker?.userId === m.userId && <Mic size={16} className="text-gold" />}
                    <span className="h-2 w-2 rounded-full bg-online" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "scan" && <p className="px-4 py-12 text-center text-sm text-muted">{t("radio.scanSoon", "Escaneo de canales próximamente")}</p>}

        {/* Mini player */}
        {speaker && (
          <div className="px-4 pb-4">
            <div className={styles.mini}>
              <span className={styles.miniHex}><Building2 size={18} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold text-ink">{activeCh?.name || t("nav.radio", "Radio")} {t("radio.channel", "Canal")}</p>
                <p className={styles.miniSpeaking}>{speaker.userId === myId ? t("radio.youTalking", "Estás hablando") : `${speaker.name} ${t("radio.isTalking", "está hablando")}`}…</p>
              </div>
              <AudioLines size={22} className="text-online" />
              <button type="button" onClick={() => { fb.tap(); if (talking) releaseTalk(); }} className={styles.miniHang}><PhoneOff size={18} /></button>
            </div>
          </div>
        )}
    </Screen>
  );
}

function TxList({ txs, roster, t }: { txs: Tx[]; roster: any[]; t: any }) {
  if (txs.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">{t("radio.noTx", "Sin transmisiones recientes")}</p>;
  }
  return (
    <div className="space-y-3">
      {txs.map((tx) => (
        <div key={tx.id} className={styles.tx}>
          <span className={styles.txAvatar}>
            <span className={styles.txAvatarImg}><UserCircle2 size={24} /></span>
            <span className={styles.txDot} />
          </span>
          <div className="min-w-0 flex-1">
            <p className={styles.txName}>{tx.name}{tx.you ? <span className="ml-2 rounded bg-gold/15 px-1.5 py-0.5 text-[11px] font-bold text-gold">{t("radio.you", "Tú")}</span> : null}</p>
            <p className={styles.txText}>{t("radio.spoke", "Transmisión de voz en vivo")}</p>
          </div>
          <div className="text-right">
            <p className={styles.txMeta}>{fmtTime(tx.at)}</p>
            <span className={`${styles.txPlay} mt-1 opacity-40`} title={t("radio.liveOnly", "Solo en vivo")}><Play size={15} /></span>
          </div>
        </div>
      ))}
    </div>
  );
}
