import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import {
  Search, SlidersHorizontal, Plus, Users, CalendarDays, Clock, UserRound,
  Building2, IdCard, Car, ChevronRight, UserCircle2,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { ErrorState, SkeletonList } from "@/components/ui";
import { supervisorRoute } from "@/lib/supervisorRoute";
import { useFileUrl } from "@/lib/fileUrl";
import { useAsync } from "@/lib/useAsync";
import fb from "@/lib/feedback";
import styles from "./SupervisorVisitors.module.css";

type Status = "checkedIn" | "expected" | "checkedOut" | "denied";
type Filter = "all" | Status;

const STATUS: Record<Status, { key: string; def: string; color: string }> = {
  checkedIn: { key: "visitors.checkedIn", def: "Checked In", color: "#22c55e" },
  expected: { key: "visitors.expected", def: "Expected", color: "#f59e0b" },
  checkedOut: { key: "visitors.checkedOut", def: "Checked Out", color: "#9aa3af" },
  denied: { key: "visitors.denied", def: "Denied", color: "#ef4444" },
};

function fmtDateTime(iso: any): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldIcon}>{icon}</span>
      <div className="min-w-0">
        <p className={styles.fieldLabel}>{label}</p>
        <p className={styles.fieldVal}>{value || "—"}</p>
      </div>
    </div>
  );
}

function VisitorCard({ v, t, onOpen }: { v: any; t: any; onOpen: () => void }) {
  const photo = useFileUrl(v.photo || null);
  const st = (["checkedIn", "expected", "checkedOut", "denied"].includes(v.status) ? v.status : "expected") as Status;
  const meta = STATUS[st];
  const inLabel = st === "expected" ? t("visitors.expectedArrival", "Llegada estimada") : st === "denied" ? t("visitors.denied", "Denegado") : t("visitors.checkedIn", "Entrada");
  const outLabel = st === "denied" ? t("visitors.reason", "Motivo") : st === "checkedOut" ? t("visitors.checkedOut", "Salida") : t("visitors.expectedDeparture", "Salida estimada");
  return (
    <button type="button" onClick={() => { fb.tap(); onOpen(); }} className={styles.card}>
      <div className={styles.head}>
        <span className={styles.avatarWrap}>
          <span className={`${styles.avatar} ring-2 ring-line`}>
            {photo ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <img src={photo} className="h-full w-full rounded-full object-cover" />
            ) : (
              <UserCircle2 size={30} />
            )}
          </span>
          <span className={styles.dot} style={{ background: meta.color }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={styles.name}>{v.name}</p>
        </div>
        <span className={styles.badge} style={{ color: meta.color, borderColor: `${meta.color}66` }}>{t(meta.key, meta.def)}</span>
        <ChevronRight size={18} className="ml-1 mt-1 shrink-0 text-faint" />
      </div>

      <div className={styles.grid2}>
        <div className={styles.col}>
          <Field icon={<Building2 size={15} />} label={t("visitors.company", "Empresa")} value={v.company} />
          <Field icon={<UserRound size={15} />} label={t("visitors.host", "Anfitrión")} value={v.host} />
        </div>
        <div className={styles.col}>
          <Field icon={<IdCard size={15} />} label={t("visitors.badge", "Credencial")} value={v.badge} />
          <Field icon={<Car size={15} />} label={t("visitors.vehicle", "Vehículo")} value={v.vehicle} />
        </div>
      </div>

      <div className={styles.footer}>
        <Field icon={<CalendarDays size={15} />} label={inLabel} value={st === "denied" ? fmtDateTime(v.checkInAt) : fmtDateTime(v.checkInAt)} />
        <Field icon={st === "denied" ? <Clock size={15} /> : <CalendarDays size={15} />} label={outLabel} value={st === "denied" ? (v.reason || "—") : fmtDateTime(v.checkOutAt)} />
      </div>
    </button>
  );
}

