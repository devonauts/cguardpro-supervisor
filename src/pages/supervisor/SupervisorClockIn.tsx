import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import {
  Clock,
  MapPin,
  ClipboardCheck,
  Camera,
  LogIn,
  LogOut,
  Loader2,
  Coffee,
  Play,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card, ErrorState, SkeletonList, ResultSheet } from "@/components/ui";
import { Button, StatusPill } from "@/components/ui/kit";
import { useAsync } from "@/lib/useAsync";
import { useAuth } from "@/context/AuthContext";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { setDuty } from "@/lib/dutyState";
import { getCurrentPosition } from "@/lib/geo";
import { uploadToStorage } from "@/lib/services";
import { fmtTime, relativeTime } from "@/lib/format";
import { pick } from "@/lib/normalize";
import { fb } from "@/lib/feedback";
import { StartShiftModal, type ChecklistResult } from "@/components/StartShiftModal";
import { SelfieClockIn, type SelfieResult } from "@/components/SelfieClockIn";
import { logError } from "@/lib/errorLog";

/** Is the supervisor currently on duty, across the loose payload shapes. */
function isClockedIn(s: any): boolean {
  if (!s) return false;
  return Boolean(
    s.clockedIn ?? s.onDuty ?? s.isOnDuty ?? s.active ?? s.clockInAt ?? s.clockedInAt ?? s.startedAt,
  );
}

/** The shift-start timestamp for the active punch, across payload shapes. */
function startedAtOf(s: any): string | null {
  return pick(s, "clockInAt", "clockedInAt", "startedAt", "since", "startTime", "start") || null;
}

/**
 * Supervisor clock-in / clock-out — now at full parity with the guard app:
 * a pre-shift CHECKLIST (StartShiftModal) → a stamped SELFIE + GPS
 * (SelfieClockIn) → the punch, which the backend propagates to the CRM (live
 * map + Actividades with the selfie) exactly like a guard check-in. Clock-out
 * captures GPS + novedades. Field-friendly: big controls, explicit states.
 */
