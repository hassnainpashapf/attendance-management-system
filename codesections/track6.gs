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
