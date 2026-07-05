import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { Screen } from "@/components/Screen";
import {
  Search,
  Plus,
  ShieldAlert,
  Clock,
  ClipboardCheck,
  Archive,
  MapPin,
  User as UserIcon,
  CalendarDays,
  Eye,
  ChevronRight,
  ArrowUpDown,
  LayoutGrid,
  List as ListIcon,
  ImageIcon,
} from "lucide-react";
import brandLogo from "@/assets/brand-logo.png";
import { NavActions } from "@/components/shared/NavActions";
import { openAppMenu } from "@/components/shared/SideMenu";
import { ErrorState, SkeletonList } from "@/components/ui";
import { IncidentForm } from "@/components/IncidentForm";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { useFileUrl } from "@/lib/fileUrl";
import { useAsync } from "@/lib/useAsync";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import fb from "@/lib/feedback";
import styles from "./SupervisorIncidents.module.css";

type Severity = "critical" | "high" | "medium" | "low";
type Status = "open" | "inProgress" | "resolved" | "closed";
type SevFilter = "all" | Severity;
type StatusFilter = "all" | "open" | "inProgress" | "resolved";

const SEV_COLOR: Record<Severity, string> = { critical: "#ef4444", high: "#f59e0b", medium: "#eab308", low: "#3b82f6" };
const SEV_DOT: Record<Severity, string> = { critical: "#ef4444", high: "#f59e0b", medium: "#eab308", low: "#22c55e" };
const STATUS_COLOR: Record<Status, string> = { open: "#ef4444", inProgress: "#f59e0b", resolved: "#3b82f6", closed: "#6b7280" };

