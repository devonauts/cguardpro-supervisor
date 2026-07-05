import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useHistory } from "react-router-dom";
import { useIonToast } from "@ionic/react";
import {
  MessageSquare,
  Phone,
  MoreVertical,
  MapPin,
  ShieldCheck,
  Clock,
  Users,
  ShieldAlert,
  ClipboardList,
  AlertTriangle,
  CheckCircle2,
  MessageCircle,
  Building2,
  Globe,
  Pencil,
  TriangleAlert,
  ClipboardPlus,
  Video,
  User as UserIcon,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { Skeleton, ErrorState, Sheet } from "@/components/ui";
import { StationMap } from "@/components/StationMap";
import { IncidentForm } from "@/components/IncidentForm";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { fileUrlFromFile } from "@/lib/fileUrl";
import { distanceMeters, getCurrentPosition } from "@/lib/geo";
import { useAsync } from "@/lib/useAsync";
import fb from "@/lib/feedback";
import styles from "./StationDetail.module.css";

type Tab = "overview" | "guards" | "checkpoints" | "incidents" | "tasks";

function toNum(v: any): number | null {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/* --------------------------------------------------------------- pieces */

function StatusPill({ status, t }: { status: string; t: any }) {
  const map: Record<string, { cls: string; key: string; def: string }> = {
    active: { cls: styles.statusActive, key: "stations.active", def: "Active" },
    attention: { cls: styles.statusAttention, key: "stations.attention", def: "Attention" },
    offline: { cls: styles.statusOffline, key: "stations.offline", def: "Offline" },
  };
  const m = map[status] || map.offline;
  return <span className={`${styles.pill} ${m.cls}`}>{t(m.key, m.def)}</span>;
}

function Kpi({
  icon,
  value,
  label,
  link,
  linkTone,
  onLink,
  bar,
  first,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  link?: string;
  linkTone?: string;
  onLink?: () => void;
  bar?: number | null;
  first?: boolean;
}) {
  return (
    <div className={styles.kpi} style={first ? { paddingLeft: 0, borderLeft: "none" } : undefined}>
      <div className="flex items-center gap-1.5">
        {icon}
        <span className={styles.kpiValue}>{value}</span>
      </div>
      <span className={styles.kpiLabel}>{label}</span>
      {bar != null && (
        <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-info" style={{ width: `${Math.max(0, Math.min(100, bar))}%` }} />
        </div>
      )}
      {link && (
        <button type="button" onClick={() => { fb.tap(); onLink?.(); }} className={`${styles.kpiLink} ${linkTone || "text-gold"} text-left`}>
          {link}
        </button>
      )}
    </div>
  );
}

function InfoItem({ icon, label, value, phone }: { icon?: React.ReactNode; label: string; value: React.ReactNode; phone?: string | null }) {
  return (
    <div className="flex min-w-0 flex-1 items-start gap-2">
      {icon && <span className="mt-0.5 shrink-0 text-muted">{icon}</span>}
      <div className="min-w-0">
        <p className={styles.infoLabel}>{label}</p>
        <p className={`${styles.infoValue} truncate`}>{value ?? "—"}</p>
        {phone && (
          <a href={`tel:${phone}`} className="text-[12px] font-semibold text-info">{phone}</a>
        )}
      </div>
    </div>
  );
}

function GuardCard({ g, t }: { g: any; t: any }) {
  const dot =
    g.status === "patrolling" ? styles.dotPatrolling : g.status === "break" ? styles.dotBreak : styles.dotOff;
  const statusText =
    g.status === "patrolling"
      ? t("stationDetail.patrolling", "En servicio")
      : g.status === "break"
      ? t("stationDetail.onBreak", "En descanso")
      : t("stationDetail.off", "Fuera de turno");
  const statusColor = g.status === "patrolling" ? "text-online" : g.status === "break" ? "text-gold" : "text-muted";
  return (
    <div className={styles.guardCard}>
      <div className={styles.guardAvatarWrap}>
        {g.avatarUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img src={g.avatarUrl} className={styles.guardAvatar} />
        ) : (
          <span className={`${styles.guardAvatar} grid place-items-center text-sm font-bold text-muted`}>
            {(g.name || "?").split(/\s+/).slice(0, 2).map((p: string) => p[0]).join("").toUpperCase()}
          </span>
        )}
        <span className={`${styles.guardDot} ${dot}`} />
      </div>
      <p className="mt-2 truncate text-[14px] font-bold text-ink">{g.name}</p>
      <p className={`text-[12px] font-semibold ${statusColor}`}>{statusText}</p>
      {g.location && <p className="truncate text-[11px] text-muted">{g.location}</p>}
      <div className="mt-2.5 flex gap-2">
        <button type="button" onClick={() => { fb.tap(); g.phone && window.open(`sms:${g.phone}`, "_system"); }} className={styles.miniBtn}>
          <MessageCircle size={15} className="text-info" />
        </button>
        <button type="button" onClick={() => { fb.tap(); g.phone && window.open(`tel:${g.phone}`, "_system"); }} className={styles.miniBtn}>
          <Phone size={15} className="text-online" />
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- screen */

export default function StationDetail() {
  const { t } = useTranslation();
  const { stationId } = useParams<{ stationId: string }>();
  const history = useHistory();
  const [present] = useIonToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [me, setMe] = useState<[number, number] | null>(null);
  const [incidentOpen, setIncidentOpen] = useState(false);

  useEffect(() => {
    getCurrentPosition().then((c) => setMe([c.latitude, c.longitude])).catch(() => {});
  }, []);

  const { data, loading, error, reload } = useAsync(
    async () => supervisorRoute.stationDetail(stationId).then((r: any) => r?.station ?? r),
    [stationId],
  );

  const soon = () => present({ message: t("guardDetail.soon", "Próximamente"), duration: 1300, position: "bottom" });
  const s = data;


  const eta = useMemo(() => {
    if (!me || !s || toNum(s.lat) == null || toNum(s.lng) == null) return null;
    const m = distanceMeters(me[0], me[1], toNum(s.lat) as number, toNum(s.lng) as number);
    return Math.max(1, Math.round((m / 1000 / 28) * 60));
  }, [me, s]);

  if (loading && !data) {
    return (
      <Screen title={t("stationDetail.title", "Detalle de estación")}>
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="mt-4 h-56 w-full rounded-2xl" />
      </Screen>
    );
  }
  if ((error && !data) || !s) {
    return (
      <Screen title={t("stationDetail.title", "Detalle de estación")} onRefresh={reload}>
        <ErrorState onRetry={reload} />
      </Screen>
    );
  }

  const photo = fileUrlFromFile(s.photo);
  const stats = s.stats || {};
  const prog = stats.patrolProgress || { pct: 0 };
  const guards: any[] = Array.isArray(s.guards) ? s.guards : [];
  const checkpoints: any[] = Array.isArray(s.checkpoints) ? s.checkpoints : [];
  const info = s.info || {};
  const riskMeta: Record<string, string> = { low: "text-online", medium: "text-gold", high: "text-critical" };

  const right = (
    <div className="flex items-center gap-0.5">
      <button type="button" aria-label={t("guards.chat", "Chat")} onClick={() => info.contactPhone && window.open(`sms:${info.contactPhone}`, "_system")} className="pressable grid h-11 w-11 place-items-center rounded-full text-ink active:bg-surface-2">
        <MessageSquare size={20} />
      </button>
      <button type="button" aria-label={t("guards.call", "Llamar")} onClick={() => info.contactPhone && window.open(`tel:${info.contactPhone}`, "_system")} className="pressable grid h-11 w-11 place-items-center rounded-full text-ink active:bg-surface-2">
        <Phone size={20} />
      </button>
      <button type="button" aria-label={t("guards.more", "Más")} onClick={soon} className="pressable grid h-11 w-11 place-items-center rounded-full text-ink active:bg-surface-2">
        <MoreVertical size={20} />
      </button>
    </div>
  );

  const TABS: [Tab, string, number | null, boolean][] = [
    ["overview", t("stationDetail.overview", "Resumen"), null, false],
    ["guards", t("stations.guards", "Vigilantes"), stats.guardsAssigned ?? guards.length, false],
    ["checkpoints", t("stationDetail.checkpoints", "Puntos"), s.checkpointsTotal ?? checkpoints.length, false],
    ["incidents", t("nav.incidents", "Novedades"), stats.openIncidents ?? 0, (stats.openIncidents ?? 0) > 0],
    ["tasks", t("guardDetail.tasks", "Tareas"), stats.tasksPending ?? 0, false],
  ];

  return (
    <Screen title={t("stationDetail.title", "Detalle de estación")} right={right} onRefresh={reload}>
      {/* Hero */}
      <div className="card-elev overflow-hidden rounded-2xl">
        <div className="p-4">
          <div className="flex items-start gap-3">
            {photo ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <img src={photo} className={styles.heroPhoto} />
            ) : (
              <span className={`${styles.heroPhoto} grid place-items-center`}><Building2 size={26} className="text-muted" /></span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-[19px] font-bold leading-snug text-ink">{s.name}</p>
                <span className="mt-0.5 shrink-0"><StatusPill status={s.status} t={t} /></span>
              </div>
              <div className="mt-1 flex items-start gap-1 text-[13px] text-ink/85">
                <MapPin size={14} className="mt-0.5 shrink-0 text-gold" />
                <span className="min-w-0">{s.address || t("stations.noAddress", "Sin dirección")}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {s.serviceType && <span className={styles.tag}>{s.serviceType}</span>}
                {s.priority === "high" && (
                  <span className={`${styles.tag} ${styles.tagDanger}`}>{t("stationDetail.highPriority", "Alta prioridad")}</span>
                )}
              </div>
            </div>
          </div>

          {/* Risk + ETA — own full-width row so they never squeeze the name */}
          <div className="mt-3 flex items-stretch gap-3 rounded-xl border border-line bg-surface-2/40 px-3.5 py-2.5">
            <div className="flex flex-1 items-center gap-2">
              <ShieldCheck size={18} className={`shrink-0 ${riskMeta[s.riskLevel] || "text-muted"}`} />
              <div className="min-w-0">
                <p className={styles.infoLabel}>{t("stationDetail.riskLevel", "Nivel de riesgo")}</p>
                <p className={`truncate text-[14px] font-bold ${riskMeta[s.riskLevel] || "text-ink"}`}>{String(t(`stationDetail.risk_${s.riskLevel}`, s.riskLevel))}</p>
              </div>
            </div>
            <div className="w-px shrink-0 bg-line" />
            <div className="flex flex-1 items-center gap-2">
              <Clock size={18} className="shrink-0 text-gold" />
              <div className="min-w-0">
                <p className={styles.infoLabel}>{t("stations.eta", "ETA supervisor")}</p>
                <p className="truncate text-[14px] font-bold text-gold">{eta == null ? "—" : t("stations.minShort", "{{n}} min", { n: eta })}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-4 border-t border-line" />

        {/* KPI strip */}
        <div className="flex items-stretch px-4 py-4">
          <Kpi first icon={<Users size={16} className="text-gold" />} value={stats.guardsAssigned ?? 0} label={t("stationDetail.guardsAssigned", "Vigilantes")} link={t("stations.guards", "Ver todos")} onLink={() => setTab("guards")} />
          <Kpi icon={<ShieldCheck size={16} className="text-info" />} value={`${prog.pct ?? 0}%`} label={t("guards.patrol", "Ronda")} bar={prog.pct} />
          <Kpi icon={<AlertTriangle size={16} className="text-critical" />} value={stats.openIncidents ?? 0} label={t("stationDetail.openIncidents", "Novedades")} link={t("stationDetail.view", "Ver")} linkTone="text-critical" onLink={() => setTab("incidents")} />
          <Kpi icon={<ClipboardList size={16} className="text-gold" />} value={stats.tasksPending ?? 0} label={t("stations.tasksPending", "Tareas")} link={t("stationDetail.view", "Ver")} onLink={() => setTab("tasks")} />
        </div>
      </div>

      {/* Map */}
      <div className="mt-4">
        <StationMap
          lat={toNum(s.lat)}
          lng={toNum(s.lng)}
          name={s.name}
          geofence={s.geofence || []}
          geofenceRadius={toNum(s.geofenceRadius)}
          checkpoints={(checkpoints || []).map((c) => ({ lat: toNum(c.lat) as number, lng: toNum(c.lng) as number, name: c.name, scanned: c.scanned }))}
          height={240}
        />
      </div>

      {/* Tabs */}
      <div className={`${styles.tabs} mt-5`}>
        {TABS.map(([key, label, count, dot]) => (
          <button key={key} type="button" onClick={() => { fb.select(); setTab(key); }} className={`${styles.tab} ${tab === key ? styles.tabActive : ""}`}>
            {label}
            {count != null && count > 0 ? ` (${count})` : ""}
            {dot && <span className={styles.tabDot} />}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="pt-4">
        {tab === "overview" && (
          <>
            {/* Assigned guards */}
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[16px] font-bold text-ink">{t("stationDetail.assignedGuards", "Vigilantes asignados")}</h3>
              {guards.length > 0 && (
                <button type="button" onClick={() => { fb.tap(); setTab("guards"); }} className="text-[13px] font-semibold text-gold">{t("stationDetail.viewAll", "Ver todos")}</button>
              )}
            </div>
            {guards.length === 0 ? (
              <p className="py-4 text-sm text-muted">{t("stationDetail.noGuards", "Sin vigilantes asignados")}</p>
            ) : (
              <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
                {guards.slice(0, 8).map((g) => <GuardCard key={g.id} g={g} t={t} />)}
              </div>
            )}

            {/* Station information */}
            <div className="card-elev mt-5 rounded-2xl p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[16px] font-bold text-ink">{t("stationDetail.stationInfo", "Información de la estación")}</h3>
                <button type="button" onClick={soon} className="pressable text-muted"><Pencil size={16} /></button>
              </div>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <InfoItem label={t("stationDetail.client", "Cliente")} value={info.client} />
                  <InfoItem icon={<MessageCircle size={15} />} label={t("stationDetail.siteType", "Tipo de sitio")} value={info.siteType} />
                  <InfoItem icon={<ShieldCheck size={15} />} label={t("stationDetail.alarmPanel", "Panel de alarma")} value={info.alarmPanel} />
                </div>
                <div className="flex gap-4">
                  <InfoItem icon={<UserIcon size={15} />} label={t("stationDetail.contactPerson", "Contacto")} value={info.contactPerson} phone={info.contactPhone} />
                  <InfoItem icon={<Clock size={15} />} label={t("stationDetail.accessHours", "Horario")} value={info.accessHours} />
                  <InfoItem icon={<Globe size={15} />} label={t("stationDetail.timeZone", "Zona horaria")} value={info.timeZone} />
                </div>
              </div>
            </div>

            {/* Quick actions */}
            <h3 className="mb-2 mt-5 text-[16px] font-bold text-ink">{t("stationDetail.quickActions", "Acciones rápidas")}</h3>
            <div className="grid grid-cols-5 gap-1.5">
              <button type="button" onClick={() => info.contactPhone ? window.open(`tel:${info.contactPhone}`, "_system") : soon()} className={styles.quickTile}>
                <Phone size={20} className="text-online" />{t("stationDetail.callClient", "Llamar")}
              </button>
              <button type="button" onClick={() => { fb.tap(); setIncidentOpen(true); }} className={styles.quickTile}>
                <TriangleAlert size={20} className="text-critical" />{t("stationDetail.openIncident", "Novedad")}
              </button>
              <button type="button" onClick={() => { fb.tap(); history.push(`/supervisor/stations/${stationId}/tasks/new`); }} className={styles.quickTile}>
                <ClipboardPlus size={20} className="text-gold" />{t("stationDetail.addTask", "Tarea")}
              </button>
              <button type="button" onClick={() => { fb.tap(); history.push(`/supervisor/stations/${stationId}/inspection`); }} className={styles.quickTile}>
                <ShieldCheck size={20} className="text-info" />{t("stationDetail.inspection", "Inspección")}
              </button>
              <button type="button" onClick={soon} className={styles.quickTile}>
                <Video size={20} className="text-route" />{t("stationDetail.cameras", "Cámaras")}
              </button>
            </div>
          </>
        )}

        {tab === "guards" && (
          guards.length ? (
            <div className="grid grid-cols-2 gap-3">
              {guards.map((g) => <GuardCard key={g.id} g={g} t={t} />)}
            </div>
          ) : <p className="py-8 text-center text-sm text-muted">{t("stationDetail.noGuards", "Sin vigilantes asignados")}</p>
        )}

        {tab === "checkpoints" && (
          checkpoints.length ? (
            <div className="space-y-2">
              {checkpoints.map((c, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
                  <CheckCircle2 size={18} className={c.scanned ? "text-online" : "text-faint"} />
                  <span className="flex-1 truncate text-[14px] font-semibold text-ink">{c.name}</span>
                  <span className="text-[12px] text-muted">{c.scanned ? t("stationDetail.scanned", "Escaneado") : t("stationDetail.pending", "Pendiente")}</span>
                </div>
              ))}
            </div>
          ) : <p className="py-8 text-center text-sm text-muted">{t("stationDetail.noCheckpoints", "Sin puntos de control")}</p>
        )}

        {tab === "incidents" && (
          <div className="py-8 text-center">
            <p className="text-sm text-muted">{t("stationDetail.incidentsSummary", "{{n}} novedades hoy", { n: stats.openIncidents ?? 0 })}</p>
            <button type="button" onClick={() => history.push("/supervisor/incidents")} className="mt-3 text-[14px] font-semibold text-gold">{t("app.viewAll", "Ver todas")}</button>
          </div>
        )}

        {tab === "tasks" && (
          <p className="py-8 text-center text-sm text-muted">
            {(stats.tasksPending ?? 0) > 0 ? t("stationDetail.tasksSummary", "{{n}} tareas pendientes", { n: stats.tasksPending }) : t("guardDetail.noTasks", "Sin tareas")}
          </p>
        )}
      </div>

      {/* Open Incident → the incident-report create flow, prefilled to this station */}
      <IncidentForm
        isOpen={incidentOpen}
        onClose={() => setIncidentOpen(false)}
        onCreated={() => { setIncidentOpen(false); reload(); }}
        station={{ id: s.id, stationName: s.name }}
      />

    </Screen>
  );
}
