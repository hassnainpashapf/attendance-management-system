/* ===== TRACK 7: rich demo data (perception fix) =====
   Seeds tasteful, realistic sample rows for the DEMO tenant only, so the
   Overtime, Holidays, Rosters, Payroll, Pay Components, Contractors,
   Contractor Bills, Attendance history, Salary Structures and Message Log
   pages open with content on first login instead of looking empty.
   Wiring: the coordinator calls seedTrack7Demo_(ss) inside seedDemo() after
   the demo employees, sites and shifts exist, and after the parallel track
   tab seeders (seedTrackNTabs_) have created their tabs. This file never
   touches Code.gs or seedDemo() directly.
   Every tab is seeded only when it has no rows yet, so re-running never
   duplicates. Wherever a real API enforces validation, seeding goes through
   that API (requestOvertime, decideOvertime, saveHoliday, saveRoster,
   savePayComponent, runPayroll, markPayslipPaid, saveContractor,
   saveContractorBill, decideContractorBill, requestLeave, decideLeave,
   saveSalaryStructure). Historical attendance punches are written straight
   to the tab because API.punch always stamps the current day; each row is
   built exactly the way API.punch builds it (same header order, site
   resolution through siteForPunch_). All dates are ISO strings. Sample rows
   carry a (demo sample) marker so they read as examples, not real data. */

/* Admin session for API calls: the demo tenant admin created by seedDemo. */
function t7admin_(ss) {
  return { id: 'U-0001', name: 'Admin', username: 'admin', role: 'admin',
           spreadsheetId: ss.getId() };
}

/* Demo employee id by its EMP-00x code (seeded by seedDemo). */
function t7empId_(ss, code) {
  var r = trows_(ss, 'employees').filter(function (e) { return String(e.code) === code; })[0];
  return r ? String(r.id) : '';
}

/* Demo site id by name. */
function t7siteId_(ss, name) {
  var r = trows_(ss, 'sites').filter(function (s) { return String(s.name) === name; })[0];
  return r ? String(r.id) : '';
}

/* One historical attendance punch, built exactly like API.punch builds rows.
   API.punch cannot be used because it always stamps the current day. */
function t7punch_(ss, employeeId, date, type, time, lat, lng, deviceId) {
  var site = siteForPunch_(ss, employeeId, lat, lng);
  tappend_(ss, 'attendance', {
    id: tnextId_(ss, 'P', 'attendance'), employeeId: employeeId, date: date,
    type: type, time: time, lat: num_(lat), lng: num_(lng), selfie: '',
    siteId: site ? site.id : '',
    distanceM: site ? Math.round(site.distanceM) : '',
    outOfZone: site ? !!site.outOfZone : true,
    source: 'app', deviceId: deviceId || '', syncedAt: nowStr_(),
    note: 'Demo sample punch'
  });
}

/* Seed rich demo data for the demo tenant. Idempotent: a tab is seeded only
   when it has no rows yet. */
