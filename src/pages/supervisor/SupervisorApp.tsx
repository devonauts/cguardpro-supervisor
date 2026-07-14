import { useEffect, useState } from "react";
import { Redirect, Route, useHistory } from "react-router-dom";
import { IonTabs, IonRouterOutlet, IonModal } from "@ionic/react";
import { RadioProvider } from "@/context/RadioContext";
import { onPush } from "@/lib/pushEvents";
import { routeForNotification } from "@/components/NotificationCenter";
import { SUPERVISOR_ROLE } from "@/lib/roles";
import { TabBar } from "@/components/shared/TabBar";
import { SideMenu } from "@/components/shared/SideMenu";
import { FloatingFabs } from "@/components/shared/FloatingFabs";
import fb from "@/lib/feedback";
import { useAsync } from "@/lib/useAsync";
import { incidentService } from "@/lib/services";
import { normalizeStatus } from "@/lib/normalize";

// Tab roots
import DashboardMap from "./DashboardMap";
import StationsList from "./StationsList";
import StationDetail from "./StationDetail";
import CreateTask from "./CreateTask";
import StationInspection from "./StationInspection";
import IncidentDetail from "./IncidentDetail";
import Notifications from "./Notifications";
import SupervisorVisitors from "./SupervisorVisitors";
import VisitorDetail from "./VisitorDetail";
import GuardsList from "./GuardsList";
import GuardDetail from "./GuardDetail";
import SupervisorIncidents from "./SupervisorIncidents";
import SupervisorRadio from "./SupervisorRadio";
import RadioCheckAlert from "@/components/RadioCheckAlert";
import IncomingPassdownGate from "@/components/IncomingPassdownGate";
import Emergency from "./Emergency";
import SupervisorMessages from "./SupervisorMessages";
import SupervisorThread from "./SupervisorThread";
import Profile from "../shared/Profile";
import GuardPermissions from "../guard/GuardPermissions";

// Route / patrullaje flow (still reachable via deep links + Más, not tabbed)
import RouteToday from "./RouteToday";
import RouteExecution from "./RouteExecution";
import StopCheck from "./StopCheck";
import RoutePrep from "./RoutePrep";
import RouteTimeline from "./RouteTimeline";
import RouteMissionStop from "./RouteMissionStop";
import RouteArrival from "./RouteArrival";
import RouteSummary from "./RouteSummary";
import SupervisorClockIn from "./SupervisorClockIn";
import CheckInOut from "./CheckInOut";
import More from "./More";

// Secondary screens (reachable from Más / detail pushes)
import ShiftSchedule from "./ShiftSchedule";
import Reports from "./Reports";
import SupervisorAttendance from "./SupervisorAttendance";
import UniformInspection from "./UniformInspection";

/**
 * Supervisor app root — the bottom-tab shell. Five tabs matching the product
 * design: Dashboard (stations map) · Guards (roster monitor) · Radio (PTT) ·
 * Incidents · Profile. The vehicle-patrol route flow keeps its routes registered
 * (reachable via Más / deep links) but is no longer a primary tab.
 */
/**
 * Radio as a route: present the SAME dismissable bottom sheet the FAB uses
 * (swipe-down handle) instead of a full-screen page, so deep-links / navigation
 * to /supervisor/radio can be swiped away like an iOS sheet. Leaving the sheet
 * pops back to wherever the user came from.
 */
function RadioSheetRoute() {
  const history = useHistory();
  const [open, setOpen] = useState(true);
  const leave = () => {
    if (history.length > 1) history.goBack();
    else history.replace("/supervisor/dashboard");
  };
  return (
    <IonModal isOpen={open} onDidDismiss={leave} breakpoints={[0, 1]} initialBreakpoint={1} handle>
      {open && <SupervisorRadio onClose={() => setOpen(false)} />}
    </IonModal>
  );
}

