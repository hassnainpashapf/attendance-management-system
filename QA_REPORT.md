# QA Report — Attendance Management System
**Date:** 2026-10-07 · **QA agent (independent verification)**
**Workspace:** `~/workspace/attendance-saas/` · **Deploy copy:** `~/workspace/your_files/AttendanceSaaS/`

## Overall: ✅ PASS (9/9 checks)

One real functional bug was found during testing (superadmin permissions), fixed, and
re-verified. Details in "Issues found & fixed".

---

## Check 1 — build.py guards — ✅ PASS
Re-ran `python3 build.py` (final run exit 0):
- Branding check OK (no old working name in served script)
- JS syntax OK (18 files, 180964 bytes, `node --check`)
- All 76 `API.call` functions used exist in MockAPI
- Contract coverage OK: all 79 contract functions mocked
- GAS sanitizer check OK (no `://` inside served script)
- All 13 routes registered: `#/attendance #/dashboard #/documents #/employees #/leave #/overtime #/payroll #/punch #/reports #/settings #/shifts #/sites #/tenants`

## Check 2 — Contract cross-check — ✅ PASS
- Distinct `API.call('name', …)` targets in `src/js/*.js`: **76** (all single-quoted form)
- Missing from `Code.gs` `var API = {...}` (line 270, 79 entries): **0**
- Missing from `MockAPI` in `src/js/02_mock.js`: **0**
- Contract functions total: **79** (all mocked; 76 are called by the frontend, 3 are server/admin-only)

