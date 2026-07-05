import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIonViewWillEnter, useIonViewWillLeave, useIonToast } from "@ionic/react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  ResponsiveContainer, LabelList, Tooltip as RTooltip,
} from "recharts";
import {
  LayoutGrid, Users, MapPin, ShieldAlert, ClipboardList, Clock, ShieldCheck,
  ArrowUp, ArrowDown, CalendarDays, Download, ChevronDown, ChevronRight,
  CheckCircle2, UserRound,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { NavActions } from "@/components/shared/NavActions";
import { openAppMenu } from "@/components/shared/SideMenu";
import { SkeletonList, ErrorState } from "@/components/ui";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { useFileUrl } from "@/lib/fileUrl";
import { useAsync } from "@/lib/useAsync";
import fb from "@/lib/feedback";
import styles from "./Reports.module.css";

type Tab = "overview" | "guards" | "sites" | "incidents" | "tasks";

const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString([], { month: "short", day: "numeric" });
};
const rangeLabel = (from?: string, to?: string) => {
  if (!from || !to) return "";
  const a = new Date(from), b = new Date(to);
  return `${a.toLocaleDateString([], { month: "short", day: "numeric" })} – ${b.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
};

function Delta({ pct, invert }: { pct: number; invert?: boolean }) {
  const up = pct >= 0;
  // For "bad" metrics (late arrivals, incidents) rising is red; for good ones green.
  const good = invert ? !up : up;
  const color = pct === 0 ? "var(--muted)" : good ? "#22c55e" : "#ef4444";
  return (
    <span className={styles.statDelta} style={{ color }}>
      {up ? <ArrowUp size={13} /> : <ArrowDown size={13} />}{Math.abs(pct)}%
    </span>
  );
}

function StatCard({ label, value, unit, icon, tint, pct, invert }: { label: string; value: string; unit?: string; icon: React.ReactNode; tint: string; pct: number; invert?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={styles.statCard}>
      <div className={styles.statTop}>
        <span className={styles.statLabel}>{label}</span>
        <span className="grid h-7 w-7 place-items-center rounded-full" style={{ background: `${tint}22`, color: tint }}>{icon}</span>
      </div>
      <p className={styles.statVal}>{value}{unit && <span className={styles.statUnit}> {unit}</span>}</p>
      <Delta pct={pct} invert={invert} />
      <p className={styles.statVs}>{t("reports.vs7", "vs 7 días previos")}</p>
    </div>
  );
}

function AreaTip({ active, payload, label, color }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.chartTip}>
      <p className={styles.chartTipDate}>{fmtDay(label)}</p>
      <p className={styles.chartTipVal} style={{ color }}>{payload[0].value}</p>
    </div>
  );
}

function TrendCard({ icon, tint, title, value, sub, series, gradId }: { icon: React.ReactNode; tint: string; title: string; value: number; sub: string; series: any[]; gradId: string }) {
  const { t } = useTranslation();
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}><span style={{ color: tint }}>{icon}</span>{title}</span>
        <span className={styles.seeAll}>{t("reports.seeAll", "Ver todo")}</span>
      </div>
      <p className={`${styles.bigNum} mt-2`}>{value}</p>
      <p className={styles.bigSub}>{sub}</p>
      <div className="mt-2 h-36">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 8, right: 6, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={tint} stopOpacity={0.4} />
                <stop offset="100%" stopColor={tint} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fill: "var(--muted)", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tick={{ fill: "var(--muted)", fontSize: 10 }} axisLine={false} tickLine={false} width={26} allowDecimals={false} />
            <RTooltip content={(p) => <AreaTip {...p} color={tint} />} cursor={{ stroke: tint, strokeOpacity: 0.3 }} />
            <Area type="monotone" dataKey="value" stroke={tint} strokeWidth={2.5} fill={`url(#${gradId})`} dot={{ r: 3, fill: tint, strokeWidth: 0 }} activeDot={{ r: 5 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PerfAvatar({ g }: { g: any }) {
  const url = useFileUrl(g.photo || null);
  return <span className={styles.perfAvatar}>{url ? <img src={url} alt="" /> : <UserRound size={20} />}</span>;
}

export default function Reports() {
  const { t } = useTranslation();
  const [present] = useIonToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [chartsVisible, setChartsVisible] = useState(false);
  useIonViewWillEnter(() => setChartsVisible(true));
  useIonViewWillLeave(() => setChartsVisible(false));

  const { data, loading, error, reload } = useAsync<any>(() => supervisorRoute.reports(), []);
  const stats = data?.stats;
  const series = data?.series || { lateArrivals: [], incidents: [], hours: [] };
  const perf: any[] = Array.isArray(data?.guardPerformance) ? data.guardPerformance : [];
  const cp = data?.checkpoints || { completed: 0, missed: 0, incomplete: 0, completionRate: 0 };

  const donut = useMemo(() => ([
    { name: t("reports.completed", "Completados"), value: cp.completed, color: "#22c55e" },
    { name: t("reports.missed", "Perdidos"), value: cp.missed, color: "#f59e0b" },
    { name: t("reports.incomplete", "Incompletos"), value: cp.incomplete, color: "#ef4444" },
  ]), [cp, t]);

  const TABS: [Tab, string, React.ReactNode][] = [
    ["overview", t("reports.overview", "Resumen"), <LayoutGrid size={16} />],
    ["guards", t("guards.title", "Vigilantes"), <Users size={16} />],
    ["sites", t("reports.sites", "Sitios"), <MapPin size={16} />],
    ["incidents", t("nav.incidents", "Novedades"), <ShieldAlert size={16} />],
    ["tasks", t("reports.tasks", "Tareas"), <ClipboardList size={16} />],
  ];

  const show = (s: Tab[]) => tab === "overview" || s.includes(tab);

  return (
    <Screen title={t("reports.title", "Reportes")} subtitle={t("reports.subtitle", "Resumen de tus operaciones")} root onMenu={openAppMenu} right={<NavActions />} flush onRefresh={reload}>
      {/* Category tabs */}
      <div className={`${styles.tabs} pt-3`}>
        {TABS.map(([key, label, icon]) => (
          <button key={key} type="button" onClick={() => { fb.select(); setTab(key); }} className={`${styles.tab} ${tab === key ? styles.tabActive : ""}`}>
            {icon}{label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="px-4 pt-4"><SkeletonList rows={6} /></div>
      ) : error && !data ? (
        <div className="px-4 pt-8"><ErrorState onRetry={reload} /></div>
      ) : (
        <div className="space-y-4 pb-6 pt-4">
          {/* Stat cards */}
          <div className="no-scrollbar flex gap-3 overflow-x-auto px-4">
            <StatCard label={t("reports.totalHours", "Horas totales")} value={String(stats?.totalHours?.value ?? 0)} unit="h" icon={<Clock size={16} />} tint="#22c55e" pct={stats?.totalHours?.changePct ?? 0} />
            <StatCard label={t("reports.lateArrivals", "Llegadas tarde")} value={String(stats?.lateArrivals?.value ?? 0)} icon={<Clock size={16} />} tint="#ef4444" pct={stats?.lateArrivals?.changePct ?? 0} invert />
            <StatCard label={t("nav.incidents", "Novedades")} value={String(stats?.incidents?.value ?? 0)} icon={<ShieldAlert size={16} />} tint="#ef4444" pct={stats?.incidents?.changePct ?? 0} invert />
            <StatCard label={t("reports.cpCompletion", "Puntos de control")} value={`${stats?.cpCompletion?.value ?? 0}%`} icon={<CheckCircle2 size={16} />} tint="#22c55e" pct={stats?.cpCompletion?.changePct ?? 0} />
          </div>

          {/* Date range + export */}
          <div className={styles.dateBar}>
            <span className={styles.dateLabel}><CalendarDays size={17} className="text-muted" />{rangeLabel(data?.range?.from, data?.range?.to)}<ChevronDown size={16} className="text-muted" /></span>
            <button type="button" className={styles.exportBtn} onClick={() => present({ message: t("guardDetail.soon", "Próximamente"), duration: 1200, position: "top" })}><Download size={16} />{t("reports.export", "Exportar")}</button>
          </div>

          <div className="space-y-4 px-4 stagger">
            {chartsVisible && show(["incidents"]) && (
              <TrendCard icon={<Clock size={18} />} tint="#ef4444" title={t("reports.lateArrivals", "Llegadas tarde")} value={stats?.lateArrivals?.value ?? 0} sub={t("reports.lateArrivalsSub", "llegadas tarde")} series={series.lateArrivals} gradId="gLate" />
            )}
            {chartsVisible && show(["incidents"]) && (
              <TrendCard icon={<ShieldAlert size={18} />} tint="#8b5cf6" title={t("reports.incidentTrends", "Tendencia de novedades")} value={stats?.incidents?.value ?? 0} sub={t("reports.totalIncidents", "novedades totales")} series={series.incidents} gradId="gInc" />
            )}

            {/* Guard performance */}
            {show(["guards"]) && (
              <div className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.cardTitle}><Users size={18} className="text-info" />{t("reports.guardPerformance", "Desempeño de vigilantes")}</span>
                  <span className={styles.seeAll}>{t("reports.seeAll", "Ver todo")}</span>
                </div>
                <p className="mt-0.5 text-[13px] text-muted">{t("reports.top5", "Top 5 vigilantes")}</p>
                <div className="mt-2">
                  {perf.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted">{t("reports.noData", "Sin datos suficientes")}</p>
                  ) : perf.map((g) => {
                    const color = g.score >= 90 ? "#22c55e" : "#f59e0b";
                    return (
                      <div key={g.guardId} className={styles.perfRow}>
                        <PerfAvatar g={g} />
                        <div className="min-w-0 flex-1">
                          <p className={styles.perfName}>{g.name}</p>
                          <div className={styles.perfTrack}><div className={styles.perfFill} style={{ width: `${Math.min(100, g.score)}%`, background: color }} /></div>
                        </div>
                        <span className={styles.perfPct} style={{ color }}>{g.score}%</span>
                      </div>
                    );
                  })}
                </div>
                <button type="button" className={styles.viewAll} onClick={() => fb.tap()}>{t("reports.viewAllGuards", "Ver todos los vigilantes")}<ChevronRight size={16} /></button>
              </div>
            )}

            {/* Checkpoint completion donut */}
            {show(["sites"]) && (
              <div className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.cardTitle}><ShieldCheck size={18} className="text-online" />{t("reports.checkpointCompletion", "Puntos de control")}</span>
                  <span className={styles.seeAll}>{t("reports.seeAll", "Ver todo")}</span>
                </div>
                <p className={`${styles.bigNum} mt-2`}>{cp.completionRate}%</p>
                <p className={styles.bigSub}>{t("reports.completionRate", "tasa de finalización")}</p>
                <div className="mt-3 flex items-center gap-4">
                  <div className="h-32 w-32 shrink-0">
                    {chartsVisible && (cp.completed + cp.missed + cp.incomplete) > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={donut} dataKey="value" nameKey="name" innerRadius={38} outerRadius={62} paddingAngle={2} stroke="none">
                            {donut.map((d, i) => <Cell key={i} fill={d.color} />)}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    ) : <div className="grid h-full w-full place-items-center rounded-full border-4 border-line text-[11px] text-muted">—</div>}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2.5">
                    {donut.map((d) => (
                      <div key={d.name} className={styles.legendRow}>
                        <span className={styles.legendDot} style={{ background: d.color }} />
                        <span className={styles.legendLabel}>{d.name}</span>
                        <span className={styles.legendVal}>{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <button type="button" className={styles.viewAll} onClick={() => fb.tap()}>{t("reports.viewCheckpoints", "Ver puntos de control")}<ChevronRight size={16} /></button>
              </div>
            )}

            {/* Hours worked bar chart */}
            {show(["guards"]) && (
              <div className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.cardTitle}><Clock size={18} className="text-info" />{t("reports.hoursWorked", "Horas trabajadas")}</span>
                  <span className={styles.seeAll}>{t("reports.seeAll", "Ver todo")}</span>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={styles.bigNum}>{stats?.totalHours?.value ?? 0} h</span>
                  <Delta pct={stats?.totalHours?.changePct ?? 0} />
                </div>
                <div className="mt-3 h-52">
                  {chartsVisible && (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={series.hours} margin={{ top: 20, right: 6, left: -14, bottom: 0 }}>
                        <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fill: "var(--muted)", fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
                        <YAxis tick={{ fill: "var(--muted)", fontSize: 10 }} axisLine={false} tickLine={false} width={30} tickFormatter={(v) => `${v}h`} />
                        <Bar dataKey="value" fill="var(--info)" radius={[4, 4, 0, 0]} maxBarSize={30}>
                          <LabelList dataKey="value" position="top" formatter={(v: any) => `${v}h`} style={{ fill: "var(--muted)", fontSize: 10, fontWeight: 700 }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            )}

            {tab === "tasks" && (
              <p className="py-8 text-center text-sm text-muted">{t("guardDetail.soon", "Próximamente")}</p>
            )}
          </div>
        </div>
      )}
    </Screen>
  );
}