export default function SupervisorClockIn() {
  const { t } = useTranslation();
  const history = useHistory();
  const { user } = useAuth();
  const myName =
    (user as any)?.fullName ||
    [(user as any)?.firstName, (user as any)?.lastName].filter(Boolean).join(" ").trim() ||
    (user as any)?.email ||
    "Supervisor";

  const { data, loading, error, reload } = useAsync(() => supervisorRoute.clockStatus());
  const clockedIn = isClockedIn(data);
  const since = startedAtOf(data);

  // Keep the shared duty state (which gates the radio mic) in sync.
  useEffect(() => {
    setDuty(clockedIn);
  }, [clockedIn]);

  // ── Submit state (shared by clock-in and clock-out) ─────────────────────
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<"in" | "out" | null>(null);

  // ── Break state (only while on duty) ────────────────────────────────────
  const shift: any = (data && (data.shift || data)) || null;
  const onBreak = Boolean(shift?.onBreak);
  const breakMinutes = Number(shift?.breakMinutes) || 0;
  const breakCount = Array.isArray(shift?.breaks) ? shift.breaks.length : 0;
  const [breakBusy, setBreakBusy] = useState(false);
  const toggleBreak = async () => {
    if (breakBusy) return;
    setBreakBusy(true);
    fb.press();
    try {
      if (onBreak) await supervisorRoute.breakEnd();
      else await supervisorRoute.breakStart();
      fb.success();
      await reload();
    } catch {
      fb.error();
    } finally {
      setBreakBusy(false);
    }
  };

  // ── Clock-in flow: checklist → selfie → submit (mirrors the worker app) ──
  const [flowStep, setFlowStep] = useState<"idle" | "checklist" | "selfie">("idle");
  const [checklist, setChecklist] = useState<ChecklistResult | null>(null);
  // Set the ref SYNCHRONOUSLY on every transition: IonModal's onDidDismiss fires
  // when we programmatically advance checklist→selfie, and without this the
  // dismiss handler would reset the flow and kill the selfie step.
  const flowStepRef = useRef<"idle" | "checklist" | "selfie">("idle");
  const goStep = (s: "idle" | "checklist" | "selfie") => {
    flowStepRef.current = s;
    setFlowStep(s);
  };

  const beginClockIn = () => {
    setChecklist(null);
    setSubmitError(null);
    goStep("checklist");
  };

  const submitClockIn = async (selfieResult: SelfieResult) => {
    if (busy) return;
    setBusy(true);
    setSubmitError(null);
    fb.press();
    try {
      let selfiePhoto: string | undefined;
      try {
        selfiePhoto = (await uploadToStorage(selfieResult.file, "guardShiftSelfie")).privateUrl;
      } catch (e: any) {
        logError("supervisor.clockIn.uploadSelfie", e?.message || String(e));
      }

      // Prefer the selfie's coords; fall back to a fresh fix. GPS stays optional.
      let latitude = selfieResult.coords?.latitude;
      let longitude = selfieResult.coords?.longitude;
      if (latitude == null) {
        try {
          const p = await getCurrentPosition();
          latitude = p.latitude;
          longitude = p.longitude;
        } catch {
          /* proceed without coordinates */
        }
      }

      await supervisorRoute.clockIn({
        latitude,
        longitude,
        selfiePhoto,
        address: selfieResult.address || undefined,
        battery: checklist?.battery ?? undefined,
        checklist: checklist?.items,
      });
      setDuty(true); // enable the radio mic immediately on clock-in
      fb.success();
      goStep("idle");
      setResult("in");
    } catch (e: any) {
      fb.error();
      logError("supervisor.clockIn.submit", e?.message || String(e));
      setSubmitError(e?.message || t("supervisor.clockError", "No se pudo registrar. Intenta de nuevo."));
      goStep("idle");
    } finally {
      setBusy(false);
    }
  };

  // ── Observations (clock-out) ────────────────────────────────────────────
  const [observations, setObservations] = useState("");

  const doClockOut = async () => {
    if (busy) return;
    setBusy(true);
    setSubmitError(null);
    fb.press();
    try {
      let latitude: number | undefined;
      let longitude: number | undefined;
      try {
        const pos = await getCurrentPosition();
        latitude = pos.latitude;
        longitude = pos.longitude;
      } catch {
        /* proceed without coordinates */
      }

      await supervisorRoute.clockOut({
        latitude,
        longitude,
        observations: observations.trim() || undefined,
      });
      setDuty(false); // disconnect the radio on clock-out
      fb.success();
      setResult("out");
    } catch (e: any) {
      fb.error();
      setSubmitError(e?.message || t("supervisor.clockError", "No se pudo registrar. Intenta de nuevo."));
    } finally {
      setBusy(false);
    }
  };

  const sinceLabel = useMemo(() => (since ? fmtTime(since) : "—"), [since]);

  return (
    <Screen title={t("supervisor.clockInTitle", "Marcar entrada")} backHref="/supervisor/dashboard" onRefresh={reload}>
      {loading ? (
        <SkeletonList rows={3} />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : clockedIn ? (
        /* ───────────────────────── ON DUTY → clock out ─────────────────── */
        <div className="space-y-4">
          <Card className="p-5 text-center">
            <span className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-online/15 text-online">
              <Clock size={30} />
            </span>
            <div className="flex justify-center">
              <StatusPill tone="green">{t("supervisor.onDuty", "En turno")}</StatusPill>
            </div>
            <p className="mt-3 text-sm text-muted">
              {t("supervisor.clockedInSince", "Entrada registrada a las")}{" "}
              <span className="font-semibold text-ink">{sinceLabel}</span>
            </p>
            {since && <p className="mt-0.5 text-xs text-faint">{relativeTime(since)}</p>}
          </Card>

          {/* Breaks */}
          <Card className={`p-4 ${onBreak ? "border-gold/40 bg-gold/5" : ""}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${onBreak ? "bg-gold/15 text-gold" : "bg-surface-2 text-muted"}`}>
                  <Coffee size={20} />
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ink">
                    {onBreak ? t("supervisor.onBreak", "En descanso") : t("supervisor.breaks", "Descansos")}
                  </p>
                  <p className="text-xs text-muted">
                    {breakCount > 0
                      ? t("supervisor.breakSummary", "{{count}} descanso(s) · {{min}} min en total", { count: breakCount, min: breakMinutes })
                      : t("supervisor.breakNone", "Sin descansos aún")}
                  </p>
                </div>
              </div>
            </div>
            <Button variant={onBreak ? "primary" : "outline"} full disabled={breakBusy} onClick={toggleBreak} className="mt-3 justify-center gap-2">
              {breakBusy ? <Loader2 size={18} className="animate-spin" /> : onBreak ? <Play size={18} /> : <Coffee size={18} />}
              {onBreak ? t("supervisor.breakEnd", "Terminar descanso") : t("supervisor.breakStart", "Iniciar descanso")}
            </Button>
          </Card>

          <Card className="p-4">
            <label className="mb-2 block text-sm font-semibold text-ink">
              {t("supervisor.observations", "Novedades (opcional)")}
            </label>
            <textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              rows={4}
              placeholder={t("supervisor.observationsPlaceholder", "Escribe cualquier novedad del turno…")}
              className="w-full resize-none rounded-xl border border-line bg-surface p-3 text-sm text-ink placeholder:text-faint outline-none focus:border-gold/60"
            />
          </Card>

          {submitError && <p className="text-center text-sm font-medium text-critical">{submitError}</p>}

          <Button variant="danger" full disabled={busy} onClick={doClockOut} className="justify-center gap-2">
            {busy ? <Loader2 size={20} className="animate-spin" /> : <LogOut size={20} />}
            {t("supervisor.clockOut", "Marcar salida")}
          </Button>
        </div>
      ) : (
        /* ───────────────────────── OFF DUTY → clock in ─────────────────── */
        <div className="space-y-4">
          <Card className="p-5 text-center">
            <span className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-gold/15 text-gold">
              <MapPin size={30} />
            </span>
            <p className="text-base font-bold text-ink">{t("supervisor.readyToStart", "Listo para iniciar tu turno")}</p>
            <p className="mt-1 text-sm text-muted">
              {t("supervisor.clockInHintFull", "Completa la lista de verificación y toma una selfie con tu ubicación para marcar la entrada.")}
            </p>
            <div className="mt-4 flex items-center justify-center gap-5 text-xs text-muted">
              <span className="flex items-center gap-1.5"><ClipboardCheck size={16} className="text-gold" /> {t("supervisor.stepChecklist", "Checklist")}</span>
              <span className="flex items-center gap-1.5"><Camera size={16} className="text-gold" /> {t("supervisor.stepSelfie", "Selfie + GPS")}</span>
            </div>
          </Card>

          {submitError && <p className="text-center text-sm font-medium text-critical">{submitError}</p>}

          <Button variant="primary" full disabled={busy} onClick={beginClockIn} className="justify-center gap-2">
            {busy ? <Loader2 size={20} className="animate-spin" /> : <LogIn size={20} />}
            {t("supervisor.clockIn", "Marcar entrada")}
          </Button>
        </div>
      )}

      {/* Pre-shift checklist */}
      <StartShiftModal
        isOpen={flowStep === "checklist"}
        station={null}
        guardName={myName}
        onClose={() => {
          if (flowStepRef.current === "checklist") goStep("idle");
        }}
        onStart={(r) => {
          setChecklist(r);
          goStep("selfie");
        }}
      />

      {/* Selfie + GPS */}
      <SelfieClockIn
        isOpen={flowStep === "selfie"}
        guardName={myName}
        stationName={t("supervisor.mobileStation", "Supervisión")}
        onCancel={() => {
          if (flowStepRef.current === "selfie") goStep("checklist");
        }}
        onCapture={submitClockIn}
      />

      {/* Success result → back to dashboard */}
      <ResultSheet
        open={result !== null}
        onClose={() => {
          setResult(null);
          history.push("/supervisor/dashboard");
        }}
        variant="success"
        title={result === "out" ? t("supervisor.clockOutDone", "Salida registrada") : t("supervisor.clockInDone", "Entrada registrada")}
        lines={[
          result === "out"
            ? t("supervisor.clockOutDoneHint", "Tu turno ha finalizado.")
            : t("supervisor.clockInDoneHint", "Tu turno ha comenzado."),
        ]}
        primaryLabel={t("supervisor.goToDashboard", "Ir al panel")}
        onPrimary={() => {
          setResult(null);
          history.push("/supervisor/dashboard");
        }}
      />
    </Screen>
  );
}
