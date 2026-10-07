# Attendance Management System — API CONTRACT (single source of truth)

Product name (use everywhere, zero exceptions): **Attendance Management System**.
Branding rule: the old working name (any case) must NOT appear in any user-facing text or deliverable.

## Transport
Frontend calls `API.call('fnName', ...args)` → in production this goes through
`google.script.run.__api('fnName', userJson, argsJson)`.
`__api(fn, userJson, argsJson)`: ScriptLock (15s), token validated via
CacheService `tok_<token>` (except `login`), dispatches to `API[fn](user, ...args)`.
Session object cached: `{id,name,username,role,tenantId,spreadsheetId,token}`.
All Dates converted to `yyyy-MM-dd` ISO strings in `rows_()` (google.script.run can't transport Dates).

## Login
Login form fields: **Company code** + username + password.
- `login(companyCode, username, password)` → `{user, token}`. Superadmin: company code `ADMIN`
  (checked against registry `saasUsers`); everyone else: tenant looked up by code
  (case-insensitive) in registry `tenants`, then `users` tab of that tenant's spreadsheet.
- Demo: superadmin=`ADMIN`/superadmin/admin123 · tenant `DEMO`: admin/admin123, hr/hr123, employee/emp123.

## API functions (Code.gs `API` object, frontend `API.call('name', ...)`, frontend `MockAPI.name(...)`)
Auth: login, getBootstrap, impersonate, stopImpersonation
Superadmin: listTenants, createTenant, updateTenant, deleteTenant, getTenantStats, getPlatformStats
Employees: listEmployees, saveEmployee, deleteEmployee, importEmployeesCSV, listDepartments, saveDepartment, deleteDepartment, bindDevice, unbindDevice, enrollFace, getFaceEnrollment, resetFaceEnrollment
Sites: listSites, saveSite, deleteSite, assignSiteEmployees
Shifts: listShifts, saveShift, deleteShift, listRosters, saveRoster, deleteRoster
Attendance: punch, devicePunch, listAttendance, bulkMark, deletePunch, getLiveMap, requestCorrection, listCorrections, decideCorrection, punchWithFace, geofencePunch, setAutoPunch, getAutoPunch, getAssignedGeofences
Leave: listLeaveTypes, saveLeaveType, deleteLeaveType, getLeaveBalances, requestLeave, listLeaveRequests, decideLeave, listHolidays, saveHoliday, deleteHoliday
Overtime: listOvertime, requestOvertime, decideOvertime
Payroll: listPayComponents, savePayComponent, deletePayComponent, runPayroll, listPayrollRuns, getPayslip, markPayslipPaid, listAdvances, grantAdvance, finalSettlement, listContractors, saveContractor, deleteContractor, listContractorBills, saveContractorBill, decideContractorBill, deleteContractorBill, computeMonthlySalary, generateMonthlySalaries, listSalaryStructures, saveSalaryStructure, listPayslips, getSalaryPayslip
Documents: listDocuments, saveDocument, deleteDocument, getExpiringDocuments
Reports: attendanceSummary, exportCSV, getDashboard
Settings: getSettings, saveSettings, backupNow, listRolePermissions, saveRolePermissions, sendAlert, runAlertChecks, checkAbsences, alertLeaveDecision, listMessageLog, resendAlert, testAlert, getRules, saveRule

## Key behaviors (backend must implement)
- `punch(employeeId, type, lat, lng, selfie, deviceId, source)`: haversine distance to each of the
  employee's assigned sites (or any active site if none assigned); nearest site wins; `distanceM`,
  `outOfZone = distanceM > site.radiusM`; duplicate guard: same employee+type within 5 min → error;
  device binding: if employee.deviceId set and differs → error; returns punch + site + outOfZone.
- `devicePunch(deviceId, employeeId, type, ts)`: same as punch without GPS (lat/lng null, source='zkteco').
- `runPayroll(month, employeeIds)`: gross = salary + sum(approved allowances); deductions = sum(approved
  deductions) + advance installment (advance.amount/installments, mark recovered, status closed when done);
  net = gross - deductions; writes payrollRuns + payslips rows.
- `exportCSV(kind, filters)` returns `{filename, csv}`; kinds: attendance, employees, payroll, leaves.
- `backupNow()` → DriveApp copy of tenant spreadsheet, returns `{url, name}`.
- `createTenant(companyName, plan, adminName, adminUser, adminPass)`: SpreadsheetApp.create →
  seed all tenant tabs → create admin user → register in registry tenants (loginCode derived).
  Returns `{tenantId, loginCode, spreadsheetId, url}` (note: no `companyName`, no `id`).
- Tenant identifier contract (2026-10-07 fix): the registry `tenants` tab has NO `id` column —
  the identifier key is **`tenantId`** everywhere. `listTenants()` returns rows keyed by `tenantId`;
  `impersonate(tenantId)`, `updateTenant(tenantId, fields)`, `deleteTenant(tenantId)` match on
  `x.tenantId === tenantId` and throw `Tenant not found` otherwise. Frontend and MockAPI must
  use `t.tenantId`, never `t.id`, for tenant rows.
- `getTenantStats(tenantId)` is PER-TENANT (requires a tenantId; throws `Tenant not found` without
  a match) → `{tenant, employees, users, sites, punchesToday, pendingLeaves, pendingCorrections, openAdvances}`.
- `getPlatformStats()` (no args, superadmin) is the platform-wide rollup for the Tenants page stat
  cards → `{tenants, active, trial, totalEmployees, totalPunches}`. The Tenants page must call
  `getPlatformStats`, never bare `getTenantStats()`.
- Every mutating fn writes an auditLog row.

## Tenant tabs (SHEETS map)
tenants(registry): tenantId,companyName,loginCode,spreadsheetId,plan,status,createdAt
saasUsers(registry): id,name,username,passwordHash,role,active
users: id,name,username,passwordHash,role,employeeId,active
rolePermissions: role,matrix
employees: id,name,code,departmentId,phone,email,salary,joinDate,deviceId,active
departments: id,name
sites: id,name,address,lat,lng,radiusM,active
siteEmployees: siteId,employeeId
shifts: id,name,startTime,endTime,graceMin
rosters: id,date,employeeId,shiftId,siteId
attendance: id,employeeId,date,type,time,lat,lng,selfie,siteId,distanceM,outOfZone,source,deviceId,syncedAt,note
corrections: id,punchId,employeeId,note,status,decidedBy,decidedAt
leaveTypes: id,name,quota,paid
leaveBalances: employeeId,year,typeId,used
leaveRequests: id,employeeId,typeId,from,to,days,reason,status,decidedBy
holidays: id,date,name
overtime: id,employeeId,date,hours,rate,reason,status,approvedBy
payComponents: id,name,kind,amount,appliesTo,approved
payrollRuns: id,month,createdAt,createdBy,status
payslips: id,runId,employeeId,salary,allowances,deductions,advanceRecovery,net,paid
advances: id,employeeId,date,amount,installments,recovered,status
contractors: id,name,company,phone,rate,active
contractorBills: id,contractorId,month,amount,status,note
documents: id,employeeId,title,expiryDate
settings: key,value
auditLog: id,at,userId,action,detail

## Frontend routes (hash)
#/dashboard #/punch #/employees #/sites #/shifts #/attendance #/leave #/overtime #/payroll #/documents #/reports #/settings #/tenants (superadmin only)

## GAS gotchas (blocking)
1. No literal '//' inside any JS string in served script (build.py rejects; use 'https:'+'//...' concat).
2. Dates → ISO strings in rows_().
3. doGet → HtmlService.createHtmlOutputFromFile('index'), never templates.
4. No '<base target=_top>' tag.

---

# Phase 2 addenda (2026-10-07)

## Track 1
# Attendance Management System — API CONTRACT ADDENDUM (TRACK 1: face check-in)

Coordinator: merge into API_CONTRACT.md. Product name rule and `tenantId` keying
contract from the base contract apply unchanged.

## New backend API functions (Code.gs, `API` object — registered via the
`/* ===== TRACK 1: face check-in ===== */` section in `codesections/track1.gs`)

