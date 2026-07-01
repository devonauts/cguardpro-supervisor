import { Redirect, Route } from "react-router-dom";
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonRouterOutlet,
  IonLabel,
} from "@ionic/react";
import { useTranslation } from "react-i18next";
import {
  Home,
  Route as RouteIcon,
  AlertTriangle,
  Users,
  MoreHorizontal,
} from "lucide-react";
import fb from "@/lib/feedback";

// Tab roots
import DashboardMap from "./DashboardMap";
import RouteToday from "./RouteToday";
import SupervisorIncidents from "./SupervisorIncidents";
import CheckInOut from "./CheckInOut";
import More from "./More";

// Pushed detail screens (vehicle-patrol flow)
import RouteExecution from "./RouteExecution";
import StopCheck from "./StopCheck";
import SupervisorClockIn from "./SupervisorClockIn";

// Existing secondary screens (reachable from More / detail pushes)
import ShiftSchedule from "./ShiftSchedule";
import Reports from "./Reports";
import UniformInspection from "./UniformInspection";
import Profile from "../shared/Profile";

/**
 * Supervisor app root — the bottom-tab shell for the vehicle-patrol supervisor.
 * Five tab roots (Inicio / Ruta / Novedades / Equipo / Más) plus the pushed
 * detail routes for executing a route, checking a stop, and clocking in.
 */
export default function SupervisorApp() {
  const { t } = useTranslation();
  return (
    <IonTabs onIonTabsDidChange={() => fb.select()}>
      <IonRouterOutlet animated>
        {/* Tab roots */}
        <Route exact path="/supervisor/dashboard" component={DashboardMap} />
        <Route exact path="/supervisor/route" component={RouteToday} />
        <Route exact path="/supervisor/incidents" component={SupervisorIncidents} />
        <Route exact path="/supervisor/checkin" component={CheckInOut} />
        <Route exact path="/supervisor/more" component={More} />

        {/* Pushed detail routes (vehicle-patrol flow) */}
        <Route exact path="/supervisor/route/:routeId" component={RouteExecution} />
        <Route
          exact
          path="/supervisor/route/:routeId/stop/:pointId"
          component={StopCheck}
        />
        <Route exact path="/supervisor/clock-in" component={SupervisorClockIn} />

        {/* Existing secondary screens */}
        <Route exact path="/supervisor/schedule" component={ShiftSchedule} />
        <Route exact path="/supervisor/reports" component={Reports} />
        <Route exact path="/supervisor/uniform" component={UniformInspection} />
        <Route exact path="/supervisor/profile" component={Profile} />

        <Route exact path="/supervisor">
          <Redirect to="/supervisor/dashboard" />
        </Route>
        <Route>
          <Redirect to="/supervisor/dashboard" />
        </Route>
      </IonRouterOutlet>

      <IonTabBar slot="bottom">
        <IonTabButton tab="dashboard" href="/supervisor/dashboard">
          <Home size={22} />
          <IonLabel>{t("nav.home")}</IonLabel>
        </IonTabButton>
        <IonTabButton tab="route" href="/supervisor/route">
          <RouteIcon size={22} />
          <IonLabel>{t("nav.route")}</IonLabel>
        </IonTabButton>
        <IonTabButton tab="incidents" href="/supervisor/incidents">
          <AlertTriangle size={22} />
          <IonLabel>{t("nav.incidents")}</IonLabel>
        </IonTabButton>
        <IonTabButton tab="checkin" href="/supervisor/checkin">
          <Users size={22} />
          <IonLabel>{t("nav.team")}</IonLabel>
        </IonTabButton>
        <IonTabButton tab="more" href="/supervisor/more">
          <MoreHorizontal size={22} />
          <IonLabel>{t("nav.more")}</IonLabel>
        </IonTabButton>
      </IonTabBar>
    </IonTabs>
  );
}
