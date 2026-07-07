import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { IonPage, IonContent, useIonToast, useIonAlert } from "@ionic/react";
import {
  ArrowLeft, ChevronDown, Shield, Plus, Flame, ShieldAlert, Users, MapPin, Video, Navigation,
  Camera, Satellite, Headphones, ShieldCheck, Phone,
} from "lucide-react";
import { OsmMap } from "@/components/OsmMap";
import { incidentService } from "@/lib/services";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { getCurrentPosition, reverseGeocode, type Coords } from "@/lib/geo";
import { useAsync } from "@/lib/useAsync";
import fb from "@/lib/feedback";
import styles from "./Emergency.module.css";

const ACTIONS = [
  { key: "medical", icon: Plus, titleKey: "sos.medical", def: "Médica", subKey: "sos.medicalSub", subDef: "Solicitar ayuda médica", subject: "🚑 Emergencia médica", body: "Se solicita asistencia médica." },
  { key: "fire", icon: Flame, titleKey: "sos.fire", def: "Incendio", subKey: "sos.fireSub", subDef: "Reportar incendio", subject: "🔥 Incendio reportado", body: "Se reporta un incendio." },
  { key: "police", icon: ShieldAlert, titleKey: "sos.police", def: "Policía", subKey: "sos.policeSub", subDef: "Solicitar policía", subject: "🚓 Solicitud de policía", body: "Se solicita presencia policial." },
  { key: "backup", icon: Users, titleKey: "sos.backup", def: "Refuerzos", subKey: "sos.backupSub", subDef: "Solicitar unidad de refuerzo", subject: "🆘 Solicitud de refuerzos", body: "Se solicita una unidad de refuerzo." },
];

function gpsQuality(acc?: number): { key: string; def: string; color: string } {
  if (acc == null) return { key: "sos.gpsUnknown", def: "Buscando…", color: "#9aa3af" };
  if (acc <= 20) return { key: "sos.gpsStrong", def: "Fuerte", color: "#22c55e" };
  if (acc <= 60) return { key: "sos.gpsGood", def: "Buena", color: "#f59e0b" };
  return { key: "sos.gpsWeak", def: "Débil", color: "#ef4444" };
}

