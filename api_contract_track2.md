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