## Check 3 — Branding — ✅ PASS
Case-insensitive repo-wide grep for the old working name across
`~/workspace/attendance-saas/` **and** `~/workspace/your_files/AttendanceSaaS/`: **0 hits**
(including inside `build.py` itself — the guard's `'h'+'azri'` concatenation keeps the literal absent, untouched per instructions).

## Check 4 — GAS gotchas — ✅ PASS
- (a) `doGet` (Code.gs:60) uses `HtmlService.createHtmlOutputFromFile('index')`; no `createTemplate*` anywhere.
- (b) No `<base target` in `src/index.html` or `deploy/index.html` (grep count 0).
- (c) No literal `://` in the served script — build.py guard passes; the only URL construction is by concatenation (`'https:'+'/'+'/'`, `00_utils.js:8`; tile URL `'https:'+'//tile…'`).
- (d) `rowsOf_` (used by both `rows_` and `trows_`, Code.gs:93–113) converts `[object Date]` cells to `yyyy-MM-dd` via `Utilities.formatDate`, with a comment explaining the `google.script.run` transport reason.

## Check 5 — Headless load test — ✅ PASS (`qa_harness.js`, 25 assertions)
- Extracted the app's own combined inline `<script>` block from `deploy/index.html` (exactly 1 inline block; CDN `src=` tags excluded).
- Ran it in node `vm` with minimal DOM/window/localStorage/navigator/geolocation stubs + `L` (Leaflet) and `Chart` stub globals.
- `App.boot` / `App.route` verified present and used.
- Booted with no session → login page; logged in as `DEMO/admin/admin123` → shell + dashboard.
- Rendered **all 13 routes** — each produced real content (>300 chars), **zero thrown errors, zero `console.error`**.
- Superadmin login → `#/tenants` renders.

## Check 6 — Punch-flow logic — ✅ PASS (`qa_punch.js`, 15 assertions)
- (a) Haversine (`haversineM` from the real `00_utils.js`): same point → `0`; `0.001°` lat → `111.19 m` (≈111.2 m ✓); `0.001°` lng at lat 31.5 → `94.79 m` (≈95.0 m ✓); null input → null.
- (b) Duplicate guard: rendered `#/punch`, clicked **Check In** → success; clicked again within 5 min → **"Duplicate blocked"** message. Server-side mirror: `MockAPI.punch` twice → second throws duplicate error.
- (c) Offline queue: `navigator.onLine=false` → Check Out lands in `localStorage['ams_queue']` (1 item, not sent to server); `onLine=true` + re-render → queue drains to `[]`, punch synced to server.

## Check 7 — Login matrix — ✅ PASS (`qa_login.js`, 29 assertions)
| Company | User | Pass | Role | Landing | Permissions |
|---|---|---|---|---|---|
| ADMIN | superadmin | admin123 | superadmin | `#/tenants` | `{all:true}` ✓ |
| DEMO | admin | admin123 | admin | `#/dashboard` | 12 modules ✓ |
| DEMO | hr | hr123 | hr | `#/dashboard` | 12 modules ✓ |
| DEMO | employee | emp123 | employee | `#/punch` | 12 modules ✓ |
Negative cases (bad password ×2, unknown company, bad user) all rejected. Tenant binding (`t_demo`) verified for non-superadmins. `perm('tenants','view')` is true for superadmin, false for admin — matching the real backend's superadmin bypass (`can_()` in Code.gs).

## Check 8 — Deliverables — ✅ PASS
- All exist: `Code.gs`, `deploy/index.html`, `build.py`, `DEPLOY.md`, `API_CONTRACT.md`, `src/`.
- `~/workspace/your_files/AttendanceSaaS/` copies byte-identical (`cmp`): `Code.gs`, `index.html`, `DEPLOY.md`.
- DEPLOY.md verified by reading (not just keywords): `setupRegistry`/`seedDemo` steps, demo logins table, company-code login, HTTPS/camera requirement, offline queue behavior, and the honest ZKTeco/ADMS note (ADMS impossible in GAS; `devicePunch` API ready for a future VPS relay).
- Seed credentials cross-checked against `Code.gs`: `ADMIN/superadmin/admin123` (setupRegistry), `DEMO/admin/admin123` (seedDemo→createTenant), `DEMO/hr/hr123`, `DEMO/employee/emp123`.

## Check 9 — Trickiest Code.gs functions vs API_CONTRACT.md — ✅ PASS
- **punch** (L752): type whitelist, active-employee check, self-only rule for employees, device binding (`emp.deviceId` mismatch → throw), dup guard (same employee+type, same day, `|Δmin|<5` → throw), geofence via `siteForPunch_` (nearest assigned site), `outOfZone=true` when no site, audit row. Matches contract.
- **runPayroll** (L1233): `yyyy-MM` validation, duplicate-run guard (non-cancelled), `payroll_manage` perm, approved components only, advance recovery `take=min(amount/installments, amount-recovered)` with 2-dp rounding and `closed` when done, `net=gross-deductions`, writes `payrollRuns` + `payslips`. Matches contract.
- **createTenant** (L351): `requireSuper_`, unique 4-letter login code, `SpreadsheetApp.create` + `setupTenantSS` seed, first admin with SHA-256 password, registry row, returns `{tenantId, loginCode, spreadsheetId, url}`. Matches contract.
- **exportCSV** (L1601): kinds attendance/employees/payroll/leaves, returns `{filename, csv}`; `csvEsc_` quotes fields containing `" , \n \r` and doubles inner quotes (RFC 4180). Matches contract.
- **backupNow** (L1764): `settings_manage` perm, `DriveApp.getFileById(...).makeCopy(name)` of the tenant spreadsheet, returns `{url, name}`, audit row. Matches contract.

---

## Issues found & fixed
1. **Superadmin permissions (real bug, FIXED).** `Code.gs getBootstrap` returns `permissions: {all:true}` for superadmin, but `MockAPI.getBootstrap` fell back to the *employee* permission matrix, and the frontend `perm()` didn't honor the `all` flag at all. Consequence against the real backend: a superadmin would get an **empty sidebar nav** (every item requires `perm(n.perm,'view')`). Fixed minimally:
   - `src/js/01_api.js`: `perm()` now returns `true` when `permissions.all` is set (mirrors the backend's `can_()` superadmin bypass).
   - `src/js/02_mock.js`: `getBootstrap()` returns `{all:true}` for superadmin, mirroring Code.gs.
   - Rebuilt `deploy/index.html` via `build.py` (all guards pass) and re-synced the `your_files` copy (byte-identical).
2. **Test-harness bug (not app code).** `qa_punch.js` initially skipped `App.boot()` after login, so `#view` never rendered and button lookup failed. Fixed in the test; all punch tests pass.

## Notes / non-blocking observations
- `punch` dup guard uses `Math.abs(minsBetween_) < 5` — a punch timestamped slightly in the *future* (clock skew) also blocks. Harmless.
- `createTenant` sets registry `status:'active'` while `MockAPI.createTenant` sets `'trial'`. Cosmetic divergence; contract doesn't specify.
- QA test scripts kept in the workspace for re-runs: `qa_harness.js`, `qa_punch.js`, `qa_login.js` (69 assertions total, 0 failures).