function seedTrack7Demo_(ss, tenantId) {
  var admin = t7admin_(ss);
  tenantId = tenantId || '';

  /* Parallel track tabs: call their seeders, never their internals. */
  if (typeof seedTrack2Tabs_ === 'function') seedTrack2Tabs_(ss);

  /* Demo employees EMP-001..EMP-006 and the two demo sites must exist. */
  var E = {};
  ['EMP-001', 'EMP-002', 'EMP-003', 'EMP-004', 'EMP-005', 'EMP-006'].forEach(function (c) {
    E[c] = t7empId_(ss, c);
    if (!E[c]) throw new Error('seedTrack7Demo_ needs demo employee ' + c);
  });
  var S1 = t7siteId_(ss, 'Main Site Gulberg');
  var S2 = t7siteId_(ss, 'DHA Site Lahore');
  if (!S1 || !S2) throw new Error('seedTrack7Demo_ needs the demo sites');

  /* ---- overtime: pending, approved, rejected ---- */
  if (!trows_(ss, 'overtime').length) {
    var ot1 = API.requestOvertime(admin, E['EMP-001'], addDays_(todayStr_(), -2), 3, 500,
      'Concrete pour ran past shift end (demo sample)');
    var ot2 = API.requestOvertime(admin, E['EMP-002'], addDays_(todayStr_(), -4), 2.5, 500,
      'Material unloading after shift (demo sample)');
    var ot3 = API.requestOvertime(admin, E['EMP-003'], addDays_(todayStr_(), -7), 4, 450,
      'Weekend standby claimed (demo sample)');
    API.decideOvertime(admin, ot2, true);
    API.decideOvertime(admin, ot3, false);
  }

  /* ---- holidays: past + upcoming Pakistan public holidays ---- */
  if (!trows_(ss, 'holidays').length) {
    [['2026-08-14', 'Independence Day'],
     ['2026-08-27', 'Eid Milad-un-Nabi'],
     ['2026-11-09', 'Iqbal Day'],
     ['2026-12-25', 'Quaid-e-Azam Day']
    ].forEach(function (h) {
      API.saveHoliday(admin, { date: h[0], name: h[1] });
    });
  }

  /* ---- rosters: one full Mon-Sun week across demo sites and shifts ---- */
  if (!trows_(ss, 'rosters').length) {
    var week = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08',
                '2026-10-09', '2026-10-10'];
    week.forEach(function (d) {
      API.saveRoster(admin, { date: d, employeeId: E['EMP-001'], shiftId: 'SH-0001', siteId: S1 });
      API.saveRoster(admin, { date: d, employeeId: E['EMP-002'], shiftId: 'SH-0001', siteId: S1 });
      API.saveRoster(admin, { date: d, employeeId: E['EMP-003'], shiftId: 'SH-0001', siteId: S1 });
      API.saveRoster(admin, { date: d, employeeId: E['EMP-004'], shiftId: 'SH-0002', siteId: S1 });
      API.saveRoster(admin, { date: d, employeeId: E['EMP-005'], shiftId: 'SH-0001', siteId: S2 });
      API.saveRoster(admin, { date: d, employeeId: E['EMP-006'], shiftId: 'SH-0001', siteId: S2 });
    });
    /* Sunday night-shift cover at the main site */
    API.saveRoster(admin, { date: '2026-10-11', employeeId: E['EMP-001'], shiftId: 'SH-0003', siteId: S1 });
    API.saveRoster(admin, { date: '2026-10-11', employeeId: E['EMP-002'], shiftId: 'SH-0003', siteId: S1 });
  }

  /* ---- pay components: allowances + one deduction, approved ---- */
  if (!trows_(ss, 'payComponents').length) {
    API.savePayComponent(admin, { name: 'House Allowance', kind: 'allowance',
      amount: 15000, appliesTo: 'all', approved: true });
    API.savePayComponent(admin, { name: 'Conveyance Allowance', kind: 'allowance',
      amount: 5000, appliesTo: 'all', approved: true });
    API.savePayComponent(admin, { name: 'Provident Fund', kind: 'deduction',
      amount: 2000, appliesTo: 'all', approved: true });
  }

  /* ---- payroll: one completed, fully-paid run for last month ---- */
  if (!trows_(ss, 'payrollRuns').length) {
    var run = API.runPayroll(admin, '2026-09',
      [E['EMP-001'], E['EMP-002'], E['EMP-003']]);
    run.slips.forEach(function (id) { API.markPayslipPaid(admin, id); });
    var rr = trows_(ss, 'payrollRuns').filter(function (x) { return x.id === run.runId; })[0];
    if (rr) {
      rr = clean_(rr);
      rr.status = 'completed';
      tupdate_(ss, 'payrollRuns', rr.id, rr);
    }
  }

  /* ---- contractors + bills: mixed paid and pending ---- */
  if (!trows_(ss, 'contractors').length) {
    var c1 = API.saveContractor(admin, { name: 'Rashid Mehmood', company: 'RM Builders',
      phone: '0300-7777777', rate: 25000, active: true });
    var c2 = API.saveContractor(admin, { name: 'Khalid Javed', company: 'KJ Electricals',
      phone: '0300-8888888', rate: 18000, active: true });
    var b1 = API.saveContractorBill(admin, { contractorId: c1, month: '2026-08',
      amount: 750000, note: 'August labor supply (demo sample)' });
    var b2 = API.saveContractorBill(admin, { contractorId: c1, month: '2026-09',
      amount: 800000, note: 'September labor supply (demo sample)' });
    var b3 = API.saveContractorBill(admin, { contractorId: c2, month: '2026-09',
      amount: 540000, note: 'September electrical work (demo sample)' });
    API.decideContractorBill(admin, b1, true);
    API.decideContractorBill(admin, b2, true);
  }

  /* ---- extra attendance punches across past days ----
     On-time, late and one out-of-zone pair, near the Lahore demo sites. */
  if (!trows_(ss, 'attendance').some(function (a) { return a.note === 'Demo sample punch'; })) {
    var P = [
      ['2026-10-02', 'EMP-001', 'in',  '07:58:12', 31.5205, 74.3588, 'DEV-001'],
      ['2026-10-02', 'EMP-001', 'out', '17:05:44', 31.5205, 74.3588, 'DEV-001'],
      ['2026-10-02', 'EMP-002', 'in',  '08:22:30', 31.5206, 74.3586, ''],
      ['2026-10-02', 'EMP-002', 'out', '17:12:05', 31.5206, 74.3586, ''],
      ['2026-10-05', 'EMP-001', 'in',  '08:02:41', 31.5205, 74.3588, 'DEV-001'],
      ['2026-10-05', 'EMP-001', 'out', '17:00:19', 31.5205, 74.3588, 'DEV-001'],
      ['2026-10-05', 'EMP-004', 'in',  '08:10:03', 31.5203, 74.3589, ''],
      ['2026-10-05', 'EMP-004', 'out', '17:03:55', 31.5203, 74.3589, ''],
      ['2026-10-06', 'EMP-003', 'in',  '08:15:20', 31.5300, 74.3700, ''],
      ['2026-10-06', 'EMP-003', 'out', '17:01:33', 31.5300, 74.3700, ''],
      ['2026-10-06', 'EMP-005', 'in',  '08:55:10', 31.5498, 74.3437, ''],
      ['2026-10-06', 'EMP-005', 'out', '18:00:22', 31.5498, 74.3437, '']
    ];
    P.forEach(function (p) {
      t7punch_(ss, E[p[1]], p[0], p[2], p[3], p[4], p[5], p[6]);
    });
  }

  /* ---- one more leave request, approved (sick leave) ---- */
  if (!trows_(ss, 'leaveRequests').some(function (l) {
        return String(l.reason).indexOf('demo sample') >= 0; })) {
    var lr = API.requestLeave(admin, E['EMP-004'], 'LT-0002',
      '2026-09-21', '2026-09-22', 2, 'Flu, doctor advised rest (demo sample)');
    API.decideLeave(admin, lr, true);
  }

  /* ---- salary structures (track 2 tab) ---- */
  if (typeof seedTrack2Tabs_ === 'function' && typeof API.saveSalaryStructure === 'function' &&
      !trows_(ss, 'salaryStructures').length) {
    API.saveSalaryStructure(admin, { employeeId: E['EMP-001'], basic: 60000,
      allowancesJson: JSON.stringify({ 'House Allowance': 15000, Conveyance: 5000 }),
      effectiveFrom: '2026-07-01', payFrequency: 'monthly' });
    API.saveSalaryStructure(admin, { employeeId: E['EMP-005'], basic: 75000,
      allowancesJson: JSON.stringify({ 'House Allowance': 18000, Conveyance: 6000 }),
      effectiveFrom: '2026-07-01', payFrequency: 'monthly' });
  }

  /* ---- message log: track 3's schema (id,ts,tenantId,channel,to,event,body,status,error). ---- */
  if (!trows_(ss, 'messageLog').length) {
    tappend_(ss, 'messageLog', { id: tnextId_(ss, 'M', 'messageLog'), ts: t3NowISO_(), tenantId: tenantId,
      channel: 'whatsapp', to: '0300-1111111', event: 'payslip_ready',
      body: 'Demo sample: September payslip is ready, net pay PKR 78,000.',
      status: 'pending-config', error: '' });
    tappend_(ss, 'messageLog', { id: tnextId_(ss, 'M', 'messageLog'), ts: t3NowISO_(), tenantId: tenantId,
      channel: 'sms', to: '0300-3333333', event: 'out_of_zone',
      body: 'Demo sample: out-of-zone punch recorded on 2026-10-06.',
      status: 'pending-config', error: '' });
  }

  return 'track7 demo seeded';
}