- `enrollFace(employeeId, descriptor)` → `{employeeId, enrolledAt, updatedAt}`.
  `descriptor` is a 128-element array of finite numbers (JSON transport keeps it
  an array). Upserts into the `faceEnrollments` tab keyed by `employeeId`;
  re-enroll overwrites, keeps the original `enrolledAt`, bumps `updatedAt`.
  Throws `Employee not found` / `Invalid face descriptor (need 128 finite numbers)`.
  Requires `employees_manage`. Writes an auditLog row (`enrollFace`).
- `getFaceEnrollment(employeeId)` → `{employeeId, enrolled}` when none, else
  `{employeeId, enrolled:true, enrolledAt, updatedAt, descriptor}`.
  The enrolled descriptor IS returned so the device can match on-device.
  Employee/user roles are scoped to their own record (`selfOnly_`, same as
  `listEmployees`); other roles need only be logged in. Read-only, no audit row.
- `resetFaceEnrollment(employeeId)` → `{ok:true, employeeId}`. Deletes the
  enrollment row. Throws `Employee not found`. Requires `employees_manage`.
  Writes an auditLog row (`resetFaceEnrollment`).
- `punchWithFace(employeeId, type, lat, lng, selfie, deviceId, source, faceVerified, matchScore)`
  → identical to `punch(...)` plus `punch.faceVerified` (boolean, or `null` when
  no face check ran) and `punch.matchScore` (0–1 number, or `null`).
  Implementation: calls `API.punch` first (all existing guards — duplicate,
  device binding, geofence — behave exactly as before), then writes the two
  face columns onto the new attendance row. `faceVerified`/`matchScore` are
  optional; omitting them produces a record identical to a plain `punch()`.
  Writes an auditLog row (`punchFace`). Face-column write failures never fail
  the punch.

