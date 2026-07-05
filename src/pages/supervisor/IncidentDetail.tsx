import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useHistory } from "react-router-dom";
import { useIonToast } from "@ionic/react";
import {
  MessageSquare, Phone, MoreVertical, MapPin, CalendarDays, Hash,
  ShieldAlert, Camera, User as UserIcon, StickyNote, MoreHorizontal, TrendingUp,
  Building2, Clock, Tag, ImageIcon, Navigation, ClipboardCheck,
  ShieldPlus, PencilLine, UserPlus, CheckCircle2,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { Skeleton, ErrorState, Sheet } from "@/components/ui";
import { StationMap } from "@/components/StationMap";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { useFileUrl } from "@/lib/fileUrl";
import { openAddressNavigation } from "@/lib/navigate";
import { useAsync } from "@/lib/useAsync";
import { useAuth } from "@/context/AuthContext";
import fb from "@/lib/feedback";
import styles from "./IncidentDetail.module.css";

const SEV_COLOR: Record<string, string> = { critical: "#ef4444", high: "#f59e0b", medium: "#eab308", low: "#3b82f6" };
const STATUS_COLOR: Record<string, string> = { open: "#ef4444", inProgress: "#f59e0b", resolved: "#3b82f6", closed: "#6b7280" };
const TL_META: Record<string, { bg: string; icon: React.ReactNode }> = {
  reported: { bg: "#ef4444", icon: <ShieldAlert size={16} /> },
  photo: { bg: "#f59e0b", icon: <Camera size={16} /> },
  location: { bg: "#22c55e", icon: <MapPin size={16} /> },
  assign: { bg: "#3b82f6", icon: <UserIcon size={16} /> },
  note: { bg: "#8b5cf6", icon: <StickyNote size={16} /> },
  status: { bg: "#6b7280", icon: <MoreHorizontal size={16} /> },
  escalate: { bg: "#ef4444", icon: <TrendingUp size={16} /> },
};

function fmtTime(iso: any): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function since(iso: any, t: any): string {
  if (!iso) return "—";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return t("incidentDetail.now", "ahora");
  if (mins < 60) return t("incidentDetail.sinceM", "hace {{n}}m", { n: mins });
  const h = Math.floor(mins / 60);
  if (h < 24) return t("incidentDetail.sinceH", "hace {{n}}h", { n: h });
  return t("incidentDetail.sinceD", "hace {{n}}d", { n: Math.floor(h / 24) });
}

/** A photo thumbnail that resolves a token URL for a private file object. */
function Thumb({ photo, className }: { photo: any; className: string }) {
  const url = useFileUrl(photo || null);
  return url ? (
    // eslint-disable-next-line jsx-a11y/alt-text
    <img src={url} className={className} />
  ) : (
    <span className={`${className} grid place-items-center text-muted`}><ImageIcon size={18} /></span>
  );
}

type Tab = "timeline" | "details" | "evidence" | "notes" | "tasks";

export default function IncidentDetail() {
  const { t } = useTranslation();
  const { incidentId } = useParams<{ incidentId: string }>();
  const history = useHistory();
  const [present] = useIonToast();
  const [tab, setTab] = useState<Tab>("timeline");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [reassignOpen, setReassignOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();

  const { data, loading, error, reload } = useAsync(
    async () => supervisorRoute.incidentDetail(incidentId).then((r: any) => r?.incident ?? r),
    [incidentId],
  );
  const guardsAsync = useAsync(async () => (reassignOpen ? supervisorRoute.guards().then((r: any) => r?.guards ?? []) : []), [reassignOpen]);

  const i = data;
  const reporterAvatar = useFileUrl(i?.reportedBy?.avatar || null);

  const act = async (fn: () => Promise<any>, okMsg: string) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); present({ message: okMsg, duration: 1300, position: "bottom", color: "success" }); reload(); }
    catch { present({ message: t("incidentDetail.actionError", "No se pudo completar la acción"), duration: 1600, position: "bottom", color: "danger" }); }
    finally { setBusy(false); }
  };

  if (loading && !data) {
    return <Screen title={t("incidentDetail.title", "Detalle del incidente")}><Skeleton className="h-56 w-full rounded-2xl" /></Screen>;
  }
  if ((error && !data) || !i) {
    return <Screen title={t("incidentDetail.title", "Detalle del incidente")} onRefresh={reload}><ErrorState onRetry={reload} /></Screen>;
  }

  const sevColor = SEV_COLOR[i.severity] || "#eab308";
  const stColor = STATUS_COLOR[i.status] || "#ef4444";

  // Inbound dispatch: this incident was dispatched to ME → acknowledge it.
  const dispatchedToMe = !!i.assignedToUserId && i.assignedToUserId === (user as any)?.id;
  const ds: string | null = i.dispatchStatus || null;
  const dsLabels: Record<string, string> = { dispatched: "Despachado", accepted: "Aceptado", enRoute: "En camino", onScene: "En sitio" };
  const nextResp =
    ds === "dispatched" ? { s: "accepted" as const, label: t("dispatch.accept", "Aceptar despacho") }
    : ds === "accepted" ? { s: "enRoute" as const, label: t("dispatch.enRoute", "Marcar en camino") }
    : ds === "enRoute" ? { s: "onScene" as const, label: t("dispatch.onScene", "Marcar en sitio") }
    : null;
  const photos: any[] = Array.isArray(i.photos) ? i.photos : [];
  const timeline: any[] = Array.isArray(i.timeline) ? i.timeline : [];
  const notes: any[] = Array.isArray(i.notes) ? i.notes : [];
  const counts = i.counts || { evidence: photos.length, notes: notes.length, tasks: 0 };

  const right = (
    <div className="flex items-center gap-0.5">
      <button type="button" aria-label={t("guards.chat", "Chat")} onClick={() => setNoteOpen(true)} className="pressable grid h-9 w-9 place-items-center rounded-full text-ink active:bg-surface-2"><MessageSquare size={20} /></button>
      <button type="button" aria-label={t("guards.call", "Llamar")} onClick={() => fb.tap()} className="pressable grid h-9 w-9 place-items-center rounded-full text-ink active:bg-surface-2"><Phone size={20} /></button>
      <button type="button" aria-label={t("guards.more", "Más")} onClick={() => fb.tap()} className="pressable grid h-9 w-9 place-items-center rounded-full text-ink active:bg-surface-2"><MoreVertical size={20} /></button>
    </div>
  );

  const TABS: [Tab, string, number | null][] = [
    ["timeline", t("incidentDetail.timeline", "Cronología"), null],
    ["details", t("incidentDetail.details", "Detalles"), null],
    ["evidence", t("incidentDetail.evidence", "Evidencia"), counts.evidence],
    ["notes", t("incidentDetail.notes", "Notas"), counts.notes],
    ["tasks", t("guardDetail.tasks", "Tareas"), counts.tasks],
  ];

  return (
    <Screen title={t("incidentDetail.title", "Detalle del incidente")} right={right} onRefresh={reload}>
      {/* Inbound dispatch acknowledgement */}
      {dispatchedToMe && ds && ds !== "onScene" && (
        <div className="mb-3 rounded-2xl border p-3.5" style={{ borderColor: "var(--gold)", background: "rgba(212,175,55,0.10)" }}>
          <p className="text-sm font-bold text-ink">{t("dispatch.assignedToYou", "Despacho asignado a ti")}</p>
          <p className="mb-2.5 text-xs text-muted">{t("dispatch.status", "Estado")}: {dsLabels[ds] || ds}</p>
          {nextResp && (
            <button
              disabled={busy}
              onClick={() => act(() => supervisorRoute.respondDispatch(incidentId, nextResp.s), nextResp.label)}
              className="w-full rounded-xl py-2.5 text-sm font-bold text-on-accent disabled:opacity-60"
              style={{ background: "var(--gold-strong)" }}
            >
              {nextResp.label}
            </button>
          )}
        </div>
      )}
      {dispatchedToMe && ds === "onScene" && (
        <div className="mb-3 rounded-2xl border border-online/40 bg-online/10 p-3 text-sm font-semibold text-online">
          {t("dispatch.onSceneDone", "En sitio ✓")}
        </div>
      )}
      {/* Hero */}
      <div className={`${styles.card} overflow-hidden`}>
        <div className="flex items-start gap-3 p-4">
          <div className={styles.heroPhoto}>
            {photos[0] ? <Thumb photo={photos[0]} className="h-full w-full object-cover" /> : <span className={styles.heroPhotoPh}><ImageIcon size={26} /></span>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className={styles.badge} style={{ color: sevColor, background: `${sevColor}22` }}>{String(t(`incidents.severity.${i.severity}`, i.severity))}</span>
              <span className={styles.badge} style={{ color: stColor, background: `${stColor}22` }}>{String(t(`incidents.statusLabel.${i.status}`, i.status))}</span>
            </div>
            <p className={styles.title}>{i.title}</p>
            <div className="flex items-start gap-1 text-[13px] text-ink/85">
              <MapPin size={14} className="mt-0.5 shrink-0" style={{ color: "var(--gold)" }} />
              <span className="font-semibold">{i.location || "—"}</span>
            </div>
            {i.address && <p className={styles.addr} style={{ marginLeft: 20 }}>{i.address}</p>}
            <div className={`${styles.metaLine} mt-1.5`}>
              <span className="flex items-center gap-1"><CalendarDays size={13} />{fmtTime(i.at)}</span>
              <span className="flex items-center gap-1"><Hash size={12} />{i.reference}</span>
            </div>
          </div>
        </div>

        <div className="mx-4 border-t border-line" />
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className={styles.infoLabel}>{t("incidents.severity.label", "Severidad")}</span>
            <span className={styles.sevDots}>
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} className={styles.dot} style={n <= (i.severityLevel || 3) ? { background: sevColor } : undefined} />
              ))}
            </span>
          </div>
          {i.reportedBy && (
            <div className={styles.reporter}>
              <div className="text-right">
                <p className={styles.infoLabel}>{t("incidentDetail.reportedBy", "Reportado por")}</p>
                <p className="text-[13px] font-bold text-ink">{i.reportedBy.name}</p>
              </div>
              {reporterAvatar ? (
                // eslint-disable-next-line jsx-a11y/alt-text
                <img src={reporterAvatar} className={styles.reporterAvatar} />
              ) : (
                <span className={styles.reporterAvatar}><UserIcon size={16} /></span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Info strip */}
      <div className={`${styles.card} ${styles.infoStrip} mt-4 py-3`}>
        <div className={styles.infoCol}>
          <div className={styles.infoTop}><Building2 size={13} style={{ color: "#3b82f6" }} /><span className={styles.infoLabel}>{t("stationDetail.client", "Sitio")}</span></div>
          <span className={styles.infoVal}>{i.site?.station || "—"}</span>
          <span className={styles.infoSub}>{i.site?.post || ""}</span>
        </div>
        <div className={styles.infoCol}>
          <div className={styles.infoTop}><UserIcon size={13} style={{ color: "#22c55e" }} /><span className={styles.infoLabel}>{t("incidentDetail.assignedTo", "Asignado a")}</span></div>
          <span className={styles.infoVal}>{i.assignedTo?.name || t("incidentDetail.unassigned", "Sin asignar")}</span>
          <span className={styles.infoSub}>{i.assignedTo ? t("incidentDetail.supervisor", "Supervisor") : ""}</span>
        </div>
        <div className={styles.infoCol}>
          <div className={styles.infoTop}><Clock size={13} style={{ color: "#f59e0b" }} /><span className={styles.infoLabel}>{t("incidentDetail.statusLabel", "Estado")}</span></div>
          <span className={styles.infoVal}>{String(t(`incidents.statusLabel.${i.status}`, i.status))}</span>
          <span className={styles.infoSub}>{since(i.statusSinceAt, t)}</span>
        </div>
        <div className={styles.infoCol}>
          <div className={styles.infoTop}><Tag size={13} style={{ color: "#8b5cf6" }} /><span className={styles.infoLabel}>{t("incidentDetail.type", "Tipo")}</span></div>
          <span className={styles.infoVal}>{i.incidentType || "—"}</span>
          <span className={styles.infoSub}>{i.title}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className={`${styles.tabs} mt-5`}>
        {TABS.map(([key, label, count]) => (
          <button key={key} type="button" onClick={() => { fb.select(); setTab(key); }} className={`${styles.tab} ${tab === key ? styles.tabActive : ""}`}>
            {label}{count != null ? ` (${count})` : ""}
          </button>
        ))}
      </div>

      <div className="pt-4">
        {tab === "timeline" && (
          <div>
            {timeline.map((e, idx) => {
              const meta = TL_META[e.type] || TL_META.status;
              const last = idx === timeline.length - 1;
              return (
                <div key={idx} className={styles.tlItem}>
                  <div className={styles.tlLeft}>
                    <span className={styles.tlNode} style={{ background: meta.bg }}>{meta.icon}</span>
                    {!last && <span className={styles.tlLine} />}
                  </div>
                  <div className={styles.tlBody}>
                    <div className="flex items-start justify-between gap-2">
                      <p className={styles.tlTitle}>{e.title}</p>
                      <span className={styles.tlTime}>{fmtTime(e.at)}</span>
                    </div>
                    {e.text && <p className={styles.tlText}>{e.text}</p>}
                    {e.type === "photo" && Array.isArray(e.photos) && (
                      <div className={styles.tlPhotos}>{e.photos.map((p: any, k: number) => <div key={k} className={styles.tlThumb}><Thumb photo={p} className="h-full w-full object-cover" /></div>)}</div>
                    )}
                    {e.type === "location" && e.lat != null && (
                      <button type="button" onClick={() => openAddressNavigation(i.address || i.location || `${e.lat},${e.lng}`)} className={`${styles.tlLink} mt-1 block`}>{t("incidentDetail.viewOnMap", "Ver en el mapa")}</button>
                    )}
                  </div>
                </div>
              );
            })}
            {timeline.length === 0 && <p className="py-6 text-center text-sm text-muted">{t("incidentDetail.noActivity", "Sin actividad")}</p>}
          </div>
        )}

        {tab === "details" && (
          <div className={`${styles.card} p-4`}>
            <p className={styles.sumText}>{i.details?.description || i.summary?.text || t("incidentDetail.noSummary", "Sin descripción")}</p>
            <div className={styles.sumRow}><span className={styles.sumLabel}>{t("incidentDetail.type", "Tipo")}</span><span className={styles.sumVal}>{i.incidentType || "—"}</span></div>
            <div className={styles.sumRow}><span className={styles.sumLabel}>{t("incidentDetail.reportedBy", "Reportado por")}</span><span className={styles.sumVal}>{i.reportedBy?.name || i.details?.caller || "—"}</span></div>
            {i.details?.actionsTaken && (
              <div className="border-t border-line pt-3">
                <p className={`${styles.infoLabel} mb-1`}>{t("incidentDetail.actionsTaken", "Acciones tomadas")}</p>
                <p className={styles.sumText}>{i.details.actionsTaken}</p>
              </div>
            )}
          </div>
        )}

        {tab === "evidence" && (
          photos.length ? (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p, k) => <div key={k} className="aspect-square overflow-hidden rounded-xl bg-surface-2"><Thumb photo={p} className="h-full w-full object-cover" /></div>)}
            </div>
          ) : <p className="py-8 text-center text-sm text-muted">{t("incidentDetail.noEvidence", "Sin evidencia")}</p>
        )}

        {tab === "notes" && (
          notes.length ? (
            <div className="space-y-2">
              {notes.map((n, k) => (
                <div key={k} className={`${styles.card} p-3`}>
                  <p className="text-[14px] text-ink">{n.text}</p>
                  <p className="mt-1 text-[11px] text-muted">{n.by || "—"} · {fmtTime(n.at)}</p>
                </div>
              ))}
            </div>
          ) : <p className="py-8 text-center text-sm text-muted">{t("incidentDetail.noNotes", "Sin notas")}</p>
        )}

        {tab === "tasks" && <p className="py-8 text-center text-sm text-muted">{t("guardDetail.noTasks", "Sin tareas")}</p>}
      </div>

      {/* Location + summary */}
      {i.lat != null && i.lng != null && (
        <div className="mt-5">
          <p className={`${styles.cardTitle} mb-2`}>{t("incidentDetail.location", "Ubicación")}</p>
          <StationMap lat={i.lat} lng={i.lng} name={i.location} geofenceRadius={90} height={200} />
          <div className={`${styles.card} mt-2 flex items-center justify-between p-3`}>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-bold text-ink">{i.location}</p>
              {i.address && <p className="truncate text-[12px] text-muted">{i.address}</p>}
              <button type="button" onClick={() => openAddressNavigation(i.address || i.location)} className={`${styles.getDir} mt-1`}>{t("incidentDetail.getDirections", "Cómo llegar")}</button>
            </div>
            <button type="button" onClick={() => openAddressNavigation(i.address || i.location)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line text-info"><Navigation size={18} /></button>
          </div>
        </div>
      )}

      <div className="mt-5">
        <p className={`${styles.cardTitle} mb-2`}>{t("incidentDetail.summary", "Resumen del incidente")}</p>
        <div className={`${styles.card} p-4`}>
          {i.summary?.text && <p className={`${styles.sumText} mb-2`}>{i.summary.text}</p>}
          <div className={styles.sumRow}><span className={styles.sumLabel}>{t("incidentDetail.cause", "Causa probable")}</span><span className={styles.sumVal}>{i.summary?.suspectedCause || t("incidentDetail.unknown", "Desconocida")}</span></div>
          <div className={styles.sumRow}><span className={styles.sumLabel}>{t("incidentDetail.impact", "Impacto potencial")}</span><span className={styles.sumVal} style={{ color: sevColor }}>{i.summary?.potentialImpact || "—"}</span></div>
          <div className={styles.sumRow}><span className={styles.sumLabel}>{t("incidentDetail.people", "Personas involucradas")}</span><span className={styles.sumVal}>{i.summary?.peopleInvolved ?? t("incidentDetail.unknown", "Desconocida")}</span></div>
          <div className={styles.sumRow}><span className={styles.sumLabel}>{t("incidentDetail.loss", "Pérdida estimada")}</span><span className={styles.sumVal}>{i.summary?.estimatedLoss || t("incidentDetail.unknown", "Desconocida")}</span></div>
        </div>
      </div>

      {/* Actions */}
      <div className={`${styles.actions} mt-5`}>
        <button type="button" disabled={busy} className={`${styles.actBtn} ${styles.actEscalate}`} onClick={() => act(() => supervisorRoute.incidentEscalate(i.id), t("incidentDetail.escalated", "Incidente escalado"))}><ShieldPlus size={20} />{t("incidentDetail.escalate", "Escalar")}</button>
        <button type="button" disabled={busy} className={`${styles.actBtn} ${styles.actNote}`} onClick={() => setNoteOpen(true)}><PencilLine size={20} />{t("incidentDetail.addNote", "Nota")}</button>
        <button type="button" disabled={busy} className={`${styles.actBtn} ${styles.actReassign}`} onClick={() => setReassignOpen(true)}><UserPlus size={20} />{t("incidentDetail.reassign", "Reasignar")}</button>
        <button type="button" disabled={busy || i.status === "resolved"} className={`${styles.actBtn} ${styles.actResolve}`} onClick={() => act(() => supervisorRoute.incidentStatus(i.id, "resolved"), t("incidentDetail.resolved", "Incidente resuelto"))}><CheckCircle2 size={20} />{t("incidentDetail.resolve", "Resolver")}</button>
      </div>

      {/* Add note sheet */}
      <Sheet open={noteOpen} onClose={() => setNoteOpen(false)} title={t("incidentDetail.addNote", "Agregar nota")}>
        <div className="flex flex-col gap-3 pb-2">
          <textarea className={styles.noteInput} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder={t("incidentDetail.notePh", "Escribe una nota…")} />
          <button type="button" className={styles.submitBtn} disabled={!noteText.trim() || busy} onClick={() => act(async () => { await supervisorRoute.incidentNote(i.id, noteText.trim()); setNoteText(""); setNoteOpen(false); }, t("incidentDetail.noteAdded", "Nota agregada"))}>
            {t("incidentDetail.saveNote", "Guardar nota")}
          </button>
        </div>
      </Sheet>

      {/* Reassign sheet */}
      <Sheet open={reassignOpen} onClose={() => setReassignOpen(false)} title={t("incidentDetail.reassignTitle", "Reasignar incidente")}>
        <div className="flex flex-col gap-1 pb-2">
          {(guardsAsync.data || []).map((g: any) => (
            <button key={g.id} type="button" className="flex items-center gap-3 rounded-xl px-2 py-3 text-left active:bg-surface-2"
              onClick={() => act(async () => { await supervisorRoute.incidentAssign(i.id, g.userId || g.id, g.name); setReassignOpen(false); }, t("incidentDetail.reassigned", "Incidente reasignado"))}>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-[11px] font-bold text-muted">{(g.name || "?").slice(0, 1)}</span>
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{g.name}</span>
            </button>
          ))}
          {(guardsAsync.data || []).length === 0 && <p className="py-4 text-center text-sm text-muted">{t("incidentDetail.noAssignees", "No hay personas disponibles")}</p>}
        </div>
      </Sheet>
    </Screen>
  );
}
