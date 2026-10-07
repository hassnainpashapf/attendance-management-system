/* ===== TRACK 2: auto salary ===== */
/* Auto salary from attendance: SalaryStructures tab, per-employee monthly salary
   computation (present / absent / late / overtime / leave), salary payroll runs
   (payrollRuns.runType = 'salary') with per-employee payslip rows carrying a
   JSON breakdown, plus a printable payslip view.
   Integration: the coordinator appends this whole section to Code.gs and wires
   seedTrack2Tabs_(ss) for new and existing tenants. */

/* --- schema extensions (idempotent; run once when this section loads) --- */
if (!SHEETS.salaryStructures)
  SHEETS.salaryStructures = ['id', 'employeeId', 'basic', 'allowancesJson', 'effectiveFrom', 'payFrequency'];
if (SHEETS.payrollRuns.indexOf('runType') < 0) SHEETS.payrollRuns.push('runType');
if (SHEETS.payslips.indexOf('breakdownJson') < 0) SHEETS.payslips.push('breakdownJson');

/* --- seed for new + existing tenants (safe to re-run) --- */
function seedTrack2Tabs_(ss) {
  sheetOf_(ss, 'salaryStructures');
  var defaults = [
    ['absentDeductionPerDay', '30'],
    ['lateGraceMinutes', '15'],
    ['latePenaltyMinutes', '60'],
    ['overtimeRateMultiplier', '1.5'],
    ['salaryWorkHoursPerDay', '8']
  ];
  var have = {};
  trows_(ss, 'settings').forEach(function (r) { have[r.key] = true; });
  defaults.forEach(function (kv) {
    if (!have[kv[0]]) tappend_(ss, 'settings', { key: kv[0], value: kv[1] });
  });
  return 'track2 seeded';
}

/* --- pure helpers (no GAS services; unit-tested by qa_salary.js) --- */
function t2r2_(n) { return Math.round(num_(n) * 100) / 100; }

function monthBounds_(yyyyMM) {
  var y = Number(String(yyyyMM).slice(0, 4)), m = Number(String(yyyyMM).slice(5, 7));
  var lastDay = new Date(y, m, 0).getDate();
  return { year: y, month: m, first: yyyyMM + '-01', last: yyyyMM + '-' + pad2_(lastDay), days: lastDay };
}

/* latest structure whose effectiveFrom is on/before the month's last day */
function pickStructure_(structs, employeeId, lastDay) {
  var best = null;
  (structs || []).forEach(function (s) {
    if (String(s.employeeId) !== String(employeeId)) return;
    var eff = String(s.effectiveFrom || '');
    if (!eff || eff > lastDay) return;
    if (!best || eff > String(best.effectiveFrom || '')) best = s;
  });
  return best;
}

/* Pure salary math. input: {employeeId, employeeName, month, basic, allowances{label:amt},
   settings{absentDivisor, lateGraceMinutes, latePenaltyMinutes, overtimeRateMultiplier,
   workHoursPerDay}, days[{date, working, joined, present, inTime, shiftStart, paidLeave,
   unpaidLeave}], overtime[{hours, rate}], prorated, proRateFactor}
   Money is computed in integer paisa so results are deterministic to the paisa. */
