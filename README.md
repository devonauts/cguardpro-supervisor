# cguardpro-supervisor

CGuardPro **Supervisor** app — field vehicle-patrol (patrullaje vehicular).
Ionic React + Capacitor (iOS/Android), cloned from the worker app. Supervisors log in,
clock in, and drive stop-by-stop routes with per-stop check tasks, proof photos and
native-maps navigation. Backed by the `/tenant/:id/supervisor/me/*` API + the CRM
"Patrulla vehicular" route system.

## Dev
```
npm install
npm run dev        # http://localhost:5174
npm run mobile     # vite build + cap sync (native)
```
Env (`.env`): `VITE_API_URL` (must end /api), `VITE_GOOGLE_MAPS_API_KEY`.
