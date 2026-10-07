# Track 6 — backend patches (DO NOT APPLY — coordinator applies these)

Exact minimal old → new snippets that make the EXISTING punch/attendance/
overtime backend functions rule-driven instead of hardcoded. Each snippet
quotes enough context (function name + surrounding lines) to locate the edit
unambiguously in `Code.gs`. Track 6's `codesections/track6.gs` (which defines
`getRule_()`) is appended before these patches, so `getRule_` is in scope.

## Verified hardcoded values in Code.gs (2026-10-07)

| # | Location | Hardcoded value | Rule that drives it |
|---|----------|-----------------|---------------------|
| 1 | `API.punch` duplicate guard (~line 806) | 5 minutes | `duplicatePunchWindowMinutes` (def 5) |
| 2 | `API.devicePunch` duplicate guard (~line 850) | 5 minutes | `duplicatePunchWindowMinutes` (def 5) |
| 3 | `API.saveShift` grace fallback (~line 709) | 15 min (`num_(s.graceMin) \|\| 15`) | `lateGraceMinutes` (def 15, Settings-backed by track 2) |
| 4 | `API.punch` out-of-zone handling (~line 813) | flag-only (records + marks) | `outOfZonePolicy` (`flag` \| `block`) |
| 5 | late marking | **no existing call site** — nothing currently marks arrivals late | `lateThresholdMinutes` (def 10) via `getRule_` |
| 6 | auto-mark absent | **no existing logic** — dashboard only computes a display count (`absentToday = active - present`, ~line 1762) | `autoAbsentCutoffTime` (def `10:00`) via `getRule_` |
| 7 | overtime eligibility | **no existing check** — `API.requestOvertime` validates only employee/date/hours | `overtimeAutoEligible` (def true) via `getRule_` |

---

## Patch 1 — `API.punch`: duplicate-punch window

OLD (in `punch`, after `var today = todayStr_(), nowT = timeStr_();`):
```js
    /* duplicate guard: same employee + type within 5 minutes */
    var dup = trows_(ss, 'attendance').filter(function (a) {
      return String(a.employeeId) === String(employeeId) && a.type === type && a.date === today &&
             Math.abs(minsBetween_(a.time, nowT)) < 5;
    })[0];
```
NEW:
```js
    /* duplicate guard: same employee + type inside the rule window */
    var dupWin = getRule_(ss, 'duplicatePunchWindowMinutes', 5);
    var dup = trows_(ss, 'attendance').filter(function (a) {
      return String(a.employeeId) === String(employeeId) && a.type === type && a.date === today &&
             Math.abs(minsBetween_(a.time, nowT)) < dupWin;
    })[0];
```

## Patch 2 — `API.devicePunch`: duplicate-punch window

OLD (in `devicePunch`, after `var date = fmtDate_(d), time = fmtTime_(d);`):
```js
    var dup = trows_(ss, 'attendance').filter(function (a) {
      return String(a.employeeId) === String(emp.id) && a.type === type && a.date === date &&
             Math.abs(minsBetween_(a.time, time)) < 5;
    })[0];
```
NEW:
```js
    var dupWin = getRule_(ss, 'duplicatePunchWindowMinutes', 5);
    var dup = trows_(ss, 'attendance').filter(function (a) {
      return String(a.employeeId) === String(emp.id) && a.type === type && a.date === date &&
             Math.abs(minsBetween_(a.time, time)) < dupWin;
    })[0];
```

## Patch 3 — `API.saveShift`: per-shift grace default

OLD (in `saveShift`, after the required-fields check):
```js
    var obj = { name: s.name, startTime: s.startTime, endTime: s.endTime, graceMin: num_(s.graceMin) || 15 };
```
NEW:
```js
    var obj = { name: s.name, startTime: s.startTime, endTime: s.endTime,
      graceMin: num_(s.graceMin) || getRule_(ss, 'lateGraceMinutes', 15) };
```
Note: `lateGraceMinutes` is one of the four payroll keys stored as tenant
Settings keys by track 2 — `getRule_` falls back to that Settings value when
no rule row exists, then to 15.

## Patch 4 — `API.punch`: out-of-zone flag-vs-block

OLD (in `punch`, the geofence resolution line before the row is built):
```js
    var site = siteForPunch_(ss, employeeId, lat, lng);
    var row = {
```
NEW:
```js
    var site = siteForPunch_(ss, employeeId, lat, lng);
    if (site && site.outOfZone && getRule_(ss, 'outOfZonePolicy', 'flag') === 'block')
      throw new Error('Punch rejected: you are outside the site geofence (out-of-zone punches are blocked)');
    var row = {
```
Default `flag` preserves today's behaviour (record + mark `outOfZone`); `block`
rejects the punch before any row is written.

---

## No-patch items (rules exposed, no hardcoded call site exists)

- **Late threshold** (`lateThresholdMinutes`, def 10): no function currently
  marks arrivals late — `attendanceSummary` reports only in/out times and
  hours. The rule is available via `getRule_(ss, 'lateThresholdMinutes', 10)`
  for the coordinator (or a later track) to compute a `late` flag from
  roster shift start + grace.
- **Auto-absent cut-off** (`autoAbsentCutoffTime`, def `10:00`): there is no
  auto-mark-absent logic today; the dashboard KPI `absentToday` is a live
  display count only. A scheduled sweep can read
  `getRule_(ss, 'autoAbsentCutoffTime', '10:00')` and mark employees with no
  in-punch by that time absent.
- **Overtime eligibility** (`overtimeAutoEligible`, def true): `requestOvertime`
  performs no eligibility check today. Consumers can read
  `getRule_(ss, 'overtimeAutoEligible', true)` to decide whether worked-past-
  shift-end hours auto-qualify.
- **Probation** (`probationDays`, def 90): exposed via
  `getRule_(ss, 'probationDays', 90)` for leave eligibility checks; no existing
  call site to patch.
