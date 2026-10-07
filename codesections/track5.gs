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
