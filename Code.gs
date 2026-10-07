/*****************************************************************
 * Attendance Management System — Google Apps Script backend (Code.gs)
 *
 * Multi-tenant GPS attendance SaaS.
 * This Apps Script project is BOUND to the master REGISTRY spreadsheet.
 *   Registry tabs (bound spreadsheet): tenants, saasUsers (+auditLog)
 *   Tenant tabs (each tenant's own spreadsheet): users, rolePermissions,
 *   employees, departments, sites, siteEmployees, shifts, rosters,
 *   attendance, corrections, leaveTypes, leaveBalances, leaveRequests,
 *   holidays, overtime, payComponents, payrollRuns, payslips, advances,
 *   contractors, contractorBills, documents, settings, auditLog
 *
 * SETUP:
 *  1. Create a Google Sheet (the registry), open Extensions > Apps Script.
 *  2. Paste this file as Code.gs.
 *  3. Run setupRegistry() once (grant permissions).
 *  4. Run seedDemo() once to create the DEMO tenant with sample data.
 *  5. Deploy > New deployment > Web app > Execute as: Me,
 *     Access: Anyone (or Anyone with Google account).
 *
 * All frontend calls go through __api(fn, userJson, argsJson) via
 * google.script.run, matching the API contract.
 *****************************************************************/

/* ---------------- sheet schemas ---------------- */
var SHEETS = {
  tenants:        ['tenantId','companyName','loginCode','spreadsheetId','plan','status','createdAt'],
  saasUsers:      ['id','name','username','passwordHash','role','active'],
  users:          ['id','name','username','passwordHash','role','employeeId','active'],
  rolePermissions:['role','matrix'],
  employees:      ['id','name','code','departmentId','phone','email','salary','joinDate','deviceId','active'],
  departments:    ['id','name'],
  sites:          ['id','name','address','lat','lng','radiusM','active'],
  siteEmployees:  ['siteId','employeeId'],
  shifts:         ['id','name','startTime','endTime','graceMin'],
  rosters:        ['id','date','employeeId','shiftId','siteId'],
  attendance:     ['id','employeeId','date','type','time','lat','lng','selfie','siteId','distanceM','outOfZone','source','deviceId','syncedAt','note'],
  corrections:    ['id','punchId','employeeId','note','status','decidedBy','decidedAt'],
  leaveTypes:     ['id','name','quota','paid'],
  leaveBalances:  ['employeeId','year','typeId','used'],
  leaveRequests:  ['id','employeeId','typeId','from','to','days','reason','status','decidedBy'],
  holidays:       ['id','date','name'],
  overtime:       ['id','employeeId','date','hours','rate','reason','status','approvedBy'],
  payComponents:  ['id','name','kind','amount','appliesTo','approved'],
  payrollRuns:    ['id','month','createdAt','createdBy','status'],
  payslips:       ['id','runId','employeeId','salary','allowances','deductions','advanceRecovery','net','paid'],
  advances:       ['id','employeeId','date','amount','installments','recovered','status'],
  contractors:    ['id','name','company','phone','rate','active'],
  contractorBills:['id','contractorId','month','amount','status','note'],
  documents:      ['id','employeeId','title','expiryDate'],
  settings:       ['key','value'],
  auditLog:       ['id','at','userId','action','detail']
};

/* Tabs that live in a tenant spreadsheet (everything except the registry tabs) */
var TENANT_TABS = Object.keys(SHEETS).filter(function (k) { return k !== 'tenants' && k !== 'saasUsers'; });

/* ---------------- web app entry ---------------- */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Attendance Management System')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* Single dispatch entry for the frontend adapter */
function __api(fn, userJson, argsJson) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { throw new Error('Server busy, try again'); }
  try {
    var user = userJson ? JSON.parse(userJson) : null;
    if (fn !== 'login' && user && user.token) {
      var cached = CacheService.getScriptCache().get('tok_' + user.token);
      if (!cached) throw new Error('Session expired — please sign in again');
      user = JSON.parse(cached);
    }
    var args = argsJson ? JSON.parse(argsJson) : [];
    var f = API[fn];
    if (typeof f !== 'function') throw new Error('Unknown API function: ' + fn);
    return f.apply(null, [user].concat(args));
  } finally { lock.releaseLock(); }
}

