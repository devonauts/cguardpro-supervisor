// Roles allowed to use the supervisor app. SUPERVISORS ONLY — guards use the
// worker app, admins use the CRM. The backend also enforces this
// (app:'supervisor' only accepts securitySupervisor); this is the client mirror.
export const GUARD_ROLE = "securityGuard";
export const SUPERVISOR_ROLE = "securitySupervisor";

export const ALLOWED_ROLES = [SUPERVISOR_ROLE] as const;
export type WorkerRole = (typeof ALLOWED_ROLES)[number];

const normalize = (r: any): string => {
  if (!r) return "";
  if (typeof r === "string") return r;
  return r.name || r.key || r.slug || r.id || "";
};

/** Collect every role string attached to a user, across global + tenant scope. */
export function collectRoles(user: any): string[] {
  if (!user) return [];
  const out: string[] = [];
  const push = (raw: any) => {
    if (Array.isArray(raw)) raw.forEach((r) => out.push(normalize(r)));
    else if (raw) out.push(normalize(raw));
  };
  push(user.roles ?? user.role);
  if (Array.isArray(user.tenants)) {
    user.tenants.forEach((t: any) => push(t.roles ?? t.role));
  }
  if (user.tenant) push(user.tenant.roles ?? user.tenant.role);
  return out.filter(Boolean);
}

/** Whether the user holds any role permitted in this app. */
export function hasAllowedRole(user: any): boolean {
  const roles = collectRoles(user);
  return roles.some((r) => (ALLOWED_ROLES as readonly string[]).includes(r));
}

/** Resolve the effective role for this app. Supervisors only — the guard
 *  branch was dead code (ALLOWED_ROLES excludes guards; app:'supervisor'
 *  rejects them server-side) and broke the WorkerRole type / the build. */
export function resolveWorkerRole(user: any): WorkerRole | null {
  const roles = collectRoles(user);
  if (roles.includes(SUPERVISOR_ROLE)) return SUPERVISOR_ROLE;
  return null;
}

/** First tenant id found on the user object. */
export function resolveTenantId(user: any): string | null {
  if (!user || !Array.isArray(user.tenants) || user.tenants.length === 0)
    return null;
  const t = user.tenants[0];
  return t.tenantId || (t.tenant && (t.tenant.id || t.tenant.tenantId)) || null;
}