function computeSalaryCore_(input) {
  var s = input.settings || {};
  var P = function (n) { return Math.round(num_(n) * 100); };
  var R = function (p) { return Math.round(p) / 100; };
  var basicP = P(input.basic), allowP = 0, allowDetail = {};
  Object.keys(input.allowances || {}).forEach(function (k) {
    var v = P(input.allowances[k]); allowDetail[k] = R(v); allowP += v;
  });
  var grossP = basicP + allowP;
  var divisor = Math.max(1, num_(s.absentDivisor) || 30);
  var whpd = Math.max(1, num_(s.workHoursPerDay) || 8);
  var dailyP = Math.round(grossP / divisor);
  var hourlyP = Math.round(dailyP / whpd);
  var daysPresent = 0, daysAbsent = 0, lateCount = 0;
  var paidLeaveDays = 0, unpaidLeaveDays = 0, workDays = 0;
  var absentP = 0, lateP = 0;
  var grace = num_(s.lateGraceMinutes), penaltyMin = num_(s.latePenaltyMinutes);
  (input.days || []).forEach(function (d) {
    if (!d.working || !d.joined) return;
    workDays++;
    if (d.paidLeave) { paidLeaveDays++; return; }
    if (d.unpaidLeave) { unpaidLeaveDays++; absentP += dailyP; return; }
    if (!d.present) { daysAbsent++; absentP += dailyP; return; }
    daysPresent++;
    if (d.inTime && d.shiftStart) {
      var lateMins = minsBetween_(d.shiftStart, d.inTime) - grace;
      if (lateMins > 0) { lateCount++; lateP += Math.round((penaltyMin / 60) * hourlyP); }
    }
  });
  var overtimeHours = 0, otP = 0;
  (input.overtime || []).forEach(function (o) {
    var h = num_(o.hours); if (h <= 0) return;
    overtimeHours = Math.round((overtimeHours + h) * 100) / 100;
    var rateP = num_(o.rate) > 0 ? P(o.rate) : Math.round(hourlyP * num_(s.overtimeRateMultiplier));
    otP += Math.round(h * rateP);
  });
  var netP = grossP - absentP - lateP + otP;
  return {
    employeeId: input.employeeId, employeeName: input.employeeName || '', month: input.month,
    basic: R(basicP), allowances: R(allowP), allowancesDetail: allowDetail, gross: R(grossP),
    absentDeduction: R(absentP), lateDeduction: R(lateP),
    overtimePay: R(otP), net: R(netP),
    daysPresent: daysPresent, daysAbsent: daysAbsent, lateCount: lateCount,
    overtimeHours: overtimeHours, paidLeaveDays: paidLeaveDays, unpaidLeaveDays: unpaidLeaveDays,
    workDays: workDays, dailyWage: R(dailyP), hourlyWage: R(hourlyP),
    prorated: !!input.prorated,
    proRateFactor: input.proRateFactor == null ? 1 : Math.round(input.proRateFactor * 100) / 100
  };
}

