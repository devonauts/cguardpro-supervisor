import { api, tenantPath, asRows, unwrap } from "./api";

/**
 * Supervisor vehicle-patrol route service — wraps the backend
 * `/supervisor/me/routes` + clock endpoints. These are thin wrappers around the
 * shared api client (JWT + tenant scope handled there). The feature agents wire
 * the returned shapes into the screens.
 */
export const supervisorRoute = {
  /** Today's assigned route(s) for the signed-in supervisor. */
  today: () =>
    api.get(tenantPath("/supervisor/me/routes/today")).then((r) => asRows(r)),

  /** Full detail of one route (stops/points, tasks, progress). */
  routeDetail: (id: string) =>
    api.get(tenantPath(`/supervisor/me/routes/${id}`)).then(unwrap),

  /** Start executing a route. */
  start: (routeId: string) =>
    api.post(tenantPath(`/supervisor/me/routes/${routeId}/start`)).then(unwrap),

  /** Record arrival/check at a stop (proof photo, tasks, notes in body). */
  checkStop: (routeId: string, pointId: string, body?: unknown) =>
    api
      .post(
        tenantPath(`/supervisor/me/routes/${routeId}/stops/${pointId}/check`),
        body
      )
      .then(unwrap),

  /** Finish the route (summary/report in body). */
  finish: (routeId: string, body?: unknown) =>
    api
      .post(tenantPath(`/supervisor/me/routes/${routeId}/finish`), body)
      .then(unwrap),

  /** Live station monitor for the dashboard map (pins + status summary). */
  stations: () =>
    api.get(tenantPath("/supervisor/me/stations")).then(unwrap),

  /** Rich station roster for the Stations list screen. */
  stationsList: () =>
    api.get(tenantPath("/supervisor/me/stations/list")).then(unwrap),

  /** Full detail for one station (hero + map + guards + info). */
  stationDetail: (id: string) =>
    api.get(tenantPath(`/supervisor/me/stations/${id}`)).then(unwrap),

  /** Create a task for a station (Station Details → Add Task). */
  createStationTask: (stationId: string, body: Record<string, any>) =>
    api.post(tenantPath(`/supervisor/me/stations/${stationId}/tasks`), { data: body }).then(unwrap),

  /** Submit a station inspection (Station Details → Start Inspection). */
  createInspection: (stationId: string, body: Record<string, any>) =>
    api.post(tenantPath(`/supervisor/me/stations/${stationId}/inspection`), { data: body }).then(unwrap),

  /** Recent inspections for a station. */
  inspections: (stationId: string) =>
    api.get(tenantPath(`/supervisor/me/stations/${stationId}/inspections`)).then(unwrap),

  /** Radio channels (live PTT presence) for the Radio screen. */
  radioChannels: () =>
    api.get(tenantPath("/supervisor/me/radio/channels")).then(unwrap),

  /** Emergency contacts (dispatch, supervisor, on-duty guards) for the SOS screen. */
  emergency: () =>
    api.get(tenantPath("/supervisor/me/emergency")).then(unwrap),

  /** Reports/analytics overview (stats + daily series + guard perf + checkpoints). */
  reports: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return api.get(tenantPath(`/supervisor/me/reports${qs}`)).then(unwrap);
  },

  /** Real-time visitors across the tenant's stations + status counts. */
  visitors: () =>
    api.get(tenantPath("/supervisor/me/visitors")).then(unwrap),

  /** Full visitor detail (hero + visit/vehicle info + timeline + documents). */
  visitorDetail: (id: string) =>
    api.get(tenantPath(`/supervisor/me/visitors/${id}`)).then(unwrap),

  /** Check a visitor out. */
  visitorCheckout: (id: string) =>
    api.post(tenantPath(`/supervisor/me/visitors/${id}/checkout`), {}).then(unwrap),

  /** Image-forward incidents list + status/severity summaries. */
  incidents: () =>
    api.get(tenantPath("/supervisor/me/incidents")).then(unwrap),

  /** Full incident detail (hero + timeline + evidence + summary). */
  incidentDetail: (id: string) =>
    api.get(tenantPath(`/supervisor/me/incidents/${id}`)).then(unwrap),

  /** Incident actions. */
  incidentNote: (id: string, text: string) =>
    api.post(tenantPath(`/supervisor/me/incidents/${id}/note`), { data: { text } }).then(unwrap),
  incidentStatus: (id: string, status: string) =>
    api.post(tenantPath(`/supervisor/me/incidents/${id}/status`), { data: { status } }).then(unwrap),
  incidentAssign: (id: string, userId: string, name?: string) =>
    api.post(tenantPath(`/supervisor/me/incidents/${id}/assign`), { data: { userId, name } }).then(unwrap),
  incidentEscalate: (id: string) =>
    api.post(tenantPath(`/supervisor/me/incidents/${id}/escalate`), {}).then(unwrap),

  /** Guard roster + live telemetry for the Guards screen. */
  guards: () =>
    api.get(tenantPath("/supervisor/me/guards")).then(unwrap),

  /** Full detail for one guard (profile + patrol + activity timeline). */
  guardDetail: (id: string) =>
    api.get(tenantPath(`/supervisor/me/guards/${id}`)).then(unwrap),

  /** Current clock status for the supervisor (on/off duty). */
  clockStatus: () =>
    api.get(tenantPath("/supervisor/me/clock")).then(unwrap),

  /** The supervisor's OWN upcoming turno windows (their shift, not guards'). */
  schedule: () =>
    api.get(tenantPath("/supervisor/me/schedule")).then(unwrap),

  /** Acknowledge an incident dispatched to me: accepted | enRoute | onScene. */
  respondDispatch: (incidentId: string, status: "accepted" | "enRoute" | "onScene") =>
    api.post(tenantPath(`/supervisor/me/incidents/${incidentId}/respond`), { status }).then(unwrap),

  /** Clock in (selfie/vehicle/geo in body). */
  clockIn: (body?: unknown) =>
    api.post(tenantPath("/supervisor/me/clock-in"), body).then(unwrap),

  /** Clock out (report/geo in body). */
  clockOut: (body?: unknown) =>
    api.post(tenantPath("/supervisor/me/clock-out"), body).then(unwrap),
};

/**
 * Whether a `/supervisor/me/clock` payload means the supervisor is on duty.
 * Tolerant of payload shapes (backend returns `{ clockedIn, shift }`).
 */
export function isSupervisorClockedIn(s: any): boolean {
  if (!s) return false;
  return Boolean(
    s.clockedIn ??
      s.onDuty ??
      s.isOnDuty ??
      s.active ??
      s.shift ??
      s.clockInAt ??
      s.clockedInAt ??
      s.startedAt,
  );
}

export default supervisorRoute;