## New tenant tab (created by `seedTrack1Tabs_(ss)`, wired by the coordinator)

- `faceEnrollments`: `employeeId, descriptorJson, enrolledAt, updatedAt`
  (`descriptorJson` = JSON string of the averaged 128-d descriptor).

## Extended tab

- `attendance` gains two OPTIONAL trailing columns: `faceVerified`, `matchScore`.
  Existing rows/punches are unaffected; `punchWithFace` adds the header columns
  to already-seeded sheets via `ensureFaceCols_` (safe when the sheet grid is
  full-width). MockAPI/02_mock.js is owned by another track — it must add the
  four functions above (enroll/reset/get/punchWithFace) mirroring these shapes.

## Frontend contract (`src/js/150_face.js`, never edited other files)

- Route `#/face` (WORKFORCE group, `employees` view perm): employee picker,
  camera, capture 1–3 samples, average → `enrollFace`; re-enroll overwrites;
  reset via `resetFaceEnrollment` with confirm dialog.
- Punch-time hook: `API.call` is wrapped — only `fn === 'punch'` is
  intercepted. It captures a frame from the live punch-page camera, loads
  `getFaceEnrollment(employeeId)`, computes the descriptor on-device with
  face-api.js (CDN: `https:` + `//cdn.jsdelivr.net/npm/face-api.js@0.22.2/...`,
  models from `https:` + `//cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights`),
  compares Euclidean distance with threshold **0.6** →
  `faceVerified = distance <= 0.6`, `matchScore = 1 - distance` clamped 0–1 —
  and calls `punchWithFace(..., faceVerified, matchScore)`.
- Face check is SKIPPED (plain `punch`, `faceVerified=null`) when: no live
  camera, face-api.js fails to load, no enrollment exists, no face in frame,
  backend call fails, or the device is offline (offline queue sync has no live
  video at sync time, so queued punches stay on the plain path). Raw face
  images never leave the device — only the averaged enrollment descriptor
  (enroll) and the boolean + score (punch) are transported.
- i18n keys: `t1.*` registered for `en` and `ur` in `150_face.js`
  (`Object.assign(I18N.dict.en/ur, {...})`); every user-facing string uses
  `I18N.t('t1.<key>')`.

## Track 2
# Track 2 — Auto salary from attendance: API additions (coordinator merges into API_CONTRACT.md)

## New tenant tab
`salaryStructures`: `id, employeeId, basic, allowancesJson, effectiveFrom, payFrequency`
- `allowancesJson`: JSON object string, e.g. `{"hra":12000,"transport":5000,"medical":3000}`
- `effectiveFrom`: ISO date `yyyy-MM-dd`; the row with the latest `effectiveFrom`
  on/before the payroll month's last day wins (supports mid-year revisions).
- `payFrequency`: currently only `monthly` is supported; other values raise a clear error.
- Seeded by `seedTrack2Tabs_(ss)` (idempotent; also seeds the salary settings keys below).
  The coordinator wires the call for new and existing tenants.

## Schema extensions (existing tabs, backward compatible)
- `payrollRuns` gains `runType` (`'salary'` for auto-salary runs, `'manual'` default for
  existing `runPayroll` runs). Old rows read as `'manual'`.
- `payslips` gains `breakdownJson` (full salary breakdown for salary runs; empty for manual runs).

