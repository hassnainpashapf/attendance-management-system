# Attendance Management System — API CONTRACT ADDENDUM (TRACK 1: face check-in)

Coordinator: merge into API_CONTRACT.md. Product name rule and `tenantId` keying
contract from the base contract apply unchanged.

## New backend API functions (Code.gs, `API` object — registered via the
`/* ===== TRACK 1: face check-in ===== */` section in `codesections/track1.gs`)

- `enrollFace(employeeId, descriptor)` → `{employeeId, enrolledAt, updatedAt}`.
  `descriptor` is a 128-element array of finite numbers (JSON transport keeps it
  an array). Upserts into the `faceEnrollments` tab keyed by `employeeId`;
  re-enroll overwrites, keeps the original `enrolledAt`, bumps `updatedAt`.
  Throws `Employee not found` / `Invalid face descriptor (need 128 finite numbers)`.
  Requires `employees_manage`. Writes an auditLog row (`enrollFace`).
- `getFaceEnrollment(employeeId)` → `{employeeId, enrolled}` when none, else
  `{employeeId, enrolled:true, enrolledAt, updatedAt, descriptor}`.
  The enrolled descriptor IS returned so the device can match on-device.
  Employee/user roles are scoped to their own record (`selfOnly_`, same as
  `listEmployees`); other roles need only be logged in. Read-only, no audit row.
- `resetFaceEnrollment(employeeId)` → `{ok:true, employeeId}`. Deletes the
  enrollment row. Throws `Employee not found`. Requires `employees_manage`.
  Writes an auditLog row (`resetFaceEnrollment`).
- `punchWithFace(employeeId, type, lat, lng, selfie, deviceId, source, faceVerified, matchScore)`
  → identical to `punch(...)` plus `punch.faceVerified` (boolean, or `null` when
  no face check ran) and `punch.matchScore` (0–1 number, or `null`).
  Implementation: calls `API.punch` first (all existing guards — duplicate,
  device binding, geofence — behave exactly as before), then writes the two
  face columns onto the new attendance row. `faceVerified`/`matchScore` are
  optional; omitting them produces a record identical to a plain `punch()`.
  Writes an auditLog row (`punchFace`). Face-column write failures never fail
  the punch.

## New tenant tab (created by `seedTrack1Tabs_(ss)`, wired by the coordinator)

- `faceEnrollments`: `employeeId, descriptorJson, enrolledAt, updatedAt`
  (`descriptorJson` = JSON string of the averaged 128-d descriptor).

## Extended tab

- `attendance` gains two OPTIONAL trailing columns: `faceVerified`, `matchScore`.
  Existing rows/punches are unaffected; `punchWithFace` adds the header columns
  to already-seeded sheets via `ensureFaceCols_` (safe when the sheet grid is
  full-width). MockAPI/02_mock.js is owned by another track — it must add the
  four functions above (enroll/reset/get/punchWithFace) mirroring these shapes.

## Frontend contract (`src/js/150_face.js`, never edited other files)

- Route `#/face` (WORKFORCE group, `employees` view perm): employee picker,
  camera, capture 1–3 samples, average → `enrollFace`; re-enroll overwrites;
  reset via `resetFaceEnrollment` with confirm dialog.
- Punch-time hook: `API.call` is wrapped — only `fn === 'punch'` is
  intercepted. It captures a frame from the live punch-page camera, loads
  `getFaceEnrollment(employeeId)`, computes the descriptor on-device with
  face-api.js (CDN: `https:` + `//cdn.jsdelivr.net/npm/face-api.js@0.22.2/...`,
  models from `https:` + `//cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights`),
  compares Euclidean distance with threshold **0.6** →
  `faceVerified = distance <= 0.6`, `matchScore = 1 - distance` clamped 0–1 —
  and calls `punchWithFace(..., faceVerified, matchScore)`.
- Face check is SKIPPED (plain `punch`, `faceVerified=null`) when: no live
  camera, face-api.js fails to load, no enrollment exists, no face in frame,
  backend call fails, or the device is offline (offline queue sync has no live
  video at sync time, so queued punches stay on the plain path). Raw face
  images never leave the device — only the averaged enrollment descriptor
  (enroll) and the boolean + score (punch) are transported.
- i18n keys: `t1.*` registered for `en` and `ur` in `150_face.js`
  (`Object.assign(I18N.dict.en/ur, {...})`); every user-facing string uses
  `I18N.t('t1.<key>')`.
