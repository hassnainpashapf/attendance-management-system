/* qa_salary.js — Track 2 QA: auto salary from attendance.
 * Loads Code.gs + codesections/track2.gs in a vm sandbox with a fake in-memory
 * SpreadsheetApp, then asserts salary math (present/absent/late/overtime/leave
 * scenarios with expected nets), API shapes, schema extensions, seed idempotency,
 * and the GAS sanitizer rule (no '://' in served JS strings).
 * Run: node qa_salary.js
 */
const fs = require('fs');
const vm = require('vm');

const ROOT = '/home/hatch/workspace/attendance-saas';
const code = fs.readFileSync(ROOT + '/Code.gs', 'utf8') + '\n' + fs.readFileSync(ROOT + '/codesections/track2.gs', 'utf8');

/* ---------- fake SpreadsheetApp (in-memory) ---------- */
class FakeSheet {
  constructor(name, headers) { this.name = name; this.rows = [headers.slice()]; }
  appendRow(a) { this.rows.push(a.slice()); }
  setFrozenRows() {}
  getDataRange() { const self = this; return { getValues() { return self.rows.map(r => r.slice()); } }; }
  getLastRow() { return this.rows.length; }
  getRange(r, c, nr, nc) {
    const self = this;
    return {
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) {
          const row = self.rows[r - 1 + i] || [];
          out.push(row.slice(c - 1, c - 1 + nc));
        }
        return out;
      },
      setValues(vals) {
        for (let i = 0; i < vals.length; i++) {
          const ri = r - 1 + i;
          while (self.rows.length <= ri) self.rows.push([]);
          for (let j = 0; j < vals[i].length; j++) self.rows[ri][c - 1 + j] = vals[i][j];
        }
      }
    };
  }
  deleteRow(i) { this.rows.splice(i - 1, 1); }
}
class FakeSS {
  constructor() { this.sheets = {}; }
  getSheetByName(n) { return this.sheets[n] || null; }
  insertSheet(n) { const s = new FakeSheet(n, []); s.rows = []; this.sheets[n] = s; return s; }
}
const tenantSS = new FakeSS();
const sandbox = {
  console,
  SpreadsheetApp: {
    openById() { return tenantSS; },
    getActiveSpreadsheet() { return tenantSS; }
  },
  Session: { getScriptTimeZone() { return 'Asia/Karachi'; } }
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'combined.gs' });

const API = sandbox.API;
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}
function approx(a, b, name) { ok(Math.abs(a - b) < 0.011, name + ' (got ' + a + ', want ' + b + ')'); }

/* ---------- 1. registration + schema ---------- */
console.log('== registration & schema ==');
['computeMonthlySalary', 'generateMonthlySalaries', 'listSalaryStructures',
 'saveSalaryStructure', 'listPayslips', 'getSalaryPayslip'].forEach(f =>
  ok(typeof API[f] === 'function', 'API.' + f + ' registered'));
ok(typeof sandbox.seedTrack2Tabs_ === 'function', 'seedTrack2Tabs_ defined');
ok(Array.isArray(sandbox.SHEETS.salaryStructures), 'SHEETS.salaryStructures tab exists');
ok(sandbox.SHEETS.payrollRuns.indexOf('runType') >= 0, 'payrollRuns has runType column');
ok(sandbox.SHEETS.payslips.indexOf('breakdownJson') >= 0, 'payslips has breakdownJson column');
ok(typeof sandbox.computeSalaryCore_ === 'function', 'computeSalaryCore_ is pure & testable');

