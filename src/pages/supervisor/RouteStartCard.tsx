import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { Route as RouteIcon, MapPin, ChevronRight } from "lucide-react";
import { SlideToConfirm } from "@/components/ui";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { normalizeStops, routeIdName, isRunActive } from "@/lib/routeMission";
import fb from "@/lib/feedback";
import styles from "./RouteMission.module.css";

/**
 * Floating card at the bottom of the dashboard map: the entry point to the
 * multi-step route mission. Slide to begin → preparation checklist. If a run is
 * already in progress, it becomes a "continue" affordance instead.
 */
export function RouteStartCard() {
  const { t } = useTranslation();
  const history = useHistory();
  const [route, setRoute] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    supervisorRoute
      .today()
      .then((rows: any) => {
        const list: any[] = Array.isArray(rows) ? rows : rows?.routes || [];
        // Prefer a not-yet-active route; fall back to the first.
        const pick = list.find((r) => !isRunActive(r)) || list[0] || null;
        if (alive) setRoute(pick);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!route) return null;
  const { id, name } = routeIdName(route);
  const stops = normalizeStops(route);
  const active = isRunActive(route);

  return (
    <div className={styles.startCard}>
      <div className={styles.startTop}>
        <span className={styles.startIcon}><RouteIcon size={22} /></span>
        <div className="min-w-0 flex-1">
          <p className={`truncate ${styles.startName}`}>{name}</p>
          <p className={styles.startMeta}>
            <MapPin size={12} className="mr-1 inline align-[-1px]" />
            {t("routeMission.stopsCount", "{{count}} paradas", { count: stops.length })}
          </p>
        </div>
      </div>

      {active ? (
        <button
          type="button"
          onClick={() => { fb.tap(); history.push(`/supervisor/route/${id}/timeline`); }}
          className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-gold text-[15px] font-bold text-on-accent"
        >
          {t("routeMission.continue", "Continuar ruta")}<ChevronRight size={18} />
        </button>
      ) : (
        <SlideToConfirm
          label={t("routeMission.slideStart", "Desliza para iniciar ruta")}
          tone="gold"
          onConfirm={() => history.push(`/supervisor/route/${id}/prep`)}
        />
      )}
    </div>
  );
}

export default RouteStartCard;
