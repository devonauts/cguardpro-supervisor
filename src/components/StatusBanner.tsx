import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { WifiOff, BatteryWarning, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDeviceStatus } from "@/hooks/useDeviceStatus";
import { subscribePending } from "@/lib/offlineQueue";

/**
 * App-wide resilience banner: a thin strip pinned to the top that warns the user
 * when the device is offline, the battery is critically low, or there are actions
 * queued offline waiting to send. Renders nothing in the normal healthy case.
 *
 * The banner is position:fixed (so it stays put while pages scroll), which means
 * it would otherwise paint OVER the page header/icons. To avoid that we measure
 * the visible strips and publish their height as `--status-banner-h` on <html>;
 * the header safe-area padding (.safe-top) adds that offset so headers sit below
 * the banner instead of behind it.
 */
export function StatusBanner() {
  const { t } = useTranslation();
  const { online, batteryLevel, charging } = useDeviceStatus();
  const [pending, setPending] = useState(0);
  useEffect(() => subscribePending(setPending), []);
  const stripsRef = useRef<HTMLDivElement>(null);

  const pct = batteryLevel != null ? Math.round(batteryLevel * 100) : null;
  const lowBattery = batteryLevel != null && batteryLevel <= 0.10 && !charging;
  const visible = !online || lowBattery || pending > 0;

  // Publish the strips' height so page headers reserve space for it. 0 when the
  // banner is empty, so headers sit at their normal safe-area position.
  useLayoutEffect(() => {
    const el = stripsRef.current;
    const setVar = (h: number) => document.documentElement.style.setProperty("--status-banner-h", `${h}px`);
    if (!el) { setVar(0); return; }
    const update = () => setVar(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { ro.disconnect(); setVar(0); };
  }, [visible, online, lowBattery, pending]);

  return (
    <div
      className="pointer-events-none fixed left-0 right-0 z-[25000] flex flex-col"
      style={{ top: 0, paddingTop: "env(safe-area-inset-top)" }}
    >
      <div ref={stripsRef} className="flex flex-col">
      {!online && (
        <div className="flex items-center justify-center gap-2 bg-critical px-3 py-1.5 text-[11px] font-bold text-white">
          <WifiOff size={13} />
          {t("net.offline", "Sin conexión — algunas acciones no estarán disponibles hasta que se restablezca.")}
        </div>
      )}
      {pending > 0 && (
        <div className="flex items-center justify-center gap-2 bg-info px-3 py-1.5 text-[11px] font-bold text-white">
          <RefreshCw size={13} className={online ? "animate-spin" : ""} />
          {online
            ? t("net.syncing", "Enviando acciones pendientes…")
            : `${pending} ${pending === 1 ? t("net.pendingOne", "acción pendiente por enviar") : t("net.pendingMany", "acciones pendientes por enviar")}`}
        </div>
      )}
      {online && lowBattery && (
        <div className="flex items-center justify-center gap-2 bg-high px-3 py-1.5 text-[11px] font-bold text-on-accent">
          <BatteryWarning size={13} />
          {`${t("net.lowBattery", "Batería baja")}${pct != null ? ` (${pct}%)` : ""} — ${t("net.charge", "conecta un cargador.")}`}
        </div>
      )}
      </div>
    </div>
  );
}