function fmtWhen(iso: any, t: any): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return `${t("incidents.today", "Hoy")}, ${time}`;
  if (same(d, y)) return `${t("incidents.yesterday", "Ayer")}, ${time}`;
  return `${d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}

/* --------------------------------------------------------------- card */

function IncidentCard({ inc, onOpen, t }: { inc: any; onOpen: () => void; t: any }) {
  const photoUrl = useFileUrl(inc.photo || null);
  const sev = (["critical", "high", "medium", "low"].includes(inc.severity) ? inc.severity : "medium") as Severity;
  const status = (["open", "inProgress", "resolved", "closed"].includes(inc.status) ? inc.status : "open") as Status;
  const sevColor = SEV_COLOR[sev];
  const stColor = STATUS_COLOR[status];
  return (
    <button type="button" onClick={() => { fb.tap(); onOpen(); }} className={styles.card}>
      <div className={styles.thumb}>
        {photoUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img src={photoUrl} />
        ) : (
          <span className={styles.thumbPh}><ImageIcon size={24} /></span>
        )}
        {inc.photoCount > 1 && (
          <span className={styles.thumbCount}><ImageIcon size={10} />{inc.photoCount}</span>
        )}
      </div>

      <div className={styles.body}>
        <div className="flex items-start justify-between gap-2">
          <span className={styles.badge} style={{ color: sevColor, background: `${sevColor}22` }}>
            {t(`incidents.severity.${sev}`, sev)}
          </span>
          <span className={styles.badge} style={{ color: stColor, background: `${stColor}22` }}>
            {t(`incidents.statusLabel.${status}`, status)}
          </span>
        </div>
        <p className={styles.title}>{inc.title}</p>
        {inc.location && (
          <div className={styles.metaRow}>
            <MapPin size={13} className="shrink-0" style={{ color: "var(--gold)" }} />
            <span className="truncate">{inc.location}</span>
          </div>
        )}
        <div className="mt-1 flex items-center gap-3">
          {inc.guard && (
            <span className={styles.metaMuted}><UserIcon size={13} />{inc.guard}</span>
          )}
          <span className={styles.metaMuted}><CalendarDays size={13} />{fmtWhen(inc.at, t)}</span>
          <span className="ml-auto flex items-center gap-2 text-muted"><Eye size={16} /><ChevronRight size={16} /></span>
        </div>
      </div>
    </button>
  );
}

/* --------------------------------------------------------------- stat */

function StatCard({ icon, tint, value, label, link, active, onClick }: {
  icon: React.ReactNode; tint: string; value: React.ReactNode; label: string; link: string; active: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={() => { fb.select(); onClick(); }} className={styles.statCard} style={active ? { borderColor: tint } : undefined}>
      <div className={styles.statTop}>
        <span style={{ color: tint }}>{icon}</span>
        <span className={styles.statVal}>{value}</span>
      </div>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statLink} style={{ color: tint }}>{link}</span>
    </button>
  );
}

/* --------------------------------------------------------------- screen */

export default function SupervisorIncidents() {
  const { t } = useTranslation();
  const history = useHistory();
  const [query, setQuery] = useState("");
  const [sev, setSev] = useState<SevFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter | "all">("all");
  const [sortNewest, setSortNewest] = useState(true);
  const [view, setView] = useState<"list" | "grid">("list");
  const [formOpen, setFormOpen] = useState(false);

  const { data, loading, error, reload } = useAsync(() => supervisorRoute.incidents(), []);
  useLiveRefresh(reload, ["incident", "panic", "alarm", "supervisor.incident"]);
  const incidents: any[] = Array.isArray(data?.incidents) ? data.incidents : [];
  const summary = data?.summary ?? { open: 0, inProgress: 0, resolved: 0, all: 0 };
  const bySeverity = data?.bySeverity ?? { critical: 0, high: 0, medium: 0, low: 0 };

  const shown = useMemo(() => {
    let list = incidents.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter && !(statusFilter === "resolved" && i.status === "closed")) return false;
      if (sev !== "all" && i.severity !== sev) return false;
      if (query) {
        const hay = `${i.title || ""} ${i.location || ""} ${i.guard || ""}`.toLowerCase();
        if (!hay.includes(query.toLowerCase())) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      const ta = new Date(a.at || 0).getTime();
      const tb = new Date(b.at || 0).getTime();
      return sortNewest ? tb - ta : ta - tb;
    });
    return list;
  }, [incidents, statusFilter, sev, query, sortNewest]);

  const openIncident = (inc: any) => history.push(`/supervisor/incidents/${inc.id}`);

  const SEV_TABS: [SevFilter, string, number, string][] = [
    ["all", t("incidents.allIncidents", "Todas"), summary.all, ""],
    ["critical", t("incidents.severity.critical", "Crítica"), bySeverity.critical, SEV_DOT.critical],
    ["high", t("incidents.severity.high", "Alta"), bySeverity.high, SEV_DOT.high],
    ["medium", t("incidents.severity.medium", "Media"), bySeverity.medium, SEV_DOT.medium],
    ["low", t("incidents.severity.low", "Baja"), bySeverity.low, SEV_DOT.low],
  ];

  return (
    <Screen
      largeTitle={t("incidents.title", "Novedades")}
      right={<NavActions />}
      onMenu={openAppMenu}
      avatar={<img src={brandLogo} alt="" className="h-7 w-7 rounded-lg object-contain" />}
      root
      flush
      onRefresh={reload}
    >
        {loading && !data ? (
          <div className="px-4 pt-4"><SkeletonList rows={5} /></div>
        ) : error && !data ? (
          <div className="px-4 pt-8"><ErrorState onRetry={reload} /></div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-4 pb-1 pt-3">
              <StatCard icon={<ShieldAlert size={18} />} tint="#ef4444" value={summary.open} label={t("incidents.statusLabel.open", "Abiertas")} link={t("incidents.viewAll", "Ver todas")} active={statusFilter === "open"} onClick={() => setStatusFilter(statusFilter === "open" ? "all" : "open")} />
              <StatCard icon={<Clock size={18} />} tint="#f59e0b" value={summary.inProgress} label={t("incidents.statusLabel.inProgress", "En proceso")} link={t("incidents.viewAll", "Ver todas")} active={statusFilter === "inProgress"} onClick={() => setStatusFilter(statusFilter === "inProgress" ? "all" : "inProgress")} />
              <StatCard icon={<ClipboardCheck size={18} />} tint="#3b82f6" value={summary.resolved} label={t("incidents.statusLabel.resolved", "Resueltas")} link={t("incidents.viewAll", "Ver todas")} active={statusFilter === "resolved"} onClick={() => setStatusFilter(statusFilter === "resolved" ? "all" : "resolved")} />
              <StatCard icon={<Archive size={18} />} tint="#9aa3af" value={summary.all} label={t("incidents.all", "Todas")} link={t("incidents.viewAll", "Ver todas")} active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
            </div>

            {/* Severity tabs */}
            <div className={`${styles.tabs} mt-3 px-4`}>
              {SEV_TABS.map(([key, label, count, dot]) => (
                <button key={key} type="button" onClick={() => { fb.select(); setSev(key); }} className={`${styles.tab} ${sev === key ? styles.tabActive : ""}`}>
                  {dot && <span className={styles.tabDot} style={{ background: dot }} />}
                  {label} ({count})
                </button>
              ))}
            </div>

            {/* Search + sort + view */}
            <div className="flex items-center gap-2.5 px-4 py-3">
              <div className={styles.searchWrap}>
                <Search size={16} className={styles.searchIcon} />
                <input className={styles.searchInput} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("incidents.searchPlaceholder", "Buscar incidentes…")} />
              </div>
              <button type="button" className={styles.sortBtn} onClick={() => { fb.select(); setSortNewest((v) => !v); }}>
                <ArrowUpDown size={14} className="text-muted" />
                {sortNewest ? t("incidents.newest", "Recientes") : t("incidents.oldest", "Antiguas")}
              </button>
              <div className={styles.viewToggle}>
                <button type="button" className={`${styles.viewBtn} ${view === "grid" ? styles.viewBtnActive : ""}`} onClick={() => { fb.select(); setView("grid"); }}><LayoutGrid size={16} /></button>
                <button type="button" className={`${styles.viewBtn} ${view === "list" ? styles.viewBtnActive : ""}`} onClick={() => { fb.select(); setView("list"); }}><ListIcon size={16} /></button>
              </div>
            </div>

            {/* List */}
            <div className={`px-4 pb-28 ${view === "grid" ? "grid grid-cols-1 gap-3" : "space-y-3"}`}>
              {shown.length === 0 ? (
                <div className="mt-16 flex flex-col items-center gap-2 text-center">
                  <ShieldAlert size={30} className="text-faint" />
                  <p className="text-sm text-muted">{t("incidents.empty", "No hay incidentes")}</p>
                </div>
              ) : (
                shown.map((inc) => <IncidentCard key={inc.id} inc={inc} onOpen={() => openIncident(inc)} t={t} />)
              )}
            </div>
          </>
        )}

        {/* New incident (FAB) */}
        <button
          type="button"
          aria-label={t("incidents.logIncident", "Nueva")}
          onClick={() => { fb.press(); setFormOpen(true); }}
          className="pressable fixed bottom-24 left-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-gold text-on-accent shadow-lg shadow-black/30"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <Plus size={26} />
        </button>

        {/* Create */}
        <IncidentForm isOpen={formOpen} onClose={() => setFormOpen(false)} onCreated={reload} />
    </Screen>
  );
}
