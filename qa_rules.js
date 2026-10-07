/* QA Check — Track 6: HR rules engine (node).
 * Part A: backend — loads the REAL Code.gs + codesections/track6.gs in a vm
 *   with an in-memory SpreadsheetApp fake and exercises:
 *   (1) rules tab registered on SHEETS + TENANT_TABS
 *   (2) seeder idempotent, seeds 6 non-Settings-backed rows
 *   (3) getRule_ default when nothing stored
 *   (4) getRule_ coercion by valueType (int/float/bool/string/time)
 *   (5) getRule_ falls back to Settings for the 4 payroll keys (track 2)
 *   (6) rule row overrides the Settings value
 *   (7) saveRule validation (unknown key, bad time, bad option, bad range,
 *       NaN, non-admin role)
 *   (8) saveRule upsert is idempotent (no duplicate rows)
 *   (9) getRules role gating + source badges
 *   (10) duplicate-window rule expression before/after save (patch #1 basis)
 * Part B: frontend — loads src/js/170_rules.js with DOM stubs:
 *   (11) I18N t6.* keys exist in en and ur
 *   (12) #/rules nav entry + route registered
 *   (13) route renders groups, badges and typed editors without throwing;
 *         save button starts disabled and enables on change
 * Run: node qa_rules.js
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
console.log('--- Part A: backend (real Code.gs + track6.gs, fake SpreadsheetApp) ---');
{
  /* ----- in-memory GAS fakes (same shape as qa_geofence.js) ----- */
  const SHEET_HEADERS = {};
  function makeSheet(name) {
    return {
      _d: [], _name: name,
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
      deleteRow(i) { this._d.splice(i - 1, 1); }
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
               fs.readFileSync(ROOT + '/codesections/track6.gs', 'utf8');
  vm.runInContext(code, sb, { filename: 'Code.gs+track6.gs' });
  const { API } = sb;
  const SHEETS = sb.SHEETS, TENANT_TABS = sb.TENANT_TABS;
  Object.keys(SHEETS).forEach(k => { SHEET_HEADERS[k] = SHEETS[k]; });

  ok('rules tab registered on SHEETS', Array.isArray(SHEETS.rules) && SHEETS.rules[0] === 'key');
  ok('rules in TENANT_TABS', TENANT_TABS.indexOf('rules') >= 0);

  /* ----- seed one tenant ----- */
  const root = { id: 'SU-0001', name: 'Super Admin', role: 'superadmin' };
  const t = API.createTenant(root, 'QA Rules Co', 'trial', 'Admin', 'admin', 'admin123');
  ok('createTenant ok', !!t.tenantId && !!t.spreadsheetId);
  const admin = { id: 'U-0001', name: 'Admin', username: 'admin', role: 'admin',
                  tenantId: t.tenantId, spreadsheetId: t.spreadsheetId };
  const hr = { id: 'U-0002', name: 'HR', username: 'hr', role: 'hr',
               tenantId: t.tenantId, spreadsheetId: t.spreadsheetId };
  const empUser = { id: 'U-0003', name: 'Emp', username: 'emp', role: 'employee',
                    tenantId: t.tenantId, spreadsheetId: t.spreadsheetId };
  const ss = sb.SpreadsheetApp.openById(t.spreadsheetId);
  const ruleRows = () => sb.trows_(ss, 'rules');

  /* ----- (2) seeder idempotent, skips Settings-backed keys ----- */
  sb.seedTrack6Tabs_(ss);
  sb.seedTrack6Tabs_(ss);
  const seeded = ruleRows();
  ok('seeder idempotent: exactly 6 rule rows', seeded.length === 6, 'rows=' + seeded.length);
  const keys = seeded.map(r => r.key).sort().join(',');
  ok('seeded keys are the 6 non-Settings rules',
     keys === 'autoAbsentCutoffTime,duplicatePunchWindowMinutes,lateThresholdMinutes,outOfZonePolicy,overtimeAutoEligible,probationDays',
     keys);

  /* ----- (3) getRule_ default when nothing stored ----- */
  ok('getRule_ falls back to supplied default',
     sb.getRule_(ss, 'lateThresholdMinutes', 10) === 10);

  /* ----- (4) coercion by valueType ----- */
  ok('int coercion from string', sb.getRule_(ss, 'duplicatePunchWindowMinutes', 5) === 5);
  ok('bool coercion -> boolean', sb.getRule_(ss, 'overtimeAutoEligible', false) === true);
  ok('time coercion', sb.getRule_(ss, 'autoAbsentCutoffTime', '') === '10:00');
  ok('string coercion', sb.getRule_(ss, 'outOfZonePolicy', '') === 'flag');

  /* ----- (5) Settings fallback for the 4 payroll keys (track 2 owns them) ----- */
  sb.tappend_(ss, 'settings', { key: 'absentDeductionPerDay', value: '30' });
  sb.tappend_(ss, 'settings', { key: 'lateGraceMinutes', value: '15' });
  sb.tappend_(ss, 'settings', { key: 'latePenaltyMinutes', value: '60' });
  sb.tappend_(ss, 'settings', { key: 'overtimeRateMultiplier', value: '1.5' });
  ok('Settings fallback: absentDeductionPerDay', sb.getRule_(ss, 'absentDeductionPerDay', 1) === 30);
  ok('Settings fallback: lateGraceMinutes', sb.getRule_(ss, 'lateGraceMinutes', 15) === 15);
  ok('Settings fallback: latePenaltyMinutes', sb.getRule_(ss, 'latePenaltyMinutes', 0) === 60);
  ok('Settings fallback: overtimeRateMultiplier', sb.getRule_(ss, 'overtimeRateMultiplier', 1) === 1.5);

  /* ----- (6) rule row overrides Settings ----- */
  API.saveRule(admin, 'lateGraceMinutes', 20);
  ok('rule row overrides Settings', sb.getRule_(ss, 'lateGraceMinutes', 15) === 20);

  /* ----- (7) saveRule validation ----- */
  ok('unknown key rejected', throwsWith(() => API.saveRule(admin, 'nope', 1), /Unknown rule key/));
  ok('bad time rejected', throwsWith(() => API.saveRule(admin, 'autoAbsentCutoffTime', '25:99'), /Invalid time/));
  ok('bad option rejected', throwsWith(() => API.saveRule(admin, 'outOfZonePolicy', 'delete'), /must be one of/));
  ok('negative int rejected', throwsWith(() => API.saveRule(admin, 'duplicatePunchWindowMinutes', -1), /must be between/));
  ok('out-of-range float rejected', throwsWith(() => API.saveRule(admin, 'overtimeRateMultiplier', 99), /must be between/));
  ok('NaN rejected', throwsWith(() => API.saveRule(admin, 'probationDays', 'abc'), /Invalid number/));
  ok('hr cannot saveRule', throwsWith(() => API.saveRule(hr, 'probationDays', 60), /only admins/));
  ok('employee cannot saveRule', throwsWith(() => API.saveRule(empUser, 'probationDays', 60), /only admins/));

  /* ----- (8) upsert idempotent ----- */
  API.saveRule(admin, 'probationDays', 120);
  API.saveRule(admin, 'probationDays', 90);
  const pRows = ruleRows().filter(r => r.key === 'probationDays');
  ok('saveRule upsert: one row per key', pRows.length === 1, 'rows=' + pRows.length);
  ok('saved value readable via getRule_', sb.getRule_(ss, 'probationDays', 90) === 90);
  ok('bool save round-trips', (API.saveRule(admin, 'overtimeAutoEligible', false).value === false) &&
     sb.getRule_(ss, 'overtimeAutoEligible', true) === false);
  ok('time save round-trips', API.saveRule(admin, 'autoAbsentCutoffTime', '09:30').value === '09:30');
  ok('option save round-trips', API.saveRule(admin, 'outOfZonePolicy', 'block').value === 'block');
  API.saveRule(admin, 'outOfZonePolicy', 'flag'); /* restore default for later tests */

  /* ----- (9) getRules gating + sources ----- */
  ok('employee cannot getRules', throwsWith(() => API.getRules(empUser), /Permission denied/));
  const gA = API.getRules(admin);
  const gH = API.getRules(hr);
  ok('admin + hr can getRules', Array.isArray(gA) && gA.length === 10 && Array.isArray(gH) && gH.length === 10);
  const byKey = k => gA.filter(r => r.key === k)[0];
  ok('seeded rule reports source=rule', byKey('duplicatePunchWindowMinutes').source === 'rule');
  ok('Settings-backed without row reports source=settings', byKey('absentDeductionPerDay').source === 'settings');
  ok('Settings-backed with row reports source=rule', byKey('lateGraceMinutes').source === 'rule');
  ok('fresh tenant seeds payroll Settings, true-default when key removed', (() => {
    const t2 = API.createTenant(root, 'QA Rules Two', 'trial', 'Admin', 'admin2', 'admin123');
    const a2 = { id: 'U-1', role: 'admin', tenantId: t2.tenantId, spreadsheetId: t2.spreadsheetId };
    const srcWired = API.getRules(a2).filter(r => r.key === 'absentDeductionPerDay')[0].source;
    /* remove the Settings row to simulate the true neither-row-nor-Settings case */
    const ss2 = sb.SpreadsheetApp.openById(t2.spreadsheetId);
    const sh = ss2.getSheetByName('settings');
    const vals = sh.getDataRange().getValues();
    for (let i = 1; i < vals.length; i++) {
      if (String(vals[i][0]) === 'absentDeductionPerDay') { sh.deleteRow(i + 1); break; }
    }
    const srcDefault = API.getRules(a2).filter(r => r.key === 'absentDeductionPerDay')[0].source;
    return srcWired === 'settings' && srcDefault === 'default';
  })());
  ok('effective value honors Settings fallback', byKey('latePenaltyMinutes').value === 60);
  ok('outOfZonePolicy carries options', JSON.stringify(byKey('outOfZonePolicy').options) === '["flag","block"]');
  ok('auditLog written for saveRule',
     sb.trows_(ss, 'auditLog').filter(a => a.action === 'saveRule').length >= 1);

  /* ----- (10) duplicate-window rule drives the patch expression ----- */
  const dupExpr = () => sb.getRule_(ss, 'duplicatePunchWindowMinutes', 5);
  ok('duplicate window default 5', dupExpr() === 5);
  API.saveRule(admin, 'duplicatePunchWindowMinutes', 8);
  ok('duplicate window reads saved rule', dupExpr() === 8);
}

console.log('--- Part B: frontend (170_rules.js with DOM stubs) ---');
{
  /* ----- minimal DOM (innerHTML parses ids like qa_punch.js) ----- */
  const DOCIDS = {};
  class FakeElement {
    constructor(tag) {
      this.tagName = String(tag || 'div').toUpperCase(); this.nodeType = 1;
      this.children = []; this.parent = null; this.style = {}; this.dataset = {};
      this._id = ''; this.className = ''; this.value = ''; this.textContent = '';
      this.checked = false; this.disabled = false; this._innerHTML = '';
      this._listeners = {};
      this.classList = { add(){}, remove(){}, toggle(){ return false; }, contains(){ return false; } };
    }
    get id() { return this._id; }
    set id(v) { this._id = String(v); if (v) DOCIDS[String(v)] = this; }
    get innerHTML() { return this._innerHTML; }
    set innerHTML(v) {
      this._innerHTML = String(v);
      const re = /<([a-zA-Z]+)([^>]*)>/g; let m;
      while ((m = re.exec(this._innerHTML))) {
        const attrs = m[2] || '';
        const idm = attrs.match(/id="([^"]+)"/);
        if (!idm) continue;
        const el = new FakeElement(m[1]);
        el.id = idm[1];
        if (/\bdisabled\b/.test(attrs)) el.disabled = true;
        if (/\bchecked\b/.test(attrs)) el.checked = true;
        const tm = attrs.match(/type="([^"]+)"/); if (tm) el.type = tm[1];
        const vm2 = attrs.match(/value="([^"]*)"/); if (vm2) el.value = vm2[1];
      }
    }
    setAttribute(k, v) { if (k === 'id') this.id = v; }
    addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); }
    fire(t) { (this._listeners[t] || []).forEach(f => f({ target: this })); }
  }
  const sb2 = {};
  sb2.window = sb2; sb2.self = sb2; sb2.globalThis = sb2;
  sb2.console = console;
  sb2.document = { getElementById: id => DOCIDS[id] || null, createElement: t => new FakeElement(t),
                   addEventListener() {}, removeEventListener() {} };
  sb2.location = { hash: '#/rules' };
  sb2.addEventListener = () => {}; sb2.removeEventListener = () => {};
  sb2.Session = { get user() { return { id: 'U-1', role: 'admin', tenantId: 'T-1' }; } };
  const mockRules = [
    { key: 'duplicatePunchWindowMinutes', value: 5, valueType: 'int', group: 'attendance',
      description: 'Duplicate guard window', settingsBacked: false, source: 'rule' },
    { key: 'outOfZonePolicy', value: 'flag', valueType: 'string', group: 'attendance',
      description: 'flag or block', settingsBacked: false, source: 'default', options: ['flag', 'block'] },
    { key: 'overtimeAutoEligible', value: true, valueType: 'bool', group: 'attendance',
      description: 'auto eligible', settingsBacked: false, source: 'rule' },
    { key: 'autoAbsentCutoffTime', value: '10:00', valueType: 'time', group: 'attendance',
      description: 'cutoff', settingsBacked: false, source: 'rule' },
    { key: 'overtimeRateMultiplier', value: 1.5, valueType: 'float', group: 'payroll',
      description: 'multiplier', settingsBacked: true, source: 'settings' }
  ];
  const saved = [];
  sb2.API = { call: async (fn, ...args) => {
    if (fn === 'getRules') return mockRules.map(r => Object.assign({}, r));
    if (fn === 'saveRule') { saved.push({ key: args[0], value: args[1] }); return { key: args[0], value: args[1], valueType: 'string' }; }
    throw new Error('Unknown API function: ' + fn);
  }};
  sb2.App = { nav: [], routes: {} };
  sb2.pageHead = (t, s) => '<h1>' + t + '</h1><p>' + s + '</p>';
  sb2.btnP = 'btnP'; sb2.btnS = 'btnS';
  sb2.uid = p => p + '_q1';
  sb2.esc = s => String(s == null ? '' : s);
  sb2.toast = () => {};
  sb2.perm = () => true;
  vm.createContext(sb2);
  vm.runInContext(fs.readFileSync(ROOT + '/src/js/170_rules.js', 'utf8'), sb2, { filename: '170_rules.js' });

  /* ----- (11) I18N keys ----- */
  ok('I18N.t t6.nav (en)', sb2.I18N.t('t6.nav') === 'HR Rules');
  ok('I18N.t t6.save (en)', sb2.I18N.t('t6.save') === 'Save changes');
  ok('I18N.t t6.adminOnly (en)', sb2.I18N.t('t6.adminOnly').indexOf('view access') >= 0);
  ok('I18N ur dict has t6 keys', !!sb2.I18N.dict.ur['t6.nav'] && !!sb2.I18N.dict.ur['t6.save']);

  /* ----- (12) nav + route registered ----- */
  const nav = sb2.App.nav.filter(n => n.path === '#/rules')[0];
  ok('nav entry #/rules registered', !!nav && nav.group === 'SYSTEM');
  ok('route #/rules registered', typeof sb2.App.routes['#/rules'] === 'function');

  /* ----- (13) route renders ----- */
  const view = new FakeElement('div');
  let renderErr = null;
  try { await sb2.App.routes['#/rules'](view); } catch (e) { renderErr = e; }
  ok('route renders without throwing', !renderErr, renderErr && renderErr.message);
  const bodyEl = DOCIDS['rules_q1-body'];
  const html = (bodyEl ? bodyEl.innerHTML : '') + ' ' + view.innerHTML;
  ok('renders Attendance + Payroll groups', html.indexOf('Attendance') >= 0 && html.indexOf('Payroll') >= 0);
  ok('renders source badges', bodyEl && bodyEl.innerHTML.indexOf('t6.src.') < 0 &&
     (bodyEl.innerHTML.indexOf('>Rule<') >= 0 || bodyEl.innerHTML.indexOf('>Settings<') >= 0 || bodyEl.innerHTML.indexOf('>Default<') >= 0));
  ok('typed editors rendered', !!DOCIDS['rules_q1-t6v-duplicatePunchWindowMinutes'] &&
     !!DOCIDS['rules_q1-t6v-outOfZonePolicy'] && !!DOCIDS['rules_q1-t6v-overtimeAutoEligible'] &&
     !!DOCIDS['rules_q1-t6v-autoAbsentCutoffTime']);
  const saveBtn = DOCIDS['rules_q1-save'];
  ok('save button starts disabled (no changes)', !!saveBtn && saveBtn.disabled === true);
  /* flip one editor, fire change, save should enable */
  const numInp = DOCIDS['rules_q1-t6v-duplicatePunchWindowMinutes'];
  numInp.value = '8';
  numInp.fire('change');
  ok('save button enables after a change', saveBtn.disabled === false);
}

console.log(failures.length ? ('\n' + failures.length + ' FAILURES: ' + failures.join(', ')) : '\nALL QA CHECKS PASSED');
process.exit(failures.length ? 1 : 0);
})();
