/* QA Check — Track 5: geofence auto-punch (node).
 * Part A: backend — loads the REAL Code.gs in a vm with an in-memory
 *   SpreadsheetApp fake and exercises the Track 5 APIs end to end:
 *   (1) duplicate-punch guard respected for source 'geofence-auto'
 *   (2) device binding enforced
 *   (3) autoPunch OFF rejects with 'auto-punch disabled'
 *   (4) default ON for new employees, seeder idempotent
 *   (5) getAssignedGeofences shape + assignment filtering
 *   (6) self-service permission scoping
 * Part B: frontend — loads src/js/165_geofence.js with DOM stubs:
 *   (7) I18N t5.* keys exist in en and ur
 *   (8) window.AndroidGetPunchConfig() returns a JSON STRING with the
 *       required shape and no selfie or face data
 *   (9) the punch-page toggle card injects and calls setAutoPunch
 * Run: node qa_geofence.js
 */
const fs = require('fs');
const vm = require('vm');

const ROOT = '/home/hatch/workspace/attendance-saas';
const failures = [];
const ok = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
  if (!cond) failures.push(name);
};
const throwsWith = (fn, re) => {
  try { fn(); } catch (e) { return re.test(String((e && e.message) || e)); }
  return false;
};

(async () => {
console.log('--- Part A: backend (real Code.gs, fake SpreadsheetApp) ---');
{
  /* ----- in-memory GAS fakes ----- */
  const SHEET_HEADERS = {};
  function makeSheet(name) {
    return {
      _d: [],
      appendRow(arr) { this._d.push(arr.slice()); },
      getLastRow() { return this._d.length; },
      setFrozenRows() {},
      getDataRange() { const d = this._d; return { getValues() { return d.map(r => r.slice()); } }; },
      getRange(r, c, nr, nc) {
        const self = this;
        return {
          getValues() {
            const out = [];
            for (let i = 0; i < nr; i++) {
              const row = self._d[r - 1 + i] || [];
              const line = [];
              for (let j = 0; j < nc; j++) line.push(j < row.length ? row[j] : '');
              out.push(line);
            }
            return out;
          },
          setValues(vals) {
            for (let i = 0; i < vals.length; i++) {
              const ri = r - 1 + i;
              const width = SHEET_HEADERS[self._name] ? SHEET_HEADERS[self._name].length : vals[i].length;
              while (self._d.length <= ri) self._d.push(new Array(width).fill(''));
              for (let j = 0; j < vals[i].length; j++) self._d[ri][c - 1 + j] = vals[i][j];
            }
          }
        };
      },
      deleteRow(i) { this._d.splice(i - 1, 1); },
      _name: name
    };
  }
  function makeSS(id) {
    const sheets = {};
    return {
      getId() { return id; },
      getUrl() { return 'fake-ss:' + id; },
      getSheetByName(n) { return sheets[n] || null; },
      insertSheet(n) { const s = makeSheet(n); sheets[n] = s; return s; }
    };
  }
  const ssStore = {};
  let ssSeq = 0;
  const sb = {};
  sb.window = sb; sb.self = sb; sb.globalThis = sb;
  sb.console = console;
  sb.SpreadsheetApp = {
    getActiveSpreadsheet() {
      if (!ssStore.__active) ssStore.__active = makeSS('REGISTRY');
      return ssStore.__active;
    },
    openById(id) {
      if (!ssStore[id]) throw new Error('no such spreadsheet ' + id);
      return ssStore[id];
    },
    create() { const id = 'SS-' + (++ssSeq); ssStore[id] = makeSS(id); return ssStore[id]; }
  };
  sb.Session = { getScriptTimeZone() { return 'Asia/Karachi'; } };
  sb.Utilities = {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    computeDigest() { const a = []; for (let i = 0; i < 32; i++) a.push(i); return a; },
    formatDate(v, tz, fmt) {
      const p = n => String(n).padStart(2, '0');
      return v.getFullYear() + '-' + p(v.getMonth() + 1) + '-' + p(v.getDate());
    }
  };
  sb.LockService = { getScriptLock() { return { waitLock() {}, releaseLock() {} }; } };
  vm.createContext(sb);
  /* coordinator integration order: Code.gs, then each codesections/trackN.gs */
  const code = fs.readFileSync(ROOT + '/Code.gs', 'utf8') + '\n' +
               fs.readFileSync(ROOT + '/codesections/track5.gs', 'utf8');
  vm.runInContext(code, sb, { filename: 'Code.gs+track5.gs' });
  const { API, SHEETS, TENANT_TABS } = sb;
  Object.keys(SHEETS).forEach(k => { SHEET_HEADERS[k] = SHEETS[k]; });

  ok('employeeFlags tab registered on SHEETS', Array.isArray(SHEETS.employeeFlags));
  ok('employeeFlags in TENANT_TABS', TENANT_TABS.indexOf('employeeFlags') >= 0);

  /* ----- seed one tenant ----- */
  const root = { id: 'SU-0001', name: 'Super Admin', role: 'superadmin' };
  const t = API.createTenant(root, 'QA Geofence Co', 'trial', 'Admin', 'admin', 'admin123');
  ok('createTenant ok', !!t.tenantId && !!t.spreadsheetId);
  const admin = { id: 'U-0001', name: 'Admin', username: 'admin', role: 'admin',
                  tenantId: t.tenantId, spreadsheetId: t.spreadsheetId };
  const siteA = API.saveSite(admin, { name: 'Site A', address: 'Gulberg', lat: 31.5204, lng: 74.3587, radiusM: 200, active: true });
  const siteB = API.saveSite(admin, { name: 'Site B', address: 'DHA', lat: 31.5497, lng: 74.3436, radiusM: 300, active: true });
  const emp1 = API.saveEmployee(admin, { name: 'Ali', code: 'E-1', deviceId: 'DEV-1', active: true });
  const emp2 = API.saveEmployee(admin, { name: 'Bilal', code: 'E-2', active: true });
  API.assignSiteEmployees(admin, siteA, [emp1]);
  const empUser1 = { id: 'U-9', role: 'employee', employeeId: emp1, tenantId: t.tenantId, spreadsheetId: t.spreadsheetId };
  const empUser2 = { id: 'U-8', role: 'employee', employeeId: emp2, tenantId: t.tenantId, spreadsheetId: t.spreadsheetId };
  const ss = sb.SpreadsheetApp.openById(t.spreadsheetId);
  const attCount = () => sb.trows_(ss, 'attendance').length;

  /* ----- toggle default ON + seeder idempotent ----- */
  ok('new employee defaults autoPunch ON', API.getAutoPunch(admin, emp1).autoPunch === true);
  API.getAutoPunch(admin, emp1);
  const flagRows = sb.trows_(ss, 'employeeFlags').filter(r => String(r.employeeId) === String(emp1));
  ok('seeder idempotent (one flag row per employee)', flagRows.length === 1, 'rows=' + flagRows.length);

  /* ----- autoPunch OFF rejects ----- */
  const setOff = API.setAutoPunch(admin, emp1, false);
  ok('setAutoPunch(false) returns flag', setOff.autoPunch === false && setOff.employeeId === emp1);
  ok('getAutoPunch reflects OFF', API.getAutoPunch(admin, emp1).autoPunch === false);
  ok('geofencePunch rejected when OFF',
     throwsWith(() => API.geofencePunch(empUser1, { employeeId: emp1, type: 'in', lat: 31.5205, lng: 74.3588, deviceId: 'DEV-1' }), /auto-punch disabled/));
  ok('no attendance row written on rejection', attCount() === 0);

  /* ----- happy path: delegation keeps guard + geofence fields ----- */
  API.setAutoPunch(admin, emp1, true);
  const before = attCount();
  const r1 = API.geofencePunch(empUser1, { employeeId: emp1, type: 'in', lat: 31.5205, lng: 74.3588, deviceId: 'DEV-1' });
  ok('auto punch succeeds when ON', !!r1.punch && r1.punch.id);
  ok('source recorded as geofence-auto', r1.punch.source === 'geofence-auto', 'got ' + r1.punch.source);
  ok('selfie skipped for auto punch', r1.punch.selfie === '' || r1.punch.selfie == null);
  ok('distanceM recorded', typeof r1.punch.distanceM === 'number', 'got ' + r1.punch.distanceM);
  ok('in-zone punch not flagged', r1.outOfZone === false && r1.site && r1.site.name === 'Site A');
  ok('exactly one attendance row appended', attCount() === before + 1);

  /* ----- duplicate guard respected for auto source ----- */
  ok('duplicate auto punch rejected',
     throwsWith(() => API.geofencePunch(empUser1, { employeeId: emp1, type: 'in', lat: 31.5205, lng: 74.3588, deviceId: 'DEV-1' }), /Duplicate punch/));
  ok('no row written for duplicate', attCount() === before + 1);

  /* ----- device binding enforced ----- */
  ok('wrong device rejected',
     throwsWith(() => API.geofencePunch(empUser1, { employeeId: emp1, type: 'out', lat: 31.5205, lng: 74.3588, deviceId: 'OTHER-DEV' }), /not registered/));
  const rOut = API.geofencePunch(empUser1, { employeeId: emp1, type: 'out', lat: 0, lng: 0, deviceId: 'DEV-1' });
  ok('out-of-zone auto punch still records (flagged)', rOut.outOfZone === true && rOut.punch.distanceM > 200);

  /* ----- getAssignedGeofences shape ----- */
  const gz = API.getAssignedGeofences(empUser1);
  ok('assigned geofences returns array', Array.isArray(gz) && gz.length === 1, 'len=' + gz.length);
  const g0 = gz[0] || {};
  ok('geofence entry shape {siteId,name,lat,lng,radiusM}',
     g0.siteId === siteA && g0.name === 'Site A' &&
     typeof g0.lat === 'number' && typeof g0.lng === 'number' && g0.radiusM === 200,
     JSON.stringify(g0));
  const gz2 = API.getAssignedGeofences(empUser2);
  ok('unassigned employee falls back to all active sites', gz2.length === 2, 'len=' + gz2.length);

  /* ----- self-service scoping ----- */
  ok('employee can toggle own flag', API.setAutoPunch(empUser2, emp2, false).autoPunch === false);
  ok('employee cannot toggle someone else',
     throwsWith(() => API.setAutoPunch(empUser2, emp1, true), /own records/));
  ok('employee cannot read someone else geofences',
     throwsWith(() => API.getAssignedGeofences(empUser2, emp1), /own records/));

  /* ----- brand-new employee defaults ON without any seeder call ----- */
  const emp3 = API.saveEmployee(admin, { name: 'New Guy', code: 'E-3', active: true });
  ok('brand-new employee autoPunch ON', API.getAutoPunch(admin, emp3).autoPunch === true);
}

console.log('--- Part B: frontend (165_geofence.js with DOM stubs) ---');
{
  /* ----- minimal DOM ----- */
  const DOCIDS = {};
  function elMatches(node, sel) {
    if (sel[0] === '#') return node._id === sel.slice(1);
    if (sel[0] === '.') return (node.className || '').split(/\s+/).indexOf(sel.slice(1)) >= 0;
    const m = sel.match(/^\[id\$="([^"]+)"\]$/);
    if (m) return (node._id || '').endsWith(m[1]);
    const n = sel.match(/^\[name="([^"]+)"\]$/);
    if (n) return node.name === n[1];
    return false;
  }
  function walk(node, sel, out) {
    if (elMatches(node, sel)) out.push(node);
    (node.children || []).forEach(c => walk(c, sel, out));
    return out;
  }
  class FakeElement {
    constructor(tag) {
      this.tagName = String(tag || 'div').toUpperCase();
      this.children = []; this.parent = null; this.style = {};
      this._id = ''; this.className = ''; this.name = '';
      this.checked = false; this.disabled = false; this.value = '';
      this.textContent = ''; this._listeners = {};
    }
    get id() { return this._id; }
    set id(v) { this._id = String(v); if (v) DOCIDS[String(v)] = this; }
    get parentNode() { return this.parent; }
    setAttribute(k, v) { if (k === 'id') this.id = v; else this['_' + k] = v; }
    appendChild(c) { if (c) { this.children.push(c); c.parent = this; } return c; }
    addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); }
    querySelector(sel) { return walk(this, sel, [])[0] || null; }
    querySelectorAll(sel) { return walk(this, sel, []); }
    closest(sel) { let n = this; while (n) { if (elMatches(n, sel)) return n; n = n.parent; } return null; }
    insertAdjacentHTML(pos, html) {
      const re = /id="([^"]+)"/g; let m;
      while ((m = re.exec(html))) {
        const child = new FakeElement('div'); child.id = m[1]; this.appendChild(child);
      }
    }
  }
  const body = new FakeElement('body');
  const storeData = {};
  const sb2 = {};
  sb2.window = sb2; sb2.self = sb2; sb2.globalThis = sb2;
  sb2.console = console;
  sb2.document = {
    body,
    createElement: t => new FakeElement(t),
    getElementById: id => DOCIDS[id] || null,
    querySelector: sel => walk(body, sel, [])[0] || null,
    querySelectorAll: sel => walk(body, sel, []),
    addEventListener() {}, removeEventListener() {}
  };
  sb2.localStorage = {
    getItem: k => (k in storeData ? storeData[k] : null),
    setItem: (k, v) => { storeData[k] = String(v); },
    removeItem: k => { delete storeData[k]; }
  };
  sb2.location = { hash: '#/punch' };
  const listeners = {};
  sb2.addEventListener = (t, f) => { (listeners[t] = listeners[t] || []).push(f); };
  sb2.removeEventListener = () => {};
  /* session exactly like 01_api.js reads it */
  const sessUser = { id: 'U-9', name: 'Ali', role: 'employee', tenantId: 'T-0001',
                     employeeId: 'EMP-0001', token: 'tok-abc-123' };
  sb2.Session = { get user() { return sessUser; } };
  const apiCalls = [];
  sb2.API = {
    call: async (fn, ...args) => {
      apiCalls.push(fn);
      if (fn === 'getAutoPunch') return { employeeId: args[0], autoPunch: true };
      if (fn === 'getAssignedGeofences') return [
        { siteId: 'S-0001', name: 'Site A', lat: 31.5204, lng: 74.3587, radiusM: 200 }
      ];
      if (fn === 'listEmployees') return [{ id: 'EMP-0001', deviceId: 'DEV-1' }];
      if (fn === 'setAutoPunch') return { employeeId: args[0], autoPunch: !!args[1] };
      throw new Error('Unknown API function: ' + fn);
    }
  };
  sb2.App = { routes: {} };
  sb2.esc = s => String(s);
  sb2.toast = () => {};
  sb2.setInterval = setInterval; sb2.clearInterval = clearInterval;
  sb2.setTimeout = setTimeout; sb2.clearTimeout = clearTimeout;
  vm.createContext(sb2);
  vm.runInContext(fs.readFileSync(ROOT + '/src/js/165_geofence.js', 'utf8'), sb2, { filename: '165_geofence.js' });

  /* ----- I18N keys ----- */
  ok('I18N.t t5.autoTitle (en)', sb2.I18N.t('t5.autoTitle') === 'Automatic attendance');
  ok('I18N ur dict has t5 keys', !!sb2.I18N.dict.ur['t5.autoTitle'] && !!sb2.I18N.dict.ur['t5.autoDesc']);

  /* ----- simulate the punch page DOM, then let the lazy hook fire ----- */
  const grid = new FakeElement('div'); grid.className = 'grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-5xl';
  const card2 = new FakeElement('div'); card2.className = 'bg-white rounded-2xl';
  const msg = new FakeElement('div'); msg.id = 'punch_x7-msg';
  card2.appendChild(msg); grid.appendChild(card2); body.appendChild(grid);
  await new Promise(res => setTimeout(res, 900)); /* lazy hook retries every 250ms */
  ok('toggle card injected into punch page', !!DOCIDS['t5-auto-card']);
  ok('toggle switch present', !!DOCIDS['t5-auto-toggle']);
  ok('bridge cache warmed from server', apiCalls.indexOf('getAssignedGeofences') >= 0);

  /* ----- toggle calls setAutoPunch ----- */
  const tgl = DOCIDS['t5-auto-toggle'];
  const beforeCalls = apiCalls.filter(f => f === 'setAutoPunch').length;
  tgl.checked = false;
  for (const f of (tgl._listeners.change || [])) await f();
  const setCalls = apiCalls.filter(f => f === 'setAutoPunch').length;
  ok('switch change calls setAutoPunch', setCalls === beforeCalls + 1);
  ok('cache updated after toggle', sb2.T5.cache.autoPunch === false);

  /* ----- AndroidGetPunchConfig shape ----- */
  const cfgStr = sb2.AndroidGetPunchConfig();
  ok('AndroidGetPunchConfig returns a JSON STRING', typeof cfgStr === 'string');
  const cfg = JSON.parse(cfgStr);
  ok('config has token', cfg.token === 'tok-abc-123');
  ok('config has tenantId', cfg.tenantId === 'T-0001');
  ok('config has employeeId', cfg.employeeId === 'EMP-0001');
  ok('config has autoPunch bool', typeof cfg.autoPunch === 'boolean');
  ok('config has deviceId', cfg.deviceId === 'DEV-1', 'got ' + cfg.deviceId);
  ok('config sites array with geofence shape',
     Array.isArray(cfg.sites) && cfg.sites.length === 1 &&
     cfg.sites[0].siteId === 'S-0001' && cfg.sites[0].name === 'Site A' &&
     typeof cfg.sites[0].lat === 'number' && typeof cfg.sites[0].lng === 'number' &&
     cfg.sites[0].radiusM === 200, JSON.stringify(cfg.sites[0]));
  ok('no selfie or face data in payload',
     cfgStr.indexOf('selfie') < 0 && cfgStr.indexOf('face') < 0);
  const cfgStr2 = await sb2.AndroidRefreshPunchConfig();
  ok('AndroidRefreshPunchConfig returns JSON string', typeof cfgStr2 === 'string' && JSON.parse(cfgStr2).token === 'tok-abc-123');
}

console.log(failures.length ? ('\nGEOFENCE QA FAILURES: ' + failures.join('; ')) : '\nGEOFENCE QA: ALL PASS');
process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
