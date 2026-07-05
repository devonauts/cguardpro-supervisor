import { IonTabBar, IonTabButton, IonLabel, IonBadge } from "@ionic/react";
import { useTranslation } from "react-i18next";
import { MapPin, Route, Users, ShieldAlert, MoreHorizontal } from "lucide-react";

/**
 * Shared bottom tab bar — the app's single, persistent tab bar (the root
 * destinations of the navigation controller). Rendered once by `SupervisorApp`
 * inside `<IonTabs>`; every screen is a child of one of these roots. Detail
 * pages push on top and keep this bar visible, matching iOS.
 *
 * NOTE: to satisfy Ionic, this MUST be rendered as a direct child of `<IonTabs>`
 * (IonTabs wires slot="bottom" + the active-tab state), so it's a plain function
 * returning <IonTabBar> — not wrapped in another element.
 */
export function TabBar({ openIncidents = 0 }: { openIncidents?: number }) {
  const { t } = useTranslation();
  return (
    <IonTabBar slot="bottom">
      <IonTabButton tab="dashboard" href="/supervisor/dashboard">
        <MapPin size={22} />
        <IonLabel>{t("nav.dashboard", "Panel")}</IonLabel>
      </IonTabButton>
      <IonTabButton tab="route" href="/supervisor/route">
        <Route size={22} />
        <IonLabel>{t("nav.route", "Ruta")}</IonLabel>
      </IonTabButton>
      <IonTabButton tab="guards" href="/supervisor/guards">
        <Users size={22} />
        <IonLabel>{t("guards.title", "Vigilantes")}</IonLabel>
      </IonTabButton>
      <IonTabButton tab="incidents" href="/supervisor/incidents">
        <ShieldAlert size={22} />
        {openIncidents > 0 && (
          <IonBadge color="danger">{openIncidents > 9 ? "9+" : openIncidents}</IonBadge>
        )}
        <IonLabel>{t("nav.incidents", "Novedades")}</IonLabel>
      </IonTabButton>
      <IonTabButton tab="more" href="/supervisor/more">
        <MoreHorizontal size={22} />
        <IonLabel>{t("nav.more", "Más")}</IonLabel>
      </IonTabButton>
    </IonTabBar>
  );
}

export default TabBar;
