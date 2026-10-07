#!/usr/bin/env node
/* QA for TRACK 7 (rich demo data).
   Runs the REAL Code.gs + codesections/track2.gs + codesections/track7.gs
   inside Node against an in-memory mock of the GAS Spreadsheet surface, then
   - replays the core of seedDemo() through the real API functions
   - runs seedTrack7Demo_() twice (idempotency)
   - asserts expected row counts per tab and referential integrity:
     every employeeId / siteId / shiftId / contractorId / runId referenced
     by a seeded row exists in the mock. */
'use strict';
const fs = require('fs');
const ROOT = '/home/hatch/workspace/attendance-saas';

/* ---------- in-memory GAS surface ---------- */
class MockSheet {
  constructor() { this.rows = []; }
  appendRow(arr) { this.rows.push(arr.slice()); return this; }
  getDataRange() {
    const self = this;
    return { getValues() { return self.rows.map(r => r.slice()); } };
  }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows.length ? this.rows[0].length : 0; }
  getMaxColumns() { return this.getLastColumn(); }
  setFrozenRows() {}
  insertColumnsAfter() {}
  deleteRow(r) { this.rows.splice(r - 1, 1); }
  getRange(r, c, nr, nc) {
    const self = this;
    return {
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) {
          const row = [];
          for (let j = 0; j < nc; j++) row.push(((self.rows[r - 1 + i]) || [])[c - 1 + j]);
          out.push(row);
        }
        return out;
      },
      setValues(vals) {
        for (let i = 0; i < vals.length; i++)
          for (let j = 0; j < vals[i].length; j++)
            self.rows[r - 1 + i][c - 1 + j] = vals[i][j];
      },
      setValue(v) { self.rows[r - 1][c - 1] = v; }
    };
  }
}
class MockSS {
  constructor(id) { this._id = id; this.sheets = {}; }
  getId() { return this._id; }
  getSheetByName(n) { return this.sheets[n] || null; }
  insertSheet(n) { const s = new MockSheet(); this.sheets[n] = s; return s; }
}
const SpreadsheetApp = {
  _byId: {},
  openById(id) {
    if (!this._byId[id]) throw new Error('unknown spreadsheet ' + id);
    return this._byId[id];
  },
  getActiveSpreadsheet() { return this._active; }
};
const Session = { getScriptTimeZone() { return 'Asia/Karachi'; } };
const Utilities = {
  formatDate(d, tz, fmt) {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
};
const Logger = { log() {} };

/* ---------- load the real sources ---------- */
const codeSrc = fs.readFileSync(ROOT + '/Code.gs', 'utf8');
const t2Src = fs.readFileSync(ROOT + '/codesections/track2.gs', 'utf8');
const t7Src = fs.readFileSync(ROOT + '/codesections/track7.gs', 'utf8');

const driver = `(function () {
  var ss = new MockSS('demo-ss-id');
  SpreadsheetApp._byId['demo-ss-id'] = ss;
  setupTenantSS(ss, 'Demo Construction Co');
  var admin = { id: 'U-0001', name: 'Admin', username: 'admin', role: 'admin',
                spreadsheetId: 'demo-ss-id' };

  /* core of seedDemo(): sites, departments, employees, assignments, advance */
  var s1 = API.saveSite(admin, { name: 'Main Site Gulberg', address: 'Gulberg, Lahore',
    lat: 31.5204, lng: 74.3587, radiusM: 200, active: true });
  var s2 = API.saveSite(admin, { name: 'DHA Site Lahore', address: 'DHA Phase 5, Lahore',
    lat: 31.5497, lng: 74.3436, radiusM: 300, active: true });
  var d1 = API.saveDepartment(admin, { name: 'Site Staff' });
  var d2 = API.saveDepartment(admin, { name: 'Office' });
  var staff = [
    ['Ahmed Khan', 'EMP-001', d1, '0300-1111111', 60000, 'DEV-001'],
    ['Bilal Hussain', 'EMP-002', d1, '0300-2222222', 55000, ''],
    ['Usman Tariq', 'EMP-003', d1, '0300-3333333', 50000, ''],
    ['Faisal Mehmood', 'EMP-004', d1, '0300-4444444', 48000, ''],
    ['Imran Ali', 'EMP-005', d2, '0300-5555555', 75000, ''],
    ['Shahid Noor', 'EMP-006', d2, '0300-6666666', 80000, '']
  ];
  var empIds = staff.map(function (e) {
    return API.saveEmployee(admin, { name: e[0], code: e[1], departmentId: e[2], phone: e[3],
      email: '', salary: e[4], joinDate: addDays_(todayStr_(), -90), deviceId: e[5], active: true });
  });
  API.assignSiteEmployees(admin, s1, empIds.slice(0, 4));
  API.assignSiteEmployees(admin, s2, empIds.slice(4));
  API.punch(admin, empIds[0], 'in', 31.5205, 74.3588, '', 'DEV-001', 'app');
  API.punch(admin, empIds[1], 'in', 31.5206, 74.3586, '', '', 'app');
  API.requestLeave(admin, empIds[1], 'LT-0001', todayStr_(), addDays_(todayStr_(), 2), 3, 'Family event');
  API.grantAdvance(admin, empIds[2], todayStr_(), 20000, 4);

  /* the track under test, twice for idempotency */
  var r1 = seedTrack7Demo_(ss);
  var snapshot1 = JSON.stringify(Object.keys(ss.sheets).sort().map(function (n) {
    return [n, trows_(ss, n).map(clean_)];
  }));
  var r2 = seedTrack7Demo_(ss);
  var snapshot2 = JSON.stringify(Object.keys(ss.sheets).sort().map(function (n) {
    return [n, trows_(ss, n).map(clean_)];
  }));

  var tabs = {};
  ['overtime','holidays','rosters','payComponents','payrollRuns','payslips',
   'contractors','contractorBills','attendance','leaveRequests',
   'salaryStructures','messageLog','employees','sites','shifts','advances'
  ].forEach(function (n) { tabs[n] = trows_(ss, n).map(clean_); });
  return { r1: r1, r2: r2, same: snapshot1 === snapshot2, tabs: tabs,
           empIds: empIds, s1: s1, s2: s2, today: todayStr_() };
})();`;

const factory = new Function('MockSS', 'MockSheet', 'SpreadsheetApp', 'Session',
  'Utilities', 'Logger', codeSrc + '\n' + t2Src + '\n' + t7Src + '\nreturn ' + driver);
const G = factory(MockSS, MockSheet, SpreadsheetApp, Session, Utilities, Logger);

/* ---------- assertions ---------- */
const failures = [];
function assert(cond, msg) { if (!cond) failures.push(msg); }
const T = G.tabs;
const empSet = new Set(T.employees.map(e => String(e.id)));
const num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
const isISODate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

assert(G.same, 'seedTrack7Demo_ is not idempotent (second run changed rows)');

/* overtime */
assert(T.overtime.length === 3, 'overtime: expected 3 rows, got ' + T.overtime.length);
const otStates = new Set(T.overtime.map(o => o.status));
['pending', 'approved', 'rejected'].forEach(s => assert(otStates.has(s), 'overtime: missing state ' + s));
T.overtime.forEach(o => {
  assert(empSet.has(String(o.employeeId)), 'overtime: orphan employeeId ' + o.employeeId);
  assert(isISODate(o.date), 'overtime: bad date ' + o.date);
  assert(num(o.hours) > 0, 'overtime: non-positive hours');
});

/* holidays */
assert(T.holidays.length === 4, 'holidays: expected 4 rows, got ' + T.holidays.length);
T.holidays.forEach(h => {
  assert(isISODate(h.date), 'holidays: bad date ' + h.date);
  assert(String(h.name).length > 0, 'holidays: empty name');
});

/* rosters: 6 employees x 6 days + 2 Sunday night = 38 */
assert(T.rosters.length === 38, 'rosters: expected 38 rows, got ' + T.rosters.length);
const siteSet = new Set(T.sites.map(s => String(s.id)));
T.rosters.forEach(r => {
  assert(empSet.has(String(r.employeeId)), 'rosters: orphan employeeId ' + r.employeeId);
  assert(['SH-0001', 'SH-0002', 'SH-0003'].indexOf(String(r.shiftId)) >= 0, 'rosters: bad shiftId ' + r.shiftId);
  assert(siteSet.has(String(r.siteId)), 'rosters: orphan siteId ' + r.siteId);
  assert(String(r.date) >= '2026-10-05' && String(r.date) <= '2026-10-11', 'rosters: date outside week ' + r.date);
});

/* pay components */
assert(T.payComponents.length === 3, 'payComponents: expected 3 rows, got ' + T.payComponents.length);
T.payComponents.forEach(c => {
  assert(['allowance', 'deduction'].indexOf(c.kind) >= 0, 'payComponents: bad kind ' + c.kind);
  assert(num(c.amount) > 0, 'payComponents: non-positive amount');
});

/* payroll run */
assert(T.payrollRuns.length === 1, 'payrollRuns: expected 1 row, got ' + T.payrollRuns.length);
const run = T.payrollRuns[0];
assert(run.month === '2026-09', 'payrollRuns: bad month ' + run.month);
assert(run.status === 'completed', 'payrollRuns: status not completed: ' + run.status);
assert(T.payslips.length === 3, 'payslips: expected 3 rows, got ' + T.payslips.length);
T.payslips.forEach(p => {
  assert(String(p.runId) === String(run.id), 'payslips: orphan runId ' + p.runId);
  assert(empSet.has(String(p.employeeId)), 'payslips: orphan employeeId ' + p.employeeId);
  const paid = p.paid === true || p.paid === 'TRUE' || p.paid === 'true' || p.paid === 1;
  assert(paid, 'payslips: slip not marked paid for ' + p.employeeId);
  /* runPayroll stores deductions = components + advanceRecovery, net = salary + allowances - deductions */
  const expect = Math.round((num(p.salary) + num(p.allowances) - num(p.deductions)) * 100) / 100;
  assert(Math.abs(expect - num(p.net)) < 0.01,
    'payslips: net mismatch for ' + p.employeeId + ' expected ' + expect + ' got ' + p.net);
});
/* advance recovery applied to EMP-003 (20000 / 4 installments) */
const emp3slip = T.payslips.filter(p => String(p.employeeId) === String(G.empIds[2]))[0];
assert(emp3slip && num(emp3slip.advanceRecovery) === 5000,
  'payslips: EMP-003 advanceRecovery should be 5000, got ' + (emp3slip && emp3slip.advanceRecovery));

/* contractors + bills */
assert(T.contractors.length === 2, 'contractors: expected 2 rows, got ' + T.contractors.length);
assert(T.contractorBills.length === 3, 'contractorBills: expected 3 rows, got ' + T.contractorBills.length);
const ctrSet = new Set(T.contractors.map(c => String(c.id)));
const billStates = new Set(T.contractorBills.map(b => b.status));
assert(billStates.has('pending') && billStates.has('approved'), 'contractorBills: need mixed pending+approved');
T.contractorBills.forEach(b => {
  assert(ctrSet.has(String(b.contractorId)), 'contractorBills: orphan contractorId ' + b.contractorId);
  assert(/^\d{4}-\d{2}$/.test(String(b.month)), 'contractorBills: bad month ' + b.month);
  assert(num(b.amount) > 0, 'contractorBills: non-positive amount');
});

/* attendance sample punches */
const demoPunches = T.attendance.filter(a => a.note === 'Demo sample punch');
assert(demoPunches.length === 12, 'attendance: expected 12 demo punches, got ' + demoPunches.length);
const outZone = demoPunches.filter(a => a.outOfZone === true || a.outOfZone === 'TRUE' || a.outOfZone === 'true');
const inZone = demoPunches.filter(a => !(a.outOfZone === true || a.outOfZone === 'TRUE' || a.outOfZone === 'true'));
assert(outZone.length >= 1, 'attendance: expected at least one out-of-zone punch');
assert(inZone.length >= 1, 'attendance: expected in-zone punches');
demoPunches.forEach(a => {
  assert(empSet.has(String(a.employeeId)), 'attendance: orphan employeeId ' + a.employeeId);
  assert(['2026-10-02', '2026-10-05', '2026-10-06'].indexOf(String(a.date)) >= 0,
    'attendance: unexpected demo punch date ' + a.date);
  assert(['in', 'out'].indexOf(a.type) >= 0, 'attendance: bad type ' + a.type);
});

/* extra leave request: approved */
const demoLeave = T.leaveRequests.filter(l => String(l.reason).indexOf('demo sample') >= 0);
assert(demoLeave.length === 1, 'leaveRequests: expected 1 demo leave, got ' + demoLeave.length);
if (demoLeave.length) {
  assert(demoLeave[0].status === 'approved', 'leaveRequests: demo leave not approved');
  assert(String(demoLeave[0].decidedBy) === 'U-0001', 'leaveRequests: bad decidedBy');
  assert(empSet.has(String(demoLeave[0].employeeId)), 'leaveRequests: orphan employeeId');
}

/* salary structures (track 2 tab) */
assert(T.salaryStructures.length === 2, 'salaryStructures: expected 2 rows, got ' + T.salaryStructures.length);
T.salaryStructures.forEach(s => {
  assert(empSet.has(String(s.employeeId)), 'salaryStructures: orphan employeeId ' + s.employeeId);
  assert(num(s.basic) > 0, 'salaryStructures: non-positive basic');
  try { JSON.parse(s.allowancesJson || '{}'); }
  catch (e) { failures.push('salaryStructures: allowancesJson not valid JSON'); }
});

/* message log (track 3 tab, provisional schema) */
assert(T.messageLog.length === 2, 'messageLog: expected 2 rows, got ' + T.messageLog.length);
T.messageLog.forEach(m => {
  assert(m.status === 'pending-config', 'messageLog: status not pending-config: ' + m.status);
});

/* no literal '//' anywhere in the shipped track file */
const t7src = fs.readFileSync(ROOT + '/codesections/track7.gs', 'utf8');
assert(t7src.indexOf('//') < 0, 'track7.gs contains a literal //');

/* ---------- report ---------- */
console.log('seedTrack7Demo_ returned: ' + G.r1 + ' / ' + G.r2);
console.log('rows seeded per tab:');
[['overtime', 3], ['holidays', 4], ['rosters', 38], ['payComponents', 3],
 ['payrollRuns', 1], ['payslips', 3], ['contractors', 2], ['contractorBills', 3],
 ['attendance(demo punches)', 12], ['leaveRequests(demo)', 1],
 ['salaryStructures', 2], ['messageLog', 2]
].forEach(([k]) => console.log('  ' + k));
console.log('payroll math check: EMP-001 net=' + T.payslips.filter(p => String(p.employeeId) === String(G.empIds[0]))[0].net +
  ' EMP-002 net=' + T.payslips.filter(p => String(p.employeeId) === String(G.empIds[1]))[0].net +
  ' EMP-003 net=' + T.payslips.filter(p => String(p.employeeId) === String(G.empIds[2]))[0].net +
  ' (advRec 5000)');
console.log('out-of-zone demo punches: ' + outZone.length + ', in-zone: ' + inZone.length);
console.log('idempotent second run: ' + (G.same ? 'yes' : 'NO'));
if (failures.length) {
  console.log('\nFAILURES (' + failures.length + '):');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log('\nALL TRACK 7 QA CHECKS PASSED');