/* ---------------- core sheet helpers (any spreadsheet) ---------------- */
function sheetOf_(ss, name) {
  var s = ss.getSheetByName(name);
  if (!s) { s = ss.insertSheet(name); s.appendRow(SHEETS[name]); s.setFrozenRows(1); }
  return s;
}
function rowsOf_(ss, name) {
  var s = sheetOf_(ss, name);
  var vals = s.getDataRange().getValues();
  if (vals.length < 2) return [];
  var heads = SHEETS[name], out = [];
  var tz = Session.getScriptTimeZone();
  for (var i = 1; i < vals.length; i++) {
    var o = { _row: i + 1 };
    for (var j = 0; j < heads.length; j++) {
      var v = vals[i][j];
      if (v === '') v = null;
      /* Sheets auto-converts date-like strings to Date objects. Convert back
         to yyyy-MM-dd strings: (1) google.script.run cannot transport Dates to
         the client, (2) day-level string comparisons. */
      else if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime()))
        v = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
      o[heads[j]] = v;
    }
    out.push(o);
  }
  return out;
}
function val_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}
function appendOf_(ss, name, obj) {
  sheetOf_(ss, name).appendRow(SHEETS[name].map(function (k) { return val_(obj[k]); }));
}
function updateOf_(ss, name, id, obj) {
  var s = sheetOf_(ss, name), heads = SHEETS[name];
  var ids = s.getRange(2, 1, Math.max(1, s.getLastRow() - 1), 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      s.getRange(i + 2, 1, 1, heads.length).setValues([heads.map(function (k) { return val_(obj[k]); })]);
      return true;
    }
  }
  return false;
}
function removeOf_(ss, name, id) {
  var s = sheetOf_(ss, name);
  var ids = s.getRange(2, 1, Math.max(1, s.getLastRow() - 1), 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === String(id)) s.deleteRow(i + 2);
  }
}
function nextIdOf_(ss, prefix, name) {
  var max = 0, re = new RegExp('^' + prefix + '-(\\d+)$');
  rowsOf_(ss, name).forEach(function (r) {
    var m = String(r.id || '').match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  var n = String(max + 1);
  while (n.length < 4) n = '0' + n;
  return prefix + '-' + n;
}

/* Registry helpers (the bound spreadsheet) */
function sh_(name)      { return sheetOf_(SpreadsheetApp.getActiveSpreadsheet(), name); }
function rows_(name)    { return rowsOf_(SpreadsheetApp.getActiveSpreadsheet(), name); }
function append_(n, o)  { appendOf_(SpreadsheetApp.getActiveSpreadsheet(), n, o); }
function update_(n, id, o) { return updateOf_(SpreadsheetApp.getActiveSpreadsheet(), n, id, o); }
function remove_(n, id) { return removeOf_(SpreadsheetApp.getActiveSpreadsheet(), n, id); }
function nextId_(p, n)  { return nextIdOf_(SpreadsheetApp.getActiveSpreadsheet(), p, n); }

/* Tenant-spreadsheet helpers */
function tsh_(ss, name)       { return sheetOf_(ss, name); }
function trows_(ss, name)    { return rowsOf_(ss, name); }
function tappend_(ss, n, o)  { appendOf_(ss, n, o); }
function tupdate_(ss, n, id, o) { return updateOf_(ss, n, id, o); }
function tremove_(ss, n, id) { return removeOf_(ss, n, id); }
function tnextId_(ss, p, n)  { return nextIdOf_(ss, p, n); }
function tsetting_(ss, k, fb) {
  var r = trows_(ss, 'settings').filter(function (x) { return x.key === k; })[0];
  return r ? r.value : fb;
}

/* ---------------- value helpers ---------------- */
function num_(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
function bool_(v) { return v === true || v === 'TRUE' || v === 'true' || v === 1; }
function clean_(o) { var c = {}; for (var k in o) if (k !== '_row') c[k] = o[k]; return c; }
function sha256_(s) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s));
  return d.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function pad2_(n) { return ('0' + n).slice(-2); }
function todayStr_() {
  var d = new Date();
  return d.getFullYear() + '-' + pad2_(d.getMonth() + 1) + '-' + pad2_(d.getDate());
}
function timeStr_() {
  var d = new Date();
  return pad2_(d.getHours()) + ':' + pad2_(d.getMinutes()) + ':' + pad2_(d.getSeconds());
}
function nowStr_() { return todayStr_() + ' ' + timeStr_(); }
function fmtDate_(d) { return d.getFullYear() + '-' + pad2_(d.getMonth() + 1) + '-' + pad2_(d.getDate()); }
function fmtTime_(d) { return pad2_(d.getHours()) + ':' + pad2_(d.getMinutes()) + ':' + pad2_(d.getSeconds()); }
function addDays_(iso, n) {
  var d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return fmtDate_(d);
}
function daysBetween_(from, to) {
  return Math.round((new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00')) / 86400000) + 1;
}
function minsBetween_(t1, t2) {
  function m(t) { var p = String(t || '00:00:00').split(':'); return num_(p[0]) * 60 + num_(p[1]) + num_(p[2] || 0) / 60; }
  return m(t2) - m(t1);
}
function haversineM_(lat1, lon1, lat2, lon2) {
  var R = 6371000, toRad = Math.PI / 180;
  var dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}
function csvEsc_(v) {
  v = (v === null || v === undefined) ? '' : String(v);
  return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
function csvOf_(heads, rows) {
  var lines = [heads.map(csvEsc_).join(',')];
  rows.forEach(function (r) { lines.push(heads.map(function (h) { return csvEsc_(r[h]); }).join(',')); });
  return lines.join('\r\n');
}

/* ---------------- auth / tenant context ---------------- */
function requireUser_(u) { if (!u || !u.id) throw new Error('Not logged in'); return u; }
function requireSuper_(u) {
  requireUser_(u);
  if (u.role !== 'superadmin') throw new Error('Superadmin only');
  return u;
}
/* Spreadsheet for this request: registry for superadmin, tenant SS otherwise */
function TSS_(user) {
  requireUser_(user);
  if (user.role === 'superadmin') return SpreadsheetApp.getActiveSpreadsheet();
  if (!user.spreadsheetId) throw new Error('No tenant spreadsheet in session');
  return SpreadsheetApp.openById(user.spreadsheetId);
}
/* Permission check against the tenant rolePermissions matrix (superadmin bypasses) */
function can_(user, perm) {
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  var r = trows_(TSS_(user), 'rolePermissions').filter(function (x) { return x.role === user.role; })[0];
  if (!r) return false;
  try { return !!JSON.parse(r.matrix || '{}')[perm]; } catch (e) { return false; }
}
function need_(user, perm) {
  if (!can_(user, perm)) throw new Error('Permission denied: ' + perm);
  return true;
}
/* Employee/user roles may only touch their own employee record */
function selfOnly_(user, employeeId) {
  if (user.role === 'superadmin') return;
  if ((user.role === 'employee' || user.role === 'user') &&
      String(user.employeeId || '') !== String(employeeId))
    throw new Error('You can only access your own records');
}
function scopeEmployeeIds_(user) {
  if ((user.role === 'employee' || user.role === 'user') && user.employeeId) return [String(user.employeeId)];
  return null;
}
function empById_(ss, id) {
  return trows_(ss, 'employees').filter(function (e) { return String(e.id) === String(id); })[0] || null;
}
function audit_(user, action, detail, ssOpt) {
  try {
    var ss = ssOpt || (user && user.spreadsheetId
      ? SpreadsheetApp.openById(user.spreadsheetId)
      : SpreadsheetApp.getActiveSpreadsheet());
    appendOf_(ss, 'auditLog', { id: nextIdOf_(ss, 'A', 'auditLog'), at: nowStr_(),
      userId: user ? user.id : '', action: action, detail: String(detail || '').slice(0, 500) });
  } catch (e) { /* audit must never break the main action */ }
}

/* ================= API implementation ================= */
var API = {

  /* ---------------- auth ---------------- */
  login: function (user, companyCode, username, password) {
    if (!companyCode || !username || !password)
      throw new Error('Company code, username and password are required');
    var token = Utilities.getUuid();
    if (String(companyCode).toUpperCase() === 'ADMIN') {
      var u = rows_('saasUsers').filter(function (x) {
        return String(x.username).toLowerCase() === String(username).toLowerCase() && bool_(x.active);
      })[0];
      if (!u || u.passwordHash !== sha256_(password)) throw new Error('Invalid username or password');
      var out = { id: u.id, name: u.name, username: u.username, role: 'superadmin',
        tenantId: '', spreadsheetId: '', token: token };
      CacheService.getScriptCache().put('tok_' + token, JSON.stringify(out), 21600);
      return { user: out, token: token };
    }
    var t = rows_('tenants').filter(function (x) {
      return String(x.loginCode).toUpperCase() === String(companyCode).toUpperCase() &&
             String(x.status).toLowerCase() === 'active';
    })[0];
    if (!t) throw new Error('Invalid company code');
    var ss = SpreadsheetApp.openById(t.spreadsheetId);
    var u2 = trows_(ss, 'users').filter(function (x) {
      return String(x.username).toLowerCase() === String(username).toLowerCase() && bool_(x.active);
    })[0];
    if (!u2 || u2.passwordHash !== sha256_(password)) throw new Error('Invalid username or password');
    var out2 = { id: u2.id, name: u2.name, username: u2.username, role: u2.role,
      employeeId: u2.employeeId || '', tenantId: t.tenantId, spreadsheetId: t.spreadsheetId, token: token };
    CacheService.getScriptCache().put('tok_' + token, JSON.stringify(out2), 21600);
    return { user: out2, token: token };
  },

  getBootstrap: function (user) {
    requireUser_(user);
    if (user.role === 'superadmin') {
      return { user: user, permissions: { all: true }, settings: {}, tenant: null, employee: null,
        tenants: rows_('tenants').map(clean_) };
    }
    var ss = TSS_(user);
    var s = {};
    trows_(ss, 'settings').forEach(function (x) { s[x.key] = x.value; });
    var pm = trows_(ss, 'rolePermissions').filter(function (p) { return p.role === user.role; })[0];
    var tenant = rows_('tenants').filter(function (t) { return t.tenantId === user.tenantId; })[0] || null;
    var emp = user.employeeId ? empById_(ss, user.employeeId) : null;
    return {
      user: user,
      permissions: pm ? JSON.parse(pm.matrix || '{}') : {},
      settings: s,
      tenant: tenant ? clean_(tenant) : null,
      employee: emp ? clean_(emp) : null
    };
  },

  impersonate: function (user, tenantId) {
    requireSuper_(user);
    var t = rows_('tenants').filter(function (x) { return x.tenantId === tenantId; })[0];
    if (!t) throw new Error('Tenant not found');
    var ss = SpreadsheetApp.openById(t.spreadsheetId);
    var all = trows_(ss, 'users').filter(function (x) { return bool_(x.active); });
    var u = all.filter(function (x) { return x.role === 'admin'; })[0] || all[0];
    if (!u) throw new Error('Tenant has no active users');
    var token = Utilities.getUuid();
    var out = { id: u.id, name: u.name, username: u.username, role: u.role, employeeId: u.employeeId || '',
      tenantId: t.tenantId, spreadsheetId: t.spreadsheetId, token: token, impersonatedBy: user.id };
    CacheService.getScriptCache().put('tok_' + token, JSON.stringify(out), 21600);
    audit_(user, 'impersonate', t.companyName + ' as ' + u.username, SpreadsheetApp.getActiveSpreadsheet());
    return { user: out, token: token };
  },

  stopImpersonation: function (user) {
    requireUser_(user);
    return true;
  },

  /* ---------------- superadmin: tenants ---------------- */
  listTenants: function (user) {
    requireSuper_(user);
    return rows_('tenants').map(clean_);
  },

  createTenant: function (user, companyName, plan, adminName, adminUser, adminPass) {
    requireSuper_(user);
    if (!companyName) throw new Error('Company name is required');
    if (!adminUser || !adminPass) throw new Error('Admin username and password are required');
    var firstWord = String(companyName).split(/\s+/)[0].toUpperCase().replace(/[^A-Z]/g, '');
    var base = (firstWord + 'XXXX').slice(0, 4);
    var codes = {};
    rows_('tenants').forEach(function (t) { codes[t.loginCode] = true; });
    var code = base, n = 1;
    while (codes[code]) { n++; code = base + n; }
    var ss = SpreadsheetApp.create(String(companyName) + ' — Attendance Management System');
    setupTenantSS(ss, companyName);
    var tid = nextId_('T', 'tenants');
    tappend_(ss, 'users', { id: 'U-0001', name: adminName || 'Administrator',
      username: String(adminUser).toLowerCase(), passwordHash: sha256_(adminPass),
      role: 'admin', employeeId: '', active: true });
    append_('tenants', { tenantId: tid, companyName: companyName, loginCode: code,
      spreadsheetId: ss.getId(), plan: plan || 'trial', status: 'active', createdAt: todayStr_() });
    audit_(user, 'createTenant', companyName + ' code=' + code, ss);
    return { tenantId: tid, loginCode: code, spreadsheetId: ss.getId(), url: ss.getUrl() };
  },

  updateTenant: function (user, tenantId, fields) {
    requireSuper_(user);
    var t = rows_('tenants').filter(function (x) { return x.tenantId === tenantId; })[0];
    if (!t) throw new Error('Tenant not found');
    ['companyName', 'plan', 'status'].forEach(function (k) {
      if (fields && fields[k] !== undefined) t[k] = fields[k];
    });
    update_('tenants', tenantId, clean_(t));
    audit_(user, 'updateTenant', tenantId + ' ' + JSON.stringify(fields || {}));
    return true;
  },

  deleteTenant: function (user, tenantId) {
    requireSuper_(user);
    var t = rows_('tenants').filter(function (x) { return x.tenantId === tenantId; })[0];
    if (!t) throw new Error('Tenant not found');
    try { DriveApp.getFileById(t.spreadsheetId).setTrashed(true); } catch (e) {}
    remove_('tenants', tenantId);
    audit_(user, 'deleteTenant', tenantId + ' ' + t.companyName);
    return true;
  },

  getTenantStats: function (user, tenantId) {
    requireSuper_(user);
    var t = rows_('tenants').filter(function (x) { return x.tenantId === tenantId; })[0];
    if (!t) throw new Error('Tenant not found');
    var ss = SpreadsheetApp.openById(t.spreadsheetId);
    var today = todayStr_();
    return {
      tenant: clean_(t),
      employees: trows_(ss, 'employees').filter(function (e) { return bool_(e.active); }).length,
      users: trows_(ss, 'users').filter(function (x) { return bool_(x.active); }).length,
      sites: trows_(ss, 'sites').filter(function (s) { return bool_(s.active); }).length,
      punchesToday: trows_(ss, 'attendance').filter(function (a) { return a.date === today; }).length,
      pendingLeaves: trows_(ss, 'leaveRequests').filter(function (l) { return l.status === 'pending'; }).length,
      pendingCorrections: trows_(ss, 'corrections').filter(function (c) { return c.status === 'pending'; }).length,
      openAdvances: trows_(ss, 'advances').filter(function (a) { return a.status === 'open'; }).length
    };
  },

  getPlatformStats: function (user) {
    requireSuper_(user);
    var tenants = rows_('tenants');
    var totalEmp = 0, totalPunches = 0;
    tenants.forEach(function (tn) {
      try {
        var tss = SpreadsheetApp.openById(tn.spreadsheetId);
        totalEmp += trows_(tss, 'employees').filter(function (e) { return bool_(e.active); }).length;
        totalPunches += trows_(tss, 'attendance').length;
      } catch (e) {}
    });
    return {
      tenants: tenants.length,
      active: tenants.filter(function (x) { return x.status === 'active'; }).length,
      trial: tenants.filter(function (x) { return x.status === 'trial'; }).length,
      totalEmployees: totalEmp,
      totalPunches: totalPunches
    };
  },

  /* ---------------- employees ---------------- */
  listEmployees: function (user, filters) {
    requireUser_(user);
    filters = filters || {};
    var ss = TSS_(user);
    var scope = scopeEmployeeIds_(user);
    var deps = {};
    trows_(ss, 'departments').forEach(function (d) { deps[d.id] = d.name; });
    var q = String(filters.q || '').toLowerCase();
    return trows_(ss, 'employees').filter(function (e) {
      if (scope && scope.indexOf(String(e.id)) < 0) return false;
      if (filters.activeOnly && !bool_(e.active)) return false;
      if (filters.departmentId && String(e.departmentId) !== String(filters.departmentId)) return false;
      if (q && (String(e.name) + ' ' + String(e.code) + ' ' + String(e.phone)).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).map(function (e) {
      e = clean_(e);
      e.department = deps[e.departmentId] || '';
      e.active = bool_(e.active);
      e.salary = num_(e.salary);
      return e;
    });
  },

  saveEmployee: function (user, e) {
    requireUser_(user);
    need_(user, 'employees_manage');
    var ss = TSS_(user);
    if (!e.name) throw new Error('Employee name is required');
    var obj = {
      name: e.name, code: e.code || '', departmentId: e.departmentId || '',
      phone: e.phone || '', email: e.email || '', salary: num_(e.salary),
      joinDate: e.joinDate || todayStr_(), deviceId: e.deviceId || '',
      active: e.active === undefined ? true : !!e.active
    };
    if (e.id) {
      var r = empById_(ss, e.id);
      if (!r) throw new Error('Employee not found');
      obj.id = e.id;
      tupdate_(ss, 'employees', e.id, obj);
      audit_(user, 'saveEmployee', 'update ' + e.id + ' ' + e.name);
      return e.id;
    }
    obj.id = tnextId_(ss, 'EMP', 'employees');
    tappend_(ss, 'employees', obj);
    audit_(user, 'saveEmployee', 'create ' + obj.id + ' ' + e.name);
    return obj.id;
  },

  deleteEmployee: function (user, id) {
    requireUser_(user);
    need_(user, 'employees_manage');
    var ss = TSS_(user);
    if (!empById_(ss, id)) throw new Error('Employee not found');
    if (trows_(ss, 'attendance').some(function (a) { return a.employeeId === id; }))
      throw new Error('Cannot delete: attendance records exist for this employee');
    if (trows_(ss, 'advances').some(function (a) { return a.employeeId === id; }))
      throw new Error('Cannot delete: advance records exist for this employee');
    if (trows_(ss, 'payslips').some(function (p) { return p.employeeId === id; }))
      throw new Error('Cannot delete: payslip records exist for this employee');
    if (trows_(ss, 'users').some(function (x) { return String(x.employeeId) === String(id); }))
      throw new Error('Cannot delete: a login user is linked to this employee');
    tremove_(ss, 'employees', id);
    audit_(user, 'deleteEmployee', id);
    return true;
  },

  importEmployeesCSV: function (user, rows) {
    requireUser_(user);
    need_(user, 'employees_manage');
    var ss = TSS_(user);
    var added = 0, updated = 0, errors = [];
    var depCache = {};
    trows_(ss, 'departments').forEach(function (d) { depCache[String(d.name).toLowerCase()] = d.id; });
    (rows || []).forEach(function (r, i) {
      try {
        if (!r.name) throw new Error('missing name');
        var depId = '';
        if (r.department) {
          var key = String(r.department).toLowerCase();
          if (!depCache[key]) {
            depCache[key] = tnextId_(ss, 'D', 'departments');
            tappend_(ss, 'departments', { id: depCache[key], name: r.department });
          }
          depId = depCache[key];
        }
        var ex = trows_(ss, 'employees').filter(function (e) {
          return (r.code && String(e.code) === String(r.code)) ||
                 String(e.name).toLowerCase() === String(r.name).toLowerCase();
        })[0];
        var payload = { name: r.name, code: r.code || '', departmentId: depId,
          phone: r.phone || '', email: r.email || '', salary: num_(r.salary),
          joinDate: r.joinDate || todayStr_(), deviceId: r.deviceId || '', active: true };
        if (ex) { payload.id = ex.id; API.saveEmployee(user, payload); updated++; }
        else { API.saveEmployee(user, payload); added++; }
      } catch (e2) { errors.push('Row ' + (i + 1) + ': ' + e2.message); }
    });
    audit_(user, 'importEmployeesCSV', 'added=' + added + ' updated=' + updated);
    return { added: added, updated: updated, errors: errors };
  },

  listDepartments: function (user) {
    requireUser_(user);
    var ss = TSS_(user);
    var counts = {};
    trows_(ss, 'employees').forEach(function (e) {
      counts[e.departmentId] = (counts[e.departmentId] || 0) + 1;
    });
    return trows_(ss, 'departments').map(function (d) {
      d = clean_(d);
      d.employeeCount = counts[d.id] || 0;
      return d;
    });
  },

  saveDepartment: function (user, d) {
    requireUser_(user);
    need_(user, 'employees_manage');
    var ss = TSS_(user);
    if (!d.name) throw new Error('Department name is required');
    if (d.id) {
      var r = trows_(ss, 'departments').filter(function (x) { return x.id === d.id; })[0];
      if (!r) throw new Error('Department not found');
      tupdate_(ss, 'departments', d.id, { id: d.id, name: d.name });
      audit_(user, 'saveDepartment', 'update ' + d.id);
      return d.id;
    }
    var id = tnextId_(ss, 'D', 'departments');
    tappend_(ss, 'departments', { id: id, name: d.name });
    audit_(user, 'saveDepartment', 'create ' + id);
    return id;
  },

  deleteDepartment: function (user, id) {
    requireUser_(user);
    need_(user, 'employees_manage');
    var ss = TSS_(user);
    if (trows_(ss, 'employees').some(function (e) { return String(e.departmentId) === String(id); }))
      throw new Error('Cannot delete: employees are assigned to this department');
    tremove_(ss, 'departments', id);
    audit_(user, 'deleteDepartment', id);
    return true;
  },

  bindDevice: function (user, employeeId, deviceId) {
    requireUser_(user);
    if (!employeeId) throw new Error('Employee is required');
    if (!deviceId) throw new Error('Device ID is required');
    if (user.role !== 'superadmin' && (user.role === 'employee' || user.role === 'user')) selfOnly_(user, employeeId);
    else need_(user, 'employees_manage');
    var ss = TSS_(user);
    var e = empById_(ss, employeeId);
    if (!e) throw new Error('Employee not found');
    e.deviceId = deviceId;
    tupdate_(ss, 'employees', e.id, clean_(e));
    audit_(user, 'bindDevice', employeeId + ' -> ' + deviceId);
    return true;
  },

  unbindDevice: function (user, employeeId) {
    requireUser_(user);
    if (!employeeId) throw new Error('Employee is required');
    if (user.role !== 'superadmin' && (user.role === 'employee' || user.role === 'user')) selfOnly_(user, employeeId);
    else need_(user, 'employees_manage');
    var ss = TSS_(user);
    var e = empById_(ss, employeeId);
    if (!e) throw new Error('Employee not found');
    e.deviceId = '';
    tupdate_(ss, 'employees', e.id, clean_(e));
    audit_(user, 'unbindDevice', employeeId);
    return true;
  },

  /* ---------------- sites ---------------- */
  listSites: function (user) {
    requireUser_(user);
    var ss = TSS_(user);
    var counts = {};
    var empIds = {};
    trows_(ss, 'siteEmployees').forEach(function (x) {
      counts[x.siteId] = (counts[x.siteId] || 0) + 1;
      (empIds[x.siteId] = empIds[x.siteId] || []).push(x.employeeId);
    });
    return trows_(ss, 'sites').map(function (s) {
      s = clean_(s);
      s.employeeCount = counts[s.id] || 0;
      s.employeeIds = empIds[s.id] || [];
      s.active = bool_(s.active);
      s.lat = num_(s.lat); s.lng = num_(s.lng); s.radiusM = num_(s.radiusM);
      return s;
    });
  },

  saveSite: function (user, s) {
    requireUser_(user);
    need_(user, 'sites_manage');
    var ss = TSS_(user);
    if (!s.name) throw new Error('Site name is required');
    var obj = {
      name: s.name, address: s.address || '', lat: num_(s.lat), lng: num_(s.lng),
      radiusM: num_(s.radiusM) || 200, active: s.active === undefined ? true : !!s.active
    };
    if (s.id) {
      var r = trows_(ss, 'sites').filter(function (x) { return x.id === s.id; })[0];
      if (!r) throw new Error('Site not found');
      obj.id = s.id;
      tupdate_(ss, 'sites', s.id, obj);
      audit_(user, 'saveSite', 'update ' + s.id + ' ' + s.name);
      return s.id;
    }
    obj.id = tnextId_(ss, 'S', 'sites');
    tappend_(ss, 'sites', obj);
    audit_(user, 'saveSite', 'create ' + obj.id + ' ' + s.name);
    return obj.id;
  },

  deleteSite: function (user, id) {
    requireUser_(user);
    need_(user, 'sites_manage');
    var ss = TSS_(user);
    if (trows_(ss, 'siteEmployees').some(function (x) { return String(x.siteId) === String(id); }))
      throw new Error('Cannot delete: employees are assigned to this site');
    if (trows_(ss, 'rosters').some(function (r) { return String(r.siteId) === String(id); }))
      throw new Error('Cannot delete: rosters reference this site');
    tremove_(ss, 'sites', id);
    audit_(user, 'deleteSite', id);
    return true;
  },

  assignSiteEmployees: function (user, siteId, employeeIds) {
    requireUser_(user);
    need_(user, 'sites_manage');
    var ss = TSS_(user);
    var site = trows_(ss, 'sites').filter(function (x) { return x.id === siteId; })[0];
    if (!site) throw new Error('Site not found');
    var sh = tsh_(ss, 'siteEmployees');
    var vals = sh.getDataRange().getValues();
    for (var i = vals.length - 1; i >= 1; i--) {
      if (String(vals[i][0]) === String(siteId)) sh.deleteRow(i + 1);
    }
    (employeeIds || []).forEach(function (eid) {
      if (empById_(ss, eid)) tappend_(ss, 'siteEmployees', { siteId: siteId, employeeId: eid });
    });
    audit_(user, 'assignSiteEmployees', siteId + ' employees=' + (employeeIds || []).length);
    return true;
  },

  /* ---------------- shifts & rosters ---------------- */
  listShifts: function (user) {
    requireUser_(user);
    return trows_(TSS_(user), 'shifts').map(clean_);
  },

  saveShift: function (user, s) {
    requireUser_(user);
    need_(user, 'shifts_manage');
    var ss = TSS_(user);
    if (!s.name || !s.startTime || !s.endTime) throw new Error('Shift name, start and end time are required');
    var obj = { name: s.name, startTime: s.startTime, endTime: s.endTime, graceMin: num_(s.graceMin) || 15 };
    if (s.id) {
      var r = trows_(ss, 'shifts').filter(function (x) { return x.id === s.id; })[0];
      if (!r) throw new Error('Shift not found');
      obj.id = s.id;
      tupdate_(ss, 'shifts', s.id, obj);
      audit_(user, 'saveShift', 'update ' + s.id);
      return s.id;
    }
    obj.id = tnextId_(ss, 'SH', 'shifts');
    tappend_(ss, 'shifts', obj);
    audit_(user, 'saveShift', 'create ' + obj.id);
    return obj.id;
  },

  deleteShift: function (user, id) {
    requireUser_(user);
    need_(user, 'shifts_manage');
    var ss = TSS_(user);
    if (trows_(ss, 'rosters').some(function (r) { return String(r.shiftId) === String(id); }))
      throw new Error('Cannot delete: rosters use this shift');
    tremove_(ss, 'shifts', id);
    audit_(user, 'deleteShift', id);
    return true;
  },

  listRosters: function (user, filters) {
    requireUser_(user);
    filters = filters || {};
    var ss = TSS_(user);
    var scope = scopeEmployeeIds_(user);
    var emps = {}, shifts = {}, sites = {};
    trows_(ss, 'employees').forEach(function (e) { emps[e.id] = e.name; });
    trows_(ss, 'shifts').forEach(function (s) { shifts[s.id] = s.name; });
    trows_(ss, 'sites').forEach(function (s) { sites[s.id] = s.name; });
    return trows_(ss, 'rosters').filter(function (r) {
      if (scope && scope.indexOf(String(r.employeeId)) < 0) return false;
      if (filters.from && r.date < filters.from) return false;
      if (filters.to && r.date > filters.to) return false;
      if (filters.employeeId && String(r.employeeId) !== String(filters.employeeId)) return false;
      if (filters.siteId && String(r.siteId) !== String(filters.siteId)) return false;
      return true;
    }).map(function (r) {
      r = clean_(r);
      r.employee = emps[r.employeeId] || '?';
      r.shift = shifts[r.shiftId] || '?';
      r.site = sites[r.siteId] || '';
      return r;
    }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
  },

  saveRoster: function (user, r) {
    requireUser_(user);
    need_(user, 'shifts_manage');
    var ss = TSS_(user);
    if (!r.date || !r.employeeId || !r.shiftId) throw new Error('Date, employee and shift are required');
    if (!empById_(ss, r.employeeId)) throw new Error('Employee not found');
    var obj = { date: r.date, employeeId: r.employeeId, shiftId: r.shiftId, siteId: r.siteId || '' };
    if (r.id) {
      var ex = trows_(ss, 'rosters').filter(function (x) { return x.id === r.id; })[0];
      if (!ex) throw new Error('Roster not found');
      obj.id = r.id;
      tupdate_(ss, 'rosters', r.id, obj);
      audit_(user, 'saveRoster', 'update ' + r.id);
      return r.id;
    }
    obj.id = tnextId_(ss, 'R', 'rosters');
    tappend_(ss, 'rosters', obj);
    audit_(user, 'saveRoster', 'create ' + obj.id);
    return obj.id;
  },

  deleteRoster: function (user, id) {
    requireUser_(user);
    need_(user, 'shifts_manage');
    tremove_(TSS_(user), 'rosters', id);
    audit_(user, 'deleteRoster', id);
    return true;
  },

  /* ---------------- attendance ---------------- */
  punch: function (user, employeeId, type, lat, lng, selfie, deviceId, source) {
    requireUser_(user);
    if (!employeeId) throw new Error('Employee is required');
    type = String(type || 'in').toLowerCase();
    if (['in', 'out', 'break-in', 'break-out'].indexOf(type) < 0) throw new Error('Invalid punch type: ' + type);
    var ss = TSS_(user);
    var emp = empById_(ss, employeeId);
    if (!emp) throw new Error('Employee not found');
    if (!bool_(emp.active)) throw new Error('Employee is not active');
    if (user.role === 'employee' || user.role === 'user') selfOnly_(user, employeeId);
    else need_(user, 'attendance_manage');
    /* device binding */
    if (emp.deviceId && deviceId && String(emp.deviceId) !== String(deviceId))
      throw new Error('This device is not registered for ' + emp.name);
    var today = todayStr_(), nowT = timeStr_();
    /* duplicate guard: same employee + type within 5 minutes */
    var dup = trows_(ss, 'attendance').filter(function (a) {
      return String(a.employeeId) === String(employeeId) && a.type === type && a.date === today &&
             Math.abs(minsBetween_(a.time, nowT)) < 5;
    })[0];
    if (dup) throw new Error('Duplicate punch: a "' + type + '" punch was already recorded at ' + dup.time);
    var site = siteForPunch_(ss, employeeId, lat, lng);
    var row = {
      id: tnextId_(ss, 'P', 'attendance'), employeeId: employeeId, date: today, type: type, time: nowT,
      lat: (lat === null || lat === undefined || lat === '') ? '' : num_(lat),
      lng: (lng === null || lng === undefined || lng === '') ? '' : num_(lng),
      selfie: selfie || '', siteId: site ? site.id : '',
      distanceM: site ? Math.round(site.distanceM) : '',
      outOfZone: site ? !!site.outOfZone : true,
      source: source || 'app', deviceId: deviceId || '',
      syncedAt: nowStr_(), note: ''
    };
    tappend_(ss, 'attendance', row);
    audit_(user, 'punch', employeeId + ' ' + type + ' @ ' + (site ? site.name : 'no-site') +
      (row.outOfZone ? ' OUT-OF-ZONE' : ''));
    return { punch: clean_(row), site: site ? clean_(site) : null, outOfZone: !!row.outOfZone };
  },

  devicePunch: function (user, deviceId, employeeId, type, ts) {
    requireUser_(user);
    need_(user, 'attendance_manage');
    var ss = TSS_(user);
    var emp = employeeId ? empById_(ss, employeeId) : null;
    if (!emp && deviceId) {
      emp = trows_(ss, 'employees').filter(function (e) {
        return e.deviceId && String(e.deviceId) === String(deviceId);
      })[0] || null;
    }
    if (!emp) throw new Error('Employee not found for this device');
    if (!bool_(emp.active)) throw new Error('Employee is not active');
    type = String(type || 'in').toLowerCase();
    if (['in', 'out', 'break-in', 'break-out'].indexOf(type) < 0) throw new Error('Invalid punch type: ' + type);
    var d = ts ? new Date(ts) : new Date();
    if (isNaN(d.getTime())) throw new Error('Invalid timestamp');
    var date = fmtDate_(d), time = fmtTime_(d);
    var dup = trows_(ss, 'attendance').filter(function (a) {
      return String(a.employeeId) === String(emp.id) && a.type === type && a.date === date &&
             Math.abs(minsBetween_(a.time, time)) < 5;
    })[0];
    if (dup) throw new Error('Duplicate device punch at ' + dup.time);
    var row = {
      id: tnextId_(ss, 'P', 'attendance'), employeeId: emp.id, date: date, type: type, time: time,
      lat: '', lng: '', selfie: '', siteId: '', distanceM: '', outOfZone: false,
      source: 'zkteco', deviceId: deviceId || '', syncedAt: nowStr_(), note: ''
    };
    tappend_(ss, 'attendance', row);
    audit_(user, 'devicePunch', emp.id + ' ' + type + ' via ' + (deviceId || 'device'));
    return { punch: clean_(row) };
  },

  listAttendance: function (user, filters) {
    requireUser_(user);
    filters = filters || {};
    var ss = TSS_(user);
    var scope = scopeEmployeeIds_(user);
    var emps = {}, sites = {};
    trows_(ss, 'employees').forEach(function (e) { emps[e.id] = { name: e.name, code: e.code }; });
    trows_(ss, 'sites').forEach(function (s) { sites[s.id] = s.name; });
    return trows_(ss, 'attendance').filter(function (a) {
      if (scope && scope.indexOf(String(a.employeeId)) < 0) return false;
      if (filters.from && a.date < filters.from) return false;
      if (filters.to && a.date > filters.to) return false;
      if (filters.employeeId && String(a.employeeId) !== String(filters.employeeId)) return false;
      if (filters.type && a.type !== filters.type) return false;
      if (filters.siteId && String(a.siteId) !== String(filters.siteId)) return false;
      if (filters.outOfZone && !bool_(a.outOfZone)) return false;
      return true;
    }).map(function (a) {
      a = clean_(a);
      var e = emps[a.employeeId] || {};
      a.employee = e.name || '?'; a.code = e.code || '';
      a.site = sites[a.siteId] || '';
      a.outOfZone = bool_(a.outOfZone);
      a.lat = a.lat === null ? '' : a.lat; a.lng = a.lng === null ? '' : a.lng;
      return a;
    }).sort(function (a, b) {
      return (String(b.date) + b.time).localeCompare(String(a.date) + a.time);
    }).slice(0, 1000);
  },

  bulkMark: function (user, date, employeeIds, type, note) {
    requireUser_(user);
    need_(user, 'attendance_manage');
    if (!date) throw new Error('Date is required');
    type = String(type || 'in').toLowerCase();
    if (['in', 'out', 'break-in', 'break-out'].indexOf(type) < 0) throw new Error('Invalid punch type: ' + type);
    var ss = TSS_(user);
    var marked = [], skipped = [];
    (employeeIds || []).forEach(function (eid) {
      var emp = empById_(ss, eid);
      if (!emp || !bool_(emp.active)) { skipped.push(eid); return; }
      var exists = trows_(ss, 'attendance').some(function (a) {
        return String(a.employeeId) === String(eid) && a.date === date && a.type === type;
      });
      if (exists) { skipped.push(eid); return; }
      tappend_(ss, 'attendance', {
        id: tnextId_(ss, 'P', 'attendance'), employeeId: eid, date: date, type: type, time: '09:00:00',
        lat: '', lng: '', selfie: '', siteId: '', distanceM: '', outOfZone: false,
        source: 'bulk', deviceId: '', syncedAt: nowStr_(), note: note || ''
      });
      marked.push(eid);
    });
    audit_(user, 'bulkMark', date + ' ' + type + ' marked=' + marked.length + ' skipped=' + skipped.length);
    return { marked: marked, skipped: skipped };
  },

  deletePunch: function (user, id) {
    requireUser_(user);
    need_(user, 'attendance_manage');
    var ss = TSS_(user);
    var p = trows_(ss, 'attendance').filter(function (a) { return a.id === id; })[0];
    if (!p) throw new Error('Punch not found');
    tremove_(ss, 'attendance', id);
    audit_(user, 'deletePunch', id + ' (' + p.employeeId + ' ' + p.date + ' ' + p.type + ')');
    return true;
  },

  getLiveMap: function (user) {
    requireUser_(user);
    var ss = TSS_(user);
    var today = todayStr_();
    var scope = scopeEmployeeIds_(user);
    var emps = {}, sites = {};
    trows_(ss, 'employees').forEach(function (e) { emps[e.id] = e; });
    trows_(ss, 'sites').forEach(function (s) { sites[s.id] = s; });
    var latest = {};
    trows_(ss, 'attendance').forEach(function (a) {
      if (a.date !== today) return;
      if (scope && scope.indexOf(String(a.employeeId)) < 0) return;
      if (a.lat === null || a.lat === '' || a.lng === null || a.lng === '') return;
      var k = a.employeeId;
      if (!latest[k] || String(a.time) > String(latest[k].time)) latest[k] = a;
    });
    return Object.keys(latest).map(function (k) {
      var a = clean_(latest[k]);
      var e = emps[a.employeeId] || {};
      a.employee = e.name || '?'; a.code = e.code || '';
      a.site = (sites[a.siteId] || {}).name || '';
      a.outOfZone = bool_(a.outOfZone);
      return a;
    });
  },

  requestCorrection: function (user, punchId, note) {
    requireUser_(user);
    var ss = TSS_(user);
    if (!punchId) throw new Error('Punch is required');
    if (!note) throw new Error('A note explaining the correction is required');
    var p = trows_(ss, 'attendance').filter(function (a) { return a.id === punchId; })[0];
    if (!p) throw new Error('Punch not found');
    if (user.role === 'employee' || user.role === 'user') selfOnly_(user, p.employeeId);
    var existing = trows_(ss, 'corrections').filter(function (c) {
      return c.punchId === punchId && c.status === 'pending';
    })[0];
    if (existing) throw new Error('A pending correction already exists for this punch');
    var id = tnextId_(ss, 'CR', 'corrections');
    tappend_(ss, 'corrections', { id: id, punchId: punchId, employeeId: p.employeeId,
      note: note, status: 'pending', decidedBy: '', decidedAt: '' });
    audit_(user, 'requestCorrection', id + ' for punch ' + punchId);
    return id;
  },

  listCorrections: function (user, filters) {
    requireUser_(user);
    filters = filters || {};
    var ss = TSS_(user);
    var scope = scopeEmployeeIds_(user);
    var emps = {};
    trows_(ss, 'employees').forEach(function (e) { emps[e.id] = e.name; });
    var punches = {};
    trows_(ss, 'attendance').forEach(function (a) { punches[a.id] = a; });
    return trows_(ss, 'corrections').filter(function (c) {
      if (scope && scope.indexOf(String(c.employeeId)) < 0) return false;
      if (filters.status && c.status !== filters.status) return false;
      if (filters.employeeId && String(c.employeeId) !== String(filters.employeeId)) return false;
      return true;
    }).map(function (c) {
      c = clean_(c);
      c.employee = emps[c.employeeId] || '?';
      var p = punches[c.punchId];
      c.punch = p ? { date: p.date, time: p.time, type: p.type } : null;
      return c;
    }).sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); });
  },

  decideCorrection: function (user, id, approve) {
    requireUser_(user);
    need_(user, 'attendance_manage');
    var ss = TSS_(user);
    var c = trows_(ss, 'corrections').filter(function (x) { return x.id === id; })[0];
    if (!c) throw new Error('Correction request not found');
    if (c.status !== 'pending') throw new Error('This request was already decided');
    c.status = approve ? 'approved' : 'rejected';
    c.decidedBy = user.id;
    c.decidedAt = nowStr_();
    tupdate_(ss, 'corrections', id, clean_(c));
    audit_(user, 'decideCorrection', id + ' -> ' + c.status);
    return true;
  },

  /* ---------------- leave ---------------- */
  listLeaveTypes: function (user) {
    requireUser_(user);
    return trows_(TSS_(user), 'leaveTypes').map(function (t) {
      t = clean_(t); t.quota = num_(t.quota); t.paid = bool_(t.paid); return t;
    });
  },

  saveLeaveType: function (user, t) {
    requireUser_(user);
    need_(user, 'leave_manage');
    var ss = TSS_(user);
    if (!t.name) throw new Error('Leave type name is required');
    var obj = { name: t.name, quota: num_(t.quota), paid: !!t.paid };
    if (t.id) {
      var r = trows_(ss, 'leaveTypes').filter(function (x) { return x.id === t.id; })[0];
      if (!r) throw new Error('Leave type not found');
      obj.id = t.id;
      tupdate_(ss, 'leaveTypes', t.id, obj);
      audit_(user, 'saveLeaveType', 'update ' + t.id);
      return t.id;
    }
    obj.id = tnextId_(ss, 'LT', 'leaveTypes');
    tappend_(ss, 'leaveTypes', obj);
    audit_(user, 'saveLeaveType', 'create ' + obj.id);
    return obj.id;
  },

  deleteLeaveType: function (user, id) {
    requireUser_(user);
    need_(user, 'leave_manage');
    var ss = TSS_(user);
    if (trows_(ss, 'leaveRequests').some(function (l) { return String(l.typeId) === String(id); }))
      throw new Error('Cannot delete: leave requests use this type');
    tremove_(ss, 'leaveTypes', id);
    audit_(user, 'deleteLeaveType', id);
    return true;
  },

  getLeaveBalances: function (user, year) {
    requireUser_(user);
    var ss = TSS_(user);
    year = String(year || todayStr_().slice(0, 4));
    var scope = scopeEmployeeIds_(user);
    var types = trows_(ss, 'leaveTypes');
    var balMap = {};
    trows_(ss, 'leaveBalances').forEach(function (b) {
      if (String(b.year) === year) balMap[b.employeeId + '|' + b.typeId] = num_(b.used);
    });
    var out = [];
    trows_(ss, 'employees').filter(function (e) {
      return bool_(e.active) && (!scope || scope.indexOf(String(e.id)) >= 0);
    }).forEach(function (e) {
      types.forEach(function (t) {
        var used = balMap[e.id + '|' + t.id] || 0;
        out.push({ employeeId: e.id, employee: e.name, year: year, typeId: t.id,
          type: t.name, quota: num_(t.quota), paid: bool_(t.paid),
          used: used, remaining: num_(t.quota) - used });
      });
    });
    return out;
  },

  requestLeave: function (user, employeeId, typeId, from, to, days, reason) {
    requireUser_(user);
    var ss = TSS_(user);
    if (!employeeId || !typeId || !from || !to) throw new Error('Employee, leave type, from and to dates are required');
    if (user.role === 'employee' || user.role === 'user') selfOnly_(user, employeeId);
    else if (!can_(user, 'leave_manage')) throw new Error('Permission denied: leave_manage');
    var emp = empById_(ss, employeeId);
    if (!emp) throw new Error('Employee not found');
    var lt = trows_(ss, 'leaveTypes').filter(function (x) { return x.id === typeId; })[0];
    if (!lt) throw new Error('Leave type not found');
    if (from > to) throw new Error('From date must be on or before to date');
    days = num_(days) || daysBetween_(from, to);
    if (days <= 0) throw new Error('Invalid leave duration');
    var overlap = trows_(ss, 'leaveRequests').filter(function (l) {
      return String(l.employeeId) === String(employeeId) &&
             (l.status === 'pending' || l.status === 'approved') &&
             !(l.to < from || l.from > to);
    })[0];
    if (overlap) throw new Error('Overlaps with an existing ' + overlap.status + ' leave (' + overlap.from + ' to ' + overlap.to + ')');
    var id = tnextId_(ss, 'LR', 'leaveRequests');
    tappend_(ss, 'leaveRequests', { id: id, employeeId: employeeId, typeId: typeId,
      from: from, to: to, days: days, reason: reason || '', status: 'pending', decidedBy: '' });
    audit_(user, 'requestLeave', id + ' ' + employeeId + ' ' + from + ' to ' + to);
    return id;
  },

  listLeaveRequests: function (user, filters) {
    requireUser_(user);
    filters = filters || {};
    var ss = TSS_(user);
    var scope = scopeEmployeeIds_(user);
    var emps = {}, types = {};
    trows_(ss, 'employees').forEach(function (e) { emps[e.id] = e.name; });
    trows_(ss, 'leaveTypes').forEach(function (t) { types[t.id] = t.name; });
    return trows_(ss, 'leaveRequests').filter(function (l) {
      if (scope && scope.indexOf(String(l.employeeId)) < 0) return false;
      if (filters.status && l.status !== filters.status) return false;
      if (filters.employeeId && String(l.employeeId) !== String(filters.employeeId)) return false;
      if (filters.typeId && String(l.typeId) !== String(filters.typeId)) return false;
      return true;
    }).map(function (l) {
      l = clean_(l);
      l.employee = emps[l.employeeId] || '?';
      l.type = types[l.typeId] || '?';
      l.days = num_(l.days);
      return l;
    }).sort(function (a, b) { return String(b.from).localeCompare(String(a.from)); });
  },

  decideLeave: function (user, id, approve) {
    requireUser_(user);
    need_(user, 'leave_approve');
    var ss = TSS_(user);
    var l = trows_(ss, 'leaveRequests').filter(function (x) { return x.id === id; })[0];
    if (!l) throw new Error('Leave request not found');
    if (l.status !== 'pending') throw new Error('This request was already decided');
    if (approve) {
      var lt = trows_(ss, 'leaveTypes').filter(function (x) { return x.id === l.typeId; })[0];
      var year = String(l.from).slice(0, 4);
      var bal = leaveBalanceOf_(ss, l.employeeId, year, l.typeId);
      if (num_(lt ? lt.quota : 0) - num_(bal.used) < num_(l.days))
        throw new Error('Insufficient leave balance for this employee');
      bal.used = num_(bal.used) + num_(l.days);
      upsertBalance_(ss, l.employeeId, year, l.typeId, bal.used);
      l.status = 'approved';
    } else {
      l.status = 'rejected';
    }
    l.decidedBy = user.id;
    tupdate_(ss, 'leaveRequests', id, clean_(l));
    audit_(user, 'decideLeave', id + ' -> ' + l.status);
    return true;
  },

  listHolidays: function (user, year) {
    requireUser_(user);
    var ss = TSS_(user);
    year = year ? String(year) : null;
    return trows_(ss, 'holidays').filter(function (h) {
      return !year || String(h.date).slice(0, 4) === year;
    }).map(clean_).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
  },

  saveHoliday: function (user, h) {
    requireUser_(user);
    need_(user, 'leave_manage');
    var ss = TSS_(user);
    if (!h.date || !h.name) throw new Error('Date and name are required');
    if (h.id) {
      var r = trows_(ss, 'holidays').filter(function (x) { return x.id === h.id; })[0];
      if (!r) throw new Error('Holiday not found');
      tupdate_(ss, 'holidays', h.id, { id: h.id, date: h.date, name: h.name });
      audit_(user, 'saveHoliday', 'update ' + h.id);
      return h.id;
    }
    var id = tnextId_(ss, 'H', 'holidays');
    tappend_(ss, 'holidays', { id: id, date: h.date, name: h.name });
    audit_(user, 'saveHoliday', 'create ' + id);
    return id;
  },

  deleteHoliday: function (user, id) {
    requireUser_(user);
    need_(user, 'leave_manage');
    tremove_(TSS_(user), 'holidays', id);
    audit_(user, 'deleteHoliday', id);
    return true;
  },

  /* ---------------- overtime ---------------- */
  listOvertime: function (user, filters) {
    requireUser_(user);
    filters = filters || {};
    var ss = TSS_(user);
    var scope = scopeEmployeeIds_(user);
    var emps = {};
    trows_(ss, 'employees').forEach(function (e) { emps[e.id] = e.name; });
    return trows_(ss, 'overtime').filter(function (o) {
      if (scope && scope.indexOf(String(o.employeeId)) < 0) return false;
      if (filters.status && o.status !== filters.status) return false;
      if (filters.employeeId && String(o.employeeId) !== String(filters.employeeId)) return false;
      if (filters.from && o.date < filters.from) return false;
      if (filters.to && o.date > filters.to) return false;
      return true;
    }).map(function (o) {
      o = clean_(o);
      o.employee = emps[o.employeeId] || '?';
      o.hours = num_(o.hours); o.rate = num_(o.rate);
      return o;
    }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  },

  requestOvertime: function (user, employeeId, date, hours, rate, reason) {
    requireUser_(user);
    var ss = TSS_(user);
    if (!employeeId || !date) throw new Error('Employee and date are required');
    if (user.role === 'employee' || user.role === 'user') selfOnly_(user, employeeId);
    if (!empById_(ss, employeeId)) throw new Error('Employee not found');
    if (num_(hours) <= 0) throw new Error('Hours must be greater than zero');
    var id = tnextId_(ss, 'OT', 'overtime');
    tappend_(ss, 'overtime', { id: id, employeeId: employeeId, date: date,
      hours: num_(hours), rate: num_(rate), reason: reason || '', status: 'pending', approvedBy: '' });
    audit_(user, 'requestOvertime', id + ' ' + employeeId + ' ' + hours + 'h');
    return id;
  },

  decideOvertime: function (user, id, approve) {
    requireUser_(user);
    need_(user, 'overtime_approve');
    var ss = TSS_(user);
    var o = trows_(ss, 'overtime').filter(function (x) { return x.id === id; })[0];
    if (!o) throw new Error('Overtime request not found');
    if (o.status !== 'pending') throw new Error('This request was already decided');
    o.status = approve ? 'approved' : 'rejected';
    o.approvedBy = user.id;
    tupdate_(ss, 'overtime', id, clean_(o));
    audit_(user, 'decideOvertime', id + ' -> ' + o.status);
    return true;
  },

  /* ---------------- payroll ---------------- */
  listPayComponents: function (user) {
    requireUser_(user);
    return trows_(TSS_(user), 'payComponents').map(function (c) {
      c = clean_(c); c.amount = num_(c.amount); c.approved = bool_(c.approved); return c;
    });
  },

  savePayComponent: function (user, c) {
    requireUser_(user);
    need_(user, 'payroll_manage');
    var ss = TSS_(user);
    if (!c.name) throw new Error('Component name is required');
    if (['allowance', 'deduction'].indexOf(c.kind) < 0) throw new Error('Kind must be allowance or deduction');
    var obj = { name: c.name, kind: c.kind, amount: num_(c.amount),
      appliesTo: c.appliesTo || 'all', approved: !!c.approved };
    if (c.id) {
      var r = trows_(ss, 'payComponents').filter(function (x) { return x.id === c.id; })[0];
      if (!r) throw new Error('Pay component not found');
      obj.id = c.id;
      tupdate_(ss, 'payComponents', c.id, obj);
      audit_(user, 'savePayComponent', 'update ' + c.id);
      return c.id;
    }
    obj.id = tnextId_(ss, 'PC', 'payComponents');
    tappend_(ss, 'payComponents', obj);
    audit_(user, 'savePayComponent', 'create ' + obj.id);
    return obj.id;
  },

  deletePayComponent: function (user, id) {
    requireUser_(user);
    need_(user, 'payroll_manage');
    tremove_(TSS_(user), 'payComponents', id);
    audit_(user, 'deletePayComponent', id);
    return true;
  },

  runPayroll: function (user, month, employeeIds) {
    requireUser_(user);
    need_(user, 'payroll_manage');
    if (!/^\d{4}-\d{2}$/.test(String(month || ''))) throw new Error('Month must be in yyyy-MM format');
    var ss = TSS_(user);
    if (trows_(ss, 'payrollRuns').some(function (r) { return r.month === month && r.status !== 'cancelled'; }))
      throw new Error('Payroll has already been run for ' + month);
    var comps = trows_(ss, 'payComponents').filter(function (c) { return bool_(c.approved); });
    var emps = trows_(ss, 'employees').filter(function (e) {
      return bool_(e.active) && (!employeeIds || !employeeIds.length || employeeIds.indexOf(e.id) >= 0);
    });
    if (!emps.length) throw new Error('No employees selected');
    var runId = tnextId_(ss, 'RUN', 'payrollRuns');
    var slipIds = [];
    emps.forEach(function (e) {
      var allow = 0, ded = 0;
      comps.forEach(function (c) {
        var applies = !c.appliesTo || c.appliesTo === 'all' ||
          String(c.appliesTo).split(',').map(function (x) { return x.trim(); }).indexOf(e.id) >= 0;
        if (!applies) return;
        if (c.kind === 'allowance') allow += num_(c.amount);
        else if (c.kind === 'deduction') ded += num_(c.amount);
      });
      /* advance installment recovery */
      var advRec = 0;
      trows_(ss, 'advances').filter(function (a) {
        return String(a.employeeId) === String(e.id) && a.status === 'open';
      }).forEach(function (a) {
        var inst = num_(a.amount) / Math.max(1, num_(a.installments) || 1);
        var remain = num_(a.amount) - num_(a.recovered);
        var take = Math.min(inst, remain);
        advRec += take;
        a.recovered = Math.round((num_(a.recovered) + take) * 100) / 100;
        if (a.recovered >= num_(a.amount) - 0.01) a.status = 'closed';
        tupdate_(ss, 'advances', a.id, clean_(a));
      });
      advRec = Math.round(advRec * 100) / 100;
      var gross = num_(e.salary) + allow;
      var deductions = Math.round((ded + advRec) * 100) / 100;
      var net = Math.round((gross - deductions) * 100) / 100;
      var slip = { id: tnextId_(ss, 'SLIP', 'payslips'), runId: runId, employeeId: e.id,
        salary: num_(e.salary), allowances: Math.round(allow * 100) / 100,
        deductions: deductions, advanceRecovery: advRec, net: net, paid: false };
      tappend_(ss, 'payslips', slip);
      slipIds.push(slip.id);
    });
    tappend_(ss, 'payrollRuns', { id: runId, month: month, createdAt: nowStr_(),
      createdBy: user.id, status: 'draft' });
    audit_(user, 'runPayroll', month + ' slips=' + slipIds.length);
    return { runId: runId, slips: slipIds };
  },

  listPayrollRuns: function (user) {
    requireUser_(user);
    need_(user, 'payroll_manage');
    var ss = TSS_(user);
    var counts = {}, totals = {};
    trows_(ss, 'payslips').forEach(function (p) {
      counts[p.runId] = (counts[p.runId] || 0) + 1;
      totals[p.runId] = (totals[p.runId] || 0) + num_(p.net);
    });
    return trows_(ss, 'payrollRuns').map(function (r) {
      r = clean_(r);
      r.slips = counts[r.id] || 0;
      r.totalNet = Math.round((totals[r.id] || 0) * 100) / 100;
      return r;
    }).sort(function (a, b) { return String(b.month).localeCompare(String(a.month)); });
  },

  getPayslip: function (user, id) {
    requireUser_(user);
    var ss = TSS_(user);
    var p = trows_(ss, 'payslips').filter(function (x) { return x.id === id; })[0];
    if (!p) throw new Error('Payslip not found');
    if (user.role === 'employee' || user.role === 'user') selfOnly_(user, p.employeeId);
    var emp = empById_(ss, p.employeeId) || {};
    var run = trows_(ss, 'payrollRuns').filter(function (r) { return r.id === p.runId; })[0] || {};
    p = clean_(p);
    ['salary', 'allowances', 'deductions', 'advanceRecovery', 'net'].forEach(function (k) { p[k] = num_(p[k]); });
    p.paid = bool_(p.paid);
    return { payslip: p, employee: clean_(emp), run: clean_(run),
      company: tsetting_(ss, 'companyName', '') };
  },

  markPayslipPaid: function (user, id) {
    requireUser_(user);
    need_(user, 'payroll_manage');
    var ss = TSS_(user);
    var p = trows_(ss, 'payslips').filter(function (x) { return x.id === id; })[0];
    if (!p) throw new Error('Payslip not found');
    p.paid = true;
    tupdate_(ss, 'payslips', id, clean_(p));
    audit_(user, 'markPayslipPaid', id);
    return true;
  },

  listAdvances: function (user, employeeId) {
    requireUser_(user);
    var ss = TSS_(user);
    var scope = scopeEmployeeIds_(user);
    var emps = {};
    trows_(ss, 'employees').forEach(function (e) { emps[e.id] = e.name; });
    return trows_(ss, 'advances').filter(function (a) {
      if (scope && scope.indexOf(String(a.employeeId)) < 0) return false;
      if (employeeId && String(a.employeeId) !== String(employeeId)) return false;
      return true;
    }).map(function (a) {
      a = clean_(a);
      a.employee = emps[a.employeeId] || '?';
      a.amount = num_(a.amount); a.installments = num_(a.installments); a.recovered = num_(a.recovered);
      a.remaining = Math.round((a.amount - a.recovered) * 100) / 100;
      return a;
    }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  },

  grantAdvance: function (user, employeeId, date, amount, installments) {
    requireUser_(user);
    need_(user, 'payroll_manage');
    var ss = TSS_(user);
    if (!employeeId) throw new Error('Employee is required');
    if (!empById_(ss, employeeId)) throw new Error('Employee not found');
    if (num_(amount) <= 0) throw new Error('Amount must be greater than zero');
    var id = tnextId_(ss, 'ADV', 'advances');
    tappend_(ss, 'advances', { id: id, employeeId: employeeId, date: date || todayStr_(),
      amount: num_(amount), installments: Math.max(1, num_(installments) || 1),
      recovered: 0, status: 'open' });
    audit_(user, 'grantAdvance', id + ' ' + employeeId + ' ' + amount);
    return id;
  },

  finalSettlement: function (user, employeeId) {
    requireUser_(user);
    need_(user, 'payroll_manage');
    var ss = TSS_(user);
    var emp = empById_(ss, employeeId);
    if (!emp) throw new Error('Employee not found');
    var advancesRemaining = 0;
    trows_(ss, 'advances').filter(function (a) {
      return String(a.employeeId) === String(employeeId) && a.status === 'open';
    }).forEach(function (a) {
      advancesRemaining += num_(a.amount) - num_(a.recovered);
      a.status = 'settled';
      tupdate_(ss, 'advances', a.id, clean_(a));
    });
    advancesRemaining = Math.round(advancesRemaining * 100) / 100;
    var unpaid = trows_(ss, 'payslips').filter(function (p) {
      return String(p.employeeId) === String(employeeId) && !bool_(p.paid);
    }).map(function (p) { p = clean_(p); p.net = num_(p.net); return p; });
    var unpaidTotal = Math.round(unpaid.reduce(function (s, p) { return s + p.net; }, 0) * 100) / 100;
    audit_(user, 'finalSettlement', employeeId + ' advances=' + advancesRemaining + ' unpaid=' + unpaidTotal);
    return { employee: clean_(emp), advancesRemaining: advancesRemaining,
      unpaidPayslips: unpaid, unpaidTotal: unpaidTotal,
      totalDue: Math.round((advancesRemaining + unpaidTotal) * 100) / 100 };
  },

  listContractors: function (user) {
    requireUser_(user);
    return trows_(TSS_(user), 'contractors').map(function (c) {
      c = clean_(c); c.active = bool_(c.active); c.rate = num_(c.rate); return c;
    });
  },

  saveContractor: function (user, c) {
    requireUser_(user);
    need_(user, 'payroll_manage');
    var ss = TSS_(user);
    if (!c.name) throw new Error('Contractor name is required');
    var obj = { name: c.name, company: c.company || '', phone: c.phone || '',
      rate: num_(c.rate), active: c.active === undefined ? true : !!c.active };
    if (c.id) {
      var r = trows_(ss, 'contractors').filter(function (x) { return x.id === c.id; })[0];
      if (!r) throw new Error('Contractor not found');
      obj.id = c.id;
      tupdate_(ss, 'contractors', c.id, obj);
      audit_(user, 'saveContractor', 'update ' + c.id);
      return c.id;
    }
    obj.id = tnextId_(ss, 'CTR', 'contractors');
    tappend_(ss, 'contractors', obj);
    audit_(user, 'saveContractor', 'create ' + obj.id);
    return obj.id;
  },

  deleteContractor: function (user, id) {
    requireUser_(user);
    need_(user, 'payroll_manage');
    var ss = TSS_(user);
    if (trows_(ss, 'contractorBills').some(function (b) { return String(b.contractorId) === String(id); }))
      throw new Error('Cannot delete: bills exist for this contractor');
    tremove_(ss, 'contractors', id);
    audit_(user, 'deleteContractor', id);
    return true;
  },

  listContractorBills: function (user, filters) {
    requireUser_(user);
    filters = filters || {};
    var ss = TSS_(user);
    var cons = {};
    trows_(ss, 'contractors').forEach(function (c) { cons[c.id] = c.name; });
    return trows_(ss, 'contractorBills').filter(function (b) {
      if (filters.status && b.status !== filters.status) return false;
      if (filters.month && b.month !== filters.month) return false;
      if (filters.contractorId && String(b.contractorId) !== String(filters.contractorId)) return false;
      return true;
    }).map(function (b) {
      b = clean_(b);
      b.contractor = cons[b.contractorId] || '?';
      b.amount = num_(b.amount);
      return b;
    }).sort(function (a, b) { return String(b.month).localeCompare(String(a.month)); });
  },

  saveContractorBill: function (user, b) {
    requireUser_(user);
    need_(user, 'payroll_manage');
    var ss = TSS_(user);
    if (!b.contractorId || !b.month) throw new Error('Contractor and month are required');
    if (!/^\d{4}-\d{2}$/.test(String(b.month))) throw new Error('Month must be in yyyy-MM format');
    if (num_(b.amount) <= 0) throw new Error('Amount must be greater than zero');
    var obj = { contractorId: b.contractorId, month: b.month, amount: num_(b.amount),
      status: b.status || 'pending', note: b.note || '' };
    if (b.id) {
      var r = trows_(ss, 'contractorBills').filter(function (x) { return x.id === b.id; })[0];
      if (!r) throw new Error('Bill not found');
      if (r.status === 'approved') throw new Error('Cannot edit an approved bill');
      obj.id = b.id;
      tupdate_(ss, 'contractorBills', b.id, obj);
      audit_(user, 'saveContractorBill', 'update ' + b.id);
      return b.id;
    }
    obj.id = tnextId_(ss, 'CB', 'contractorBills');
    tappend_(ss, 'contractorBills', obj);
    audit_(user, 'saveContractorBill', 'create ' + obj.id);
    return obj.id;
  },

  decideContractorBill: function (user, id, approve) {
    requireUser_(user);
    need_(user, 'payroll_manage');
    var ss = TSS_(user);
    var b = trows_(ss, 'contractorBills').filter(function (x) { return x.id === id; })[0];
    if (!b) throw new Error('Bill not found');
    if (b.status !== 'pending') throw new Error('This bill was already decided');
    b.status = approve ? 'approved' : 'rejected';
    tupdate_(ss, 'contractorBills', id, clean_(b));
    audit_(user, 'decideContractorBill', id + ' -> ' + b.status);
    return true;
  },

  deleteContractorBill: function (user, id) {
    requireUser_(user);
    need_(user, 'payroll_manage');
    var ss = TSS_(user);
    var b = trows_(ss, 'contractorBills').filter(function (x) { return x.id === id; })[0];
    if (!b) throw new Error('Bill not found');
    if (b.status === 'approved') throw new Error('Cannot delete an approved bill');
    tremove_(ss, 'contractorBills', id);
    audit_(user, 'deleteContractorBill', id);
    return true;
  },

  /* ---------------- documents ---------------- */
  listDocuments: function (user, employeeId) {
    requireUser_(user);
    var ss = TSS_(user);
    var scope = scopeEmployeeIds_(user);
    var emps = {};
    trows_(ss, 'employees').forEach(function (e) { emps[e.id] = e.name; });
    return trows_(ss, 'documents').filter(function (d) {
      if (scope && scope.indexOf(String(d.employeeId)) < 0) return false;
      if (employeeId && String(d.employeeId) !== String(employeeId)) return false;
      return true;
    }).map(function (d) {
      d = clean_(d);
      d.employee = emps[d.employeeId] || '';
      d.daysLeft = daysLeft_(d.expiryDate);
      return d;
    }).sort(function (a, b) { return a.daysLeft - b.daysLeft; });
  },

  saveDocument: function (user, d) {
    requireUser_(user);
    need_(user, 'documents_manage');
    var ss = TSS_(user);
    if (!d.title) throw new Error('Document title is required');
    var obj = { employeeId: d.employeeId || '', title: d.title, expiryDate: d.expiryDate || '' };
    if (d.id) {
      var r = trows_(ss, 'documents').filter(function (x) { return x.id === d.id; })[0];
      if (!r) throw new Error('Document not found');
      obj.id = d.id;
      tupdate_(ss, 'documents', d.id, obj);
      audit_(user, 'saveDocument', 'update ' + d.id);
      return d.id;
    }
    obj.id = tnextId_(ss, 'DOC', 'documents');
    tappend_(ss, 'documents', obj);
    audit_(user, 'saveDocument', 'create ' + obj.id);
    return obj.id;
  },

  deleteDocument: function (user, id) {
    requireUser_(user);
    need_(user, 'documents_manage');
    tremove_(TSS_(user), 'documents', id);
    audit_(user, 'deleteDocument', id);
    return true;
  },

  getExpiringDocuments: function (user, days) {
    requireUser_(user);
    days = days === undefined ? 30 : num_(days);
    var ss = TSS_(user);
    var scope = scopeEmployeeIds_(user);
    var emps = {};
    trows_(ss, 'employees').forEach(function (e) { emps[e.id] = e.name; });
    return trows_(ss, 'documents').filter(function (d) {
      if (!d.expiryDate) return false;
      if (scope && scope.indexOf(String(d.employeeId)) < 0) return false;
      return daysLeft_(d.expiryDate) <= days;
    }).map(function (d) {
      d = clean_(d);
      d.employee = emps[d.employeeId] || '';
      d.daysLeft = daysLeft_(d.expiryDate);
      return d;
    }).sort(function (a, b) { return a.daysLeft - b.daysLeft; });
  },

  /* ---------------- reports ---------------- */
  attendanceSummary: function (user, from, to, employeeId) {
    requireUser_(user);
    var ss = TSS_(user);
    var scope = scopeEmployeeIds_(user);
    if (!from) from = todayStr_();
    if (!to) to = from;
    var emps = {};
    trows_(ss, 'employees').forEach(function (e) { emps[e.id] = e; });
    var perDay = {};
    trows_(ss, 'attendance').forEach(function (a) {
      if (a.date < from || a.date > to) return;
      if (scope && scope.indexOf(String(a.employeeId)) < 0) return;
      if (employeeId && String(a.employeeId) !== String(employeeId)) return;
      var k = a.employeeId + '|' + a.date;
      perDay[k] = perDay[k] || { employeeId: a.employeeId, date: a.date, punches: 0, outOfZone: 0, inTime: '', outTime: '' };
      var r = perDay[k];
      r.punches++;
      if (bool_(a.outOfZone)) r.outOfZone++;
      if (a.type === 'in' && (!r.inTime || a.time < r.inTime)) r.inTime = a.time;
      if (a.type === 'out' && (!r.outTime || a.time > r.outTime)) r.outTime = a.time;
    });
    var rows = Object.keys(perDay).map(function (k) {
      var r = perDay[k], e = emps[r.employeeId] || {};
      r.employee = e.name || '?'; r.code = e.code || '';
      r.hours = (r.inTime && r.outTime) ? Math.round(minsBetween_(r.inTime, r.outTime) / 60 * 100) / 100 : 0;
      return r;
    }).sort(function (a, b) {
      return (a.date + a.employee).localeCompare(b.date + b.employee);
    });
    var presentDays = {}, totalHours = 0, ooz = 0;
    rows.forEach(function (r) {
      presentDays[r.employeeId] = true;
      totalHours += r.hours; ooz += r.outOfZone;
    });
    return { rows: rows,
      totals: { employeeDays: rows.length, employeesPresent: Object.keys(presentDays).length,
        totalHours: Math.round(totalHours * 100) / 100, outOfZonePunches: ooz } };
  },

  exportCSV: function (user, kind, filters) {
    requireUser_(user);
    filters = filters || {};
    var ss = TSS_(user);
    var today = todayStr_();
    var filename, csv;
    if (kind === 'attendance') {
      var emps = {}, sites = {};
      trows_(ss, 'employees').forEach(function (e) { emps[e.id] = { name: e.name, code: e.code }; });
      trows_(ss, 'sites').forEach(function (s) { sites[s.id] = s.name; });
      var rows = trows_(ss, 'attendance').filter(function (a) {
        return (!filters.from || a.date >= filters.from) && (!filters.to || a.date <= filters.to) &&
               (!filters.employeeId || String(a.employeeId) === String(filters.employeeId));
      }).map(function (a) {
        var e = emps[a.employeeId] || {};
        return { id: a.id, date: a.date, time: a.time, employee: e.name || '?', code: e.code || '',
          type: a.type, site: sites[a.siteId] || '', distanceM: a.distanceM || '',
          outOfZone: bool_(a.outOfZone) ? 'Yes' : 'No', source: a.source || '',
          deviceId: a.deviceId || '', note: a.note || '' };
      });
      filename = 'attendance-' + today + '.csv';
      csv = csvOf_(['id', 'date', 'time', 'employee', 'code', 'type', 'site', 'distanceM', 'outOfZone', 'source', 'deviceId', 'note'], rows);
    } else if (kind === 'employees') {
      var deps = {};
      trows_(ss, 'departments').forEach(function (d) { deps[d.id] = d.name; });
      var erows = trows_(ss, 'employees').map(function (e) {
        return { id: e.id, code: e.code || '', name: e.name, department: deps[e.departmentId] || '',
          phone: e.phone || '', email: e.email || '', salary: num_(e.salary),
          joinDate: e.joinDate || '', active: bool_(e.active) ? 'Yes' : 'No' };
      });
      filename = 'employees-' + today + '.csv';
      csv = csvOf_(['id', 'code', 'name', 'department', 'phone', 'email', 'salary', 'joinDate', 'active'], erows);
    } else if (kind === 'payroll') {
      var pemps = {};
      trows_(ss, 'employees').forEach(function (e) { pemps[e.id] = { name: e.name, code: e.code }; });
      var prows = trows_(ss, 'payslips').filter(function (p) {
        if (filters.month) {
          var run = trows_(ss, 'payrollRuns').filter(function (r) { return r.id === p.runId; })[0];
          if (!run || run.month !== filters.month) return false;
        }
        return !filters.employeeId || String(p.employeeId) === String(filters.employeeId);
      }).map(function (p) {
        var e = pemps[p.employeeId] || {};
        return { id: p.id, runId: p.runId, employee: e.name || '?', code: e.code || '',
          salary: num_(p.salary), allowances: num_(p.allowances), deductions: num_(p.deductions),
          advanceRecovery: num_(p.advanceRecovery), net: num_(p.net),
          paid: bool_(p.paid) ? 'Yes' : 'No' };
      });
      filename = 'payroll-' + (filters.month || today) + '.csv';
      csv = csvOf_(['id', 'runId', 'employee', 'code', 'salary', 'allowances', 'deductions', 'advanceRecovery', 'net', 'paid'], prows);
    } else if (kind === 'leaves') {
      var lemps = {}, ltypes = {};
      trows_(ss, 'employees').forEach(function (e) { lemps[e.id] = e.name; });
      trows_(ss, 'leaveTypes').forEach(function (t) { ltypes[t.id] = t.name; });
      var lrows = trows_(ss, 'leaveRequests').filter(function (l) {
        return (!filters.from || l.to >= filters.from) && (!filters.to || l.from <= filters.to) &&
               (!filters.status || l.status === filters.status);
      }).map(function (l) {
        return { id: l.id, employee: lemps[l.employeeId] || '?', type: ltypes[l.typeId] || '?',
          from: l.from, to: l.to, days: num_(l.days), reason: l.reason || '', status: l.status };
      });
      filename = 'leaves-' + today + '.csv';
      csv = csvOf_(['id', 'employee', 'type', 'from', 'to', 'days', 'reason', 'status'], lrows);
    } else {
      throw new Error('Unknown export kind: ' + kind + ' (attendance, employees, payroll, leaves)');
    }
    audit_(user, 'exportCSV', kind + ' -> ' + filename);
    return { filename: filename, csv: csv };
  },

  getDashboard: function (user) {
    requireUser_(user);
    if (user.role === 'superadmin') {
      var tenants = rows_('tenants');
      var totalEmp = 0, todayP = 0, t = todayStr_();
      tenants.forEach(function (tn) {
        try {
          var tss = SpreadsheetApp.openById(tn.spreadsheetId);
          totalEmp += trows_(tss, 'employees').filter(function (e) { return bool_(e.active); }).length;
          todayP += trows_(tss, 'attendance').filter(function (a) { return a.date === t; }).length;
        } catch (e) {}
      });
      return {
        kpis: { totalTenants: tenants.length,
          activeTenants: tenants.filter(function (x) { return x.status === 'active'; }).length,
          totalEmployees: totalEmp, punchesToday: todayP },
        tenants: tenants.map(clean_)
      };
    }
    var ss = TSS_(user), today = todayStr_();
    var scope = scopeEmployeeIds_(user);
    var emps = {};
    trows_(ss, 'employees').forEach(function (e) { emps[e.id] = e; });
    var activeEmps = Object.keys(emps).map(function (k) { return emps[k]; })
      .filter(function (e) { return bool_(e.active) && (!scope || scope.indexOf(String(e.id)) >= 0); });
    var sites = {};
    trows_(ss, 'sites').forEach(function (s) { sites[s.id] = s.name; });
    var att = trows_(ss, 'attendance').filter(function (a) {
      return a.date === today && (!scope || scope.indexOf(String(a.employeeId)) >= 0);
    });
    var presentIds = {};
    att.forEach(function (a) { if (a.type === 'in') presentIds[a.employeeId] = true; });
    var present = Object.keys(presentIds).length;
    var onLeave = trows_(ss, 'leaveRequests').filter(function (l) {
      return l.status === 'approved' && l.from <= today && l.to >= today &&
             (!scope || scope.indexOf(String(l.employeeId)) >= 0);
    }).length;
    var feed = att.map(function (a) {
      var e = emps[a.employeeId] || {};
      return { time: a.time, employee: e.name || '?', code: e.code || '', type: a.type,
        site: sites[a.siteId] || '', outOfZone: bool_(a.outOfZone), lat: a.lat, lng: a.lng };
    }).sort(function (a, b) { return String(b.time).localeCompare(String(a.time)); }).slice(0, 20);
    var siteStats = {};
    att.forEach(function (a) {
      if (a.type !== 'in' || !a.siteId) return;
      var nm = sites[a.siteId] || a.siteId;
      siteStats[nm] = siteStats[nm] || { site: nm, present: 0 };
      siteStats[nm].present++;
    });
    return {
      kpis: {
        totalEmployees: activeEmps.length,
        presentToday: present,
        absentToday: Math.max(0, activeEmps.length - present),
        onLeaveToday: onLeave,
        outOfZoneToday: att.filter(function (a) { return bool_(a.outOfZone); }).length,
        pendingCorrections: trows_(ss, 'corrections').filter(function (c) { return c.status === 'pending'; }).length,
        pendingLeaves: trows_(ss, 'leaveRequests').filter(function (l) {
          return l.status === 'pending' && (!scope || scope.indexOf(String(l.employeeId)) >= 0);
        }).length,
        pendingOvertime: trows_(ss, 'overtime').filter(function (o) { return o.status === 'pending'; }).length,
        expiringDocuments: API.getExpiringDocuments(user, 30).length,
        openAdvances: trows_(ss, 'advances').filter(function (a) { return a.status === 'open'; }).length
      },
      feed: feed,
      siteStats: Object.keys(siteStats).map(function (k) { return siteStats[k]; })
    };
  },

  /* ---------------- settings ---------------- */
  getSettings: function (user) {
    requireUser_(user);
    var s = {};
    trows_(TSS_(user), 'settings').forEach(function (x) { s[x.key] = x.value; });
    return s;
  },

  saveSettings: function (user, s) {
    requireUser_(user);
    need_(user, 'settings_manage');
    var ss = TSS_(user);
    var sh = tsh_(ss, 'settings');
    var vals = sh.getDataRange().getValues();
    var keyRow = {};
    for (var i = 1; i < vals.length; i++) keyRow[String(vals[i][0])] = i + 1;
    Object.keys(s || {}).forEach(function (k) {
      if (keyRow[k]) sh.getRange(keyRow[k], 2).setValue(val_(s[k]));
      else tappend_(ss, 'settings', { key: k, value: s[k] });
    });
    audit_(user, 'saveSettings', Object.keys(s || {}).join(','));
    return true;
  },

  backupNow: function (user) {
    requireUser_(user);
    need_(user, 'settings_manage');
    var ss = TSS_(user);
    var name = 'Backup — ' + tsetting_(ss, 'companyName', 'Tenant') + ' — ' + todayStr_();
    var copy = DriveApp.getFileById(ss.getId()).makeCopy(name);
    audit_(user, 'backupNow', name);
    return { url: copy.getUrl(), name: copy.getName() };
  },

  listRolePermissions: function (user) {
    requireUser_(user);
    return trows_(TSS_(user), 'rolePermissions').map(function (p) {
      p = clean_(p);
      try { p.matrix = JSON.parse(p.matrix || '{}'); } catch (e) { p.matrix = {}; }
      return p;
    });
  },

  saveRolePermissions: function (user, rows) {
    requireUser_(user);
    need_(user, 'settings_manage');
    var ss = TSS_(user);
    (rows || []).forEach(function (m) {
      if (!m.role) throw new Error('Role is required');
      var v = typeof m.matrix === 'string' ? m.matrix : JSON.stringify(m.matrix || {});
      var r = trows_(ss, 'rolePermissions').filter(function (p) { return p.role === m.role; })[0];
      if (r) tupdate_(ss, 'rolePermissions', m.role, { role: m.role, matrix: v });
      else tappend_(ss, 'rolePermissions', { role: m.role, matrix: v });
    });
    audit_(user, 'saveRolePermissions', (rows || []).map(function (m) { return m.role; }).join(','));
    return true;
  }
};

/* rolePermissions rows are keyed by role (first column), so update by role id */

/* ---------------- private helpers used by API ---------------- */
function siteForPunch_(ss, employeeId, lat, lng) {
  if (lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '')
    return null;
  var assigned = trows_(ss, 'siteEmployees')
    .filter(function (x) { return String(x.employeeId) === String(employeeId); })
    .map(function (x) { return x.siteId; });
  var active = trows_(ss, 'sites').filter(function (s) { return bool_(s.active); });
  var pool = assigned.length
    ? active.filter(function (s) { return assigned.indexOf(s.id) >= 0; })
    : active;
  if (!pool.length) pool = active;
  var best = null;
  pool.forEach(function (s) {
    if (s.lat === null || s.lat === '' || s.lng === null || s.lng === '') return;
    var d = haversineM_(num_(lat), num_(lng), num_(s.lat), num_(s.lng));
    if (!best || d < best.distanceM) {
      best = { id: s.id, name: s.name, distanceM: d, outOfZone: d > (num_(s.radiusM) || 200) };
    }
  });
  return best;
}
function leaveBalanceOf_(ss, employeeId, year, typeId) {
  var r = trows_(ss, 'leaveBalances').filter(function (b) {
    return String(b.employeeId) === String(employeeId) && String(b.year) === String(year) &&
           String(b.typeId) === String(typeId);
  })[0];
  return r ? clean_(r) : { employeeId: employeeId, year: year, typeId: typeId, used: 0 };
}
function upsertBalance_(ss, employeeId, year, typeId, used) {
  var sh = tsh_(ss, 'leaveBalances');
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(employeeId) && String(vals[i][1]) === String(year) &&
        String(vals[i][2]) === String(typeId)) {
      sh.getRange(i + 1, 4).setValue(num_(used));
      return;
    }
  }
  tappend_(ss, 'leaveBalances', { employeeId: employeeId, year: year, typeId: typeId, used: num_(used) });
}
function daysLeft_(iso) {
  if (!iso) return 99999;
  return Math.ceil((new Date(iso + 'T00:00:00').getTime() - Date.now()) / 86400000);
}

/* ================= one-time setup & seeders ================= */

/* Registry: run once from the Apps Script editor on the bound spreadsheet */
function setupRegistry() {
  ['tenants', 'saasUsers', 'auditLog'].forEach(function (n) { sh_(n); });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try { var s1 = ss.getSheetByName('Sheet1'); if (s1) ss.deleteSheet(s1); } catch (e) {}
  if (!rows_('saasUsers').length) {
    append_('saasUsers', { id: 'SU-0001', name: 'Super Admin', username: 'superadmin',
      passwordHash: sha256_('admin123'), role: 'superadmin', active: true });
  }
  Logger.log('Registry ready. Superadmin login: company code ADMIN / superadmin / admin123');
  return 'Registry ready';
}

/* Seed every tenant tab inside a tenant spreadsheet */
function setupTenantSS(ss, companyName) {
  TENANT_TABS.forEach(function (n) { sheetOf_(ss, n); });

  var perms = {
    admin:   { employees_manage: 1, sites_manage: 1, shifts_manage: 1, attendance_view: 1,
               attendance_manage: 1, leave_manage: 1, leave_approve: 1, overtime_approve: 1,
               payroll_view: 1, payroll_manage: 1, documents_manage: 1, reports_view: 1, settings_manage: 1 },
    hr:      { employees_manage: 1, sites_manage: 1, shifts_manage: 1, attendance_view: 1,
               attendance_manage: 1, leave_manage: 1, leave_approve: 1, overtime_approve: 1,
               payroll_view: 1, payroll_manage: 1, documents_manage: 1, reports_view: 1, settings_manage: 1 },
    manager: { employees_view: 1, attendance_view: 1, leave_approve: 1, overtime_approve: 1,
               reports_view: 1, documents_view: 1 },
    employee:{ punch_own: 1, leave_request: 1, overtime_request: 1, own_view: 1 },
    user:    { own_view: 1 }
  };
  Object.keys(perms).forEach(function (role) {
    tappend_(ss, 'rolePermissions', { role: role, matrix: JSON.stringify(perms[role]) });
  });

  [['companyName', companyName || ''],
   ['currency', 'PKR'],
   ['timezone', 'Asia/Karachi'],
   ['graceMinutes', '15'],
   ['workingDays', 'Mon,Tue,Wed,Thu,Fri,Sat'],
   ['logoUrl', ''],
   ['supportEmail', '']
  ].forEach(function (kv) { tappend_(ss, 'settings', { key: kv[0], value: kv[1] }); });

  [['SH-0001', 'Morning Shift', '08:00', '17:00', 15],
   ['SH-0002', 'Evening Shift', '14:00', '22:00', 15],
   ['SH-0003', 'Night Shift', '22:00', '06:00', 15]
  ].forEach(function (s) {
    tappend_(ss, 'shifts', { id: s[0], name: s[1], startTime: s[2], endTime: s[3], graceMin: s[4] });
  });

  [['LT-0001', 'Annual Leave', 14, true],
   ['LT-0002', 'Sick Leave', 10, true],
   ['LT-0003', 'Casual Leave', 12, true]
  ].forEach(function (t) {
    tappend_(ss, 'leaveTypes', { id: t[0], name: t[1], quota: t[2], paid: t[3] });
  });

  return 'Tenant spreadsheet seeded';
}

/* Demo tenant + sample data. Run once from the editor. */
function seedDemo() {
  setupRegistry();
  var root = { id: 'SU-0001', name: 'Super Admin', username: 'superadmin', role: 'superadmin' };
  var existing = rows_('tenants').filter(function (x) { return x.loginCode === 'DEMO'; })[0];
  var t = existing
    ? { tenantId: existing.tenantId, spreadsheetId: existing.spreadsheetId }
    : API.createTenant(root, 'Demo Construction Co', 'trial', 'Admin', 'admin', 'admin123');
  var admin = { id: 'U-0001', name: 'Admin', username: 'admin', role: 'admin',
    tenantId: t.tenantId, spreadsheetId: t.spreadsheetId };
  var ss = SpreadsheetApp.openById(t.spreadsheetId);
  var today = todayStr_();

  /* sites */
  var s1 = API.saveSite(admin, { name: 'Main Site Gulberg', address: 'Gulberg, Lahore',
    lat: 31.5204, lng: 74.3587, radiusM: 200, active: true });
  var s2 = API.saveSite(admin, { name: 'DHA Site Lahore', address: 'DHA Phase 5, Lahore',
    lat: 31.5497, lng: 74.3436, radiusM: 300, active: true });

  /* departments */
  var d1 = API.saveDepartment(admin, { name: 'Site Staff' });
  var d2 = API.saveDepartment(admin, { name: 'Office' });

  /* employees */
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
      email: '', salary: e[4], joinDate: addDays_(today, -90), deviceId: e[5], active: true });
  });

  /* login users: admin/admin123 exists from createTenant; add hr + employee */
  tappend_(ss, 'users', { id: 'U-0002', name: 'HR Manager', username: 'hr',
    passwordHash: sha256_('hr123'), role: 'hr', employeeId: '', active: true });
  tappend_(ss, 'users', { id: 'U-0003', name: 'Ahmed Khan', username: 'employee',
    passwordHash: sha256_('emp123'), role: 'employee', employeeId: empIds[0], active: true });

  /* assign employees to sites */
  API.assignSiteEmployees(admin, s1, empIds.slice(0, 4));
  API.assignSiteEmployees(admin, s2, empIds.slice(4));

  /* today's punches (near Main Site Gulberg) */
  API.punch(admin, empIds[0], 'in', 31.5205, 74.3588, '', 'DEV-001', 'app');
  API.punch(admin, empIds[1], 'in', 31.5206, 74.3586, '', '', 'app');
  API.punch(admin, empIds[2], 'in', 31.5203, 74.3589, '', '', 'app');
  API.punch(admin, empIds[0], 'out', 31.5205, 74.3588, '', 'DEV-001', 'app');
  API.punch(admin, empIds[3], 'in', 31.5490, 74.3440, '', '', 'app');

  /* one pending leave request */
  API.requestLeave(admin, empIds[1], 'LT-0001', today, addDays_(today, 2), 3, 'Family event');

  /* one pending correction */
  var firstPunch = trows_(ss, 'attendance')[0];
  if (firstPunch) API.requestCorrection(admin, firstPunch.id, 'Forgot to punch out, actual out 17:05');

  /* one advance */
  API.grantAdvance(admin, empIds[2], today, 20000, 4);

  /* one document expiring in 10 days */
  API.saveDocument(admin, { employeeId: empIds[0], title: 'CNIC Copy', expiryDate: addDays_(today, 10) });

  Logger.log('Demo tenant seeded. Login: company code DEMO / admin / admin123');
  return 'Demo seeded';
}
