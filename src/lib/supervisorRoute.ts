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

  /** Current clock status for the supervisor (on/off duty). */
  clockStatus: () =>
    api.get(tenantPath("/supervisor/me/clock")).then(unwrap),

  /** Clock in (selfie/vehicle/geo in body). */
  clockIn: (body?: unknown) =>
    api.post(tenantPath("/supervisor/me/clock-in"), body).then(unwrap),

  /** Clock out (report/geo in body). */
  clockOut: (body?: unknown) =>
    api.post(tenantPath("/supervisor/me/clock-out"), body).then(unwrap),
};

export default supervisorRoute;