/* --- sheet-reading builder (GAS services) --- */
function buildSalaryInput_(ss, employeeId, yyyyMM) {
  var b = monthBounds_(yyyyMM);
  var emp = empById_(ss, employeeId);
  if (!emp) throw new Error('Employee not found');
  if (!bool_(emp.active)) throw new Error('Employee is not active');
  var st = pickStructure_(trows_(ss, 'salaryStructures'), employeeId, b.last);
  if (!st) throw new Error('No salary structure for this employee');
  var pf = String(st.payFrequency || 'monthly').toLowerCase();
  if (pf !== 'monthly') throw new Error('Pay frequency "' + pf + '" is not supported yet (monthly only)');
  var basic = num_(st.basic);
  if (!(basic > 0)) throw new Error('Salary structure has no basic pay');
  var allowances = {};
  try { allowances = JSON.parse(st.allowancesJson || '{}') || {}; } catch (e) { allowances = {}; }
  var joinDate = String(emp.joinDate || '') || b.first;
  if (joinDate > b.last) throw new Error('Employee joins after this month');
  var wdNames = String(tsetting_(ss, 'workingDays', 'Mon,Tue,Wed,Thu,Fri,Sat')).split(',');
  var dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var holidays = {};
  trows_(ss, 'holidays').forEach(function (h) { holidays[String(h.date)] = true; });
  var prorated = false, factor = 1;
  if (joinDate > b.first) {
    var tot = 0, eff = 0;
    for (var d = 1; d <= b.days; d++) {
      var iso0 = yyyyMM + '-' + pad2_(d);
      var w0 = wdNames.indexOf(dowNames[new Date(b.year, b.month - 1, d).getDay()]) >= 0 && !holidays[iso0];
      if (w0) { tot++; if (iso0 >= joinDate) eff++; }
    }
    if (tot > 0) { factor = eff / tot; prorated = true; }
  }
  if (prorated) {
    basic = t2r2_(basic * factor);
    Object.keys(allowances).forEach(function (k) { allowances[k] = t2r2_(num_(allowances[k]) * factor); });
  }
  var byDate = {};
  trows_(ss, 'attendance').forEach(function (a) {
    if (String(a.employeeId) !== String(employeeId)) return;
    if (a.date < b.first || a.date > b.last) return;
    var r = byDate[a.date] || (byDate[a.date] = { present: true, inTime: null, anyTime: null });
    r.present = true;
    if (a.time) {
      if (a.type === 'in' && (!r.inTime || a.time < r.inTime)) r.inTime = a.time;
      if (!r.anyTime || a.time < r.anyTime) r.anyTime = a.time;
    }
  });
  var leaveTypes = {};
  trows_(ss, 'leaveTypes').forEach(function (t) { leaveTypes[t.id] = bool_(t.paid); });
  var leaveByDate = {};
  trows_(ss, 'leaveRequests').forEach(function (l) {
    if (String(l.employeeId) !== String(employeeId) || l.status !== 'approved') return;
    var paid = leaveTypes[l.typeId] !== false;
    for (var d = 1; d <= b.days; d++) {
      var iso = yyyyMM + '-' + pad2_(d);
      if (iso >= String(l.from) && iso <= String(l.to)) leaveByDate[iso] = paid ? 'paid' : 'unpaid';
    }
  });
  var shifts = trows_(ss, 'shifts').slice().sort(function (x, y) {
    return String(x.startTime).localeCompare(String(y.startTime));
  });
  var shiftById = {};
  shifts.forEach(function (x) { shiftById[x.id] = x.startTime; });
  var rosterByDate = {};
  trows_(ss, 'rosters').forEach(function (r) {
    if (String(r.employeeId) === String(employeeId)) rosterByDate[String(r.date)] = r.shiftId;
  });
  var days = [];
  for (var d = 1; d <= b.days; d++) {
    var iso = yyyyMM + '-' + pad2_(d);
    var dow = dowNames[new Date(b.year, b.month - 1, d).getDay()];
    var att = byDate[iso];
    days.push({
      date: iso,
      working: wdNames.indexOf(dow) >= 0 && !holidays[iso],
      joined: iso >= joinDate,
      present: !!(att && att.present),
      inTime: att ? (att.inTime || att.anyTime || null) : null,
      shiftStart: shiftById[rosterByDate[iso]] || (shifts[0] && shifts[0].startTime) || '09:00',
      paidLeave: leaveByDate[iso] === 'paid',
      unpaidLeave: leaveByDate[iso] === 'unpaid'
    });
  }
  var ot = [];
  trows_(ss, 'overtime').forEach(function (o) {
    if (String(o.employeeId) !== String(employeeId) || o.status !== 'approved') return;
    if (o.date >= b.first && o.date <= b.last) ot.push({ hours: num_(o.hours), rate: num_(o.rate) });
  });
  return {
    employeeId: employeeId, employeeName: emp.name, month: yyyyMM,
    basic: basic, allowances: allowances,
    settings: {
      absentDivisor: num_(tsetting_(ss, 'absentDeductionPerDay', '30')) || 30,
      lateGraceMinutes: num_(tsetting_(ss, 'lateGraceMinutes', '15')),
      latePenaltyMinutes: num_(tsetting_(ss, 'latePenaltyMinutes', '60')),
      overtimeRateMultiplier: num_(tsetting_(ss, 'overtimeRateMultiplier', '1.5')) || 1.5,
      workHoursPerDay: num_(tsetting_(ss, 'salaryWorkHoursPerDay', '8')) || 8
    },
    days: days, overtime: ot, prorated: prorated, proRateFactor: factor
  };
}

