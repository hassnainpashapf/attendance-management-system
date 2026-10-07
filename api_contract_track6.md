# Track 6 — HR rules engine API additions

Companion to `API_CONTRACT.md` (which is NOT modified by this track). All
functions below live in `codesections/track6.gs` and are dispatched through
the existing `__api` dispatcher, so frontend calls `API.call('getRules')`
exactly like every other API function. Transport, auth and audit rules from
the main contract apply unchanged.

## Backend API

### `getRules(user)` — read the rule catalog (admin, HR)
- Visible to roles `admin` and `hr` (`superadmin` passes through). All other
  roles get `Permission denied`.
- Idempotently seeds the `rules` tab via `seedTrack6Tabs_(ss)` before reading.
- Returns an array of rule objects, one per known key:
  `{key, value, valueType, group, description, settingsBacked, source, options?}`
  - `value` is the EFFECTIVE value: rules-tab row first, then (for the four
    payroll keys) the tenant `settings` tab value stored by track 2, then the
    built-in default.
  - `valueType` is one of `int | float | bool | string | time` and the value
    is already coerced to that type (bool comes back as a real boolean).
  - `source` is `rule` (a rule row exists), `settings` (value came from the
    Settings fallback) or `default` (built-in default).
  - `options` is present only for `outOfZonePolicy`: `['flag', 'block']`.

### `saveRule(user, key, value)` — change one rule (admin only)
- `requireUser_` + role check: only `admin` (and `superadmin`) may save;
  everyone else gets `Permission denied: only admins can change HR rules`.
- Unknown `key` → error `Unknown rule key: <key>`.
- Validation before writing:
  - `int`/`float`: must parse as a number and lie within the key's `[min, max]`
    range (e.g. `duplicatePunchWindowMinutes` 0–60, `probationDays` 0–3650,
    `overtimeRateMultiplier` 0–10).
  - `time`: must match 24-hour `HH:MM` (`autoAbsentCutoffTime`).
  - `string` with options: must be one of the options (`outOfZonePolicy`).
- Upserts into the `rules` tab (keyed update by row, no duplicate rows);
  `updatedAt` is written as a plain ISO string (`nowStr_()`), never a Date.
- Writes an auditLog row (`saveRule`, `<key> = <value>`).
- Returns `{key, value, valueType}` with the coerced, stored value.

### Internal helpers (not API functions)
- `getRule_(ss, key, defaultValue)`: typed reader for rule-driven backend
  code. Resolution order: rules tab row → Settings tab (only for the four
  payroll keys owned by track 2) → default. Coerces by `valueType`.
- `coerceRule_(v, type)`, `t6validate_(meta, value)`, `t6meta_(key)`,
  `seedTrack6Tabs_(ss)` (idempotent).

## New tenant tab

`rules(key, value, valueType, description, updatedAt)` — registered on `SHEETS`
and `TENANT_TABS` at load time inside the track 6 section, so new tenants get
the tab via the untouched `setupTenantSS()`; `getRules`/`saveRule`/`getRule_`
also seed defensively. Backend rows remain keyed by `tenantId` everywhere
(this tab is per-tenant and keyed by rule `key`).

Seeded rules (all non-Settings-backed keys):

| key | type | default | notes |
|-----|------|---------|-------|
| duplicatePunchWindowMinutes | int | 5 | drives the punch/devicePunch duplicate guard (patches_track6.md #1–2) |
| lateGraceMinutes | int | 15 | Settings-backed; default shift grace (patch #3) |
| lateThresholdMinutes | int | 10 | no existing call site yet — for late marking |
| autoAbsentCutoffTime | time | 10:00 | no auto-absent logic yet — for the absentee sweep |
| outOfZonePolicy | string | flag | `flag` \| `block` — patch #4 |
| overtimeAutoEligible | bool | true | for overtime eligibility checks |
| probationDays | int | 90 | for leave eligibility checks |
| absentDeductionPerDay | float | 30 | Settings-backed (track 2) |
| latePenaltyMinutes | float | 60 | Settings-backed (track 2) |
| overtimeRateMultiplier | float | 1.5 | Settings-backed (track 2) |

Note: the effective defaults for the four Settings-backed keys match track 2's
seeded Settings values (`30`, `15`, `60`, `1.5`); the built-in `def` in the
catalog is a last-resort fallback only.

## Frontend (`src/js/170_rules.js`, new file only)

- Admin-only page `#/rules` (nav group `SYSTEM`, registered at runtime via
  `App.nav.push` + `App.routes` — no existing file touched).
- Groups rules under Attendance / Payroll cards; each row shows the key, its
  description, a source badge (Rule / Settings / Default) and a typed editor
  (number, checkbox, time, or select).
- Non-admin users (e.g. HR) see the page read-only with a view-only notice;
  the Save button is enabled only when a value changed and saves changed
  rows one by one through `saveRule`.
- New i18n keys `t6.*` (`Object.assign(I18N.dict.en / I18N.dict.ur)` in the
  same file; the `window.I18N` shim from track 5 is re-declared defensively).

## Notes for other tracks / build

- `02_mock.js` was intentionally NOT touched (Track 6 rule). Until `MockAPI`
  gains `getRules` and `saveRule`, `build.py`'s "every API.call fn must exist
  in MockAPI" sanity check will flag these two names in local mock mode; in
  production (Apps Script) they resolve through the real dispatcher. The
  `#/rules` page shows a friendly `t6.loadFail` banner in mock mode.
- Rule-driven patches for the existing hardcoded values are listed in
  `patches_track6.md` (coordinator applies); this track does not change
  `punch`, `devicePunch`, `saveShift` or `attendanceSummary` behaviour itself.
