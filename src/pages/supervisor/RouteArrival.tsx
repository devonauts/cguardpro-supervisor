import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory, useParams } from "react-router-dom";
import {
  MapPin, Building2, Check, X, Camera, Loader2, ClipboardCheck,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { NavActions } from "@/components/shared/NavActions";
import { EmptyState, ErrorState, Skeleton, ResultSheet, SectionTitle } from "@/components/ui";
import { Button } from "@/components/ui/kit";
import { usePhotoCapture, PhotoStrip } from "@/components/photoCapture";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { uploadToStorage } from "@/lib/services";
import { getCurrentPosition } from "@/lib/geo";
import { useAsync } from "@/lib/useAsync";
import { normalizeStops, nextIncompleteIndex } from "@/lib/routeMission";
import fb from "@/lib/feedback";

type TaskResult = "ok" | "no";

export default function RouteArrival() {
  const { t } = useTranslation();
  const history = useHistory();
  const { routeId, index } = useParams<{ routeId: string; index: string }>();
  const idx = Math.max(0, parseInt(index, 10) || 0);

  const { data, loading, error, reload } = useAsync<any>(() => supervisorRoute.routeDetail(routeId), [routeId]);
  const stops = useMemo(() => normalizeStops(data), [data]);
  const stop = stops[idx];

  const { photos, addPhoto, removePhoto, Inputs } = usePhotoCapture();
  const [results, setResults] = useState<Record<string, TaskResult>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // The next stop to visit after this one is completed.
  const nextIdx = useMemo(() => nextIncompleteIndex(stops, idx + 1), [stops, idx]);
  const isLast = nextIdx < 0;

  const setTask = (id: string, r: TaskResult) => setResults((prev) => ({ ...prev, [id]: r }));

  const onSubmit = async () => {
    if (!stop || submitting) return;
    setSubmitting(true); setSubmitError(false);
    try {
      let latitude: number | undefined, longitude: number | undefined;
      try { const pos = await getCurrentPosition(); latitude = pos.latitude; longitude = pos.longitude; } catch { /* no fix */ }

      const photoIds: any[] = [];
      for (const p of photos) {
        try { const up = await uploadToStorage(p.file, "supervisorProofImage"); photoIds.push({ ...up, new: true }); } catch { /* skip */ }
      }
      const taskResults = stop.tasks.map((tk) => ({ taskId: tk.id, label: tk.label, result: results[tk.id] ?? "ok" }));

      await supervisorRoute.checkStop(routeId, stop.id, { taskResults, notes: notes.trim() || undefined, photoIds, latitude, longitude });
      fb.success(); setDone(true);
    } catch {
      fb.error(); setSubmitError(true);
    } finally { setSubmitting(false); }
  };

  const goNext = () => {
    fb.tap();
    history.replace(`/supervisor/route/${routeId}/mission/${nextIdx}`);
  };

  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    try { await supervisorRoute.finish(routeId, {}); } catch { /* best-effort */ }
    fb.success();
    history.replace(`/supervisor/route/${routeId}/summary`);
  };

  if (loading && !data) {
    return (
      <Screen title={t("routeMission.arriveTitle", "Registrar llegada")} back right={<NavActions />}>
        <div className="px-4 pt-4"><Skeleton className="h-28 w-full rounded-2xl" /><Skeleton className="mt-4 h-40 w-full rounded-2xl" /></div>
      </Screen>
    );
  }
  if ((error && !data) || !stop) {
    return (
      <Screen title={t("routeMission.arriveTitle", "Registrar llegada")} back right={<NavActions />} onRefresh={reload}>
        <div className="px-4 pt-8">{error ? <ErrorState onRetry={reload} /> : <EmptyState icon={<MapPin size={26} />} title={t("routeMission.noStop", "Parada no encontrada")} />}</div>
      </Screen>
    );
  }

  return (
    <Screen title={t("routeMission.arriveTitle", "Registrar llegada")} subtitle={stop.name || undefined} back right={<NavActions />}>
      <Inputs />
      <div className="px-4 pt-4">
        {/* Stop header */}
        <div className="rounded-2xl border border-line bg-surface-elev p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-info/15 text-info"><Building2 size={22} /></span>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight text-ink">{stop.name}</p>
              {stop.address && <p className="mt-1 flex items-start gap-1.5 text-sm text-muted"><MapPin size={14} className="mt-0.5 shrink-0" />{stop.address}</p>}
            </div>
          </div>
        </div>

        {/* Tasks */}
        {stop.tasks.length > 0 && (
          <div className="mt-6">
            <SectionTitle icon={<ClipboardCheck size={16} />}>{t("supervisor.tasks", "Tareas")}</SectionTitle>
            <div className="flex flex-col gap-2.5">
              {stop.tasks.map((tk) => {
                const r = results[tk.id];
                return (
                  <div key={tk.id} className="rounded-2xl border border-line bg-surface p-4">
                    <p className="text-[15px] font-medium text-ink">{tk.label}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => { fb.select(); setTask(tk.id, "ok"); }} aria-pressed={r === "ok"} className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl border text-sm font-semibold ${r === "ok" ? "border-online/40 bg-online/15 text-online" : "border-line text-muted active:bg-surface-2"}`}><Check size={18} />{t("supervisor.route.taskOk", "OK")}</button>
                      <button type="button" onClick={() => { fb.select(); setTask(tk.id, "no"); }} aria-pressed={r === "no"} className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl border text-sm font-semibold ${r === "no" ? "border-critical/40 bg-critical/15 text-critical" : "border-line text-muted active:bg-surface-2"}`}><X size={18} />{t("supervisor.route.taskNo", "Falla")}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="mt-6">
          <SectionTitle>{t("supervisor.route.notes", "Novedades / notas")}</SectionTitle>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder={t("supervisor.route.notesPlaceholder", "Observaciones de la parada (opcional)…")} className="w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-[15px] text-ink placeholder:text-faint focus:border-gold/50 focus:outline-none" />
        </div>

        {/* Proof photo */}
        <div className="mt-6 pb-28">
          <SectionTitle icon={<Camera size={16} />}>{t("supervisor.proofPhoto", "Foto de evidencia")}<span className="ml-1 text-xs font-normal text-faint">{t("supervisor.route.optional", "(opcional)")}</span></SectionTitle>
          <PhotoStrip photos={photos} onAdd={addPhoto} onRemove={removePhoto} />
        </div>
      </div>

      {/* Sticky submit */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-surface/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur">
        <Button full onClick={onSubmit} disabled={submitting}>
          {submitting ? <span className="inline-flex items-center gap-2"><Loader2 size={18} className="animate-spin" />{t("supervisor.route.saving", "Guardando…")}</span>
            : <span className="inline-flex items-center gap-2"><Check size={18} />{t("routeMission.confirmArrival", "Confirmar llegada")}</span>}
        </Button>
      </div>

      {/* Success → progress to next stop or finish */}
      <ResultSheet
        open={done}
        onClose={isLast ? finish : goNext}
        variant="success"
        title={t("routeMission.stopChecked", "Llegada registrada")}
        lines={[stop.name, isLast ? t("routeMission.allStopsDone", "Todas las paradas completadas") : t("routeMission.onward", "Continúa a la siguiente parada")].filter(Boolean) as string[]}
        primaryLabel={isLast ? (finishing ? t("routeMission.finishing", "Finalizando…") : t("routeMission.finishRoute", "Finalizar recorrido")) : t("routeMission.nextStop", "Siguiente parada")}
        onPrimary={isLast ? finish : goNext}
      />

      {/* Error → retry */}
      <ResultSheet
        open={submitError}
        onClose={() => setSubmitError(false)}
        variant="error"
        title={t("routeMission.checkError", "No se pudo registrar")}
        lines={[t("supervisor.route.checkErrorHint", "Revisa tu conexión e inténtalo de nuevo.")]}
        primaryLabel={t("app.retry", "Reintentar")}
        onPrimary={() => { setSubmitError(false); onSubmit(); }}
        secondaryLabel={t("common.close", "Cerrar")}
        onSecondary={() => setSubmitError(false)}
      />
    </Screen>
  );
}