## New tenant Settings keys (all strings; defaults in parentheses)
- `absentDeductionPerDay` (`30`): divisor — per absent/unpaid-leave day deduction = monthly gross ÷ this.
- `lateGraceMinutes` (`15`): arrival later than shift start + grace counts as late.
- `latePenaltyMinutes` (`60`): minutes of hourly wage deducted per late arrival.
- `overtimeRateMultiplier` (`1.5`): applied to the derived hourly wage when an approved
  overtime row has no explicit `rate` (explicit `rate` always wins).
- `salaryWorkHoursPerDay` (`8`): hourly wage = (monthly gross ÷ absent divisor) ÷ this.
- `workingDays` (existing): comma list like `Mon,Tue,Wed,Thu,Fri,Sat`; non-listed days and
  `holidays` rows are never counted absent.

## API functions (all on the `API` object; frontend `API.call('name', ...)`)
- `computeMonthlySalary(user, employeeId, yyyyMM)` — perm `payroll_manage`.
  Returns the breakdown object (below). Throws `No salary structure for this employee`,
  `Employee not found`, `Employee is not active`, `Month must be in yyyy-MM format`,
  or pay-frequency errors.
- `generateMonthlySalaries(user, yyyyMM)` — perm `payroll_manage`.
  Computes for every active employee; employees without a structure (or other failures)
  are **skipped with a clear reason**, never fatal. Creates a `payrollRuns` row with
  `runType:'salary'` (status `draft`), or **regenerates** the existing draft run for the
  month (deletes its slips, recomputes). A `finalized` salary run cannot be regenerated.
  Returns `{runId, month, generated:[{employeeId, employeeName, employeeCode, net,
  daysPresent, daysAbsent, lateCount, overtimeHours}], skipped:[{employeeId, employeeName,
  employeeCode, reason}], totalNet}`. Writes an auditLog row.
- `listSalaryStructures(user)` — perm `payroll_manage` → rows with
  `employeeName, employeeCode, basic, allowancesJson, allowancesDetail{}, effectiveFrom, payFrequency`.
- `saveSalaryStructure(user, s)` — perm `payroll_manage`; `s={id?, employeeId, basic,
  allowancesJson (object or JSON string), effectiveFrom?, payFrequency?}`.
  Upserts by `id`, else by `(employeeId, effectiveFrom)`. Returns the id. Throws on
  unknown employee, non-positive basic, or invalid allowances JSON.
- `listPayslips(user, runId)` — perm `payroll_manage` → payslip rows for one run with
  `employeeName, employeeCode, month, runType`; numeric fields parsed, `paid` boolean.
  (Works for manual runs too.)
- `getSalaryPayslip(user, runId, employeeId)` — perm `payroll_manage`; employee/user roles
  may only read their own (`selfOnly_`). Returns `{payslip, employee, run, company,
  breakdown}` where `breakdown` is the parsed `breakdownJson` (null for manual-run slips).

## Breakdown object (computeMonthlySalary / payslip.breakdownJson)
`{employeeId, employeeName, month, basic, allowances, allowancesDetail{}, gross,
absentDeduction, lateDeduction, overtimePay, net, daysPresent, daysAbsent, lateCount,
overtimeHours, paidLeaveDays, unpaidLeaveDays, workDays, dailyWage, hourlyWage,
prorated, proRateFactor}` — all money rounded to 2dp, all dates ISO strings.
Money is computed in integer paisa inside `computeSalaryCore_`, so results are
deterministic to the paisa (no float dust).

## Computation rules
- Present = any attendance row that day. Late = earliest `in` punch (fallback: earliest
  punch of any type) later than roster shift start (fallback: earliest shift start,
  fallback `09:00`) + `lateGraceMinutes`.
- Approved leave days on working days: paid type → `paidLeaveDays` (no deduction);
  unpaid type → `unpaidLeaveDays` (deducted like absent). Absent deduction covers
  `daysAbsent + unpaidLeaveDays`.
- Overtime: approved rows in the month only; `hours × (rate || hourlyWage × multiplier)`.
- Mid-month joiners (`employees.joinDate` in the month): basic + allowances pro-rated by
  `workDays(joinDate..end) ÷ workDays(month)`; pre-join days never count absent;
  `prorated:true`.
- `net = gross − absentDeduction − lateDeduction + overtimePay`.

## Frontend (src/js/155_salary.js, Salaries tab in src/js/100_payroll.js)
- `API.call('listSalaryStructures' | 'saveSalaryStructure' | 'generateMonthlySalaries' |
  'listPayslips' | 'getSalaryPayslip', ...)` — **coordinator note:** these must be added
  to `MockAPI` in `src/js/02_mock.js` (another track owns that file); until then
  `build.py` step 2 exits 1 with `WARNING: API functions used but not in MockAPI`.
