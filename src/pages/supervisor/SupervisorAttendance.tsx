import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useIonToast } from "@ionic/react";
import { CalendarCheck, Check, X, Clock, LogOut, AlertTriangle } from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card, SkeletonList, EmptyState, ErrorState } from "@/components/ui";
import { useAsync } from "@/lib/useAsync";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { fmtTime } from "@/lib/format";

/** Best-effort field extraction across payload shapes. */
const guardName = (r: any) =>
  r.guardName || r.guard?.fullName || r.securityGuard?.fullName || r.fullName || "Vigilante";
const stationName = (r: any) =>
  r.stationName || r.station?.stationName || r.station || "—";
const whenOf = (r: any) => r.requestedAt || r.punchInTime || r.createdAt || r.at || null;

export default function SupervisorAttendance() {
  const { t } = useTranslation();
  const [present] = useIonToast();
  const [busy, setBusy] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsync(() => supervisorRoute.attendancePending());
  useLiveRefresh(reload, ["guard.check", "attendance"]);

  const clockIn: any[] = (data as any)?.clockInRequests || [];
  const clockOut: any[] = (data as any)?.clockOutRequests || [];
  const exceptions: any[] = (data as any)?.exceptions || [];
  const total = clockIn.length + clockOut.length + exceptions.length;

  const act = async (key: string, fn: () => Promise<any>, ok: string) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
      present({ message: ok, duration: 1200, position: "bottom", color: "success" });
      reload();
    } catch {
      present({ message: t("attendance.actionError", "No se pudo completar la acción"), duration: 1600, position: "bottom", color: "danger" });
    } finally {
      setBusy(null);
    }
  };

  const Row = ({ r, kind }: { r: any; kind: "in" | "out" | "exc" }) => {
    const w = whenOf(r);
    return (
      <Card className="flex items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{guardName(r)}</p>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
            <span className="truncate">{stationName(r)}</span>
            {w && <span className="flex items-center gap-1"><Clock size={11} />{fmtTime(w)}</span>}
          </p>
          {r.reason && <p className="mt-0.5 truncate text-xs text-muted">{r.reason}</p>}
        </div>
        {kind === "exc" ? (
          <button
            disabled={!!busy}
            onClick={() => act(`exc-${r.id}`, () => supervisorRoute.attendanceResolveException(r.id), t("attendance.resolved", "Resuelto"))}
            className="min-h-[40px] shrink-0 rounded-lg bg-online/15 px-3 py-2 text-xs font-bold text-online"
          >
            {t("attendance.resolve", "Resolver")}
          </button>
        ) : (
          <div className="flex shrink-0 gap-1.5">
            <button
              disabled={!!busy}
              onClick={() => act(`ok-${r.id}`, () => kind === "in" ? supervisorRoute.attendanceDecideClockIn(r.id, "approved") : supervisorRoute.attendanceDecideClockOut(r.id, "approved"), t("attendance.approved", "Aprobado"))}
              className="grid h-11 w-11 place-items-center rounded-lg bg-online/15 text-online"
              aria-label={t("attendance.approve", "Aprobar")}
            ><Check size={18} /></button>
            <button
              disabled={!!busy}
              onClick={() => act(`no-${r.id}`, () => kind === "in" ? supervisorRoute.attendanceDecideClockIn(r.id, "rejected") : supervisorRoute.attendanceDecideClockOut(r.id, "rejected"), t("attendance.rejected", "Rechazado"))}
              className="grid h-11 w-11 place-items-center rounded-lg bg-critical/15 text-critical"
              aria-label={t("attendance.reject", "Rechazar")}
            ><X size={18} /></button>
          </div>
        )}
      </Card>
    );
  };

  const SectionH = ({ icon, title, n }: { icon: any; title: string; n: number }) => (
    <div className="mb-2 mt-4 flex items-center gap-2 first:mt-0">
      {icon}
      <span className="text-sm font-bold text-ink">{title}</span>
      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{n}</span>
    </div>
  );

  return (
    <Screen title={t("attendance.title", "Asistencia")} subtitle={t("attendance.pendingCount", { count: total, defaultValue: `${total} pendiente(s)` })} onRefresh={reload}>
      {loading && !data ? (
        <SkeletonList />
      ) : error && !data ? (
        <ErrorState onRetry={reload} />
      ) : total === 0 ? (
        <EmptyState icon={<CalendarCheck size={28} />} title={t("attendance.allClear", "Sin pendientes de asistencia")} />
      ) : (
        <div>
          {clockIn.length > 0 && <><SectionH icon={<Clock size={16} className="text-gold" />} title={t("attendance.clockInRequests", "Solicitudes de entrada")} n={clockIn.length} /><div className="space-y-2">{clockIn.map((r, i) => <Row key={r.id || i} r={r} kind="in" />)}</div></>}
          {clockOut.length > 0 && <><SectionH icon={<LogOut size={16} className="text-gold" />} title={t("attendance.clockOutRequests", "Solicitudes de salida")} n={clockOut.length} /><div className="space-y-2">{clockOut.map((r, i) => <Row key={r.id || i} r={r} kind="out" />)}</div></>}
          {exceptions.length > 0 && <><SectionH icon={<AlertTriangle size={16} className="text-gold" />} title={t("attendance.exceptions", "Excepciones")} n={exceptions.length} /><div className="space-y-2">{exceptions.map((r, i) => <Row key={r.id || i} r={r} kind="exc" />)}</div></>}
        </div>
      )}
    </Screen>
  );
}