export default function SupervisorVisitors() {
  const { t } = useTranslation();
  const history = useHistory();
  const [filter, setFilter] = useState<Filter>("all");

  const { data, loading, error, reload } = useAsync(() => supervisorRoute.visitors(), []);
  const visitors: any[] = Array.isArray(data?.visitors) ? data.visitors : [];
  const summary = data?.summary ?? { checkedIn: 0, expected: 0, checkedOut: 0, all: 0, denied: 0 };

  const shown = useMemo(
    () => (filter === "all" ? visitors : visitors.filter((v) => v.status === filter)),
    [visitors, filter],
  );

  const TABS: [Filter, string][] = [
    ["all", t("visitors.all", "Todos")],
    ["checkedIn", t("visitors.checkedIn", "Dentro")],
    ["expected", t("visitors.expected", "Esperados")],
    ["checkedOut", t("visitors.checkedOut", "Salieron")],
    ["denied", t("visitors.denied", "Denegados")],
  ];

  const right = (
    <div className="flex items-center gap-0.5">
      <button type="button" aria-label={t("common.search", "Buscar")} onClick={() => fb.tap()} className="pressable grid h-11 w-11 place-items-center rounded-full text-ink active:bg-surface-2"><Search size={20} /></button>
      <button type="button" aria-label={t("guards.filters", "Filtros")} onClick={() => fb.tap()} className="pressable grid h-11 w-11 place-items-center rounded-full text-ink active:bg-surface-2"><SlidersHorizontal size={20} /></button>
      <button type="button" aria-label={t("visitors.add", "Registrar")} onClick={() => { fb.press(); reload(); }} className="pressable ml-0.5 grid h-11 w-11 place-items-center rounded-full bg-gold text-on-accent"><Plus size={20} /></button>
    </div>
  );

  return (
    <Screen largeTitle={t("visitors.title", "Visitantes")} right={right} back flush onRefresh={reload}>
        {loading && !data ? (
          <div className="px-4 pt-4"><SkeletonList rows={5} /></div>
        ) : error && !data ? (
          <div className="px-4 pt-8"><ErrorState onRetry={reload} /></div>
        ) : (
          <>
            <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-4 pb-1 pt-3">
              <button type="button" onClick={() => { fb.select(); setFilter(filter === "checkedIn" ? "all" : "checkedIn"); }} className={styles.statCard} style={filter === "checkedIn" ? { borderColor: STATUS.checkedIn.color } : undefined}>
                <div className={styles.statTop}><Users size={18} style={{ color: "#3b82f6" }} /><span className={styles.statVal}>{summary.checkedIn}</span></div>
                <span className={styles.statLabel}>{t("visitors.checkedIn", "Dentro")}</span>
              </button>
              <button type="button" onClick={() => { fb.select(); setFilter(filter === "expected" ? "all" : "expected"); }} className={styles.statCard} style={filter === "expected" ? { borderColor: STATUS.expected.color } : undefined}>
                <div className={styles.statTop}><CalendarDays size={18} style={{ color: "#22c55e" }} /><span className={styles.statVal}>{summary.expected}</span></div>
                <span className={styles.statLabel}>{t("visitors.expected", "Esperados")}</span>
              </button>
              <button type="button" onClick={() => { fb.select(); setFilter(filter === "checkedOut" ? "all" : "checkedOut"); }} className={styles.statCard} style={filter === "checkedOut" ? { borderColor: STATUS.checkedOut.color } : undefined}>
                <div className={styles.statTop}><Clock size={18} style={{ color: "#f59e0b" }} /><span className={styles.statVal}>{summary.checkedOut}</span></div>
                <span className={styles.statLabel}>{t("visitors.checkedOut", "Salieron")}</span>
              </button>
              <button type="button" onClick={() => { fb.select(); setFilter("all"); }} className={styles.statCard} style={filter === "all" ? { borderColor: "var(--gold)" } : undefined}>
                <div className={styles.statTop}><UserRound size={18} className="text-muted" /><span className={styles.statVal}>{summary.all}</span></div>
                <span className={styles.statLabel}>{t("visitors.allVisitors", "Todos")}</span>
              </button>
            </div>

            <div className={`${styles.tabs} mt-3`}>
              {TABS.map(([key, label]) => (
                <button key={key} type="button" onClick={() => { fb.select(); setFilter(key); }} className={`${styles.tab} ${filter === key ? styles.tabActive : ""}`}>{label}</button>
              ))}
            </div>

            <div className="space-y-3 px-4 pb-28 pt-4">
              {shown.length === 0 ? (
                <div className="mt-16 flex flex-col items-center gap-2 text-center">
                  <Users size={30} className="text-faint" />
                  <p className="text-sm text-muted">{t("visitors.empty", "No hay visitantes")}</p>
                </div>
              ) : (
                shown.map((v) => <VisitorCard key={v.id} v={v} t={t} onOpen={() => history.push(`/supervisor/visitors/${v.id}`)} />)
              )}
            </div>
          </>
        )}
    </Screen>
  );
}