- All new user-facing strings use `I18N.t('t2.<key>')`, registered via
  `Object.assign(I18N.dict.en, {...})` / `Object.assign(I18N.dict.ur, {...})` in 155_salary.js.

## Track 3
# Track 3 — WhatsApp / SMS alerts: API additions

Companion to `API_CONTRACT.md` (which is the single source of truth and is NOT
edited by this track). Backend lives in `codesections/track3.gs` (appended to
`Code.gs` by the coordinator); frontend in `src/js/160_alerts.js`; Settings UI
wiring in `src/js/130_settings.js` (Track 3 owns that file).

## Tenant Settings keys

| key | default | meaning |
|---|---|---|
| `wa_token` | `''` | WhatsApp Cloud API access token (Meta developer dashboard) |
| `wa_phone_number_id` | `''` | WhatsApp Cloud API phone number ID |
| `wa_enabled` | `'0'` | master switch for WhatsApp alerts |
| `wa_template_name` | `''` | optional approved template name; empty = send plain text |
| `sms_webhook_url` | `''` | generic SMS webhook endpoint (receives POST JSON `{to, message}`) |
| `sms_enabled` | `'0'` | master switch for SMS alerts |
| `alert_late` | `'1'` | send alert on late arrival |
| `alert_absent` | `'1'` | send alert when an employee is absent after the grace period |
| `alert_leave_decision` | `'1'` | send alert on leave approved / rejected |
| `alert_out_of_zone` | `'1'` | send alert on out-of-geofence punch |
| `absence_grace_minutes` | `'60'` | absent is flagged only after this many minutes past shift start (today) |

Channel pick: WhatsApp wins when `wa_enabled` + token + phone number ID are all
set; otherwise SMS when `sms_enabled` + webhook URL are set; otherwise the
attempt is logged with status `pending-config` and nothing is sent.

## messageLog tab

Schema: `id, ts, tenantId, channel, to, event, body, status, error`

- `ts`: ISO string `yyyy-MM-ddTHH:mm:ss` (never a Date object — `rows_()`
  already converts Dates and `google.script.run` cannot transport them).
- `tenantId`: the tenant key on every backend row.
- `channel`: `whatsapp` | `sms` | `''` (empty when nothing was configured).
- `event`: `late` | `absent` | `leave_approved` | `leave_rejected` |
  `out_of_zone` | `test` | `manual`.
- `status`: `sent` | `failed` | `pending-config`.

## API functions (Code.gs `API` object → `API.call('name', …)`)

- `sendAlert(user, {event, toEmployeeId, vars})` → `{ok, sent, status, error?}`.
  Permission: `settings_manage`. Resolves the recipient phone from the
  Employees tab, picks the channel, sends, logs. Never throws for transport
  problems; missing employee phone logs `failed` with an error note.
- `runAlertChecks(user, employeeId, date?)` → `{date, employeeId, alerts:[…]}`.
  Frontend calls this after `punch` / `devicePunch` (the 160_alerts.js wrapper
  does it automatically). Checks the employee's first check-in against the
  rostered (or first) shift start + grace → `late`; any `outOfZone` punch →
  `out_of_zone`. Idempotent per (date, event, phone, punch time). Employee-role
  callers are restricted to their own record via `selfOnly_`.
- `checkAbsences(user, date?)` → `{date, checked, absent:[…], alerted, skipped}`.
  Daily sweep for HR/admin (`attendance_view`). Skips future dates, holidays,
  weekly offs (per `workingDays` setting) and approved leave. For today, grace
  must have elapsed (`absence_grace_minutes` past shift start).
- `alertLeaveDecision(user, requestId)` → `{ok, status}`. Called after
  `decideLeave` (automatic via the 160_alerts.js wrapper). Sends
  `leave_approved` / `leave_rejected` to the employee. No-op when the toggle is
  off, the request is still pending, or the decision was already notified.
- `listMessageLog(user, limit?)` → newest-first rows (`settings_manage`).
- `resendAlert(user, logId)` → `{ok, status, error}`. Retries one row with the
  current credentials and updates that row in place (`settings_manage`).
- `testAlert(user, channel, to)` → dispatch result. Sends a test message; the
  channel need not be enabled, but missing credentials log `pending-config`
  (`settings_manage`).