/* ---------- 2. pure math scenarios (Oct 2026: 31 days, Sundays 4/11/18/25 -> 27 workdays Mon-Sat) ---------- */
console.log('== pure salary math (computeSalaryCore_) ==');
const SETTINGS = { absentDivisor: 30, lateGraceMinutes: 15, latePenaltyMinutes: 60, overtimeRateMultiplier: 1.5, workHoursPerDay: 8 };
const ALLOW = { hra: 12000, transport: 5000, medical: 3000 }; /* gross 80000, daily 2666.67, hourly 333.33 */
function mkInput(days, overtime, basic, allowances, extra) {
  return Object.assign({ employeeId: 'E1', employeeName: 'Test', month: '2026-10',
    basic: basic == null ? 60000 : basic, allowances: allowances || ALLOW,
    settings: SETTINGS, days: days, overtime: overtime || [] }, extra || {});
}
/* build 27 workdays of Oct 2026; opts: absent[], late{day:inTime}, paidLeave[], unpaidLeave[], holidays[] */
function mkDays(opts) {
  opts = opts || {};
  const days = [];
  const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let d = 1; d <= 31; d++) {
    const iso = '2026-10-' + String(d).padStart(2, '0');
    const dow = dowNames[new Date(2026, 9, d).getDay()];
    const working = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(dow) >= 0 && (opts.holidays || []).indexOf(d) < 0;
    const absent = (opts.absent || []).indexOf(d) >= 0;
    days.push({ date: iso, working: working, joined: true,
      present: working && !absent,
      inTime: (opts.late && opts.late[d]) || '09:00:00', shiftStart: '09:00',
      paidLeave: (opts.paidLeave || []).indexOf(d) >= 0,
      unpaidLeave: (opts.unpaidLeave || []).indexOf(d) >= 0 });
  }
  return days;
}
let r = sandbox.computeSalaryCore_(mkInput(mkDays()));
approx(r.net, 80000, 'S1 full attendance net=80000'); ok(r.daysPresent === 27 && r.daysAbsent === 0, 'S1 27 present 0 absent');

r = sandbox.computeSalaryCore_(mkInput(mkDays({ absent: [5, 6, 7] })));
approx(r.net, 71999.99, 'S2 3 absents net=71999.99'); ok(r.daysAbsent === 3, 'S2 daysAbsent=3');
approx(r.absentDeduction, 8000.01, 'S2 absentDeduction=8000.01');

r = sandbox.computeSalaryCore_(mkInput(mkDays({ late: { 8: '09:20:00', 9: '09:45:00' } })));
approx(r.lateDeduction, 666.66, 'S3 lateDeduction=666.66'); approx(r.net, 79333.34, 'S3 net=79333.34');
ok(r.lateCount === 2, 'S3 lateCount=2');

r = sandbox.computeSalaryCore_(mkInput(mkDays({ late: { 8: '09:10:00' } })));
ok(r.lateCount === 0, 'S4 arrival inside grace is not late'); approx(r.net, 80000, 'S4 net=80000');

r = sandbox.computeSalaryCore_(mkInput(mkDays(), [{ hours: 5, rate: 0 }]));
approx(r.overtimePay, 2500, 'S5 5h OT x1.5 =2500'); approx(r.net, 82500, 'S5 net=82500');
ok(r.overtimeHours === 5, 'S5 overtimeHours=5');

r = sandbox.computeSalaryCore_(mkInput(mkDays(), [{ hours: 4, rate: 500 }]));
approx(r.overtimePay, 2000, 'S6 explicit OT rate wins (4h x 500)'); approx(r.net, 82000, 'S6 net=82000');

r = sandbox.computeSalaryCore_(mkInput(mkDays({ unpaidLeave: [12, 13] })));
approx(r.absentDeduction, 5333.34, 'S7 absentDeduction=5333.34'); approx(r.net, 74666.66, 'S7 net=74666.66');
ok(r.unpaidLeaveDays === 2, 'S7 unpaidLeaveDays=2');

r = sandbox.computeSalaryCore_(mkInput(mkDays({ paidLeave: [12, 13] })));
approx(r.net, 80000, 'S8 paid leave no deduction'); ok(r.paidLeaveDays === 2 && r.daysAbsent === 0, 'S8 paidLeaveDays=2');

r = sandbox.computeSalaryCore_(mkInput(mkDays({ holidays: [5] })));
ok(r.workDays === 26 && r.daysPresent === 26, 'S9 holiday not counted absent'); approx(r.net, 80000, 'S9 net=80000');

r = sandbox.computeSalaryCore_(mkInput(mkDays(), [], 31111.11, { hra: 6222.22, transport: 2592.59, medical: 1555.56 },
  { prorated: true, proRateFactor: 14 / 27 }));
approx(r.net, 41481.48, 'S10 mid-month joiner prorated net~=41481.48');
ok(r.prorated === true, 'S10 prorated flag');
ok(/^\d{4}-\d{2}$/.test(r.month), 'S11 month is yyyy-MM ISO');

const mb = sandbox.monthBounds_('2026-10');
ok(mb.first === '2026-10-01' && mb.last === '2026-10-31' && mb.days === 31, 'S12 monthBounds Oct');
ok(sandbox.monthBounds_('2026-02').days === 28, 'S13 monthBounds Feb non-leap');
const pk = sandbox.pickStructure_([
  { employeeId: 'E1', effectiveFrom: '2026-09-01' },
  { employeeId: 'E1', effectiveFrom: '2026-10-15' },
  { employeeId: 'E2', effectiveFrom: '2026-01-01' }], 'E1', '2026-10-31');