/* --- API registrations (dispatcher __api routes API[fn] to these) --- */
API.computeMonthlySalary = function (user, employeeId, yyyyMM) {
  requireUser_(user); need_(user, 'payroll_manage');
  if (!/^\d{4}-\d{2}$/.test(String(yyyyMM || ''))) throw new Error('Month must be in yyyy-MM format');
  return computeSalaryCore_(buildSalaryInput_(TSS_(user), employeeId, yyyyMM));
};

API.listSalaryStructures = function (user) {
  requireUser_(user); need_(user, 'payroll_manage');
  var ss = TSS_(user), emps = {};
  trows_(ss, 'employees').forEach(function (e) { emps[e.id] = e; });
  return trows_(ss, 'salaryStructures').map(function (s) {
    s = clean_(s);
    var e = emps[s.employeeId] || {};
    s.employeeName = e.name || '?'; s.employeeCode = e.code || '';
    s.basic = num_(s.basic);
    try { s.allowancesDetail = JSON.parse(s.allowancesJson || '{}') || {}; }
    catch (e2) { s.allowancesDetail = {}; }
    return s;
  }).sort(function (a, b) { return String(a.employeeName).localeCompare(String(b.employeeName)); });
};

API.saveSalaryStructure = function (user, s) {
  requireUser_(user); need_(user, 'payroll_manage');
  var ss = TSS_(user);
  s = s || {};
  if (!empById_(ss, s.employeeId)) throw new Error('Employee not found');
  if (!(num_(s.basic) > 0)) throw new Error('Basic pay must be greater than zero');
  var aj = s.allowancesJson;
  if (aj && typeof aj === 'object') aj = JSON.stringify(aj);
  try { JSON.parse(aj || '{}'); } catch (e) { throw new Error('Allowances must be valid JSON'); }
  var obj = { employeeId: s.employeeId, basic: num_(s.basic), allowancesJson: aj || '{}',
    effectiveFrom: s.effectiveFrom || todayStr_(), payFrequency: s.payFrequency || 'monthly' };
  var ex = null;
  if (s.id) ex = trows_(ss, 'salaryStructures').filter(function (x) { return x.id === s.id; })[0];
  else ex = trows_(ss, 'salaryStructures').filter(function (x) {
    return String(x.employeeId) === String(obj.employeeId) && String(x.effectiveFrom) === String(obj.effectiveFrom);
  })[0];
  var id;
  if (ex) { obj.id = ex.id; tupdate_(ss, 'salaryStructures', ex.id, obj); id = ex.id; }
  else { obj.id = tnextId_(ss, 'SS', 'salaryStructures'); tappend_(ss, 'salaryStructures', obj); id = obj.id; }
  audit_(user, 'saveSalaryStructure', id + ' ' + s.employeeId);
  return id;
};