## Failure semantics (hard guarantees)

- Missing credentials → status `pending-config`, `ok:true`, no exception.
- Transport failure → status `failed` with the error text, `ok:true`, no
  exception. The punch/leave flow that triggered the alert is never broken.
- `UrlFetchApp` calls use `muteHttpExceptions:true`; 2xx = sent.
- NOTE: GAS `UrlFetchApp` exposes no timeout parameter, so the platform default
  applies; the wrapper keeps every failure non-fatal by contract.

## Trigger points (for the coordinator / other tracks)

No punch/leave backend or frontend files were edited. Wiring is:

1. **Automatic (shipped):** `160_alerts.js` wraps `API.call` once per page load.
   After a successful `punch` it fires `runAlertChecks(employeeId)`; after
   `devicePunch` with its `employeeId` arg; after `decideLeave` it fires
   `alertLeaveDecision(requestId)`. Follow-ups are fire-and-forget with empty
   catch handlers and never delay the UI.
2. **Manual hooks (if the wrapper is ever removed):** call
   `API.call('runAlertChecks', employeeId)` after any punch write, and
   `API.call('alertLeaveDecision', requestId)` after any `decideLeave`.
3. **Daily absence sweep:** schedule `checkAbsences` (time-driven trigger or a
   dashboard button) — e.g. once per morning after `absence_grace_minutes`.

## build.py dependency — MockAPI stubs REQUIRED (Track 3 may not edit 02_mock.js)

`build.py` check #2 exits non-zero when an `API.call('fn')` has no `MockAPI.fn`.
The coordinator (or mock owner) must add these stubs to `src/js/02_mock.js`
before the build passes:

```js
sendAlert(opts){ return {ok:true, sent:false, status:'pending-config'}; },
runAlertChecks(employeeId, date){ return {date:date||'', employeeId, alerts:[]}; },
checkAbsences(date){ return {date:date||'', checked:0, absent:[], alerted:0, skipped:'mock'}; },
alertLeaveDecision(requestId){ return {ok:true, status:'skipped', reason:'mock'}; },
listMessageLog(limit){ return []; },
resendAlert(logId){ return {ok:true, status:'pending-config'}; },
testAlert(channel, to){ return {ok:true, sent:false, status:'pending-config'}; },
```

## Seeding

`seedTrack3Tabs_(ss)` creates the `messageLog` tab and inserts the default
settings keys (only keys the tenant does not already have). The coordinator
wires it into tenant setup alongside `setupTenantSS`.

## Track 4
# Track 4 — I18N Contract (EN/UR) — for coordinator merge

No backend/API additions. This document describes the frontend internationalization
contract owned by Track 4 (Phase 2). Do NOT edit `Code.gs`, `02_mock.js`, or
`API_CONTRACT.md`; merge the notes below into the main contract where marked.

## 1. Framework (`src/js/005_i18n.js`, loads before every UI module)

Exact shape — other tracks depend on it, do not alter:

```js
window.I18N = { lang: localStorage.getItem('ams_lang')||'en', dict:{en:{},ur:{}},
  t: function(k){ var d=I18N.dict[I18N.lang]||{}; return (d[k]!==undefined?d[k]:((I18N.dict.en[k]!==undefined)?I18N.dict.en[k]:k)); },
  setLang: function(l){ I18N.lang=l; try{localStorage.setItem('ams_lang',l);}catch(e){} document.documentElement.dir=(l==='ur'?'rtl':'ltr'); document.documentElement.lang=l; if(window.rerenderAll) window.rerenderAll(); } };
```

- `I18N.t(key)` fallback chain: current lang → `en` → the key itself (never throws,
  never returns undefined). Safe to call at module load time.
- `I18N.setLang('en'|'ur')` persists to `localStorage['ams_lang']`, flips
  `document.documentElement` `dir` (`rtl` for Urdu, `ltr` otherwise) and `lang`,
  then calls `window.rerenderAll()`.
- On script load, the saved language is applied immediately (dir/lang attributes),
  so a returning Urdu user lands directly in RTL.
- `window.rerenderAll()` (defined in 005_i18n.js): repaints the header toggle,
  refreshes one-shot header chrome (Punch button, footer, impersonation banner),
  then calls the central `App.route()` to re-render the current view. If
  `App.route` is ever absent it falls back to re-triggering the current hash route.
