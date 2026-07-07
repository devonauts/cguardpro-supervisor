import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory, useParams } from "react-router-dom";
import { useIonToast } from "@ionic/react";
import {
  MapPin, Navigation, Send, Clock, CheckCircle2, BellRing, ChevronRight, Building2,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { NavActions } from "@/components/shared/NavActions";
import { SkeletonList, ErrorState } from "@/components/ui";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { useAsync } from "@/lib/useAsync";
import { openAddressNavigation } from "@/lib/navigate";
import { normalizeStops, computeEtas, fmtTime, nextIncompleteIndex } from "@/lib/routeMission";
import fb from "@/lib/feedback";
import styles from "./RouteMission.module.css";

const ETA_OPTIONS = [5, 10, 15, 20, 30];

function StepDots({ step }: { step: number }) {
  return (
    <div className={`${styles.steps} mb-4`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`${styles.stepDot} ${i < step ? styles.stepDotDone : i === step ? styles.stepDotActive : ""}`} />
      ))}
    </div>
  );
}

export default function RouteMissionStop() {
  const { t } = useTranslation();
  const history = useHistory();
  const [present] = useIonToast();
  const { routeId, index } = useParams<{ routeId: string; index: string }>();
  const idx = Math.max(0, parseInt(index, 10) || 0);
  const { data, loading, error, reload } = useAsync<any>(() => supervisorRoute.routeDetail(routeId), [routeId]);

  const stops = useMemo(() => normalizeStops(data), [data]);
  const etas = useMemo(() => computeEtas(stops), [stops]);
  const stop = stops[idx];
  const doneCount = stops.filter((s) => s.done).length;
  const nextIdx = useMemo(() => nextIncompleteIndex(stops, idx + 1), [stops, idx]);
  const isLast = nextIdx < 0;

  const [eta, setEta] = useState(15);
  const [notifying, setNotifying] = useState(false);
  const [notified, setNotified] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const advance = () => {
    fb.tap();
    if (isLast) finish();
    else history.push(`/supervisor/route/${routeId}/mission/${nextIdx}`);
  };
  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      await supervisorRoute.finish(routeId, {});
      // Only confirm + navigate once the backend recorded the finish.
      fb.success();
      history.replace(`/supervisor/route/${routeId}/summary`);
    } catch {
      fb.error(); // stay on the page so the supervisor can retry
    } finally {
      setFinishing(false);
    }
  };

  const notify = async () => {
    if (!stop || notifying) return;
    setNotifying(true);
    fb.press();
    try {
      const r: any = await supervisorRoute.notifyEta(routeId, stop.id, eta);
      setNotified(true);
      fb.success();
      present({
        message: r?.clientNotified
          ? t("routeMission.notifiedBoth", "CRM y cliente notificados · ETA {{min}} min", { min: eta })
          : t("routeMission.notifiedCrm", "CRM notificado · ETA {{min}} min", { min: eta }),
        duration: 1800, position: "top", color: "success",
      });
    } catch (e: any) {
      fb.error();
      present({ message: e?.message || t("routeMission.notifyFailed", "No se pudo notificar"), duration: 2000, position: "top", color: "danger" });
    } finally { setNotifying(false); }
  };

  return (
    <Screen title={t("routeMission.stopTitle", "Parada {{n}} de {{total}}", { n: idx + 1, total: stops.length || 1 })} back right={<NavActions />}>
      <div className="px-4 pt-4">
        <StepDots step={2} />

        {stops.length > 0 && (
          <div className="mb-4 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-online transition-all" style={{ width: `${Math.round((doneCount / stops.length) * 100)}%` }} />
            </div>
            <span className="shrink-0 text-[12.5px] font-bold text-muted">{t("routeMission.progress", "{{done}}/{{total}} completadas", { done: doneCount, total: stops.length })}</span>
          </div>
        )}

        {loading && !data ? (
          <SkeletonList rows={4} />
        ) : error && !data ? (
          <ErrorState onRetry={reload} />
        ) : !stop ? (
          <p className="py-10 text-center text-sm text-muted">{t("routeMission.noStop", "Parada no encontrada")}</p>
        ) : (
          <div className="space-y-4 pb-10">
            {/* Hero */}
            <div className={styles.stopHero}>
              <div className="flex items-start gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-info/15 text-info"><Building2 size={24} /></span>
                <div className="min-w-0 flex-1">
                  <p className={styles.stopName}>{stop.name}</p>
                  {stop.address && <p className={styles.stopAddr}><MapPin size={13} className="mr-1 inline align-[-1px]" />{stop.address}</p>}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-muted">
                <Clock size={14} className="text-gold" />
                {t("routeMission.plannedEta", "Llegada planificada")}: <span className="font-bold text-ink">{etas[idx] ? fmtTime(etas[idx]) : "—"}</span>
              </div>
            </div>

            {/* Notify: heading here with an ETA */}
            <div className={styles.stopHero}>
              <p className="flex items-center gap-2 text-[15px] font-extrabold text-ink"><BellRing size={18} className="text-gold" />{t("routeMission.notifyHeading", "Avisar que voy en camino")}</p>
              <p className="mt-0.5 text-[13px] text-muted">{t("routeMission.notifySub", "Notifica al CRM y al cliente con tu tiempo estimado de llegada")}</p>

              <p className="mt-3 mb-2 text-[12px] font-semibold uppercase tracking-wide text-faint">{t("routeMission.selectEta", "Tiempo estimado")}</p>
              <div className={styles.etaChips}>
                {ETA_OPTIONS.map((m) => (
                  <button key={m} type="button" onClick={() => { fb.select(); setEta(m); setNotified(false); }} className={`${styles.etaChip} ${eta === m ? styles.etaChipOn : ""}`}>
                    {t("routeMission.minShort", "{{m}} min", { m })}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={notify}
                disabled={notifying}
                className={`mt-4 flex h-13 min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-full text-[15px] font-bold disabled:opacity-60 ${notified ? "bg-online text-white" : "bg-gold text-on-accent"}`}
              >
                {notified ? <><CheckCircle2 size={18} />{t("routeMission.notified", "Notificado · ETA {{min}} min", { min: eta })}</> : <><Send size={18} />{notifying ? t("routeMission.sending", "Enviando…") : t("routeMission.notifyNow", "Notificar en camino")}</>}
              </button>
            </div>

            {/* Navigate */}
            <button type="button" onClick={() => { fb.tap(); openAddressNavigation(stop.address || stop.name); }} className={styles.action}>
              <span className={styles.actionIcon} style={{ background: "color-mix(in srgb, var(--info) 16%, transparent)", color: "var(--info)" }}><Navigation size={20} /></span>
              <span className="min-w-0 flex-1">
                <span className={`block ${styles.actionTitle}`}>{t("routeMission.navigate", "Navegar a la parada")}</span>
                <span className={`block ${styles.actionSub}`}>{t("routeMission.navigateSub", "Abrir en mapas")}</span>
              </span>
              <ChevronRight size={18} className="text-faint" />
            </button>

            {/* Arrival check-in / progression */}
            {stop.done ? (
              <>
                <div className="flex items-center justify-center gap-2 rounded-xl border border-online/40 bg-online/10 py-2.5 text-[14px] font-bold text-online">
                  <CheckCircle2 size={17} />{t("routeMission.stopRegistered", "Parada registrada")}
                </div>
                <button
                  type="button"
                  onClick={advance}
                  disabled={finishing}
                  className="flex h-13 min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-full bg-gold text-[15px] font-bold text-on-accent disabled:opacity-60"
                >
                  {isLast ? (finishing ? t("routeMission.finishing", "Finalizando…") : t("routeMission.finishRoute", "Finalizar recorrido")) : t("routeMission.nextStop", "Siguiente parada")}<ChevronRight size={18} />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => { fb.tap(); history.push(`/supervisor/route/${routeId}/mission/${idx}/arrive`); }}
                className="flex h-13 min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-full bg-gold text-[15px] font-bold text-on-accent"
              >
                <MapPin size={18} />{t("routeMission.markArrival", "Marcar llegada")}
              </button>
            )}
          </div>
        )}
      </div>
    </Screen>
  );
}
