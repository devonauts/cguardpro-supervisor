import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory, useParams } from "react-router-dom";
import { MapPin, Clock, Flag } from "lucide-react";
import { Screen } from "@/components/Screen";
import { NavActions } from "@/components/shared/NavActions";
import { SlideToConfirm, SkeletonList, ErrorState } from "@/components/ui";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { useAsync } from "@/lib/useAsync";
import { normalizeStops, computeEtas, fmtTime, routeIdName } from "@/lib/routeMission";
import fb from "@/lib/feedback";
import styles from "./RouteMission.module.css";

function StepDots({ step }: { step: number }) {
  return (
    <div className={`${styles.steps} mb-4`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`${styles.stepDot} ${i < step ? styles.stepDotDone : i === step ? styles.stepDotActive : ""}`} />
      ))}
    </div>
  );
}

export default function RouteTimeline() {
  const { t } = useTranslation();
  const history = useHistory();
  const { routeId } = useParams<{ routeId: string }>();
  const { data, loading, error, reload } = useAsync<any>(() => supervisorRoute.routeDetail(routeId), [routeId]);
  const [starting, setStarting] = useState(false);

  const stops = useMemo(() => normalizeStops(data), [data]);
  const etas = useMemo(() => computeEtas(stops), [stops]);
  const { name } = routeIdName(data || {});

  const start = async () => {
    if (starting) return;
    setStarting(true);
    try {
      await supervisorRoute.start(routeId);
      // Only confirm + enter the mission once the backend recorded the start —
      // otherwise the route session is broken (finish/summary would have no start).
      fb.success();
      history.push(`/supervisor/route/${routeId}/mission/0`);
    } catch {
      fb.error(); // stay so the supervisor can retry
    } finally {
      setStarting(false);
    }
  };

  return (
    <Screen title={t("routeMission.timelineTitle", "Recorrido")} back right={<NavActions />}>
      <div className="px-4 pt-4">
        <StepDots step={1} />

        {loading && !data ? (
          <SkeletonList rows={5} />
        ) : error && !data ? (
          <ErrorState onRetry={reload} />
        ) : (
          <>
            <div className="mb-4">
              <p className="text-[19px] font-extrabold text-ink">{name}</p>
              <p className="flex items-center gap-3 text-[13px] text-muted">
                <span className="flex items-center gap-1"><MapPin size={13} />{t("routeMission.stopsCount", "{{count}} paradas", { count: stops.length })}</span>
                {etas.length > 0 && <span className="flex items-center gap-1"><Clock size={13} />{t("routeMission.finishBy", "Fin ~{{time}}", { time: fmtTime(etas[etas.length - 1]) })}</span>}
              </p>
            </div>

            <div className={`${styles.tl} pb-40`}>
              {stops.map((s, i) => (
                <div key={s.id} className={styles.tlRow}>
                  {i < stops.length - 1 && <span className={styles.tlLine} />}
                  <span className={styles.tlNode} style={i === stops.length - 1 ? { background: "var(--gold)" } : undefined}>
                    {i === stops.length - 1 ? <Flag size={13} /> : s.order}
                  </span>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`truncate ${styles.tlName}`}>{s.name}</p>
                      {s.address && <p className={`truncate ${styles.tlAddr}`}>{s.address}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={styles.tlEtaLabel}>{t("routeMission.eta", "ETA")}</p>
                      <p className={styles.tlEta}>{fmtTime(etas[i])}</p>
                    </div>
                  </div>
                </div>
              ))}
              {stops.length === 0 && <p className="py-8 text-center text-sm text-muted">{t("routeMission.noStops", "Esta ruta no tiene paradas")}</p>}
            </div>
          </>
        )}
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-surface/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur">
        <SlideToConfirm label={starting ? t("routeMission.starting", "Iniciando…") : t("routeMission.slideStartRoute", "Desliza para iniciar recorrido")} tone="gold" onConfirm={start} />
      </div>
    </Screen>
  );
}