ok(pk.effectiveFrom === '2026-10-15', 'S14 latest effective structure wins');
ok(sandbox.pickStructure_([{ employeeId: 'E1', effectiveFrom: '2026-11-01' }], 'E1', '2026-10-31') === null,
  'S15 future-dated structure ignored');

/* ---------- 3. integration: seed + generate with fake sheets ---------- */
console.log('== integration (fake SpreadsheetApp) ==');
const user = { id: 'U-0001', name: 'Admin', role: 'admin', spreadsheetId: 'SS-1' };
function put(tab, rows) {
  const heads = sandbox.SHEETS[tab];
  const sh = new FakeSheet(tab, heads);
  rows.forEach(o => sh.appendRow(heads.map(h => (o[h] === undefined || o[h] === null) ? '' : o[h])));
  tenantSS.sheets[tab] = sh;
}
put('rolePermissions', [{ role: 'admin', matrix: JSON.stringify({ payroll_manage: 1, settings_manage: 1 }) }]);
put('settings', [{ key: 'workingDays', value: 'Mon,Tue,Wed,Thu,Fri,Sat' }, { key: 'companyName', value: 'Test Co' }]);
put('employees', [
  { id: 'EMP-0001', name: 'Ahmed', code: 'A1', salary: 60000, joinDate: '2026-10-01', active: true },
  { id: 'EMP-0002', name: 'Bilal', code: 'B2', salary: 90000, joinDate: '2026-10-16', active: true },
  { id: 'EMP-0003', name: 'NoStruct', code: 'C3', salary: 50000, joinDate: '2026-09-01', active: true }
]);
put('salaryStructures', [
  { id: 'SS-0001', employeeId: 'EMP-0001', basic: 60000, allowancesJson: '{"hra":12000,"transport":5000,"medical":3000}', effectiveFrom: '2026-10-01', payFrequency: 'monthly' },
  { id: 'SS-0002', employeeId: 'EMP-0002', basic: 90000, allowancesJson: '{}', effectiveFrom: '2026-10-01', payFrequency: 'monthly' }
]);
put('shifts', [{ id: 'SH-0001', name: 'Morning', startTime: '09:00', endTime: '17:00', graceMin: 15 }]);
put('leaveTypes', [
  { id: 'LT-0001', name: 'Annual', quota: 14, paid: true },
  { id: 'LT-0009', name: 'Unpaid', quota: 99, paid: false }
]);
put('leaveRequests', [
  { id: 'LR-1', employeeId: 'EMP-0001', typeId: 'LT-0001', from: '2026-10-12', to: '2026-10-13', days: 2, status: 'approved' },
  { id: 'LR-2', employeeId: 'EMP-0001', typeId: 'LT-0009', from: '2026-10-19', to: '2026-10-19', days: 1, status: 'approved' }
]);
put('overtime', [{ id: 'OT-1', employeeId: 'EMP-0001', date: '2026-10-20', hours: 4, rate: 0, status: 'approved' }]);
const att = [];
for (let d = 1; d <= 31; d++) {
  const iso = '2026-10-' + String(d).padStart(2, '0');
  const dow = new Date(2026, 9, d).getDay();
  if (dow === 0) continue;
  if (d >= 16) att.push({ id: 'P2-' + d, employeeId: 'EMP-0002', date: iso, type: 'in', time: '09:00:00' });
  if (d === 5 || d === 6) continue;                 /* EMP-0001 absent Mon/Tue */
  if (d === 12 || d === 13 || d === 19) continue;   /* EMP-0001 on leave */
  att.push({ id: 'P1-' + d, employeeId: 'EMP-0001', date: iso, type: 'in', time: d === 8 ? '09:20:00' : '09:00:00' });
}
put('attendance', att);
put('holidays', []); put('rosters', []);

ok(sandbox.seedTrack2Tabs_(tenantSS) === 'track2 seeded', 'I1 seedTrack2Tabs_ runs');
const skeys = tenantSS.sheets['settings'].rows.slice(1).map(r => r[0]);
['absentDeductionPerDay', 'lateGraceMinutes', 'latePenaltyMinutes', 'overtimeRateMultiplier', 'salaryWorkHoursPerDay']
  .forEach(k => ok(skeys.indexOf(k) >= 0, 'I2 setting seeded: ' + k));
