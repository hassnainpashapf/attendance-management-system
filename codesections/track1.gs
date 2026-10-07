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
