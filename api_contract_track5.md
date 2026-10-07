# Track 5 — Geofence auto-punch API additions

Companion to `API_CONTRACT.md` (which is NOT modified by this track). All
functions below live in the `/* ===== TRACK 5: geofence auto-punch ===== */`
section of `Code.gs` and are dispatched through the existing `__api`
dispatcher, so frontend calls `API.call('geofencePunch', payload)` etc. exactly
like every other API function. Transport, auth and audit rules from the main
contract apply unchanged.

## New backend APIs

### `geofencePunch(user, payload)` — native Android entry point
`payload`: `{employeeId, type, lat, lng, deviceId}` where `type` is
`'in'` or `'out'` (the `'break-in'` / `'break-out'` types are also accepted,
same as manual punch).

- Delegates to the existing `API.punch(user, employeeId, type, lat, lng, '', deviceId, 'geofence-auto')`.
- The existing duplicate-punch guard applies: same employee + type within
  5 minutes → error `Duplicate punch: a "<type>" punch was already recorded at <time>`.
- Device binding applies: if the employee has a bound `deviceId` and the
  call's `deviceId` differs → error `This device is not registered for <name>`.
- Selfie is skipped for auto punches (empty string is stored).
- The geofence distance check still runs: `distanceM` and `outOfZone`
  (`distanceM > site.radiusM`) are computed against the employee's assigned
  sites (or every active site when none are assigned) and stored on the
  attendance row, exactly like a manual punch.
- Per-employee toggle: when `autoPunch` is OFF for the employee the call is
  rejected with error `auto-punch disabled` before anything is recorded.
- Returns the same shape as `punch`: `{punch, site, outOfZone}` where the
  punch row carries `source: 'geofence-auto'`.
- Writes an auditLog row (via `punch`).

### `setAutoPunch(user, employeeId, on)` — "Automatic attendance" toggle
- Stores the flag in the new `employeeFlags` tab
  (`employeeId, autoPunch, updatedAt`).
- The employee role may toggle only their own record; `admin` / `hr` need
  `employees_manage` for anyone.
- Returns `{employeeId, autoPunch}`. Writes an auditLog row.

### `getAutoPunch(user, employeeId?)` — read the toggle
- `employeeId` defaults to the caller's own employee. Employees may read only
  their own record.
- Missing flag row ⇒ `{autoPunch: true}` (default ON for all employees,
  including brand-new ones).

### `getAssignedGeofences(user, employeeId?)` — geofence list for the caller
- Returns `[{siteId, name, lat, lng, radiusM}]` for the employee's assigned
  active sites (sites without coordinates are skipped). When the employee has
  no assignments, every active site with coordinates is returned — the same
  fallback the punch geofence check uses.
- The Android app calls this to refresh geofences without scraping the
  WebView.

## New tenant tab

`employeeFlags(employeeId, autoPunch, updatedAt)` — created by
`seedTrack5Tabs_(ss)` (idempotent: only adds rows for employees missing a
flag, all defaulting ON). Registered on `SHEETS` / `TENANT_TABS` at load time
inside the Track 5 section, so new tenants get the tab via the untouched
`setupTenantSS()`; the track APIs also call the seeder defensively, and the
coordinator may call `seedTrack5Tabs_(ss)` once per existing tenant.

## Frontend (`src/js/165_geofence.js`, new file only)

- `window.AndroidGetPunchConfig()` → **JSON STRING**
  `{token, tenantId, employeeId, autoPunch, deviceId, sites:[{siteId,name,lat,lng,radiusM}]}`.
  The token is read from `Session.user` exactly like `01_api.js` does
  (localStorage `ams_session`, set at login). No selfie or face data is ever
  included. Values are cached on punch-page load and refreshed in the
  background on each call.
- `window.AndroidRefreshPunchConfig(employeeId?)` → Promise resolving to the
  same JSON string after a guaranteed-fresh server round-trip.
- The punch page (`#/punch`) gets an "Automatic attendance" toggle card
  injected via a lazy DOM hook (no edit to `30_punch.js`). The switch calls
  `setAutoPunch` and updates the cached `autoPunch` used by the bridge.
- New i18n keys `t5.*` (`Object.assign(I18N.dict.en / I18N.dict.ur)` in the
  same file; a minimal `window.I18N` shim with `I18N.t()` is defined there
  because no track has introduced I18N yet).

## Notes for other tracks / build

- `02_mock.js` was intentionally NOT touched (Track 5 rule). Until
  `MockAPI` gains `geofencePunch`, `setAutoPunch`, `getAutoPunch` and
  `getAssignedGeofences`, `build.py`'s "every API.call fn must exist in
  MockAPI" sanity check will flag these four names in local mock mode. In
  production (Apps Script) they resolve through the real dispatcher.
- Error strings the app must handle: `auto-punch disabled`, `Duplicate punch:
  ...`, `This device is not registered for ...`, `Session expired — please
  sign in again`.
