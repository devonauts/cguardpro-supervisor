import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, Clock, MapPin } from "lucide-react";
import {
  startOfWeek,
  addDays,
  isSameDay,
  format,
} from "date-fns";
import { Screen } from "@/components/Screen";
import { Card, SkeletonList, EmptyState, ErrorState } from "@/components/ui";
import { useAsync } from "@/lib/useAsync";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { fmtTime } from "@/lib/format";
import { fb } from "@/lib/feedback";

interface TurnoRow { date: string; start: string; end: string; kind: string }

export default function ShiftSchedule() {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState(() => new Date());

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // The supervisor's OWN turno windows (not guards' shifts).
  const { data, loading, error, reload } = useAsync(() => supervisorRoute.schedule());
  const rows: TurnoRow[] = (data as any)?.rows || [];

  const dayShifts = useMemo(
    () =>
      rows.filter((r) => {
        const d = new Date(r.start);
        return !Number.isNaN(d.getTime()) && isSameDay(d, selected);
      }),
    [rows, selected]
  );

  const dshort = i18n.language?.startsWith("en") ? "EEE" : "EEEEEE";
  const hasTurno = !!(data as any)?.turno?.days?.length;

  return (
    <Screen
      title={t("schedule.title", "Mi turno")}
      subtitle={t("supervisor.turnoCount", { count: dayShifts.length, defaultValue: `${dayShifts.length} turno(s)` })}
      onRefresh={reload}
    >
      {/* Week day picker */}
      <div className="mb-4 grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const active = isSameDay(d, selected);
          return (
            <button
              key={d.toISOString()}
              onClick={() => {
                fb.select();
                setSelected(d);
              }}
              className={`flex flex-col items-center rounded-lg border py-2 ${
                active
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-line text-muted"
              }`}
            >
              <span className="text-xs uppercase">{format(d, dshort)}</span>
              <span className="text-base font-bold">{format(d, "d")}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <SkeletonList />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : dayShifts.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={28} />}
          title={hasTurno ? t("supervisor.noTurnoToday", "Sin turno este día") : t("supervisor.noTurno", "Aún no tienes un turno asignado")}
        />
      ) : (
        <div className="space-y-2">
          {dayShifts.map((s, i) => (
            <Card key={i} className="border-l-4 !border-l-gold p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">{s.kind}</p>
                <span className="flex items-center gap-1 text-xs text-muted">
                  <Clock size={13} className="text-gold" />
                  {fmtTime(s.start)} — {fmtTime(s.end)}
                </span>
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                <MapPin size={13} className="text-gold" />
                {t("supervisor.mobileStation", "Estación móvil")}
              </p>
            </Card>
          ))}
        </div>
      )}
    </Screen>
  );
}