- Dictionaries for ALL converted modules live in `005_i18n.js` (single place):
  `Object.assign(I18N.dict.en,{...})` and `Object.assign(I18N.dict.ur,{...})`.
  Other tracks register their own keys the same way (their `t3.*` keys already do).

## 2. Key naming

`c4.<module>.<slug>` — e.g. `c4.emp.addEmployee`, `c4.att.bulkMark`, `c4.common.save`.
Modules: `common` (shared words: Save/Cancel/Delete/Edit/…, statuses, Check-in/out),
`utils`, `api`, `auth`, `nav` (nav labels + nav-group labels), `layout` (shell chrome),
`dash`, `punch`, `emp`, `sites`, `shifts`, `att`, `leave`, `ot`, `docs`, `rep`, `ten`.

- Placeholder convention: `{n}`, `{s}`, `{name}`, `{msg}`, `{type}`, `{date}`,
  `{company}`, `{code}`, `{kind}` — substituted with `.replace('{x}', value)`.
- Dynamic content (employee/site names, numbers, dates, codes, credentials) is
  NEVER translated — only chrome strings are wrapped.

## 3. Nav labels (re-render safe)

Nav items carry both a load-time `label` and a `labelKey`:
`App.nav.push({..., label:I18N.t('c4.nav.dashboard'), labelKey:'c4.nav.dashboard', ...})`.
`renderNav()` and the breadcrumb resolve via `I18N.t(n.labelKey)` (falling back to
`n.label` when no key — the payroll/settings pushes owned by tracks 2/3 have no
key yet). Nav-group labels use the same pattern (`g.labelKey`). Provided for
tracks 2/3: `c4.nav.payroll`, `c4.nav.settings`.

## 4. Language toggle

- EN | اردو segmented toggle injected at RUNTIME into the app `<header>`
  (before the avatar block) from 005_i18n.js — `11_layout.js` was not modified
  for this. A `MutationObserver` re-mounts it after login/logout shell rebuilds.
- Active language is highlighted; `aria-pressed` is set per button.
- Not shown on the login page (no header there), but the login page renders in
  the saved language.

## 5. RTL (`html[dir='rtl']` stylesheet injected from 005_i18n.js)

Surgical overrides only, no redesign:
- Sidebar (`#side`) docks right; mobile hidden state becomes `translateX(100%)`
  (scoped below the `lg` breakpoint so desktop `lg:translate-x-0` still wins);
  main column margin flips (`lg:ml-[248px]` → `margin-right:248px` at ≥1024px);
  sidebar border flips to the left.
- Text alignment: `body` right; `.text-left`→right, `.text-right`→left (covers
  table headers and numeric cells); inputs/selects/textareas right-aligned
  (checkbox/radio/range/date/time keep natural alignment).
- `#toasts` move to top-left, `#avatarDrop` opens left-aligned,
  `.ml-auto`/`.mr-auto` mirrored. Flex rows auto-mirror via `direction`.
- Login split-screen, cards, modals, tables need no extra rules.

## 6. Converted files (strings wrapped, logic/DOM ids/API shapes untouched)

`00_utils.js` (confirm dialog, table empty state, export toast, map fallback),
`01_api.js` ('Server call failed'), `10_auth.js` (login), `11_layout.js` (shell,
nav groups, avatar menu, route error states), `20_dashboard.js`, `30_punch.js`,
`40_employees.js`, `50_sites.js`, `60_shifts.js`, `70_attendance.js`, `80_leave.js`,
`90_overtime.js`, `110_documents.js`, `120_reports.js`, `140_tenants.js`.

NOT touched (other tracks): `src/js/100_payroll.js`, `src/js/130_settings.js`,
`Code.gs`, `02_mock.js`. Print/payslip views left for track 2.

## 7. QA

`qa_i18n.js` (project root, `node qa_i18n.js`): asserts every `I18N.t` key used in
the converted files exists in `dict.en` AND `dict.ur`, no empty translations,
`setLang` flips `dir`/`lang` and persists `ams_lang`, `rerenderAll` routes through
`App.route()`, and the GAS `://` guard holds on all touched files. 22/22 green.

## 8. Merge notes for the main API_CONTRACT.md

- Add an "I18N" section: product name "Attendance Management System" stays
  English in both languages (branding rule); `ams_lang` localStorage contract;
  `c4.*` key convention; dynamic data never translated.
- Note: `005_i18n.js` must remain the first script in build order (filename sort
  already guarantees this); the concurrent `150_*`–`170_*` tracks register
  `t3.*` keys into the same `I18N.dict` and shim-guard on `window.I18N`.