sandbox.seedTrack2Tabs_(tenantSS);
const dupes = tenantSS.sheets['settings'].rows.slice(1).map(r => r[0]).filter(k => k === 'absentDeductionPerDay');
ok(dupes.length === 1, 'I3 seed is idempotent');

const gen = API.generateMonthlySalaries(user, '2026-10');
ok(gen.month === '2026-10' && gen.runId, 'I4 generate returns runId+month');
ok(gen.generated.length === 2, 'I5 2 salaries generated (got ' + gen.generated.length + ')');
ok(gen.skipped.length === 1 && gen.skipped[0].employeeId === 'EMP-0003' &&
   /no salary structure/i.test(gen.skipped[0].reason), 'I6 no-structure employee skipped with clear reason: ' + (gen.skipped[0] || {}).reason);
const ahmed = gen.generated.filter(g => g.employeeId === 'EMP-0001')[0];
approx(ahmed.net, 73666.66, 'I7 Ahmed net=73666.66 (2 absent + 1 unpaid leave + 1 late + 4h OT + 2 paid leave)');
ok(ahmed.daysAbsent === 2 && ahmed.lateCount === 1 && ahmed.overtimeHours === 4, 'I8 Ahmed counts (absent=2 late=1 ot=4)');
const bilal = gen.generated.filter(g => g.employeeId === 'EMP-0002')[0];
approx(bilal.net, 46666.67, 'I9 Bilal prorated net~=46666.67 (joined Oct 16)');

const runs = tenantSS.sheets['payrollRuns'].rows.slice(1);
ok(runs.length === 1 && runs[0][5] === 'salary', 'I10 payrollRuns row has runType=salary');
const slips = tenantSS.sheets['payslips'].rows.slice(1);
ok(slips.length === 2, 'I11 2 payslip rows stored');
const bd = JSON.parse(slips.filter(p => p[2] === 'EMP-0001')[0][9]);
approx(bd.net, 73666.66, 'I12 breakdownJson net matches'); ok(bd.paidLeaveDays === 2 && bd.unpaidLeaveDays === 1, 'I13 breakdown leave counts');

const gen2 = API.generateMonthlySalaries(user, '2026-10');
ok(gen2.runId === gen.runId, 'I14 regenerate reuses draft run');
ok(tenantSS.sheets['payslips'].rows.length - 1 === 2, 'I15 regenerate does not duplicate slips');

const list = API.listPayslips(user, gen.runId);
ok(list.length === 2 && list[0].employeeName && list[0].month === '2026-10' && list[0].runType === 'salary',
  'I16 listPayslips shape (name/month/runType)');
const one = API.getSalaryPayslip(user, gen.runId, 'EMP-0001');
ok(one.breakdown && Math.abs(one.breakdown.net - 73666.66) < 0.011 && one.company === 'Test Co' &&
   one.employee.name === 'Ahmed' && one.run.month === '2026-10', 'I17 getSalaryPayslip full shape');

const structs = API.listSalaryStructures(user);
ok(structs.length === 2 && structs[0].allowancesDetail.hra === 12000, 'I18 listSalaryStructures with parsed allowances');
let threw = '';
try { API.saveSalaryStructure(user, { employeeId: 'EMP-0001', basic: 1, allowancesJson: '{bad json' }); }
catch (e) { threw = e.message; }
ok(/valid JSON/.test(threw), 'I19 invalid allowances JSON rejected: ' + threw);
threw = '';
try { API.saveSalaryStructure(user, { employeeId: 'NOPE', basic: 1000, allowancesJson: '{}' }); }
catch (e) { threw = e.message; }
ok(/Employee not found/.test(threw), 'I20 unknown employee rejected');
threw = '';
try { API.computeMonthlySalary(user, 'EMP-0001', '2026-1'); } catch (e) { threw = e.message; }
ok(/yyyy-MM/.test(threw), 'I21 bad month rejected');
const direct = API.computeMonthlySalary(user, 'EMP-0001', '2026-10');
approx(direct.net, 73666.66, 'I22 computeMonthlySalary matches generate');

/* ---------- 4. GAS sanitizer rule ---------- */
console.log('== GAS sanitizer ==');
['codesections/track2.gs', 'src/js/155_salary.js', 'src/js/100_payroll.js'].forEach(f => {
  const src = fs.readFileSync(ROOT + '/' + f, 'utf8');
  const bad = src.split('\n').filter(l => l.indexOf('://') >= 0);
  ok(bad.length === 0, 'no \'://\' in ' + f + (bad.length ? ' -> ' + bad[0].trim().slice(0, 80) : ''));
});

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
