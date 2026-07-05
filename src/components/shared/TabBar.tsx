import { IonTabBar, IonTabButton, IonLabel } from "@ionic/react";
import { useTranslation } from "react-i18next";
import { MapPin, Building2, Users, MessageSquare, FileBarChart } from "lucide-react";

/**
 * Shared bottom tab bar — the app's single, persistent tab bar (the root
 * destinations of the navigation controller). Rendered once by `SupervisorApp`
 * inside `<IonTabs>`; every screen is a child of one of these roots. Detail
 * pages push on top and keep this bar visible, matching iOS. Everything NOT here
 * (Incidents, Emergency, Notifications, Visitors, Radio, Route, Schedule…) lives
 * in the hamburger side menu.
 *
 * NOTE: to satisfy Ionic, this MUST be rendered as a direct child of `<IonTabs>`
 * (IonTabs wires slot="bottom" + the active-tab state), so it's a plain function
 * returning <IonTabBar> — not wrapped in another element.
 */
export function TabBar(_props: { openIncidents?: number } = {}) {
  const { t } = useTranslation();
  return (
    <IonTabBar slot="bottom">
      <IonTabButton tab="dashboard" href="/supervisor/dashboard">
        <MapPin size={22} />
        <IonLabel>{t("nav.dashboard", "Panel")}</IonLabel>
      </IonTabButton>
      <IonTabButton tab="stations" href="/supervisor/stations">
        <Building2 size={22} />
        <IonLabel>{t("stations.title", "Estaciones")}</IonLabel>
      </IonTabButton>
      <IonTabButton tab="guards" href="/supervisor/guards">
        <Users size={22} />
        <IonLabel>{t("guards.title", "Vigilantes")}</IonLabel>
      </IonTabButton>
      <IonTabButton tab="messages" href="/supervisor/messages">
        <MessageSquare size={22} />
        <IonLabel>{t("messages.title", "Mensajes")}</IonLabel>
      </IonTabButton>
      <IonTabButton tab="reports" href="/supervisor/reports">
        <FileBarChart size={22} />
        <IonLabel>{t("nav.reports", "Reportes")}</IonLabel>
      </IonTabButton>
    </IonTabBar>
  );
}

export default TabBar;
