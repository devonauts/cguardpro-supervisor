import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, Clock, MapPin, ChevronLeft, ChevronRight } from "lucide-react";
import { startOfWeek, addDays, isSameDay, format } from "date-fns";
import { Screen } from "@/components/Screen";
import { Card, SkeletonList, EmptyState, ErrorState } from "@/components/ui";
import { useAsync } from "@/lib/useAsync";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { fmtTime } from "@/lib/format";
import { fb } from "@/lib/feedback";

interface TurnoRow { date: string; start: string; end: string; kind: string }

/** Calendar day (YYYY-MM-DD) an instant falls on IN THE TENANT TIMEZONE — never
 *  the device's own tz. This is what keeps a night turno on the right day. */
const tzYmd = (value: any, tz?: string): string => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch { return format(d, "yyyy-MM-dd"); }
};

const isWork = (c: string) => c === "D" || c === "N" || c === "24";

export default function ShiftSchedule() {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState(() => new Date());
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, ±1 navigate

  const weekStart = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // The supervisor's OWN turno windows + the authoritative day-by-day schedule.
  const { data, loading, error, reload } = useAsync(() => supervisorRoute.schedule());
  const rows: TurnoRow[] = (data as any)?.rows || [];
  const tz: string = (data as any)?.timezone || "";

  // Backend is the source of truth: date -> 'D'|'N'|'L' (or novedad). We just paint it.
  const dayCodes: Record<string, string> = useMemo(() => {
    const out: Record<string, string> = {};
    for (const day of ((data as any)?.days || [])) { if (day?.date) out[String(day.date)] = String(day.code || ""); }
    return out;
  }, [data]);

  const selKey = format(selected, "yyyy-MM-dd");
  const selCode = dayCodes[selKey] || "";

  // Turnos for the selected day — bucketed by the TENANT timezone, not the device.
  const dayShifts = useMemo(
    () => rows.filter((r) => (tz ? tzYmd(r.start, tz) === selKey : (() => { const d = new Date(r.start); return !Number.isNaN(d.getTime()) && isSameDay(d, selected); })())),
    [rows, selected, selKey, tz]
  );

  const dshort = i18n.language?.startsWith("en") ? "EEE" : "EEEEEE";
  const kindLabel = (k: string) =>
    k === "night" || k === "N" ? t("supervisor.night", "Nocturno") : t("supervisor.day", "Diurno");
  const codeColor = (c: string) =>
    c === "N" ? "text-indigo-400" : isWork(c) ? "text-gold" : "text-online";
  const emptyTitle = selCode === "L"
    ? t("supervisor.restDay", "Descanso (libre)")
    : isWork(selCode)
      ? t("supervisor.noTurnoToday", "Sin turno este día")
      : t("supervisor.noTurno", "Aún no tienes un turno asignado");

  return (
    <Screen
      title={t("schedule.title", "Mi turno")}
      subtitle={t("supervisor.turnoCount", { count: dayShifts.length, defaultValue: `${dayShifts.length} turno(s)` })}
      onRefresh={reload}
    >
      {/* Week navigation */}
      <div className="mb-2 flex items-center justify-between">
        <button onClick={() => { fb.select(); setWeekOffset((w) => w - 1); }} className="rounded-lg p-1.5 text-muted active:bg-line/40" aria-label="Semana anterior">
          <ChevronLeft size={18} />
        </button>
        <span className="text-xs font-semibold uppercase text-muted">
          {format(weekStart, "d MMM")} – {format(addDays(weekStart, 6), "d MMM")}
        </span>
        <button onClick={() => { fb.select(); setWeekOffset((w) => w + 1); }} className="rounded-lg p-1.5 text-muted active:bg-line/40" aria-label="Semana siguiente">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Week day picker — each day shows its código (D/N/L) from the backend */}
      <div className="mb-4 grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const active = isSameDay(d, selected);
          const code = dayCodes[format(d, "yyyy-MM-dd")] || "";
          return (
            <button
              key={d.toISOString()}
              onClick={() => { fb.select(); setSelected(d); }}
              className={`flex flex-col items-center rounded-lg border py-2 ${active ? "border-gold bg-gold/10 text-gold" : "border-line text-muted"}`}
            >
              <span className="text-xs uppercase">{format(d, dshort)}</span>
              <span className="text-base font-bold">{format(d, "d")}</span>
              <span className={`mt-0.5 h-3 text-[10px] font-bold leading-none ${active ? "text-gold" : codeColor(code)}`}>
                {code || ""}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <SkeletonList />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : dayShifts.length === 0 ? (
        <EmptyState icon={<CalendarDays size={28} />} title={emptyTitle} />
      ) : (
        <div className="space-y-2">
          {dayShifts.map((s, i) => (
            <Card key={i} className="border-l-4 !border-l-gold p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">{kindLabel(s.kind)}</p>
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