export default function Emergency({ onClose }: { onClose?: () => void } = {}) {
  const { t } = useTranslation();
  const history = useHistory();
  const [present] = useIonToast();
  const [confirm] = useIonAlert();

  const [coords, setCoords] = useState<Coords | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: contacts } = useAsync(() => supervisorRoute.emergency(), []);

  // Acquire location on mount (best-effort) for the SOS payload + the map.
  useEffect(() => {
    let alive = true;
    getCurrentPosition()
      .then((c) => {
        if (!alive) return;
        setCoords(c);
        reverseGeocode(c.latitude, c.longitude).then((a) => alive && setAddress(a)).catch(() => {});
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const locString = () =>
    address || (coords ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}` : undefined);

  const fire = async (subject: string, body: string, panic: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await incidentService.createAsGuard({
        isPanic: panic,
        priority: panic ? "critical" : "high",
        subject,
        content: body + (locString() ? ` Ubicación: ${locString()}.` : ""),
        location: locString(),
        latitude: coords?.latitude,
        longitude: coords?.longitude,
      });
      fb.press();
      present({ message: t("sos.sent", "Alerta enviada a central"), duration: 1600, position: "top", color: "danger" });
    } catch {
      present({ message: t("sos.error", "No se pudo enviar la alerta"), duration: 1800, position: "top", color: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const askFire = (subject: string, body: string, panic = true) =>
    confirm({
      header: t("sos.confirmTitle", "¿Enviar alerta?"),
      message: subject,
      buttons: [
        { text: t("app.cancel", "Cancelar"), role: "cancel" },
        { text: t("sos.confirmSend", "Enviar alerta"), role: "destructive", handler: () => fire(subject, body, panic) },
      ],
    });

  const shareGps = async () => {
    let c = coords;
    try { if (!c) { c = await getCurrentPosition(); setCoords(c); } } catch { /* ignore */ }
    fire(t("sos.locShared", "📍 Ubicación compartida"), t("sos.locSharedBody", "Ubicación en tiempo real compartida con central."), false);
  };

  const call = (phone?: string | null) => {
    if (!phone) { present({ message: t("sos.noPhone", "Sin número disponible"), duration: 1400, position: "top" }); return; }
    fb.tap();
    window.open(`tel:${phone}`, "_system");
  };

  const q = gpsQuality(coords?.accuracy);
  const dispatch = contacts?.dispatch;
  const supervisor = contacts?.supervisor;
  const guards = contacts?.onDutyGuards;

  const body = (
      <IonContent fullscreen>
        <div className={styles.screen}>
          {/* Header */}
          <div className="safe-top flex h-14 items-center px-3">
            <button type="button" aria-label={onClose ? t("app.close", "Cerrar") : t("app.back", "Atrás")} onClick={() => { fb.tap(); if (onClose) { onClose(); return; } history.length > 1 ? history.goBack() : history.push("/supervisor/dashboard"); }} className="grid h-11 w-11 place-items-center rounded-full text-white active:bg-white/10">{onClose ? <ChevronDown size={24} /> : <ArrowLeft size={22} />}</button>
            <p className="flex-1 text-center text-[18px] font-extrabold tracking-wide text-white">{t("sos.title", "EMERGENCIA")}</p>
            <span className="grid h-11 w-11 place-items-center text-white/80"><Shield size={22} /></span>
          </div>

          {/* SOS */}
          <div className={styles.sosWrap}>
            <div className={styles.sosRings}>
              <span className={styles.sosRing} style={{ width: "min(240px, 56vw)", height: "min(240px, 56vw)" }} />
              <span className={styles.sosRing} style={{ width: "min(320px, 76vw)", height: "min(320px, 76vw)", animationDelay: "0.8s" }} />
              <span className={styles.sosRing} style={{ width: "min(400px, 92vw)", height: "min(400px, 92vw)", animationDelay: "1.6s" }} />
            </div>
            <button type="button" disabled={busy} className={styles.sosBtn} onClick={() => { fb.tap(); askFire(t("sos.sosSubject", "🆘 SOS — Emergencia"), t("sos.sosBody", "Alerta SOS activada. Ubicación y cámaras compartidas automáticamente."), true); }}>
              <div>
                <p className={styles.sosText}>SOS</p>
                <p className={styles.sosSub}>{t("sos.tapToAlert", "TOCA PARA ALERTAR")}</p>
              </div>
            </button>
          </div>
          <p className={`${styles.sosHint} mx-auto`}>{t("sos.autoShare", "Tu ubicación y cámaras se compartirán automáticamente.")}</p>

          {/* Quick actions */}
          <div className="grid grid-cols-4 gap-2.5 px-4 pt-5">
            {ACTIONS.map((a) => (
              <button key={a.key} type="button" className={styles.actionCard} onClick={() => askFire(a.subject, a.body, true)}>
                <span className={styles.actionIcon}><a.icon size={26} /></span>
                <span className={styles.actionTitle}>{t(a.titleKey, a.def)}</span>
                <span className={styles.actionSub}>{t(a.subKey, a.subDef)}</span>
              </button>
            ))}
          </div>

          {/* Share GPS */}
          <div className="px-4 pt-4">
            <div className={styles.infoCard}>
              <span className={styles.infoIcon} style={{ background: "rgba(220,38,38,0.16)", color: "#f87171" }}><MapPin size={24} /></span>
              <div className="min-w-0 flex-1">
                <p className={styles.infoTitle}>{t("sos.shareGps", "Compartir ubicación GPS")}</p>
                <p className={styles.infoText}>{t("sos.shareGpsSub", "Comparte tu ubicación en tiempo real con central y equipo")}</p>
              </div>
              <button type="button" disabled={busy} className={`${styles.infoBtn} ${styles.infoBtnPrimary}`} onClick={shareGps}><Navigation size={16} />{t("sos.shareNow", "Compartir")}</button>
            </div>
          </div>

          {/* Open cameras */}
          <div className="px-4 pt-3">
            <div className={styles.infoCard}>
              <span className={styles.infoIcon} style={{ background: "#fff", color: "#dc2626" }}><Video size={24} /></span>
              <div className="min-w-0 flex-1">
                <p className={styles.infoTitle}>{t("sos.openCameras", "Abrir cámaras")}</p>
                <p className={styles.infoText}>{t("sos.openCamerasSub", "Ver cámaras en vivo cerca de tu ubicación")}</p>
              </div>
              <button type="button" className={`${styles.infoBtn} ${styles.infoBtnGhost}`} onClick={() => present({ message: t("guardDetail.soon", "Próximamente"), duration: 1300, position: "top" })}><Camera size={16} />{t("sos.viewCameras", "Ver cámaras")}</button>
            </div>
          </div>

          {/* Active location */}
          <div className="px-4">
            <p className={styles.section}>{t("sos.activeLocation", "Ubicación activa")}</p>
            <div className={styles.locCard}>
              <div className="flex gap-3">
                <div className={styles.locMap}>
                  {coords ? (
                    <OsmMap points={[{ lat: coords.latitude, lng: coords.longitude, status: "current" }]} height={108} showRoute={false} />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-white/30"><MapPin size={22} /></div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={styles.locName}><MapPin size={15} className="mr-1 inline align-[-2px] text-red-400" />{address ? address.split(",")[0] : t("sos.locating", "Ubicando…")}</p>
                  <p className={styles.locAddr}>{address || (coords ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}` : "—")}</p>
                  {coords?.accuracy != null && <p className={styles.locAddr}>{t("sos.accuracy", "Precisión")}: {Math.round(coords.accuracy)} m</p>}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
                <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: q.color }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: q.color }} />{t("sos.gpsSignal", "Señal GPS")}: {t(q.key, q.def)}
                </span>
                <button type="button" className={styles.gpsBtn} onClick={() => { getCurrentPosition().then((c) => { setCoords(c); reverseGeocode(c.latitude, c.longitude).then(setAddress).catch(() => {}); }).catch(() => {}); }}><Satellite size={17} /></button>
              </div>
            </div>
          </div>

          {/* Emergency contacts */}
          <div className="px-4 pb-24 safe-bottom">
            <p className={styles.section}>{t("sos.contacts", "Contactos de emergencia")}</p>
            <div className="space-y-2.5">
              <Contact icon={<Headphones size={20} />} name={dispatch?.name || t("sos.dispatch", "Central de Despacho")} sub={dispatch?.subtitle || "24/7"} onCall={() => call(dispatch?.phone)} disabled={!dispatch?.phone} />
              <Contact icon={<ShieldCheck size={20} />} name={supervisor?.name || t("nav.supervisor", "Supervisor")} sub={supervisor?.subtitle || t("sos.onDuty", "En servicio")} onCall={() => call(supervisor?.phone)} disabled={!supervisor?.phone} />
              <Contact icon={<Users size={20} />} name={guards?.name || t("sos.allGuards", "Vigilantes en servicio")} sub={`${guards?.count ?? 0} ${t("sos.members", "en servicio")}`} onCall={() => call(guards?.phone)} disabled={!guards?.phone} />
            </div>
          </div>
        </div>
      </IonContent>
  );

  // In a sheet (SosFab) the modal is the container; as a route we need an IonPage.
  return onClose ? body : <IonPage>{body}</IonPage>;
}

function Contact({ icon, name, sub, onCall, disabled }: { icon: React.ReactNode; name: string; sub: string; onCall: () => void; disabled?: boolean }) {
  return (
    <div className={styles.contact}>
      <span className={styles.contactIcon}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className={styles.contactName}>{name}</p>
        <p className={styles.contactSub}>{sub}</p>
      </div>
      <button type="button" disabled={disabled} className={styles.callBtn} onClick={onCall}><Phone size={18} /></button>
    </div>
  );
}
