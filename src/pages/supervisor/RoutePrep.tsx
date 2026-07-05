import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory, useParams } from "react-router-dom";
import {
  Car, Fuel, Radio, BatteryFull, BatteryLow, FileText, Flashlight, Check, ShieldCheck,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { NavActions } from "@/components/shared/NavActions";
import { SlideToConfirm } from "@/components/ui";
import { subscribeDeviceStatus, getDeviceStatus } from "@/lib/deviceStatus";
import fb from "@/lib/feedback";
import styles from "./RouteMission.module.css";

type Item = { id: string; label: string; sub?: string; icon: React.ReactNode; auto?: boolean };

function StepDots({ step }: { step: number }) {
  return (
    <div className={`${styles.steps} mb-4`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`${styles.stepDot} ${i < step ? styles.stepDotDone : i === step ? styles.stepDotActive : ""}`} />
      ))}
    </div>
  );
}

export default function RoutePrep() {
  const { t } = useTranslation();
  const history = useHistory();
  const { routeId } = useParams<{ routeId: string }>();
  const [battery, setBattery] = useState<number | null>(getDeviceStatus().batteryLevel);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => subscribeDeviceStatus((s) => setBattery(s.batteryLevel)), []);

  const batteryPct = battery == null ? null : Math.round(battery * 100);
  const batteryOk = batteryPct == null || batteryPct >= 30;

  const items: Item[] = useMemo(() => [
    { id: "vehicle", label: t("routeMission.chk.vehicle", "Vehículo inspeccionado"), sub: t("routeMission.chk.vehicleSub", "Llantas, luces, frenos"), icon: <Car size={20} /> },
    { id: "fuel", label: t("routeMission.chk.fuel", "Combustible / carga suficiente"), icon: <Fuel size={20} /> },
    { id: "radio", label: t("routeMission.chk.radio", "Radio / PTT operativo"), icon: <Radio size={20} /> },
    {
      id: "phone",
      label: t("routeMission.chk.phone", "Teléfono cargado"),
      sub: batteryPct == null ? t("routeMission.chk.batteryUnknown", "Nivel no disponible") : t("routeMission.chk.battery", "Batería: {{pct}}%", { pct: batteryPct }),
      icon: batteryOk ? <BatteryFull size={20} /> : <BatteryLow size={20} />,
      auto: batteryOk,
    },
    { id: "docs", label: t("routeMission.chk.docs", "Documentos y credenciales"), icon: <FileText size={20} /> },
    { id: "kit", label: t("routeMission.chk.kit", "Linterna y botiquín"), icon: <Flashlight size={20} /> },
  ], [t, batteryPct, batteryOk]);

  // Battery auto-check keeps in sync until the user overrides it.
  const isOn = (it: Item) => checked[it.id] ?? Boolean(it.auto);
  const allDone = items.every((it) => isOn(it));
  const doneCount = items.filter(isOn).length;

  const toggle = (it: Item) => {
    fb.select();
    setChecked((c) => ({ ...c, [it.id]: !isOn(it) }));
  };

  return (
    <Screen title={t("routeMission.prepTitle", "Preparación")} back right={<NavActions />}>
      <div className="px-4 pt-4">
        <StepDots step={0} />

        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-line bg-surface-elev p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold"><ShieldCheck size={22} /></span>
          <div className="min-w-0">
            <p className="text-[15.5px] font-extrabold text-ink">{t("routeMission.prepHeading", "Antes de salir")}</p>
            <p className="text-[13px] text-muted">{t("routeMission.prepSub", "Confirma que llevas todo lo necesario")}</p>
          </div>
          <span className="ml-auto shrink-0 text-[13px] font-bold text-muted">{doneCount}/{items.length}</span>
        </div>

        {!batteryOk && batteryPct != null && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-critical/40 bg-critical/10 px-3 py-2.5 text-[13px] font-semibold text-critical">
            <BatteryLow size={16} />{t("routeMission.lowBattery", "Batería baja ({{pct}}%). Carga antes de iniciar.", { pct: batteryPct })}
          </div>
        )}

        <div className="space-y-2.5 pb-40">
          {items.map((it) => {
            const on = isOn(it);
            return (
              <button key={it.id} type="button" onClick={() => toggle(it)} className={`${styles.checkRow} ${on ? styles.checkRowOn : ""}`}>
                <span className={styles.checkIcon}>{it.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block ${styles.checkLabel}`}>{it.label}</span>
                  {it.sub && <span className={`block ${styles.checkSub}`}>{it.sub}</span>}
                </span>
                <span className={`${styles.checkBox} ${on ? styles.checkBoxOn : ""}`}><Check size={16} /></span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Slide to continue — pinned above the tab bar */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-surface/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur">
        {allDone ? (
          <SlideToConfirm label={t("routeMission.slideContinue", "Desliza para continuar")} tone="gold" onConfirm={() => history.push(`/supervisor/route/${routeId}/timeline`)} />
        ) : (
          <div className="flex h-[60px] items-center justify-center rounded-full border border-line-2 bg-surface-2 text-sm font-bold text-muted">
            {t("routeMission.completeChecklist", "Completa la lista para continuar")}
          </div>
        )}
      </div>
    </Screen>
  );
}
