import { useEffect, useState } from "react";
import { IonMenu, IonContent } from "@ionic/react";
import { menuController } from "@ionic/core/components";
import { useHistory, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ShieldAlert, Users2, Route as RouteIcon,
  CalendarDays, Shirt, LifeBuoy, LogOut, Clock, ChevronRight,
} from "lucide-react";
import brandLogo from "@/assets/brand-logo.png";
import { useAuth } from "@/context/AuthContext";
import { getDuty, subscribeDuty } from "@/lib/dutyState";
import fb from "@/lib/feedback";

/** Menu id — used by the hamburger to open the drawer from anywhere. */
export const APP_MENU_ID = "app-menu";
export const openAppMenu = () => menuController.open(APP_MENU_ID);

/**
 * The app's slide-out navigation menu (a left-side `IonMenu` drawer, opened by
 * the top-bar hamburger). This is the app menu — the single place that lists
 * every destination — not a "More" page. Swipe from the left edge or tap the
 * hamburger to open; tapping an item navigates and closes it.
 */
export function SideMenu() {
  const { t } = useTranslation();
  const history = useHistory();
  const location = useLocation();
  const { user, signOut } = useAuth();

  const name = user?.fullName || user?.name || user?.email || "—";

  // Live on/off-duty state for the clock control (kept in sync by SupervisorClockIn).
  const [onDuty, setOnDuty] = useState<boolean>(getDuty());
  useEffect(() => subscribeDuty(setOnDuty), []);

  // Only destinations NOT already in the bottom tab bar (Dashboard / Stations /
  // Guards / Messages / Reports live there) — the menu never duplicates the tabs.
  // Emergency (SOS FAB), Notifications + Profile (top-bar NavActions) already have
  // dedicated entry points, so they're intentionally NOT duplicated here.
  const items: { icon: React.ReactNode; label: string; to: string }[] = [
    { icon: <ShieldAlert size={20} />, label: t("nav.incidents", "Novedades"), to: "/supervisor/incidents" },
    { icon: <Users2 size={20} />, label: t("visitors.title", "Visitantes"), to: "/supervisor/visitors" },
    { icon: <RouteIcon size={20} />, label: t("nav.route", "Ruta"), to: "/supervisor/route" },
    { icon: <CalendarDays size={20} />, label: t("nav.schedule", "Horario"), to: "/supervisor/schedule" },
    { icon: <Shirt size={20} />, label: t("uniform.title", "Uniforme"), to: "/supervisor/uniform" },
    { icon: <LifeBuoy size={20} />, label: t("backupConfirm.title", "Respaldo"), to: "/supervisor/backup" },
  ];

  const go = async (to: string) => {
    fb.tap();
    await menuController.close(APP_MENU_ID);
    history.push(to);
  };

  return (
    <IonMenu menuId={APP_MENU_ID} contentId="main-content" side="start" type="overlay" className="app-side-menu">
      <IonContent scrollY>
        {/* Brand / identity */}
        <div className="safe-top flex items-center gap-3 border-b border-line px-5 pb-4 pt-5">
          <img src={brandLogo} alt="" className="h-10 w-10 shrink-0 rounded-xl object-contain" />
          <div className="min-w-0">
            <p className="truncate text-[16px] font-extrabold text-ink">C-GuardPro</p>
            <p className="truncate text-[12.5px] text-muted">{name}</p>
          </div>
        </div>

        {/* Clock in / out — the supervisor's own shift. Live duty status. */}
        <div className="px-3 pt-4">
          <button
            type="button"
            onClick={() => go("/supervisor/clock-in")}
            className={`pressable flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left ${
              onDuty ? "border-online/40 bg-online/10" : "border-gold/40 bg-gold/10"
            }`}
          >
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${onDuty ? "bg-online/20 text-online" : "bg-gold/20 text-gold"}`}>
              <Clock size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${onDuty ? "bg-online" : "bg-faint"}`} />
                <span className="text-[13px] font-bold uppercase tracking-wide" style={{ color: onDuty ? "var(--online)" : "var(--gold)" }}>
                  {onDuty ? t("supervisor.onDuty", "En turno") : t("supervisor.offDuty", "Fuera de turno")}
                </span>
              </span>
              <span className="mt-0.5 block text-[15px] font-semibold text-ink">
                {onDuty ? t("supervisor.clockOut", "Marcar salida") : t("supervisor.clockIn", "Marcar entrada")}
              </span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-faint" />
          </button>
        </div>

        {/* Destinations */}
        <nav className="flex flex-col gap-1.5 px-3 py-4">
          {items.map((it) => {
            const active = location.pathname === it.to || location.pathname.startsWith(it.to + "/");
            return (
              <button
                key={it.to}
                type="button"
                onClick={() => go(it.to)}
                className={`pressable flex min-h-[3.25rem] items-center gap-3.5 rounded-xl px-3.5 py-3.5 text-left text-[15px] font-semibold ${
                  active ? "bg-gold/15 text-gold" : "text-ink active:bg-surface-2"
                }`}
              >
                <span className={active ? "text-gold" : "text-muted"}>{it.icon}</span>
                {it.label}
              </button>
            );
          })}
        </nav>

        {/* Sign out */}
        <div className="mt-auto border-t border-line px-3 py-3 safe-bottom">
          <button
            type="button"
            onClick={async () => { fb.tap(); await menuController.close(APP_MENU_ID); signOut(); }}
            className="pressable flex w-full items-center gap-3.5 rounded-xl px-3 py-3 text-left text-[15px] font-semibold text-critical active:bg-surface-2"
          >
            <LogOut size={20} />
            {t("profile.signOut", "Cerrar sesión")}
          </button>
        </div>
      </IonContent>
    </IonMenu>
  );
}

export default SideMenu;
