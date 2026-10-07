# Track 3 — WhatsApp / SMS alerts: API additions

Companion to `API_CONTRACT.md` (which is the single source of truth and is NOT
edited by this track). Backend lives in `codesections/track3.gs` (appended to
`Code.gs` by the coordinator); frontend in `src/js/160_alerts.js`; Settings UI
wiring in `src/js/130_settings.js` (Track 3 owns that file).

## Tenant Settings keys

| key | default | meaning |
|---|---|---|
| `wa_token` | `''` | WhatsApp Cloud API access token (Meta developer dashboard) |
| `wa_phone_number_id` | `''` | WhatsApp Cloud API phone number ID |
| `wa_enabled` | `'0'` | master switch for WhatsApp alerts |
| `wa_template_name` | `''` | optional approved template name; empty = send plain text |
| `sms_webhook_url` | `''` | generic SMS webhook endpoint (receives POST JSON `{to, message}`) |
| `sms_enabled` | `'0'` | master switch for SMS alerts |
| `alert_late` | `'1'` | send alert on late arrival |
| `alert_absent` | `'1'` | send alert when an employee is absent after the grace period |
| `alert_leave_decision` | `'1'` | send alert on leave approved / rejected |
| `alert_out_of_zone` | `'1'` | send alert on out-of-geofence punch |
| `absence_grace_minutes` | `'60'` | absent is flagged only after this many minutes past shift start (today) |

Channel pick: WhatsApp wins when `wa_enabled` + token + phone number ID are all
set; otherwise SMS when `sms_enabled` + webhook URL are set; otherwise the
attempt is logged with status `pending-config` and nothing is sent.

## messageLog tab

Schema: `id, ts, tenantId, channel, to, event, body, status, error`

- `ts`: ISO string `yyyy-MM-ddTHH:mm:ss` (never a Date object — `rows_()`
  already converts Dates and `google.script.run` cannot transport them).
- `tenantId`: the tenant key on every backend row.
- `channel`: `whatsapp` | `sms` | `''` (empty when nothing was configured).
- `event`: `late` | `absent` | `leave_approved` | `leave_rejected` |
  `out_of_zone` | `test` | `manual`.
- `status`: `sent` | `failed` | `pending-config`.

## API functions (Code.gs `API` object → `API.call('name', …)`)

- `sendAlert(user, {event, toEmployeeId, vars})` → `{ok, sent, status, error?}`.
  Permission: `settings_manage`. Resolves the recipient phone from the
  Employees tab, picks the channel, sends, logs. Never throws for transport
  problems; missing employee phone logs `failed` with an error note.
- `runAlertChecks(user, employeeId, date?)` → `{date, employeeId, alerts:[…]}`.
  Frontend calls this after `punch` / `devicePunch` (the 160_alerts.js wrapper
  does it automatically). Checks the employee's first check-in against the
  rostered (or first) shift start + grace → `late`; any `outOfZone` punch →
  `out_of_zone`. Idempotent per (date, event, phone, punch time). Employee-role
  callers are restricted to their own record via `selfOnly_`.
- `checkAbsences(user, date?)` → `{date, checked, absent:[…], alerted, skipped}`.
  Daily sweep for HR/admin (`attendance_view`). Skips future dates, holidays,
  weekly offs (per `workingDays` setting) and approved leave. For today, grace
  must have elapsed (`absence_grace_minutes` past shift start).
- `alertLeaveDecision(user, requestId)` → `{ok, status}`. Called after
  `decideLeave` (automatic via the 160_alerts.js wrapper). Sends
  `leave_approved` / `leave_rejected` to the employee. No-op when the toggle is
  off, the request is still pending, or the decision was already notified.
- `listMessageLog(user, limit?)` → newest-first rows (`settings_manage`).
- `resendAlert(user, logId)` → `{ok, status, error}`. Retries one row with the
  current credentials and updates that row in place (`settings_manage`).
- `testAlert(user, channel, to)` → dispatch result. Sends a test message; the
  channel need not be enabled, but missing credentials log `pending-config`
  (`settings_manage`).

## Failure semantics (hard guarantees)

- Missing credentials → status `pending-config`, `ok:true`, no exception.
- Transport failure → status `failed` with the error text, `ok:true`, no
  exception. The punch/leave flow that triggered the alert is never broken.
- `UrlFetchApp` calls use `muteHttpExceptions:true`; 2xx = sent.
- NOTE: GAS `UrlFetchApp` exposes no timeout parameter, so the platform default
  applies; the wrapper keeps every failure non-fatal by contract.

## Trigger points (for the coordinator / other tracks)

No punch/leave backend or frontend files were edited. Wiring is:

1. **Automatic (shipped):** `160_alerts.js` wraps `API.call` once per page load.
   After a successful `punch` it fires `runAlertChecks(employeeId)`; after
   `devicePunch` with its `employeeId` arg; after `decideLeave` it fires
   `alertLeaveDecision(requestId)`. Follow-ups are fire-and-forget with empty
   catch handlers and never delay the UI.
2. **Manual hooks (if the wrapper is ever removed):** call
   `API.call('runAlertChecks', employeeId)` after any punch write, and
   `API.call('alertLeaveDecision', requestId)` after any `decideLeave`.
3. **Daily absence sweep:** schedule `checkAbsences` (time-driven trigger or a
   dashboard button) — e.g. once per morning after `absence_grace_minutes`.

## build.py dependency — MockAPI stubs REQUIRED (Track 3 may not edit 02_mock.js)

`build.py` check #2 exits non-zero when an `API.call('fn')` has no `MockAPI.fn`.
The coordinator (or mock owner) must add these stubs to `src/js/02_mock.js`
before the build passes:

```js
sendAlert(opts){ return {ok:true, sent:false, status:'pending-config'}; },
runAlertChecks(employeeId, date){ return {date:date||'', employeeId, alerts:[]}; },
checkAbsences(date){ return {date:date||'', checked:0, absent:[], alerted:0, skipped:'mock'}; },
alertLeaveDecision(requestId){ return {ok:true, status:'skipped', reason:'mock'}; },
listMessageLog(limit){ return []; },
resendAlert(logId){ return {ok:true, status:'pending-config'}; },
testAlert(channel, to){ return {ok:true, sent:false, status:'pending-config'}; },
```

## Seeding

`seedTrack3Tabs_(ss)` creates the `messageLog` tab and inserts the default
settings keys (only keys the tenant does not already have). The coordinator
wires it into tenant setup alongside `setupTenantSS`.