export default function SupervisorApp() {
  const history = useHistory();

  // Deep-link on notification TAP (system-tray push while backgrounded/killed):
  // land the supervisor on the relevant screen — an SOS/incident push opens the
  // incident DETAIL (which loads by id + can Resolve), a route push the route,
  // etc. Mirrors the guard shell, which previously had this and the supervisor
  // didn't (so supervisor taps just opened the app on the dashboard).
  useEffect(() => {
    return onPush((d: any) => {
      if (!d || d._tapped !== "1") return;
      // Explicit backend-provided route wins; else derive from the event type.
      const explicit = typeof d.route === "string" && d.route.startsWith("/supervisor/") ? d.route : null;
      const route = explicit || routeForNotification(
        { id: "", type: d.type, title: "", body: "", data: d, read: false, createdAt: "" } as any,
        SUPERVISOR_ROLE as any,
      );
      if (route) { try { fb.tap(); } catch { /* ignore */ } history.push(route); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open-incident badge for the Incidents tab (best-effort; no badge on error).
  const { data: openIncidents } = useAsync(async () => {
    try {
      const res: any = await incidentService.list({ limit: 100 });
      const rows = res?.rows ?? res ?? [];
      return (Array.isArray(rows) ? rows : []).filter(
        (i: any) => normalizeStatus(i.status) === "open",
      ).length;
    } catch {
      return 0;
    }
  }, []);

  return (
    <RadioProvider>
    <SideMenu />
    <IonTabs onIonTabsDidChange={() => fb.select()}>
      <IonRouterOutlet id="main-content" animated>
        {/* Tab roots */}
        <Route exact path="/supervisor/dashboard" component={DashboardMap} />
        <Route exact path="/supervisor/stations" component={StationsList} />
        <Route exact path="/supervisor/stations/:stationId/tasks/new" component={CreateTask} />
        <Route exact path="/supervisor/stations/:stationId/inspection" component={StationInspection} />
        <Route exact path="/supervisor/stations/:stationId" component={StationDetail} />
        <Route exact path="/supervisor/guards" component={GuardsList} />
        <Route exact path="/supervisor/guards/:guardId" component={GuardDetail} />
        <Route exact path="/supervisor/radio" component={RadioSheetRoute} />
        <Route exact path="/supervisor/emergency" component={Emergency} />
        <Route exact path="/supervisor/incidents" component={SupervisorIncidents} />
        <Route exact path="/supervisor/incidents/:incidentId" component={IncidentDetail} />
        <Route exact path="/supervisor/profile" component={Profile} />
        <Route exact path="/supervisor/permissions" component={GuardPermissions} />

        {/* Vehicle-patrol route flow (not tabbed) */}
        <Route exact path="/supervisor/route" component={RouteToday} />
        {/* Multi-step mission flow (slide-to-start → prep → timeline → stops) */}
        <Route exact path="/supervisor/route/:routeId/prep" component={RoutePrep} />
        <Route exact path="/supervisor/route/:routeId/timeline" component={RouteTimeline} />
        <Route exact path="/supervisor/route/:routeId/summary" component={RouteSummary} />
        <Route exact path="/supervisor/route/:routeId/mission/:index/arrive" component={RouteArrival} />
        <Route exact path="/supervisor/route/:routeId/mission/:index" component={RouteMissionStop} />
        <Route exact path="/supervisor/route/:routeId" component={RouteExecution} />
        <Route
          exact
          path="/supervisor/route/:routeId/stop/:pointId"
          component={StopCheck}
        />
        <Route exact path="/supervisor/clock-in" component={SupervisorClockIn} />
        <Route exact path="/supervisor/checkin" component={CheckInOut} />
        <Route exact path="/supervisor/more" component={More} />
        <Route exact path="/supervisor/notifications" component={Notifications} />
        <Route exact path="/supervisor/messages" component={SupervisorMessages} />
        <Route exact path="/supervisor/messages/:conversationId" component={SupervisorThread} />
        <Route exact path="/supervisor/visitors" component={SupervisorVisitors} />
        <Route exact path="/supervisor/visitors/:visitorId" component={VisitorDetail} />

        {/* Secondary screens */}
        <Route exact path="/supervisor/schedule" component={ShiftSchedule} />
        <Route exact path="/supervisor/reports" component={Reports} />
        <Route exact path="/supervisor/attendance" component={SupervisorAttendance} />
        <Route exact path="/supervisor/uniform" component={UniformInspection} />

        <Route exact path="/supervisor">
          <Redirect to="/supervisor/dashboard" />
        </Route>
        <Route>
          <Redirect to="/supervisor/dashboard" />
        </Route>
      </IonRouterOutlet>

      <TabBar openIncidents={openIncidents || 0} />
    </IonTabs>
    <FloatingFabs />
    {/* Global pase-de-novedades popup (push + poll fallback) — same as the worker
        app; without this the supervisor never sees the roll-call response screen. */}
    <RadioCheckAlert />
    {/* Pase de turno left by the previous supervisor — shown once on entry. */}
    <IncomingPassdownGate />
    </RadioProvider>
  );
}
