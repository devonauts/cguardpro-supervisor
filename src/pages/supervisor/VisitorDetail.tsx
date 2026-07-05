import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { useIonToast } from "@ionic/react";
import {
  Phone, Mail, IdCard, Building2, Star, MoreVertical, LogOut, CalendarDays, Car,
  Users, UserRound, CheckCircle2, Shield, Clock, ImageIcon, FileText, Download,
  MessageCircle, TriangleAlert, MapPin, UserCircle2,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { Skeleton, ErrorState } from "@/components/ui";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { useFileUrl } from "@/lib/fileUrl";
import { useAsync } from "@/lib/useAsync";
import fb from "@/lib/feedback";
import styles from "./VisitorDetail.module.css";

const STATUS: Record<string, { key: string; def: string; color: string }> = {
  checkedIn: { key: "visitors.checkedIn", def: "Checked In", color: "#22c55e" },
  expected: { key: "visitors.expected", def: "Expected", color: "#f59e0b" },
  checkedOut: { key: "visitors.checkedOut", def: "Checked Out", color: "#9aa3af" },
  denied: { key: "visitors.denied", def: "Denied", color: "#ef4444" },
};
const TL: Record<string, { bg: string; icon: React.ReactNode }> = {
  registered: { bg: "#22c55e", icon: <CheckCircle2 size={15} /> },
  checkin: { bg: "#3b82f6", icon: <LogOut size={15} /> },
  badge: { bg: "#8b5cf6", icon: <Shield size={15} /> },
  host: { bg: "#f59e0b", icon: <UserRound size={15} /> },
  checkout: { bg: "#9aa3af", icon: <Clock size={15} /> },
};

function fmtDT(iso: any): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
function fileSize(f: any): string {
  const b = Number(f?.sizeInBytes);
  if (!b) return "";
  return b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
}

function Row({ label, value, tag, tagColor }: { label: string; value: React.ReactNode; tag?: boolean; tagColor?: string }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      {tag ? (
        <span className={styles.tag} style={{ color: tagColor, background: `${tagColor}22` }}>{value}</span>
      ) : (
        <span className={styles.rowVal}>{value ?? "—"}</span>
      )}
    </div>
  );
}