## Track 5
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

## Track 6
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

## Track 7
# Track 7 — Rich Demo Data (perception fix)

## Purpose
`seedTrack7Demo_(ss)` seeds tasteful, realistic sample rows for the DEMO tenant
only, so first-login pages (Overtime, Holidays, Rosters, Payroll, Pay
Components, Contractors, Contractor Bills, Attendance history, Salary
Structures, Message Log) open with content instead of looking empty.

## Wiring (coordinator)
- Backend code lives ONLY in `codesections/track7.gs`.
- Call `seedTrack7Demo_(ss)` inside `seedDemo()` AFTER the demo employees
  (EMP-001..EMP-006), sites ("Main Site Gulberg", "DHA Site Lahore") and shifts
  exist, and AFTER the parallel track tab seeders (`seedTrackNTabs_`) have run.
- Track 2's seeder is called from inside `seedTrack7Demo_` via a
  `typeof seedTrack2Tabs_ === 'function'` guard; track 2 internals are never
  depended on.
- Do NOT edit `Code.gs`, `seedDemo()`, `02_mock.js`, or `API_CONTRACT.md`.

## Dataset (all dates ISO strings; sample rows marked "(demo sample)")
| Tab | Rows | Content |
|---|---|---|
| overtime | 3 | pending (EMP-001, 3h), approved (EMP-002, 2.5h), rejected (EMP-003, 4h); recent dates |
| holidays | 4 | 2026-08-14 Independence Day, 2026-08-27 Eid Milad-un-Nabi, 2026-11-09 Iqbal Day, 2026-12-25 Quaid-e-Azam Day |
| rosters | 38 | full week Mon 2026-10-05 .. Sun 2026-10-11; EMP-001..003 morning @ Main Site Gulberg, EMP-004 evening @ Gulberg, EMP-005/006 morning @ DHA Site Lahore, Sun night cover @ Gulberg |
| payComponents | 3 | House Allowance 15000 (allowance), Conveyance Allowance 5000 (allowance), Provident Fund 2000 (deduction); all approved, apply to all |
| payrollRuns | 1 | month 2026-09, status `completed`, created by U-0001 |
| payslips | 3 | EMP-001 net 78000, EMP-002 net 73000, EMP-003 net 63000 (5000 advance recovery from the demo advance); all marked paid |
| contractors | 2 | Rashid Mehmood / RM Builders (25000), Khalid Javed / KJ Electricals (18000) |
| contractorBills | 3 | RM 2026-08 750000 approved, RM 2026-09 800000 approved, KJ 2026-09 540000 pending |
| attendance | 12 | historical punches 2026-10-02/05/06 near the Lahore demo sites: on-time, late (08:22 vs 08:00+15 grace), and one out-of-zone pair (EMP-003 at 31.5300,74.3700, ~1.5 km from site) |
| leaveRequests | 1 | EMP-004 sick leave 2026-09-21..22, approved by U-0001 (leave balance updated) |
| salaryStructures | 2 | EMP-001 basic 60000, EMP-005 basic 75000, effective 2026-07-01, monthly |
| messageLog | 2 | status `pending-config` (see schema note below) |

## Validation
- Every tab is seeded only when empty, so re-running never duplicates rows.
- All writes go through the real API functions (requestOvertime, decideOvertime,
  saveHoliday, saveRoster, savePayComponent, runPayroll, markPayslipPaid,
  saveContractor, saveContractorBill, decideContractorBill, requestLeave,
  decideLeave, saveSalaryStructure), inheriting their validation.
- Historical punches bypass `API.punch` (it always stamps today) but are built
  exactly as it builds rows: same header order, site resolution via
  `siteForPunch_`, `distanceM` from `haversineM_`.
- QA: `node qa_demo.js` — runs the real `Code.gs` + `track2.gs` + `track7.gs`
  in Node against an in-memory GAS surface, replays the core of `seedDemo()`
  through the real APIs, runs `seedTrack7Demo_` twice (idempotent), and asserts
  row counts, ISO dates, payroll math, and referential integrity
  (every employeeId / siteId / shiftId / contractorId / runId resolves).

## Schema assumption (flag for track 3)
Track 3's messageLog schema was not defined yet, so `seedTrack7Demo_` registers
a minimal shape ONLY when the track has not defined one:
`['id','at','channel','recipient','message','status']` with 2 rows at status
`pending-config`. If track 3 defines its own headers, its schema wins and
these rows should be re-checked against it.
