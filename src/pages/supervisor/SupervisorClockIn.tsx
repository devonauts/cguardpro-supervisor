import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import {
  Clock,
  MapPin,
  Camera,
  Image as ImageIcon,
  X,
  LogIn,
  LogOut,
  Loader2,
  Coffee,
  Play,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import {
  Card,
  ErrorState,
  SkeletonList,
  ResultSheet,
  Sheet,
} from "@/components/ui";
import { Button, StatusPill } from "@/components/ui/kit";
import { useAsync } from "@/lib/useAsync";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { setDuty } from "@/lib/dutyState";
import { getCurrentPosition } from "@/lib/geo";
import {
  compressImage,
  takeNativePhoto,
  isNative,
  CapturedImage,
} from "@/lib/capture";
import { uploadToStorage } from "@/lib/services";
import { fmtTime, relativeTime } from "@/lib/format";
import { pick } from "@/lib/normalize";
import { fb } from "@/lib/feedback";

/** Is the supervisor currently on duty, across the loose payload shapes. */
function isClockedIn(s: any): boolean {
  if (!s) return false;
  return Boolean(
    s.clockedIn ??
      s.onDuty ??
      s.isOnDuty ??
      s.active ??
      s.clockInAt ??
      s.clockedInAt ??
      s.startedAt,
  );
}

/** The shift-start timestamp for the active punch, across payload shapes. */
function startedAtOf(s: any): string | null {
  return (
    pick(
      s,
      "clockInAt",
      "clockedInAt",
      "startedAt",
      "since",
      "startTime",
      "start",
    ) || null
  );
}

/**
 * Supervisor clock-in / clock-out — start or end the supervisor's own shift.
 * Grabs GPS + an optional selfie on entry; captures optional observations on
 * exit. Field-friendly: big controls, explicit loading + error states.
 */
export default function SupervisorClockIn() {
  const { t } = useTranslation();
  const history = useHistory();

  const { data, loading, error, reload } = useAsync(() =>
    supervisorRoute.clockStatus(),
  );
  const clockedIn = isClockedIn(data);
  const since = startedAtOf(data);

  // Keep the shared duty state (which gates the radio mic) in sync with the
  // real clock status whenever it loads/refreshes.
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

  // ── Selfie picker (clock-in) ────────────────────────────────────────────
  const [selfie, setSelfie] = useState<CapturedImage | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const webResolver = useRef<((file: File | null) => void) | null>(null);

  const pickFile = (
    source: "camera" | "gallery",
  ): Promise<CapturedImage | null> => {
    // Native uses the Capacitor camera (FRONT camera for a selfie); web falls
    // back to a hidden <input type="file"> (capture="user" → front camera).
    if (isNative())
      return takeNativePhoto(source, { front: source === "camera" }).catch(
        () => null,
      );
    return new Promise((resolve) => {
      webResolver.current = async (file) => {
        if (!file) return resolve(null);
        try {
          resolve(await compressImage(file));
        } catch {
          resolve(null);
        }
      };
      (source === "camera" ? cameraInput : galleryInput).current?.click();
    });
  };

  const onWebPick = (file?: File | null) => {
    const r = webResolver.current;
    webResolver.current = null;
    r?.(file || null);
  };

  const chooseSelfie = async (source: "camera" | "gallery") => {
    setPickOpen(false);
    const img = await pickFile(source);
    if (img) setSelfie(img);
  };

  // ── Observations (clock-out) ────────────────────────────────────────────
  const [observations, setObservations] = useState("");

  // ── Actions ─────────────────────────────────────────────────────────────
  const doClockIn = async () => {
    if (busy) return;
    setBusy(true);
    setSubmitError(null);
    fb.press();
    try {
      // Best-effort GPS: a denied/stuck location must not block the punch.
      let latitude: number | undefined;
      let longitude: number | undefined;
      try {
        const pos = await getCurrentPosition();
        latitude = pos.latitude;
        longitude = pos.longitude;
      } catch {
        /* proceed without coordinates */
      }

      let selfiePhoto: string | undefined;
      if (selfie) {
        selfiePhoto = (
          await uploadToStorage(selfie.file, "guardShiftSelfie")
        ).privateUrl;
      }

      await supervisorRoute.clockIn({ latitude, longitude, selfiePhoto });
      setDuty(true); // enable the radio mic immediately on clock-in
      fb.success();
      setResult("in");
    } catch (e: any) {
      fb.error();
      setSubmitError(
        e?.message ||
          t("supervisor.clockError", "No se pudo registrar. Intenta de nuevo."),
      );
    } finally {
      setBusy(false);
    }
  };

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
      setSubmitError(
        e?.message ||
          t("supervisor.clockError", "No se pudo registrar. Intenta de nuevo."),
      );
    } finally {
      setBusy(false);
    }
  };

  const sinceLabel = useMemo(
    () => (since ? fmtTime(since) : "—"),
    [since],
  );

  return (
    <Screen
      title={t("supervisor.clockInTitle", "Marcar entrada")}
      backHref="/supervisor/dashboard"
      onRefresh={reload}
    >
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
              <StatusPill tone="green">
                {t("supervisor.onDuty", "En turno")}
              </StatusPill>
            </div>
            <p className="mt-3 text-sm text-muted">
              {t("supervisor.clockedInSince", "Entrada registrada a las")}{" "}
              <span className="font-semibold text-ink">{sinceLabel}</span>
            </p>
            {since && (
              <p className="mt-0.5 text-xs text-faint">{relativeTime(since)}</p>
            )}
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
            <Button
              variant={onBreak ? "primary" : "outline"}
              full
              disabled={breakBusy}
              onClick={toggleBreak}
              className="mt-3 justify-center gap-2"
            >
              {breakBusy ? <Loader2 size={18} className="animate-spin" />
                : onBreak ? <Play size={18} /> : <Coffee size={18} />}
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
              placeholder={t(
                "supervisor.observationsPlaceholder",
                "Escribe cualquier novedad del turno…",
              )}
              className="w-full resize-none rounded-xl border border-line bg-surface p-3 text-sm text-ink placeholder:text-faint outline-none focus:border-gold/60"
            />
          </Card>

          {submitError && (
            <p className="text-center text-sm font-medium text-critical">
              {submitError}
            </p>
          )}

          <Button
            variant="danger"
            full
            disabled={busy}
            onClick={doClockOut}
            className="justify-center gap-2"
          >
            {busy ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <LogOut size={20} />
            )}
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
            <p className="text-base font-bold text-ink">
              {t("supervisor.readyToStart", "Listo para iniciar tu turno")}
            </p>
            <p className="mt-1 text-sm text-muted">
              {t(
                "supervisor.clockInHint",
                "Registraremos tu ubicación al marcar la entrada.",
              )}
            </p>
          </Card>

          {/* Optional selfie */}
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-surface-2">
                {selfie ? (
                  <img
                    src={selfie.dataUrl}
                    alt={t("supervisor.selfie", "Selfie")}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Camera size={22} className="text-faint" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">
                  {t("supervisor.selfie", "Selfie")}{" "}
                  <span className="font-normal text-faint">
                    ({t("app.optional", "opcional")})
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {selfie
                    ? t("supervisor.selfieTaken", "Foto lista")
                    : t(
                        "supervisor.selfieHint",
                        "Toma una foto para verificar tu identidad.",
                      )}
                </p>
              </div>
              {selfie ? (
                <button
                  type="button"
                  aria-label={t("app.remove", "Quitar")}
                  onClick={() => setSelfie(null)}
                  className="pressable shrink-0 rounded-full p-2 text-muted active:bg-surface-2"
                >
                  <X size={18} />
                </button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setPickOpen(true)}
                  className="shrink-0 px-4"
                >
                  {t("supervisor.addPhoto", "Agregar")}
                </Button>
              )}
            </div>
          </Card>

          {submitError && (
            <p className="text-center text-sm font-medium text-critical">
              {submitError}
            </p>
          )}

          <Button
            variant="primary"
            full
            disabled={busy}
            onClick={doClockIn}
            className="justify-center gap-2"
          >
            {busy ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <LogIn size={20} />
            )}
            {t("supervisor.clockIn", "Marcar entrada")}
          </Button>
        </div>
      )}

      {/* Hidden web file inputs (browser selfie fallback) */}
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={(e) => {
          onWebPick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onWebPick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {/* Selfie source picker */}
      <Sheet open={pickOpen} onClose={() => setPickOpen(false)}>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => chooseSelfie("camera")}
            className="pressable flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-4 text-left"
          >
            <Camera size={20} className="text-gold" />
            <span className="text-sm font-medium text-ink">
              {t("supervisor.takePhoto", "Tomar foto")}
            </span>
          </button>
          <button
            type="button"
            onClick={() => chooseSelfie("gallery")}
            className="pressable flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-4 text-left"
          >
            <ImageIcon size={20} className="text-gold" />
            <span className="text-sm font-medium text-ink">
              {t("supervisor.chooseFromGallery", "Elegir de la galería")}
            </span>
          </button>
        </div>
      </Sheet>

      {/* Success result → back to dashboard */}
      <ResultSheet
        open={result !== null}
        onClose={() => {
          setResult(null);
          history.push("/supervisor/dashboard");
        }}
        variant="success"
        title={
          result === "out"
            ? t("supervisor.clockOutDone", "Salida registrada")
            : t("supervisor.clockInDone", "Entrada registrada")
        }
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