API.generateMonthlySalaries = function (user, yyyyMM) {
  requireUser_(user); need_(user, 'payroll_manage');
  if (!/^\d{4}-\d{2}$/.test(String(yyyyMM || ''))) throw new Error('Month must be in yyyy-MM format');
  var ss = TSS_(user);
  var run = trows_(ss, 'payrollRuns').filter(function (r) {
    return r.month === yyyyMM && (r.runType || 'manual') === 'salary' && r.status !== 'cancelled';
  })[0];
  var runId;
  if (run) {
    if (run.status === 'finalized')
      throw new Error('Salary run for ' + yyyyMM + ' is finalized and cannot be regenerated');
    runId = run.id;
    trows_(ss, 'payslips').forEach(function (p) {
      if (String(p.runId) === String(runId)) tremove_(ss, 'payslips', p.id);
    });
    tupdate_(ss, 'payrollRuns', runId,
      { id: runId, month: yyyyMM, createdAt: nowStr_(), createdBy: user.id, status: 'draft', runType: 'salary' });
  } else {
    runId = tnextId_(ss, 'RUN', 'payrollRuns');
    tappend_(ss, 'payrollRuns',
      { id: runId, month: yyyyMM, createdAt: nowStr_(), createdBy: user.id, status: 'draft', runType: 'salary' });
  }
  var generated = [], skipped = [];
  trows_(ss, 'employees').filter(function (e) { return bool_(e.active); }).forEach(function (e) {
    try {
      var bd = computeSalaryCore_(buildSalaryInput_(ss, e.id, yyyyMM));
      var slip = { id: tnextId_(ss, 'SLIP', 'payslips'), runId: runId, employeeId: e.id,
        salary: bd.basic, allowances: bd.allowances,
        deductions: t2r2_(bd.absentDeduction + bd.lateDeduction),
        advanceRecovery: 0, net: bd.net, paid: false, breakdownJson: JSON.stringify(bd) };
      tappend_(ss, 'payslips', slip);
      generated.push({ employeeId: e.id, employeeName: e.name, employeeCode: e.code, net: bd.net,
        daysPresent: bd.daysPresent, daysAbsent: bd.daysAbsent,
        lateCount: bd.lateCount, overtimeHours: bd.overtimeHours });
    } catch (err) {
      skipped.push({ employeeId: e.id, employeeName: e.name, employeeCode: e.code, reason: err.message });
    }
  });
  audit_(user, 'generateMonthlySalaries', yyyyMM + ' generated=' + generated.length + ' skipped=' + skipped.length);
  return { runId: runId, month: yyyyMM, generated: generated, skipped: skipped,
    totalNet: t2r2_(generated.reduce(function (s, g) { return s + g.net; }, 0)) };
};

API.listPayslips = function (user, runId) {
  requireUser_(user); need_(user, 'payroll_manage');
  var ss = TSS_(user), emps = {};
  trows_(ss, 'employees').forEach(function (e) { emps[e.id] = e; });
  var run = trows_(ss, 'payrollRuns').filter(function (r) { return r.id === runId; })[0] || {};
  return trows_(ss, 'payslips').filter(function (p) { return String(p.runId) === String(runId); }).map(function (p) {
    p = clean_(p);
    var e = emps[p.employeeId] || {};
    p.employeeName = e.name || '?'; p.employeeCode = e.code || '';
    p.month = run.month || ''; p.runType = run.runType || 'manual';
    ['salary', 'allowances', 'deductions', 'advanceRecovery', 'net'].forEach(function (k) { p[k] = num_(p[k]); });
    p.paid = bool_(p.paid);
    return p;
  }).sort(function (a, b) { return String(a.employeeName).localeCompare(String(b.employeeName)); });
};

API.getSalaryPayslip = function (user, runId, employeeId) {
  requireUser_(user);
  if (user.role === 'employee' || user.role === 'user') selfOnly_(user, employeeId);
  else need_(user, 'payroll_manage');
  var ss = TSS_(user);
  var p = trows_(ss, 'payslips').filter(function (x) {
    return String(x.runId) === String(runId) && String(x.employeeId) === String(employeeId);
  })[0];
  if (!p) throw new Error('Payslip not found');
  var emp = empById_(ss, p.employeeId) || {};
  var run = trows_(ss, 'payrollRuns').filter(function (r) { return r.id === p.runId; })[0] || {};
  p = clean_(p);
  ['salary', 'allowances', 'deductions', 'advanceRecovery', 'net'].forEach(function (k) { p[k] = num_(p[k]); });
  p.paid = bool_(p.paid);
  var breakdown = null;
  try { breakdown = JSON.parse(p.breakdownJson || 'null'); } catch (e) { breakdown = null; }
  return { payslip: p, employee: clean_(emp), run: clean_(run),
    company: tsetting_(ss, 'companyName', ''), breakdown: breakdown };
};
