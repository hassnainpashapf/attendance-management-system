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
