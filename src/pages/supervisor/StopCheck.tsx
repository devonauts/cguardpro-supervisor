import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory, useParams } from "react-router-dom";
import {
  MapPin,
  Building2,
  Navigation,
  Check,
  X,
  Camera,
  Loader2,
  ClipboardCheck,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import {
  EmptyState,
  ErrorState,
  Skeleton,
  ResultSheet,
  SectionTitle,
} from "@/components/ui";
import { Button } from "@/components/ui/kit";
import { usePhotoCapture, PhotoStrip } from "@/components/photoCapture";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { openNativeNavigation } from "@/lib/navigate";
import { uploadToStorage } from "@/lib/services";
import { getCurrentPosition } from "@/lib/geo";
import { useAsync } from "@/lib/useAsync";
import fb from "@/lib/feedback";

/* -------------------------------------------------------------- normalizers */

function asText(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object")
    return (
      v.name ||
      v.title ||
      v.label ||
      v.text ||
      v.taskToDo ||
      v.postSiteName ||
      v.stationName ||
      v.address ||
      ""
    );
  return String(v);
}

function toNum(v: any): number | undefined {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && !Number.isNaN(n) ? n : undefined;
}

interface StopTask {
  id: string;
  label: string;
}

interface StopPoint {
  id: string;
  name: string;
  address: string;
  siteType: string;
  latitude?: number;
  longitude?: number;
  tasks: StopTask[];
}

function findPoint(route: any, pointId: string): StopPoint | null {
  if (!route || typeof route !== "object") return null;
  const rawStops: any[] = Array.isArray(route.points)
    ? route.points
    : Array.isArray(route.stops)
    ? route.stops
    : Array.isArray(route.routePoints)
    ? route.routePoints
    : [];

  const raw = rawStops.find(
    (p, i) =>
      String(p.id ?? p.pointId ?? p.postSiteId ?? i) === String(pointId)
  );
  if (!raw) return null;

  const site = raw.postSite ?? raw.site ?? raw.station ?? null;
  const rawTasks: any[] = Array.isArray(raw.tasks)
    ? raw.tasks
    : Array.isArray(raw.checklist)
    ? raw.checklist
    : Array.isArray(raw.items)
    ? raw.items
    : [];

  const tasks: StopTask[] = rawTasks.map((tk, i) => ({
    id: String(tk?.id ?? tk?.taskId ?? i),
    label: asText(tk) || `#${i + 1}`,
  }));

  return {
    id: String(raw.id ?? raw.pointId ?? raw.postSiteId ?? pointId),
    name:
      asText(raw.name) ||
      asText(raw.postSite) ||
      asText(raw.station) ||
      asText(site) ||
      "",
    address: asText(raw.address) || asText(site) || "",
    siteType:
      asText(raw.siteType) || asText(raw.type) || asText(site?.type) || "",
    latitude: toNum(raw.latitude ?? raw.lat ?? site?.latitude),
    longitude: toNum(raw.longitude ?? raw.lng ?? raw.lon ?? site?.longitude),
    tasks,
  };
}

/* ---------------------------------------------------------------- component */

type TaskResult = "ok" | "no";

export default function StopCheck() {
  const { t } = useTranslation();
  const history = useHistory();
  const { routeId, pointId } = useParams<{ routeId: string; pointId: string }>();

  const { data, loading, error, reload } = useAsync(
    () => supervisorRoute.routeDetail(routeId),
    [routeId]
  );

  const point = useMemo(() => findPoint(data, pointId), [data, pointId]);

  const { photos, addPhoto, removePhoto, Inputs } = usePhotoCapture();
  const [results, setResults] = useState<Record<string, TaskResult>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const backToRoute = () => history.push(`/supervisor/route/${routeId}`);

  const setTask = (id: string, r: TaskResult) =>
    setResults((prev) => ({ ...prev, [id]: prev[id] === r ? prev[id] : r }));

  const navigate = () => {
    if (
      !point ||
      typeof point.latitude !== "number" ||
      typeof point.longitude !== "number"
    )
      return;
    fb.tap();
    openNativeNavigation(point.latitude, point.longitude, point.name);
  };

  const onSubmit = async () => {
    if (!point || submitting) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      // Best-effort GPS (never blocks the check — a denied fix just omits coords).
      let latitude: number | undefined;
      let longitude: number | undefined;
      try {
        const pos = await getCurrentPosition();
        latitude = pos.latitude;
        longitude = pos.longitude;
      } catch {
        /* proceed without coordinates */
      }

      // Upload proof photos → descriptors.
      const photoIds: any[] = [];
      for (const p of photos) {
        try {
          const up = await uploadToStorage(p.file, "supervisorProofImage");
          photoIds.push({ ...up, new: true });
        } catch {
          /* skip a failed upload */
        }
      }

      const taskResults = point.tasks.map((tk) => ({
        taskId: tk.id,
        label: tk.label,
        result: results[tk.id] ?? "ok",
      }));

      await supervisorRoute.checkStop(routeId, pointId, {
        taskResults,
        notes: notes.trim() || undefined,
        photoIds,
        latitude,
        longitude,
      });
      fb.success();
      setDone(true);
    } catch {
      fb.error();
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  };

  /* --------------------------------------------------------- loading state */
  if (loading && !data) {
    return (
      <Screen
        title={t("supervisor.checkStop", "Registrar parada")}
        backHref={`/supervisor/route/${routeId}`}
      >
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="mt-4 h-40 w-full rounded-2xl" />
      </Screen>
    );
  }

  /* --------------------------------------------------- error / not-found */
  if ((error && !data) || !point) {
    return (
      <Screen
        title={t("supervisor.checkStop", "Registrar parada")}
        backHref={`/supervisor/route/${routeId}`}
        onRefresh={reload}
      >
        {error ? (
          <ErrorState onRetry={reload} />
        ) : (
          <EmptyState
            icon={<MapPin size={26} />}
            title={t("supervisor.route.stopNotFound", "Parada no encontrada")}
          />
        )}
      </Screen>
    );
  }

  const hasCoords =
    typeof point.latitude === "number" && typeof point.longitude === "number";

  return (
    <Screen
      title={t("supervisor.checkStop", "Registrar parada")}
      subtitle={point.name || undefined}
      backHref={`/supervisor/route/${routeId}`}
    >
      <Inputs />

      {/* Stop header */}
      <div className="card-elev p-5">
        <p className="text-lg font-bold leading-tight text-ink">{point.name}</p>
        {point.address && (
          <p className="mt-1.5 flex items-start gap-1.5 text-sm text-muted">
            <MapPin size={14} className="mt-0.5 shrink-0" />
            <span>{point.address}</span>
          </p>
        )}
        {point.siteType && (
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted">
            <Building2 size={12} />
            {point.siteType}
          </span>
        )}
        <Button
          full
          variant="outline"
          className="mt-4"
          disabled={!hasCoords}
          onClick={navigate}
        >
          <span className="inline-flex items-center gap-2">
            <Navigation size={18} />
            {t("supervisor.navigate", "Navegar")}
          </span>
        </Button>
      </div>

      {/* Checklist */}
      {point.tasks.length > 0 && (
        <div className="mt-6">
          <SectionTitle icon={<ClipboardCheck size={16} />}>
            {t("supervisor.tasks", "Tareas")}
          </SectionTitle>
          <div className="flex flex-col gap-2.5">
            {point.tasks.map((tk) => {
              const r = results[tk.id];
              return (
                <div
                  key={tk.id}
                  className="rounded-2xl border border-line bg-surface p-4"
                >
                  <p className="text-[15px] font-medium text-ink">{tk.label}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        fb.select();
                        setTask(tk.id, "ok");
                      }}
                      aria-pressed={r === "ok"}
                      className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors ${
                        r === "ok"
                          ? "border-online/40 bg-online/15 text-online"
                          : "border-line text-muted active:bg-surface-2"
                      }`}
                    >
                      <Check size={18} />
                      {t("supervisor.route.taskOk", "OK")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        fb.select();
                        setTask(tk.id, "no");
                      }}
                      aria-pressed={r === "no"}
                      className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors ${
                        r === "no"
                          ? "border-critical/40 bg-critical/15 text-critical"
                          : "border-line text-muted active:bg-surface-2"
                      }`}
                    >
                      <X size={18} />
                      {t("supervisor.route.taskNo", "Falla")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="mt-6">
        <SectionTitle>
          {t("supervisor.route.notes", "Novedades / notas")}
        </SectionTitle>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder={t(
            "supervisor.route.notesPlaceholder",
            "Observaciones de la parada (opcional)…"
          )}
          className="w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-[15px] text-ink placeholder:text-faint focus:border-gold/50 focus:outline-none"
        />
      </div>

      {/* Proof photo (optional) */}
      <div className="mt-6 pb-28">
        <SectionTitle icon={<Camera size={16} />}>
          {t("supervisor.proofPhoto", "Foto de evidencia")}
          <span className="ml-1 text-xs font-normal text-faint">
            {t("supervisor.route.optional", "(opcional)")}
          </span>
        </SectionTitle>
        <PhotoStrip photos={photos} onAdd={addPhoto} onRemove={removePhoto} />
      </div>

      {/* Sticky submit */}
      <div className="pointer-events-none sticky bottom-0 -mx-4 mt-2 px-4 pb-2 pt-3 safe-bottom">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[-24px] bg-gradient-to-t from-background via-background to-transparent" />
        <div className="pointer-events-auto relative">
          <Button full onClick={onSubmit} disabled={submitting}>
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 size={18} className="animate-spin" />
                {t("supervisor.route.saving", "Guardando…")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <Check size={18} />
                {t("supervisor.route.confirmCheck", "Confirmar parada")}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Success → back to the route */}
      <ResultSheet
        open={done}
        onClose={backToRoute}
        variant="success"
        title={t("supervisor.route.stopChecked", "Parada registrada")}
        lines={[point.name].filter(Boolean)}
        primaryLabel={t("supervisor.route.backToRoute", "Volver a la ruta")}
        onPrimary={backToRoute}
      />

      {/* Error → retry */}
      <ResultSheet
        open={submitError}
        onClose={() => setSubmitError(false)}
        variant="error"
        title={t("supervisor.route.checkError", "No se pudo registrar")}
        lines={[
          t(
            "supervisor.route.checkErrorHint",
            "Revisa tu conexión e inténtalo de nuevo."
          ),
        ]}
        primaryLabel={t("app.retry", "Reintentar")}
        onPrimary={() => {
          setSubmitError(false);
          onSubmit();
        }}
        secondaryLabel={t("common.close", "Cerrar")}
        onSecondary={() => setSubmitError(false)}
      />
    </Screen>
  );
}
