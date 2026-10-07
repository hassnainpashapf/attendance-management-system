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
/* The frontend ships as 3 small HTML files (the Apps Script editor hangs when
   saving files > ~300KB). index.html holds part 1 inline; app2.html / app3.html
   are minimal VALID HTML documents each wrapping one <script> block.
   NOTE 1: createHtmlOutputFromFile('app2').getContent() returns EMPTY when the
   file is a bare <script> fragment instead of a valid document, so the parts
   must stay valid documents and we extract the script block here with pure
   string ops (no templates/scriptlets).
   NOTE 2: doGet() injects the extracted script blocks immediately before the
   shell's </body>. HTML-comment placeholders (<!--APP_PART_*-->) are NOT used:
   getContent() may strip comments, which silently dropped parts 2/3 and shipped
   a blank page (the boot code lives in part 2). */
function partScript(name) {
  var doc = HtmlService.createHtmlOutputFromFile(name).getContent();
  var i = doc.indexOf('<script>');
  var j = doc.lastIndexOf('</script>');
  if (i < 0 || j < 0 || j <= i) throw new Error('part ' + name + ': no script block (got ' + doc.length + ' chars)');
  var s = doc.substring(i, j + 9);
  if (s.length < 50000) throw new Error('part ' + name + ': suspiciously small (' + s.length + ' chars)');
  return s;
}
function doGet() {
  var shell = HtmlService.createHtmlOutputFromFile('index').getContent();
  var k = shell.lastIndexOf('</body>');
  if (k < 0) throw new Error('shell has no </body>');
  var html = shell.substring(0, k) + partScript('app2') + partScript('app3') + shell.substring(k);
  return HtmlService.createHtmlOutput(html)
    .setTitle('Attendance Management System')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
/* Editor-runnable diagnostic: verifies every frontend part extracts non-empty.
   Run this after pasting files and before deploying a new version. */
function verifyAssembly() {
  var out = {};
  ['index', 'app2', 'app3'].forEach(function (name) {
    var doc = HtmlService.createHtmlOutputFromFile(name).getContent();
    out[name + '_docChars'] = doc.length;
  });
  out.app2_scriptChars = partScript('app2').length;
  out.app3_scriptChars = partScript('app3').length;
  out.app2_hasBoot = partScript('app2').indexOf('11_layout.js') >= 0;
  out.app3_hasDashboard = partScript('app3').indexOf('20_dashboard.js') >= 0;
  Logger.log(JSON.stringify(out));
  return out;
}
/* Editor-runnable diagnostic: JSON summary of what doGet() would serve. */
function debugAssembly() {
  var shell = HtmlService.createHtmlOutputFromFile('index').getContent();
  var p2 = partScript('app2');
  var p3 = partScript('app3');
  var out = {
    indexChars: shell.length,
    hasBodyClose: shell.lastIndexOf('</body>') >= 0,
    part2Chars: p2.length,
    part3Chars: p3.length,
    assembledChars: shell.length + p2.length + p3.length
  };
  Logger.log(JSON.stringify(out));
  return out;
}

/* HTTP entry for native clients (Android auto-punch service). Accepts a JSON
   body {fn, user, args} and routes through the same __api dispatcher + token
   validation as google.script.run. Returns {ok, data|error} as JSON. */
function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { body = {}; }
  var out;
  try {
    var userJson = body.userJson || JSON.stringify(body.user || null);
    var argsJson = body.argsJson || JSON.stringify(body.args || []);
    out = { ok: true, data: __api(body.fn, userJson, argsJson) };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
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
    var flat = {};
    try { flat = pm ? JSON.parse(pm.matrix || '{}') : {}; } catch (e) { flat = {}; }
    /* The stored matrix uses flat keys (employees_manage, payroll_view, ...);
       the frontend perm(module, action) needs nested {module:{action:1}}.
       manage/edit imply view+edit; approve/request/own imply view. */
    var permissions = {};
    Object.keys(flat).forEach(function (k) {
      if (!flat[k]) return;
      var i = k.lastIndexOf('_');
      if (i < 0) return;
      var mod = k.substring(0, i), act = k.substring(i + 1);
      if (!permissions[mod]) permissions[mod] = {};
      permissions[mod][act] = 1;
      if (act === 'manage' || act === 'edit') { permissions[mod].view = 1; permissions[mod].edit = 1; }
      if (act === 'approve' || act === 'request' || act === 'own') { permissions[mod].view = 1; }
    });
    /* dashboard + punch are nav-level grants implied by role */
    if (user.role === 'admin' || user.role === 'hr' || user.role === 'manager') {
      if (!permissions.dashboard) permissions.dashboard = {};
      permissions.dashboard.view = 1;
    }
    if (user.role === 'admin' || user.role === 'hr') {
      if (!permissions.punch) permissions.punch = {};
      permissions.punch.view = 1;
    }
    var tenant = rows_('tenants').filter(function (t) { return t.tenantId === user.tenantId; })[0] || null;
    var emp = user.employeeId ? empById_(ss, user.employeeId) : null;
    return {
      user: user,
      permissions: permissions,
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
    var obj = { name: s.name, startTime: s.startTime, endTime: s.endTime,
      graceMin: num_(s.graceMin) || getRule_(ss, 'lateGraceMinutes', 15) };
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
    /* duplicate guard: same employee + type inside the rule window */
    var dupWin = getRule_(ss, 'duplicatePunchWindowMinutes', 5);
    var dup = trows_(ss, 'attendance').filter(function (a) {
      return String(a.employeeId) === String(employeeId) && a.type === type && a.date === today &&
             Math.abs(minsBetween_(a.time, nowT)) < dupWin;
    })[0];
    if (dup) throw new Error('Duplicate punch: a "' + type + '" punch was already recorded at ' + dup.time);
    var site = siteForPunch_(ss, employeeId, lat, lng);
    if (site && site.outOfZone && getRule_(ss, 'outOfZonePolicy', 'flag') === 'block')
      throw new Error('Punch rejected: outside the site geofence (out-of-zone punches are blocked by HR rule)');
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
    var dupWin = getRule_(ss, 'duplicatePunchWindowMinutes', 5);
    var dup = trows_(ss, 'attendance').filter(function (a) {
      return String(a.employeeId) === String(emp.id) && a.type === type && a.date === date &&
             Math.abs(minsBetween_(a.time, time)) < dupWin;
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

  /* Phase 2 track tab seeders (all idempotent; typeof-guarded for safety) */
  if (typeof seedTrack1Tabs_ === 'function') seedTrack1Tabs_(ss);
  if (typeof seedTrack2Tabs_ === 'function') seedTrack2Tabs_(ss);
  if (typeof seedTrack3Tabs_ === 'function') seedTrack3Tabs_(ss);
  if (typeof seedTrack5Tabs_ === 'function') seedTrack5Tabs_(ss);
  if (typeof seedTrack6Tabs_ === 'function') seedTrack6Tabs_(ss);

  var perms = {
    admin:   { dashboard_view: 1, punch_view: 1, employees_manage: 1, sites_manage: 1, shifts_manage: 1, attendance_view: 1,
               attendance_manage: 1, leave_manage: 1, leave_approve: 1, overtime_approve: 1,
               payroll_view: 1, payroll_manage: 1, documents_manage: 1, reports_view: 1, settings_manage: 1 },
    hr:      { dashboard_view: 1, punch_view: 1, employees_manage: 1, sites_manage: 1, shifts_manage: 1, attendance_view: 1,
               attendance_manage: 1, leave_manage: 1, leave_approve: 1, overtime_approve: 1,
               payroll_view: 1, payroll_manage: 1, documents_manage: 1, reports_view: 1, settings_manage: 1 },
    manager: { dashboard_view: 1, employees_view: 1, attendance_view: 1, leave_approve: 1, overtime_approve: 1,
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

  /* Phase 2 rich demo data (overtime, holidays, rosters, payroll, contractors, extra punches) */
  if (typeof seedTrack7Demo_ === 'function') seedTrack7Demo_(ss, t.tenantId);

  Logger.log('Demo tenant seeded. Login: company code DEMO / admin / admin123');
  return 'Demo seeded';
}

/* ===== TRACK 1: face check-in =====
   On-device face verification (Phase 2). Face matching never runs server-side:
   the frontend captures frames, computes 128-d descriptors with face-api.js in
   the browser, and sends only the boolean faceVerified + numeric matchScore.
   enrollFace stores one averaged descriptor per employee in the
   faceEnrollments tab (keyed by employeeId). punchWithFace wraps API.punch and
   appends the face columns to the punch record; all face fields are optional
   so plain punch() calls keep working unchanged.
   Dispatcher registration: __api resolves API[fn], so the assignments below
   register enrollFace / getFaceEnrollment / resetFaceEnrollment / punchWithFace. */

/* Tab schema for seedTrack1Tabs_ (coordinator wires the call into tenant setup).
   The key is the sheet name; sheetOf_/rowsOf_/appendOf_ pick it up automatically. */
SHEETS.faceEnrollments = ['employeeId', 'descriptorJson', 'enrolledAt', 'updatedAt'];
/* Face columns on the attendance tab for both new and existing tenant sheets. */
['faceVerified', 'matchScore'].forEach(function (c) {
  if (SHEETS.attendance.indexOf(c) < 0) SHEETS.attendance.push(c);
});

/* Create the Track 1 tabs in a tenant spreadsheet. Called by the coordinator
   from tenant setup (do NOT call from setupTenantSS directly). */
function seedTrack1Tabs_(ss) {
  sheetOf_(ss, 'faceEnrollments');
  return 'faceEnrollments ready';
}

function faceRowByEmp_(ss, employeeId) {
  return trows_(ss, 'faceEnrollments').filter(function (r) {
    return String(r.employeeId) === String(employeeId);
  })[0] || null;
}

/* Normalize a transported descriptor to 128 finite numbers, or null. */
function parseFaceDescriptor_(descriptor) {
  var d = null;
  try { d = (typeof descriptor === 'string') ? JSON.parse(descriptor) : descriptor; }
  catch (e) { d = null; }
  if (!Array.isArray(d) || d.length !== 128) return null;
  for (var i = 0; i < d.length; i++) {
    var v = Number(d[i]);
    if (!isFinite(v)) return null;
    d[i] = v;
  }
  return d;
}

/* Add faceVerified/matchScore header columns to an already-seeded attendance tab. */
function ensureFaceCols_(ss) {
  var s = tsh_(ss, 'attendance');
  var heads = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(function (x) { return String(x); });
  ['faceVerified', 'matchScore'].forEach(function (c) {
    if (heads.indexOf(c) < 0) {
      if (s.getMaxColumns() < s.getLastColumn() + 1) s.insertColumnsAfter(s.getMaxColumns(), 1);
      s.getRange(1, s.getLastColumn() + 1).setValue(c);
      heads.push(c);
    }
  });
}

API.enrollFace = function (user, employeeId, descriptor) {
  requireUser_(user);
  need_(user, 'employees_manage');
  var ss = TSS_(user);
  if (!empById_(ss, employeeId)) throw new Error('Employee not found');
  var d = parseFaceDescriptor_(descriptor);
  if (!d) throw new Error('Invalid face descriptor (need 128 finite numbers)');
  var now = nowStr_();
  var existing = faceRowByEmp_(ss, employeeId);
  var row = { employeeId: employeeId, descriptorJson: JSON.stringify(d),
              enrolledAt: existing ? existing.enrolledAt : now, updatedAt: now };
  /* faceEnrollments is keyed by employeeId in column 1, so update/remove match on it */
  if (existing) tupdate_(ss, 'faceEnrollments', employeeId, row);
  else tappend_(ss, 'faceEnrollments', row);
  audit_(user, 'enrollFace', employeeId + (existing ? ' re-enrolled' : ' enrolled'));
  return { employeeId: employeeId, enrolledAt: row.enrolledAt, updatedAt: now };
};

API.getFaceEnrollment = function (user, employeeId) {
  requireUser_(user);
  if (!employeeId) throw new Error('Employee is required');
  /* same scoping as listEmployees: employee/user roles see only their own record */
  if (user.role === 'employee' || user.role === 'user') selfOnly_(user, employeeId);
  var ss = TSS_(user);
  var row = faceRowByEmp_(ss, employeeId);
  if (!row) return { employeeId: employeeId, enrolled: false };
  var out = { employeeId: employeeId, enrolled: true,
              enrolledAt: row.enrolledAt, updatedAt: row.updatedAt };
  /* the enrolled descriptor is handed to the device so matching runs on-device */
  var d = parseFaceDescriptor_(row.descriptorJson);
  if (d) out.descriptor = d;
  return out;
};

API.resetFaceEnrollment = function (user, employeeId) {
  requireUser_(user);
  need_(user, 'employees_manage');
  var ss = TSS_(user);
  if (!empById_(ss, employeeId)) throw new Error('Employee not found');
  tremove_(ss, 'faceEnrollments', employeeId);
  audit_(user, 'resetFaceEnrollment', employeeId);
  return { ok: true, employeeId: employeeId };
};

/* Punch with on-device face result. faceVerified/matchScore are optional:
   when omitted (or invalid) the record is written exactly like API.punch. */
API.punchWithFace = function (user, employeeId, type, lat, lng, selfie, deviceId, source, faceVerified, matchScore) {
  var r = API.punch(user, employeeId, type, lat, lng, selfie, deviceId, source);
  try {
    var fv = (faceVerified === true || faceVerified === 'TRUE' || faceVerified === 'true');
    var hadFace = (faceVerified !== null && faceVerified !== undefined && faceVerified !== '');
    var ms = (matchScore === null || matchScore === undefined || matchScore === '') ? '' : Number(matchScore);
    if (isNaN(ms)) ms = '';
    var ss = TSS_(user);
    ensureFaceCols_(ss);
    var s = tsh_(ss, 'attendance');
    var heads = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(function (x) { return String(x); });
    var c1 = heads.indexOf('faceVerified') + 1, c2 = heads.indexOf('matchScore') + 1;
    var ids = s.getRange(2, 1, Math.max(1, s.getLastRow() - 1), 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(r.punch.id)) {
        if (c1 && hadFace) s.getRange(i + 2, c1).setValue(fv);
        if (c2 && ms !== '') s.getRange(i + 2, c2).setValue(ms);
        break;
      }
    }
    r.punch.faceVerified = hadFace ? fv : null;
    r.punch.matchScore = ms;
    audit_(user, 'punchFace', employeeId + ' faceVerified=' + r.punch.faceVerified + ' score=' + ms);
  } catch (e) {
    /* face columns are informational — never fail the punch */
    r.punch.faceVerified = r.punch.faceVerified === undefined ? null : r.punch.faceVerified;
    if (r.punch.matchScore === undefined) r.punch.matchScore = null;
  }
  return r;
};

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

/* ===== TRACK 3: alerts (WhatsApp + SMS) =====
   Tenant-level WhatsApp Cloud API + generic SMS webhook alerting.
   Events: late arrival, absent (no check-in), leave approved/rejected,
   out-of-zone punch. Every attempt is written to the messageLog tab with
   status sent / failed / pending-config. Missing credentials never throw:
   the attempt is logged as pending-config and the punch/leave flow continues.
   Dispatcher registration: __api resolves API[fn], so the API.* assignments
   below register sendAlert / runAlertChecks / checkAbsences /
   alertLeaveDecision / listMessageLog / resendAlert / testAlert automatically.
   Integration: the coordinator appends this whole section to Code.gs and
   wires seedTrack3Tabs_(ss) for new and existing tenants. */

/* Tab schema for seedTrack3Tabs_. ts is an ISO string (yyyy-MM-ddTHH:mm:ss),
   never a Date object: google.script.run cannot transport Dates. */
SHEETS.messageLog = ['id', 'ts', 'tenantId', 'channel', 'to', 'event', 'body', 'status', 'error'];
if (TENANT_TABS.indexOf('messageLog') < 0) TENANT_TABS.push('messageLog');

/* Create the Track 3 tab + default settings keys in a tenant spreadsheet.
   Idempotent: never overwrites keys the tenant already set. */
function seedTrack3Tabs_(ss) {
  sheetOf_(ss, 'messageLog');
  var defaults = [
    ['wa_token', ''],
    ['wa_phone_number_id', ''],
    ['wa_enabled', '0'],
    ['wa_template_name', ''],
    ['sms_webhook_url', ''],
    ['sms_enabled', '0'],
    ['alert_late', '1'],
    ['alert_absent', '1'],
    ['alert_leave_decision', '1'],
    ['alert_out_of_zone', '1'],
    ['absence_grace_minutes', '60']
  ];
  var have = {};
  trows_(ss, 'settings').forEach(function (r) { have[r.key] = 1; });
  defaults.forEach(function (kv) {
    if (!have[kv[0]]) tappend_(ss, 'settings', { key: kv[0], value: kv[1] });
  });
  return 'Track 3 tabs seeded';
}

/* ---------- small helpers ---------- */
function t3On_(v) {
  return v === true || v === 1 || v === '1' || v === 'true' || v === 'TRUE';
}
function t3NowISO_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
}
function t3NormPhone_(p) {
  return String(p || '').replace(/[^0-9]/g, '');
}
/* Channel pick: WhatsApp wins when fully configured + enabled, else SMS when
   its webhook is configured + enabled, else '' (pending-config path). */
function t3Channel_(ss) {
  if (t3On_(tsetting_(ss, 'wa_enabled', '0')) &&
      tsetting_(ss, 'wa_token', '') && tsetting_(ss, 'wa_phone_number_id', ''))
    return 'whatsapp';
  if (t3On_(tsetting_(ss, 'sms_enabled', '0')) && tsetting_(ss, 'sms_webhook_url', ''))
    return 'sms';
  return '';
}
/* Validate an explicitly requested channel against stored credentials. */
function t3ChannelFor_(ss, channel) {
  if (channel === 'whatsapp' && tsetting_(ss, 'wa_token', '') && tsetting_(ss, 'wa_phone_number_id', ''))
    return 'whatsapp';
  if (channel === 'sms' && tsetting_(ss, 'sms_webhook_url', ''))
    return 'sms';
  return '';
}
function t3LogRow_(ss, base, status, error) {
  tappend_(ss, 'messageLog', {
    id: base.id, ts: base.ts, tenantId: base.tenantId, channel: base.channel,
    to: base.to, event: base.event, body: String(base.body || '').slice(0, 1000),
    status: status, error: String(error || '').slice(0, 500)
  });
}
/* Message text per event. English templates; localizable later via settings. */
function t3Body_(event, v) {
  var brand = 'Attendance Management System';
  switch (event) {
    case 'late':
      return brand + ': ' + v.name + ' checked in late at ' + v.time +
        ' (shift starts ' + v.shiftStart + ', ' + v.lateBy + ' min beyond grace).';
    case 'out_of_zone':
      return brand + ': ' + v.name + ' punched ' + v.type + ' at ' + v.time +
        ' outside the geofence (' + v.site + (v.distance ? ', ' + v.distance + ' m away' : '') + ').';
    case 'absent':
      return brand + ': ' + v.name + ' is marked absent for ' + v.date + ' (no check-in recorded).';
    case 'leave_approved':
      return brand + ': Dear ' + v.name + ', your ' + v.type + ' leave from ' + v.from +
        ' to ' + v.to + ' (' + v.days + ' days) has been APPROVED.';
    case 'leave_rejected':
      return brand + ': Dear ' + v.name + ', your ' + v.type + ' leave from ' + v.from +
        ' to ' + v.to + ' (' + v.days + ' days) has been REJECTED.';
    case 'test':
      return brand + ' test alert via ' + v.channel + ' - your notification channel is working.';
    default:
      return brand + ' notification: ' + event;
  }
}
/* WhatsApp Cloud API. URL built by concat: no literal double-slash in strings.
   NOTE: GAS UrlFetchApp exposes no timeout parameter, so the platform default
   applies; the call is wrapped so a failure is logged, never thrown. */
function t3WhatsApp_(ss, to, body) {
  var token = tsetting_(ss, 'wa_token', '');
  var pid = tsetting_(ss, 'wa_phone_number_id', '');
  if (!token || !pid) throw new Error('WhatsApp credentials not configured');
  var url = 'https:' + '/' + '/graph.facebook.com/v21.0/' + pid + '/messages';
  var tpl = tsetting_(ss, 'wa_template_name', '');
  var payload = tpl
    ? { messaging_product: 'whatsapp', to: to, type: 'template',
        template: { name: tpl, language: { code: 'en' } } }
    : { messaging_product: 'whatsapp', to: to, type: 'text', text: { body: body } };
  var resp = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(payload),
    headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  if (code < 200 || code >= 300)
    throw new Error('WhatsApp API HTTP ' + code + ': ' + String(resp.getContentText()).slice(0, 300));
  return true;
}
/* Generic SMS webhook: POST JSON {to, message}. 2xx counts as sent. */
function t3Sms_(ss, to, body) {
  var url = tsetting_(ss, 'sms_webhook_url', '');
  if (!url) throw new Error('SMS webhook URL not configured');
  var resp = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ to: to, message: body }), muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  if (code < 200 || code >= 300)
    throw new Error('SMS webhook HTTP ' + code + ': ' + String(resp.getContentText()).slice(0, 300));
  return true;
}
/* Raw send: throws on any failure (including missing credentials). */
function t3TrySend_(ss, channel, to, body) {
  if (channel === 'whatsapp') return t3WhatsApp_(ss, to, body);
  if (channel === 'sms') return t3Sms_(ss, to, body);
  throw new Error('No notification channel configured');
}
/* Dispatch + log. NEVER throws: missing credentials -> pending-config,
   send failure -> failed with error text. Returns a result object. */
function t3Dispatch_(ss, tenantId, channel, to, event, body) {
  var base = { id: tnextId_(ss, 'M', 'messageLog'), ts: t3NowISO_(),
    tenantId: tenantId, channel: channel || '', to: to, event: event, body: body };
  if (!channel) {
    t3LogRow_(ss, base, 'pending-config', 'WhatsApp/SMS credentials not configured');
    return { ok: true, sent: false, status: 'pending-config' };
  }
  try {
    t3TrySend_(ss, channel, to, body);
    t3LogRow_(ss, base, 'sent', '');
    return { ok: true, sent: true, status: 'sent', channel: channel };
  } catch (e) {
    var msg = String((e && e.message) || e).slice(0, 500);
    t3LogRow_(ss, base, 'failed', msg);
    return { ok: true, sent: false, status: 'failed', error: msg };
  }
}
/* Dedupe guard: was this event already logged (not failed)? The log ts is when
   the check RAN, which may differ from the event date (e.g. a back-dated
   absence sweep), so a row counts when its ts starts with dateISO OR its body
   mentions dateISO, and the match string (when given) appears in the body. */
function t3Logged_(ss, dateISO, event, phone, match) {
  var to = t3NormPhone_(phone);
  return trows_(ss, 'messageLog').some(function (r) {
    if (r.event !== event || t3NormPhone_(r.to) !== to || r.status === 'failed') return false;
    var body = String(r.body || '');
    if (match && body.indexOf(match) < 0) return false;
    return String(r.ts || '').indexOf(dateISO) === 0 || body.indexOf(dateISO) >= 0;
  });
}
/* Shift for an employee on a date: roster row wins, else the first shift. */
function t3ShiftFor_(ss, employeeId, date) {
  var ros = trows_(ss, 'rosters').filter(function (r) {
    return String(r.employeeId) === String(employeeId) && r.date === date && r.shiftId;
  });
  var sh = null;
  if (ros.length)
    sh = trows_(ss, 'shifts').filter(function (s) { return String(s.id) === String(ros[0].shiftId); })[0] || null;
  if (!sh) sh = trows_(ss, 'shifts')[0] || null;
  return sh;
}
/* Core send: resolves the recipient phone from the Employees tab. */
function t3SendAlert_(ss, tenantId, event, toEmployeeId, vars) {
  vars = vars || {};
  var emp = toEmployeeId ? empById_(ss, toEmployeeId) : null;
  var to = t3NormPhone_(emp ? emp.phone : '');
  if (!to) {
    var base = { id: tnextId_(ss, 'M', 'messageLog'), ts: t3NowISO_(), tenantId: tenantId,
      channel: t3Channel_(ss), to: '', event: event, body: t3Body_(event, vars) };
    t3LogRow_(ss, base, 'failed', 'No phone number on file for employee');
    return { ok: true, sent: false, status: 'failed', error: 'No phone number on file for employee' };
  }
  return t3Dispatch_(ss, tenantId, t3Channel_(ss), to, event, t3Body_(event, vars));
}

/* ---------- API: sendAlert ---------- */
API.sendAlert = function (user, opts) {
  requireUser_(user);
  need_(user, 'settings_manage');
  opts = opts || {};
  var ss = TSS_(user);
  return t3SendAlert_(ss, user.tenantId || '', opts.event || 'manual',
    opts.toEmployeeId, opts.vars || {});
};

/* ---------- API: runAlertChecks ----------
   Called by the frontend after punch / devicePunch. Evaluates late arrival
   (first check-in vs shift start + grace) and out-of-zone punches for one
   employee on one date. Idempotent per (date, event, phone, punch time). */
API.runAlertChecks = function (user, employeeId, date) {
  requireUser_(user);
  var ss = TSS_(user);
  if (!employeeId) {
    if (user.employeeId) employeeId = user.employeeId;
    else throw new Error('Employee is required');
  }
  selfOnly_(user, employeeId);
  date = date || todayStr_();
  var emp = empById_(ss, employeeId);
  if (!emp) throw new Error('Employee not found');
  var out = { date: date, employeeId: employeeId, alerts: [] };
  var att = trows_(ss, 'attendance').filter(function (a) {
    return String(a.employeeId) === String(employeeId) && a.date === date;
  });
  if (t3On_(tsetting_(ss, 'alert_late', '1'))) {
    var ins = att.filter(function (a) { return a.type === 'in'; })
      .sort(function (a, b) { return String(a.time) < String(b.time) ? -1 : (String(a.time) > String(b.time) ? 1 : 0); });
    var sh = t3ShiftFor_(ss, employeeId, date);
    if (ins.length && sh && sh.startTime) {
      var grace = num_(sh.graceMin || tsetting_(ss, 'graceMinutes', '15'));
      var lateBy = minsBetween_(sh.startTime, ins[0].time) - grace;
      if (lateBy > 0 && !t3Logged_(ss, date, 'late', emp.phone, ins[0].time)) {
        out.alerts.push(t3SendAlert_(ss, user.tenantId || '', 'late', employeeId, {
          name: emp.name, time: ins[0].time, shiftStart: sh.startTime,
          grace: grace, lateBy: Math.round(lateBy)
        }));
      }
    }
  }
  if (t3On_(tsetting_(ss, 'alert_out_of_zone', '1'))) {
    var sites = {};
    trows_(ss, 'sites').forEach(function (s) { sites[String(s.id)] = s; });
    att.forEach(function (a) {
      if (!bool_(a.outOfZone)) return;
      if (t3Logged_(ss, date, 'out_of_zone', emp.phone, a.time)) return;
      var site = sites[String(a.siteId)] || null;
      out.alerts.push(t3SendAlert_(ss, user.tenantId || '', 'out_of_zone', employeeId, {
        name: emp.name, type: a.type, time: a.time,
        site: site ? site.name : 'unknown site', distance: a.distanceM || ''
      }));
    });
  }
  return out;
};

/* ---------- API: checkAbsences ----------
   Daily sweep: active employees with no check-in for `date`, excluding
   holidays, weekly offs and approved leave. For today, an employee counts as
   absent only after shift start + absence_grace_minutes. */
API.checkAbsences = function (user, date) {
  requireUser_(user);
  need_(user, 'attendance_view');
  var ss = TSS_(user);
  date = date || todayStr_();
  var out = { date: date, checked: 0, absent: [], alerted: 0, skipped: '' };
  if (date > todayStr_()) { out.skipped = 'future date'; return out; }
  if (trows_(ss, 'holidays').some(function (h) { return h.date === date; })) {
    out.skipped = 'holiday'; return out;
  }
  var wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(date + 'T12:00:00').getDay()];
  var working = String(tsetting_(ss, 'workingDays', 'Mon,Tue,Wed,Thu,Fri,Sat')).split(',');
  if (working.indexOf(wd) < 0) { out.skipped = 'weekly off (' + wd + ')'; return out; }
  var grace = num_(tsetting_(ss, 'absence_grace_minutes', '60'));
  var nowT = timeStr_();
  var isToday = (date === todayStr_());
  var onLeave = {};
  trows_(ss, 'leaveRequests').forEach(function (l) {
    if (l.status === 'approved' && String(l.from) <= date && date <= String(l.to))
      onLeave[String(l.employeeId)] = 1;
  });
  var punched = {};
  trows_(ss, 'attendance').forEach(function (a) {
    if (a.date === date && a.type === 'in') punched[String(a.employeeId)] = 1;
  });
  trows_(ss, 'employees').filter(function (e) { return bool_(e.active); }).forEach(function (e) {
    if (punched[String(e.id)] || onLeave[String(e.id)]) return;
    out.checked++;
    var sh = t3ShiftFor_(ss, e.id, date);
    var start = (sh && sh.startTime) ? sh.startTime : '09:00';
    if (isToday && minsBetween_(start, nowT) <= grace) return;
    out.absent.push({ employeeId: e.id, name: e.name, code: e.code, shiftStart: start });
    if (t3On_(tsetting_(ss, 'alert_absent', '1')) && !t3Logged_(ss, date, 'absent', e.phone, date)) {
      var r = t3SendAlert_(ss, user.tenantId || '', 'absent', e.id,
        { name: e.name, date: date, shiftStart: start });
      if (r.sent) out.alerted++;
    }
  });
  return out;
};

/* ---------- API: alertLeaveDecision ----------
   Called by the frontend right after decideLeave. Sends leave_approved or
   leave_rejected to the employee. No-op when the event toggle is off or the
   request is still pending. */
API.alertLeaveDecision = function (user, requestId) {
  requireUser_(user);
  var ss = TSS_(user);
  var l = trows_(ss, 'leaveRequests').filter(function (x) { return String(x.id) === String(requestId); })[0];
  if (!l) throw new Error('Leave request not found');
  if (l.status !== 'approved' && l.status !== 'rejected')
    return { ok: true, status: 'skipped', reason: 'request still pending' };
  if (!t3On_(tsetting_(ss, 'alert_leave_decision', '1')))
    return { ok: true, status: 'skipped', reason: 'event disabled' };
  var emp = empById_(ss, l.employeeId);
  var lt = trows_(ss, 'leaveTypes').filter(function (t) { return String(t.id) === String(l.typeId); })[0] || {};
  var ev = (l.status === 'approved') ? 'leave_approved' : 'leave_rejected';
  /* match must appear verbatim in the message body for the dedupe check */
  var match = String(l.from) + ' to ' + String(l.to) + ' (' + String(l.days) + ' days)';
  if (t3Logged_(ss, todayStr_(), ev, emp ? emp.phone : '', match))
    return { ok: true, status: 'skipped', reason: 'already sent' };
  var r = t3SendAlert_(ss, user.tenantId || '', ev, l.employeeId, {
    name: emp ? emp.name : '', type: lt.name || 'leave',
    from: l.from, to: l.to, days: l.days, reason: l.reason || '', decidedBy: l.decidedBy || ''
  });
  return { ok: true, status: r.status };
};

/* ---------- API: listMessageLog ---------- */
API.listMessageLog = function (user, limit) {
  requireUser_(user);
  need_(user, 'settings_manage');
  var rows = trows_(TSS_(user), 'messageLog')
    .sort(function (a, b) { return String(a.ts) < String(b.ts) ? -1 : (String(a.ts) > String(b.ts) ? 1 : 0); });
  limit = num_(limit) || 50;
  return rows.slice(0, limit).map(clean_);
};

/* ---------- API: resendAlert ----------
   Retries one messageLog row with the current channel credentials. The row
   itself is updated in place (new ts, new status). */
API.resendAlert = function (user, logId) {
  requireUser_(user);
  need_(user, 'settings_manage');
  var ss = TSS_(user);
  var r = trows_(ss, 'messageLog').filter(function (x) { return String(x.id) === String(logId); })[0];
  if (!r) throw new Error('Log entry not found');
  var to = t3NormPhone_(r.to);
  if (!to) throw new Error('No recipient number on this log entry');
  var channel = t3ChannelFor_(ss, r.channel) || t3Channel_(ss);
  var status, error;
  try {
    if (!channel) throw new Error('WhatsApp/SMS credentials not configured');
    t3TrySend_(ss, channel, to, r.body);
    status = 'sent'; error = '';
  } catch (e) {
    status = channel ? 'failed' : 'pending-config';
    error = String((e && e.message) || e).slice(0, 500);
  }
  r.ts = t3NowISO_(); r.status = status; r.channel = channel; r.error = error;
  tupdate_(ss, 'messageLog', r.id, clean_(r));
  return { ok: true, status: status, error: error };
};

/* ---------- API: testAlert ----------
   Sends a test message on an explicit channel to a given number. The channel
   does not need to be enabled; missing credentials log pending-config. */
API.testAlert = function (user, channel, to) {
  requireUser_(user);
  need_(user, 'settings_manage');
  channel = String(channel || '').toLowerCase();
  if (channel !== 'whatsapp' && channel !== 'sms') throw new Error('Channel must be whatsapp or sms');
  to = t3NormPhone_(to);
  if (!to) throw new Error('A test phone number is required');
  var ss = TSS_(user);
  return t3Dispatch_(ss, user.tenantId || '', t3ChannelFor_(ss, channel), to, 'test',
    t3Body_('test', { channel: channel }));
};

/* ===== TRACK 5: geofence auto-punch ===== */
/* Additive-only section for the native Android app. It does NOT modify
   setupTenantSS() and does NOT modify the bodies of API.punch or
   API.devicePunch. API.geofencePunch delegates to API.punch with source
   'geofence-auto', so the existing duplicate-punch guard (same employee and
   type within 5 minutes) and the device-binding check keep working exactly
   as for manual punches. Auto punches skip the selfie (an empty string is
   passed) but keep the geofence check: API.punch still records distanceM and
   outOfZone via siteForPunch_ against the employee's assigned sites (or every
   active site when none are assigned). */

/* Per-employee automatic-attendance flags. Registered here instead of inside
   setupTenantSS(): sheetOf_ reads SHEETS at call time and setupTenantSS()
   reads TENANT_TABS at call time, so registering at load time keeps new-tenant
   seeding working without touching setupTenantSS(). */
SHEETS.employeeFlags = ['employeeId','autoPunch','updatedAt'];
TENANT_TABS.push('employeeFlags');

/* Idempotent seeder for this track. Called automatically by the track APIs
   below so the tab always exists; the coordinator may also call it once per
   tenant for existing tenants. New employees default to ON. */
function seedTrack5Tabs_(ss) {
  tsh_(ss, 'employeeFlags');
  var seen = {};
  trows_(ss, 'employeeFlags').forEach(function (r) { seen[String(r.employeeId)] = 1; });
  trows_(ss, 'employees').forEach(function (e) {
    if (!seen[String(e.id)]) {
      tappend_(ss, 'employeeFlags', { employeeId: e.id, autoPunch: true, updatedAt: nowStr_() });
    }
  });
  return true;
}

/* True when automatic (geofence) punching is enabled for the employee.
   A missing flag row means ON (the default for all employees, new ones
   included). */
function autoPunchOn_(ss, employeeId) {
  seedTrack5Tabs_(ss);
  var r = trows_(ss, 'employeeFlags').filter(function (x) {
    return String(x.employeeId) === String(employeeId);
  })[0];
  return r ? bool_(r.autoPunch) : true;
}

/* Active sites assigned to one employee, shaped for the native app payload.
   When the employee has no assignments, every active site with coordinates
   is returned (mirrors the siteForPunch_ fallback). */
function assignedGeofences_(ss, employeeId) {
  var assigned = trows_(ss, 'siteEmployees')
    .filter(function (x) { return String(x.employeeId) === String(employeeId); })
    .map(function (x) { return x.siteId; });
  var pool = trows_(ss, 'sites').filter(function (s) {
    if (!bool_(s.active)) return false;
    if (assigned.length && assigned.indexOf(s.id) < 0) return false;
    return s.lat !== null && s.lat !== '' && s.lng !== null && s.lng !== '';
  });
  if (!pool.length && !assigned.length) {
    pool = trows_(ss, 'sites').filter(function (s) {
      return bool_(s.active) && s.lat !== null && s.lat !== '' && s.lng !== null && s.lng !== '';
    });
  }
  return pool.map(function (s) {
    return { siteId: s.id, name: s.name, lat: num_(s.lat), lng: num_(s.lng),
             radiusM: num_(s.radiusM) || 200 };
  });
}

/* Native-app entry point.
   payload: {employeeId, type ('in' or 'out'), lat, lng, deviceId}
   Rejects with 'auto-punch disabled' when the employee toggle is off.
   Duplicate-punch guard, device binding and the geofence distance check run
   inside API.punch; the punch row records source 'geofence-auto', an empty
   selfie, plus distanceM and outOfZone like a manual punch. */
API.geofencePunch = function (user, payload) {
  requireUser_(user);
  payload = payload || {};
  if (!payload.employeeId) throw new Error('Employee is required');
  var ss = TSS_(user);
  if (!autoPunchOn_(ss, payload.employeeId)) throw new Error('auto-punch disabled');
  return API.punch(user, payload.employeeId, payload.type, payload.lat, payload.lng,
                   '', payload.deviceId, 'geofence-auto');
};

/* Per-employee automatic-attendance toggle. The employee may toggle only
   their own record; admin and hr may toggle anyone. */
API.setAutoPunch = function (user, employeeId, on) {
  requireUser_(user);
  if (!employeeId) throw new Error('Employee is required');
  var ss = TSS_(user);
  if (!empById_(ss, employeeId)) throw new Error('Employee not found');
  if (user.role === 'employee' || user.role === 'user') selfOnly_(user, employeeId);
  else need_(user, 'employees_manage');
  seedTrack5Tabs_(ss);
  var obj = { employeeId: employeeId, autoPunch: !!on, updatedAt: nowStr_() };
  var exists = trows_(ss, 'employeeFlags').filter(function (x) {
    return String(x.employeeId) === String(employeeId);
  })[0];
  if (exists) tupdate_(ss, 'employeeFlags', employeeId, obj);
  else tappend_(ss, 'employeeFlags', obj);
  audit_(user, 'setAutoPunch', employeeId + ' autoPunch=' + (!!on ? 'on' : 'off'));
  return { employeeId: employeeId, autoPunch: !!on };
};

/* Read the automatic-attendance toggle. Employees read only their own;
   defaults to employeeId from the session when omitted. */
API.getAutoPunch = function (user, employeeId) {
  requireUser_(user);
  var ss = TSS_(user);
  var eid = employeeId || user.employeeId;
  if (!eid) throw new Error('Employee is required');
  if (user.role === 'employee' || user.role === 'user') selfOnly_(user, eid);
  return { employeeId: eid, autoPunch: autoPunchOn_(ss, eid) };
};

/* Geofence list for the caller (the native app refreshes with this instead
   of scraping the WebView). Returns [{siteId,name,lat,lng,radiusM}]. */
API.getAssignedGeofences = function (user, employeeId) {
  requireUser_(user);
  var ss = TSS_(user);
  var eid = employeeId || user.employeeId;
  if (!eid) throw new Error('Employee is required');
  if (user.role === 'employee' || user.role === 'user') selfOnly_(user, eid);
  if (!empById_(ss, eid)) throw new Error('Employee not found');
  return assignedGeofences_(ss, eid);
};

/* ===== TRACK 6: HR rules engine =====
   Coordinator appends this whole section to Code.gs; Code.gs itself is never
   edited by this track. Additive only: a new tenant-level "rules" tab
   (key, value, valueType, description, updatedAt), a typed getRule_() reader,
   and the getRules / saveRule APIs. Existing hardcoded values (duplicate-punch
   window, shift grace default, late threshold, out-of-zone handling,
   auto-absent cut-off) become rule-driven through the snippets in
   patches_track6.md; this file only ADDS the engine they read from.

   The four payroll keys (absentDeductionPerDay, lateGraceMinutes,
   latePenaltyMinutes, overtimeRateMultiplier) are stored as tenant Settings
   keys by track 2. getRule_() falls back to the Settings value for them when
   no rule row exists, so a tenant keeps working before anyone overrides. */

/* --- schema registration (idempotent; runs once when this section loads) --- */
if (!SHEETS.rules) SHEETS.rules = ['key', 'value', 'valueType', 'description', 'updatedAt'];
if (TENANT_TABS.indexOf('rules') < 0) TENANT_TABS.push('rules');

/* --- rule catalog: key, type, default, validation range, description ---
   type is one of: int | float | bool | string | time. settingsBacked rules
   are owned by track 2 as Settings keys and are only seeded as rows when an
   admin explicitly overrides them through saveRule. */
var T6_META = [
  { key: 'duplicatePunchWindowMinutes', type: 'int', def: 5, min: 0, max: 60, group: 'attendance',
    desc: 'Duplicate punch guard: a second punch of the same type for the same employee inside this many minutes is rejected.' },
  { key: 'lateGraceMinutes', type: 'int', def: 15, min: 0, max: 180, group: 'attendance', settingsBacked: true,
    desc: 'Grace minutes after shift start before an arrival counts as late. Also the default grace for new shifts. Lives in Settings unless a rule row overrides it.' },
  { key: 'lateThresholdMinutes', type: 'int', def: 10, min: 0, max: 180, group: 'attendance',
    desc: 'Minutes past shift start (after grace) after which the arrival is marked late in attendance reports.' },
  { key: 'autoAbsentCutoffTime', type: 'time', def: '10:00', group: 'attendance',
    desc: 'Daily cut-off time (24-hour HH:MM): employees with no in-punch by this time are auto-marked absent.' },
  { key: 'outOfZonePolicy', type: 'string', def: 'flag', options: ['flag', 'block'], group: 'attendance',
    desc: 'Out-of-zone punch handling: flag records the punch and marks it out-of-zone; block rejects the punch.' },
  { key: 'overtimeAutoEligible', type: 'bool', def: true, group: 'attendance',
    desc: 'When ON, employees who work past their shift end are automatically eligible for overtime.' },
  { key: 'probationDays', type: 'int', def: 90, min: 0, max: 3650, group: 'attendance',
    desc: 'Probation length in days from join date; employees still in probation are not eligible for paid leave.' },
  { key: 'absentDeductionPerDay', type: 'float', def: 30, min: 0, max: 31, group: 'payroll', settingsBacked: true,
    desc: 'Pay deduction per absent day, in the same unit as the salary structure (days or amount). Lives in Settings unless a rule row overrides it.' },
  { key: 'latePenaltyMinutes', type: 'float', def: 60, min: 0, max: 480, group: 'payroll', settingsBacked: true,
    desc: 'Minutes of pay deducted for each late arrival. Lives in Settings unless a rule row overrides it.' },
  { key: 'overtimeRateMultiplier', type: 'float', def: 1.5, min: 0, max: 10, group: 'payroll', settingsBacked: true,
    desc: 'Multiplier applied to the hourly rate for overtime pay. Lives in Settings unless a rule row overrides it.' }
];

function t6meta_(key) {
  return T6_META.filter(function (m) { return m.key === key; })[0] || null;
}

/* --- idempotent seeder: creates the tab and seeds non-Settings rules once.
   Called defensively by every track API, so the coordinator may also run it
   once per existing tenant. */
function seedTrack6Tabs_(ss) {
  tsh_(ss, 'rules');
  var have = {};
  trows_(ss, 'rules').forEach(function (r) { have[r.key] = true; });
  T6_META.forEach(function (m) {
    if (m.settingsBacked) return;
    if (!have[m.key]) tappend_(ss, 'rules',
      { key: m.key, value: val_(m.def), valueType: m.type, description: m.desc, updatedAt: nowStr_() });
  });
  return true;
}

/* --- typed coercion for a stored rule value --- */
function coerceRule_(v, type) {
  if (type === 'int') { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
  if (type === 'float') { var f = parseFloat(v); return isNaN(f) ? 0 : f; }
  if (type === 'bool') return bool_(v);
  if (type === 'time') return String(v === null || v === undefined ? '' : v).slice(0, 5);
  return String(v === null || v === undefined ? '' : v);
}

/* --- the one reader every rule-driven backend function calls ---
   Resolution order: rules tab row, then the tenant Settings tab for the four
   payroll keys owned by track 2, then the supplied default. */
function getRule_(ss, key, defaultValue) {
  var r = trows_(ss, 'rules').filter(function (x) { return x.key === key; })[0];
  if (r) return coerceRule_(r.value, r.valueType);
  var m = t6meta_(key);
  if (m && m.settingsBacked) {
    var sv = tsetting_(ss, key, null);
    if (sv !== null && sv !== undefined && sv !== '') return coerceRule_(sv, m.type);
  }
  return defaultValue;
}

/* --- validation for saveRule --- */
function t6validate_(m, value) {
  if (m.options) {
    var s = String(value === null || value === undefined ? '' : value);
    if (m.options.indexOf(s) < 0)
      throw new Error('Invalid value for ' + m.key + ': must be one of ' + m.options.join(', '));
    return s;
  }
  if (m.type === 'time') {
    var t = String(value === null || value === undefined ? '' : value).slice(0, 5);
    if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(t))
      throw new Error('Invalid time for ' + m.key + ': expected 24-hour HH:MM');
    return t;
  }
  if (m.type === 'bool') return bool_(value);
  if (m.type === 'int' || m.type === 'float') {
    var n = m.type === 'int' ? parseInt(value, 10) : parseFloat(value);
    if (isNaN(n)) throw new Error('Invalid number for ' + m.key);
    if (n < m.min || n > m.max)
      throw new Error(m.key + ' must be between ' + m.min + ' and ' + m.max);
    return m.type === 'int' ? Math.floor(n) : n;
  }
  return String(value === null || value === undefined ? '' : value);
}

/* --- read all rules with their effective values (admin + HR) --- */
API.getRules = function (user) {
  requireUser_(user);
  if (['admin', 'hr', 'superadmin'].indexOf(user.role) < 0)
    throw new Error('Permission denied: HR rules are visible to admin and HR roles only');
  var ss = TSS_(user);
  seedTrack6Tabs_(ss);
  var rows = {};
  trows_(ss, 'rules').forEach(function (r) { rows[r.key] = true; });
  return T6_META.map(function (m) {
    var sv = m.settingsBacked ? tsetting_(ss, m.key, null) : null;
    var source = rows[m.key] ? 'rule'
      : (sv !== null && sv !== undefined && sv !== '' ? 'settings' : 'default');
    var o = { key: m.key, value: getRule_(ss, m.key, m.def), valueType: m.type,
      group: m.group, description: m.desc, settingsBacked: !!m.settingsBacked, source: source };
    if (m.options) o.options = m.options;
    return o;
  });
};

/* --- change one rule (admin only) --- */
API.saveRule = function (user, key, value) {
  requireUser_(user);
  if (['admin', 'superadmin'].indexOf(user.role) < 0)
    throw new Error('Permission denied: only admins can change HR rules');
  var ss = TSS_(user);
  seedTrack6Tabs_(ss);
  var m = t6meta_(key);
  if (!m) throw new Error('Unknown rule key: ' + key);
  var v = t6validate_(m, value);
  var heads = SHEETS.rules;
  var row = { key: key, value: v, valueType: m.type, description: m.desc, updatedAt: nowStr_() };
  var ex = trows_(ss, 'rules').filter(function (x) { return x.key === key; })[0];
  if (ex) {
    sheetOf_(ss, 'rules').getRange(ex._row, 1, 1, heads.length)
      .setValues([heads.map(function (k) { return val_(row[k]); })]);
  } else {
    tappend_(ss, 'rules', row);
  }
  audit_(user, 'saveRule', key + ' = ' + v);
  return { key: key, value: v, valueType: m.type };
};

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

/* Phase 2 migration — run once from the editor AFTER deploying the new version.
   Adds all Phase 2 tabs + default rules + salary settings to every EXISTING
   tenant spreadsheet. New tenants get them automatically via setupTenantSS. */
function migratePhase2() {
  var out = [];
  rows_('tenants').forEach(function (t) {
    try {
      var ss = SpreadsheetApp.openById(t.spreadsheetId);
      if (typeof seedTrack1Tabs_ === 'function') seedTrack1Tabs_(ss);
      if (typeof seedTrack2Tabs_ === 'function') seedTrack2Tabs_(ss);
      if (typeof seedTrack3Tabs_ === 'function') seedTrack3Tabs_(ss);
      if (typeof seedTrack5Tabs_ === 'function') seedTrack5Tabs_(ss);
      if (typeof seedTrack6Tabs_ === 'function') seedTrack6Tabs_(ss);
      out.push(t.loginCode + ': ok');
    } catch (e) { out.push(t.loginCode + ': FAILED ' + String((e && e.message) || e)); }
  });
  Logger.log(out.join('\n'));
  return out;
}
