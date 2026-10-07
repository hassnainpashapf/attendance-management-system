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
