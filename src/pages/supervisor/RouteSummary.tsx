import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useHistory, useParams } from "react-router-dom";
import { CheckCircle2, Circle, Flag, MapPin, Home } from "lucide-react";
import { Screen } from "@/components/Screen";
import { NavActions } from "@/components/shared/NavActions";
import { SkeletonList } from "@/components/ui";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { useAsync } from "@/lib/useAsync";
import { normalizeStops, routeIdName } from "@/lib/routeMission";
import fb from "@/lib/feedback";

export default function RouteSummary() {
  const { t } = useTranslation();
  const history = useHistory();
  const { routeId } = useParams<{ routeId: string }>();
  const { data, loading } = useAsync<any>(() => supervisorRoute.routeDetail(routeId), [routeId]);

  const stops = useMemo(() => normalizeStops(data), [data]);
  const { name } = routeIdName(data || {});
  const done = stops.filter((s) => s.done).length;
  const pct = stops.length ? Math.round((done / stops.length) * 100) : 100;

  return (
    <Screen title={t("routeMission.summaryTitle", "Resumen del recorrido")} back right={<NavActions />}>
      <div className="px-4 pt-6">
        {loading && !data ? (
          <SkeletonList rows={5} />
        ) : (
          <>
            <div className="flex flex-col items-center text-center">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-online/15 text-online"><Flag size={30} /></span>
              <p className="mt-3 text-[22px] font-extrabold text-ink">{t("routeMission.routeComplete", "Recorrido finalizado")}</p>
              <p className="text-[14px] text-muted">{name}</p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-line bg-surface-elev p-4 text-center">
                <p className="text-[28px] font-extrabold text-ink">{done}/{stops.length}</p>
                <p className="text-[12.5px] text-muted">{t("routeMission.stopsChecked", "Paradas registradas")}</p>
              </div>
              <div className="rounded-2xl border border-line bg-surface-elev p-4 text-center">
                <p className="text-[28px] font-extrabold text-online">{pct}%</p>
                <p className="text-[12.5px] text-muted">{t("routeMission.completion", "Completado")}</p>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              {stops.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface-elev px-3.5 py-3">
                  {s.done ? <CheckCircle2 size={20} className="shrink-0 text-online" /> : <Circle size={20} className="shrink-0 text-faint" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-semibold text-ink">{s.name}</p>
                    {s.address && <p className="truncate text-[12px] text-muted"><MapPin size={11} className="mr-1 inline align-[-1px]" />{s.address}</p>}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => { fb.tap(); history.replace("/supervisor/dashboard"); }}
              className="mt-6 mb-10 flex h-13 min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-full bg-gold text-[15px] font-bold text-on-accent"
            >
              <Home size={18} />{t("routeMission.backHome", "Volver al inicio")}
            </button>
          </>
        )}
      </div>
    </Screen>
  );
}