function DocRow({ doc, t }: { doc: any; t: any }) {
  const url = useFileUrl(doc.file || null);
  const isImg = doc.kind === "photo" || doc.kind === "id";
  const color = doc.kind === "photo" ? "#22c55e" : isImg ? "#3b82f6" : "#ef4444";
  return (
    <div className={styles.doc}>
      <span className={styles.docIcon} style={{ background: `${color}22`, color }}>
        {doc.kind === "photo" ? <ImageIcon size={18} /> : <FileText size={18} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={styles.docName}>{doc.name}</p>
        <p className={styles.docMeta}>{[doc.kind === "photo" ? "JPG" : "IMG", fileSize(doc.file)].filter(Boolean).join(" · ")}</p>
      </div>
      <button type="button" disabled={!url} onClick={() => url && window.open(url, "_blank")} className="grid h-11 w-11 place-items-center rounded-lg border border-line text-muted disabled:opacity-40">
        <Download size={16} />
      </button>
    </div>
  );
}

export default function VisitorDetail() {
  const { t } = useTranslation();
  const { visitorId } = useParams<{ visitorId: string }>();
  const [present] = useIonToast();
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useAsync(
    async () => supervisorRoute.visitorDetail(visitorId).then((r: any) => r?.visitor ?? r),
    [visitorId],
  );
  const v = data;
  const photo = useFileUrl(v?.photo || null);

  const checkout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await supervisorRoute.visitorCheckout(v.id);
      present({ message: t("visitorDetail.checkedOut", "Visitante marcado como salida"), duration: 1400, position: "bottom", color: "success" });
      reload();
    } catch {
      present({ message: t("visitorDetail.checkoutError", "No se pudo marcar la salida"), duration: 1600, position: "bottom", color: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const soon = () => present({ message: t("guardDetail.soon", "Próximamente"), duration: 1300, position: "bottom" });

  if (loading && !data) return <Screen title={t("visitorDetail.title", "Detalle del visitante")}><Skeleton className="h-64 w-full rounded-2xl" /></Screen>;
  if ((error && !data) || !v) return <Screen title={t("visitorDetail.title", "Detalle del visitante")} onRefresh={reload}><ErrorState onRetry={reload} /></Screen>;

  const st = STATUS[v.status] || STATUS.expected;
  const timeline: any[] = Array.isArray(v.timeline) ? v.timeline : [];
  const documents: any[] = Array.isArray(v.documents) ? v.documents : [];
  const isOut = v.status === "checkedOut";

  const right = (
    <div className="flex items-center gap-2">
      <button type="button" className={styles.editBtn} onClick={soon}>{t("visitorDetail.edit", "Editar")}</button>
      <button type="button" aria-label={t("guards.more", "Más")} onClick={soon} className="pressable grid h-11 w-11 place-items-center rounded-full text-ink active:bg-surface-2"><MoreVertical size={20} /></button>
    </div>
  );

  return (
    <Screen title={t("visitorDetail.title", "Detalle del visitante")} subtitle={t("visitorDetail.subtitle", "Ver y gestionar el visitante")} right={right} onRefresh={reload}>
      {/* Hero */}
      <div className={`${styles.card} p-4`}>
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex flex-col items-center gap-2">
            <div className={styles.photo}>
              {photo ? (
                // eslint-disable-next-line jsx-a11y/alt-text
                <img src={photo} />
              ) : <UserCircle2 size={40} />}
            </div>
            <span className={styles.pill} style={{ color: "#22c55e", background: "#22c55e22" }}>{t("visitorDetail.approved", "Aprobado")}</span>
          </div>

          <div className="min-w-0 flex-1">
            <p className={styles.name}>{v.name} <Star size={17} className="ml-1 inline align-[-1px] text-gold" fill="currentColor" /></p>
            <p className={styles.sub}>{v.visitType ? String(v.visitType) : t("visitorDetail.visitor", "Visitante")}</p>
            <div className="mt-2 space-y-1.5">
              {v.phone && <a href={`tel:${v.phone}`} className={styles.contactRow}><Phone size={14} className="text-muted" />{v.phone}</a>}
              {v.email && <a href={`mailto:${v.email}`} className={styles.contactRow}><Mail size={14} className="text-muted" />{v.email}</a>}
            </div>
            <div className="mt-2 space-y-1.5">
              {[
                [t("visitorDetail.idType", "Tipo de ID"), v.idType],
                [t("visitorDetail.idNumber", "N° de ID"), v.idNumber],
                [t("visitorDetail.issuingState", "Estado emisor"), v.issuingState],
                [t("visitors.company", "Empresa"), v.company],
              ].map(([l, val]) => (val ? (
                <div key={l as string} className="flex items-center gap-2">
                  <IdCard size={13} className="shrink-0 text-muted" />
                  <span className={styles.idLabel} style={{ width: 92 }}>{l}</span>
                  <span className={styles.idVal}>{val}</span>
                </div>
              ) : null))}
            </div>
          </div>

          <div className="shrink-0 sm:w-40 sm:border-l sm:border-line sm:pl-4">
            {[
              [t("visitorDetail.visitId", "ID de visita"), v.reference, "var(--ink)"],
              [t("visitorDetail.checkIn", "Entrada"), fmtDT(v.checkInAt), "#22c55e"],
              [t("visitorDetail.checkOut", "Salida"), v.checkOutAt ? fmtDT(v.checkOutAt) : "–", "var(--ink)"],
              [t("visitorDetail.visitType", "Tipo de visita"), v.visitType || "—", "var(--ink)"],
            ].map(([l, val, c]) => (
              <div key={l as string} className="mb-2.5">
                <p className={styles.rightLabel}>{l}</p>
                <p className={styles.rightVal} style={{ color: c as string }}>{val}</p>
              </div>
            ))}
            <p className={styles.rightLabel}>{t("incidentDetail.statusLabel", "Estado")}</p>
            <p className="flex items-center gap-1.5 text-[15px] font-bold" style={{ color: st.color }}>
              <span className="h-2 w-2 rounded-full" style={{ background: st.color }} />{t(st.key, st.def)}
            </p>
            {!isOut && (
              <button type="button" disabled={busy} className={styles.checkoutBtn} onClick={checkout}>
                <LogOut size={17} />{t("visitorDetail.checkoutBtn", "Marcar salida")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Visit + Vehicle info */}
      <div className="mt-4 grid grid-cols-1 gap-4">
        <div className={`${styles.card} p-4`}>
          <p className={styles.cardTitle}><CalendarDays size={17} className="text-gold" />{t("visitorDetail.visitInfo", "Información de la visita")}</p>
          <div className="mt-2">
            <Row label={t("visitorDetail.purpose", "Motivo")} value={v.visit?.purpose} />
            <Row label={t("visitorDetail.location", "Ubicación")} value={v.visit?.location} />
            <Row label={t("visitors.host", "Anfitrión")} value={v.visit?.host} />
            {v.visit?.department && <Row label={t("visitorDetail.department", "Departamento")} value={v.visit.department} />}
            {v.visit?.accessLevel && <Row label={t("visitorDetail.accessLevel", "Nivel de acceso")} value={v.visit.accessLevel} tag tagColor="#3b82f6" />}
            <Row label={t("visitorDetail.preRegistered", "Pre-registrado")} value={v.visit?.preRegistered ? t("app.yes", "Sí") : t("app.no", "No")} />
            {v.visit?.expectedDuration && <Row label={t("visitorDetail.duration", "Duración estimada")} value={v.visit.expectedDuration} />}
            {v.visit?.notes && <Row label={t("visitorDetail.notes", "Notas")} value={v.visit.notes} />}
          </div>
        </div>

        {v.vehicle && (
          <div className={`${styles.card} p-4`}>
            <p className={styles.cardTitle}><Car size={17} className="text-gold" />{t("visitorDetail.vehicleInfo", "Información del vehículo")}</p>
            <div className="mt-2">
              <Row label={t("visitors.vehicle", "Vehículo")} value={v.vehicle.vehicle} />
              <Row label={t("visitorDetail.plate", "Placa")} value={v.vehicle.plate} />
              {v.vehicle.color && <Row label={t("visitorDetail.color", "Color")} value={v.vehicle.color} />}
              {v.vehicle.makeModel && <Row label={t("visitorDetail.makeModel", "Marca / Modelo")} value={v.vehicle.makeModel} />}
              {v.vehicle.parking && <Row label={t("visitorDetail.parking", "Estacionamiento")} value={v.vehicle.parking} />}
            </div>
          </div>
        )}

        <div className={`${styles.card} p-4`}>
          <p className={styles.cardTitle}><Users size={17} className="text-info" />{t("visitorDetail.peopleOnsite", "Personas en sitio")} <span className="ml-1 rounded-full bg-surface-2 px-2 text-[12px] text-muted">{v.peopleOnsite}</span></p>
          <div className="mt-3 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-full bg-surface-2 text-muted">
              {photo ? (
                // eslint-disable-next-line jsx-a11y/alt-text
                <img src={photo} className="h-full w-full object-cover" />
              ) : <UserCircle2 size={20} />}
            </span>
            <span className="flex-1 truncate text-[15px] font-semibold text-ink">{v.name}</span>
            <span className={styles.tag} style={{ color: st.color, background: `${st.color}22` }}>{t(st.key, st.def)}</span>
            <span className={styles.tag} style={{ color: "#3b82f6", background: "#3b82f622" }}>{t("visitorDetail.primary", "Principal")}</span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      {timeline.length > 0 && (
        <div className="mt-4">
          <p className={`${styles.cardTitle} mb-2`}>{t("visitorDetail.timeline", "Cronología de la visita")}</p>
          <div className={`${styles.card} p-4`}>
            {timeline.map((e, i) => {
              const m = TL[e.type] || TL.checkin;
              const last = i === timeline.length - 1;
              return (
                <div key={i} className={styles.tlItem}>
                  <div className={styles.tlLeft}>
                    <span className={styles.tlNode} style={{ background: m.bg }}>{m.icon}</span>
                    {!last && <span className={styles.tlLine} />}
                  </div>
                  <div className={styles.tlBody}>
                    <div className="flex items-start justify-between gap-2">
                      <p className={styles.tlTitle}>{e.title}</p>
                      {e.detail && <span className="shrink-0 text-[12px] text-muted">{e.detail}</span>}
                    </div>
                    <p className={styles.tlSub}>{fmtDT(e.at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Documents */}
      {documents.length > 0 && (
        <div className="mt-4">
          <p className={`${styles.cardTitle} mb-2`}>{t("visitorDetail.documents", "Documentos")}</p>
          <div className="space-y-2">
            {documents.map((d, i) => <DocRow key={i} doc={d} t={t} />)}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className={`${styles.actions} mt-5`}>
        <button type="button" className={`${styles.actBtn} ${styles.actCall}`} disabled={!v.phone} onClick={() => v.phone && window.open(`tel:${v.phone}`, "_system")}><Phone size={18} />{t("visitorDetail.call", "Llamar")}</button>
        <button type="button" className={`${styles.actBtn} ${styles.actMsg}`} disabled={!v.phone} onClick={() => v.phone && window.open(`sms:${v.phone}`, "_system")}><MessageCircle size={18} />{t("visitorDetail.message", "Mensaje")}</button>
        <button type="button" className={`${styles.actBtn} ${styles.actReport}`} onClick={soon}><TriangleAlert size={18} />{t("visitorDetail.report", "Reportar")}</button>
      </div>
    </Screen>
  );
}
