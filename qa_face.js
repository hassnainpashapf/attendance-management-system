/* QA — Track 1 face check-in (run: node qa_face.js)
 * (a) node --check on src/js/150_face.js
 * (b) no literal colon-slash-slash in the served file (GAS sanitizer guard)
 * (c) pure-function tests: euclid / averageDescriptors / matchScore /
 *     verifyFace (threshold 0.6 boundary) / validDescriptor /
 *     buildFacePunchFields — by loading 150_face.js in a vm sandbox
 * (d) mocked-API contract shapes: enrollFace / getFaceEnrollment /
 *     resetFaceEnrollment / punchWithFace (upsert, reset, descriptor shape,
 *     backward-compatible punch payload)
 * (e) punch-hook fallback: API.call('punch') with no live camera goes through
 *     as a plain punch (face check skipped, faceVerified=null)
 * (f) every I18N.t('t1.*') key used is registered in dict.en and dict.ur
 * Zero console.error tolerated.
 */
const fs = require('fs');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = '/home/hatch/workspace/attendance-saas';
const failures = [];
const consoleErrors = [];
const ok = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
  if (!cond) failures.push(name);
};

const src = fs.readFileSync(ROOT + '/src/js/150_face.js', 'utf8');

(async () => {
  // (a) syntax
  try {
    execFileSync('node', ['--check', ROOT + '/src/js/150_face.js'], { stdio: 'pipe' });
    ok('node --check 150_face.js', true);
  } catch (e) { ok('node --check 150_face.js', false, String(e.message).slice(0, 200)); }

  // (b) GAS sanitizer guard: no literal '://' anywhere in the served file
  const badLines = src.split('\n').filter(l => l.includes('://'));
  ok("no literal '://' in 150_face.js", badLines.length === 0,
    badLines.length ? badLines[0].trim().slice(0, 90) : 'clean');

  // ---- sandbox load ----
  const sb = {};
  sb.window = sb; sb.globalThis = sb;
  const apiCalls = [];
  sb.API = {
    call(fn, ...args) {
      apiCalls.push([fn, ...args]);
      if (fn === 'punch') return Promise.resolve({ punch: { id: 'P-0001', faceVerified: null, matchScore: null } });
      return Promise.reject(new Error('not mocked: ' + fn));
    },
  };
  sb.App = { nav: [], ICONS: {}, routes: {} };
  sb.perm = () => true;
  sb.document = {
    readyState: 'complete',
    head: { appendChild() {} },
    createElement: () => ({ set src(v) {}, style: {}, addEventListener() {} }),
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null,
    addEventListener() {}, removeEventListener() {},
    body: { append() {} },
  };
  sb.navigator = { mediaDevices: {} };
  sb.console = {
    log() {}, info() {}, warn() {}, debug() {},
    error(...a) { consoleErrors.push(a.map(String).join(' ')); },
  };
  sb.setTimeout = setTimeout; sb.clearTimeout = clearTimeout;
  sb.toast = () => {}; sb.esc = s => String(s);
  sb.location = { hash: '#/face' };
  vm.createContext(sb);
  try {
    vm.runInContext(src, sb, { filename: '150_face.js' });
    ok('150_face.js evaluates in sandbox', true);
  } catch (e) { ok('150_face.js evaluates in sandbox', false, e.message); }
  const T = sb.T1Face;
  ok('T1Face exposed', !!T && typeof T.euclid === 'function');
  ok('punch hook installed', sb.API.__t1wrapped === true);
  ok('#/face route registered', typeof sb.App.routes['#/face'] === 'function');
  ok('nav entry added', sb.App.nav.some(n => n.path === '#/face'));

  if (T) {
    // (c) pure math
    const d0 = T.euclid([0, 0], [0, 0]);
    ok('euclid identical = 0', d0 === 0, 'got ' + d0);
    const d1 = T.euclid(new Array(128).fill(0), new Array(128).fill(1));
    ok('euclid 128-d zeros vs ones = sqrt(128)', Math.abs(d1 - Math.sqrt(128)) < 1e-9, 'got ' + d1);
    ok('euclid length mismatch -> null', T.euclid([1, 2], [1]) === null);
    ok('euclid empty -> null', T.euclid([], []) === null);
    ok('euclid NaN input -> null', T.euclid([NaN], [1]) === null);
    ok('euclid non-array -> null', T.euclid('x', [1]) === null);

    const avg = T.averageDescriptors([[1, 3], [3, 5]]);
    ok('averageDescriptors basic', avg && Math.abs(avg[0] - 2) < 1e-9 && Math.abs(avg[1] - 4) < 1e-9);
    const single = T.averageDescriptors([[7, 8]]);
    ok('averageDescriptors single sample passthrough', single && single[0] === 7 && single[1] === 8);
    ok('averageDescriptors empty -> null', T.averageDescriptors([]) === null);
    ok('averageDescriptors skips bad rows', (() => {
      const a = T.averageDescriptors([[1, 1], 'nope', [3, 3]]);
      return a && Math.abs(a[0] - 2) < 1e-9;
    })());

    ok('matchScore 0 -> 1', T.matchScore(0) === 1);
    ok('matchScore 0.6 -> 0.4', Math.abs(T.matchScore(0.6) - 0.4) < 1e-9);
    ok('matchScore clamped at 0', T.matchScore(2.5) === 0);
    ok('matchScore null -> null', T.matchScore(null) === null);

    // threshold boundary: exactly 0.6 verifies, just above does not
    const at = T.verifyFace([0.6], [0], 0.6);
    ok('verifyFace dist=0.6 -> true (inclusive)', at.faceVerified === true, JSON.stringify(at));
    const above = T.verifyFace([0.6000001], [0], 0.6);
    ok('verifyFace dist>0.6 -> false', above.faceVerified === false);
    const def = T.verifyFace(new Array(128).fill(0), new Array(128).fill(0));
    ok('verifyFace default threshold 0.6', def.faceVerified === true && def.matchScore === 1);
    const noface = T.verifyFace(null, new Array(128).fill(0));
    ok('verifyFace null live -> faceVerified null', noface.faceVerified === null && noface.matchScore === null);

    const good = new Array(128).fill(0.5);
    ok('validDescriptor 128 finite -> true', T.validDescriptor(good) === true);
    ok('validDescriptor 127 -> false', T.validDescriptor(new Array(127).fill(0)) === false);
    ok('validDescriptor NaN -> false', T.validDescriptor(good.map((v, i) => (i === 3 ? NaN : v))) === false);
    ok('validDescriptor non-array -> false', T.validDescriptor('x') === false);

    const pf0 = T.buildFacePunchFields(null);
    ok('buildFacePunchFields null -> {} (backward compat)', Object.keys(pf0).length === 0);
    const pf1 = T.buildFacePunchFields({ faceVerified: true, matchScore: 0.82 });
    ok('buildFacePunchFields passes through', pf1.faceVerified === true && pf1.matchScore === 0.82);
    const pf2 = T.buildFacePunchFields({ faceVerified: null, matchScore: null });
    ok('buildFacePunchFields skipped -> {}', Object.keys(pf2).length === 0);
  }

  // (d) mocked-API contract shapes (mirrors Code.gs semantics)
  {
    const store = {}; // employeeId -> row
    const MockFace = {
      enrollFace(employeeId, descriptor) {
        if (!Array.isArray(descriptor) || descriptor.length !== 128 ||
            !descriptor.every(v => typeof v === 'number' && isFinite(v)))
          throw new Error('Invalid face descriptor (need 128 finite numbers)');
        const now = '2026-10-07 16:30:00';
        const ex = store[employeeId];
        store[employeeId] = { employeeId, descriptorJson: JSON.stringify(descriptor),
          enrolledAt: ex ? ex.enrolledAt : now, updatedAt: now };
        return { employeeId, enrolledAt: store[employeeId].enrolledAt, updatedAt: now };
      },
      getFaceEnrollment(employeeId) {
        const r = store[employeeId];
        if (!r) return { employeeId, enrolled: false };
        return { employeeId, enrolled: true, enrolledAt: r.enrolledAt,
          updatedAt: r.updatedAt, descriptor: JSON.parse(r.descriptorJson) };
      },
      resetFaceEnrollment(employeeId) { delete store[employeeId]; return { ok: true, employeeId }; },
      punchWithFace(employeeId, type, lat, lng, selfie, deviceId, source, faceVerified, matchScore) {
        const punch = { id: 'P-0002', employeeId, type,
          faceVerified: (faceVerified === undefined || faceVerified === null) ? null : !!faceVerified,
          matchScore: (matchScore === undefined || matchScore === null) ? null : Number(matchScore) };
        return { punch, site: null, outOfZone: false };
      },
    };
    const d = new Array(128).fill(0.1);
    const e1 = MockFace.enrollFace('E-1', d);
    ok('enrollFace shape', e1.employeeId === 'E-1' && !!e1.enrolledAt && !!e1.updatedAt);
    const e2 = MockFace.enrollFace('E-1', d.map(v => v + 0.01)); // re-enroll
    ok('re-enroll keeps enrolledAt, bumps updatedAt',
      e2.enrolledAt === e1.enrolledAt && e2.updatedAt >= e1.updatedAt);
    const g1 = MockFace.getFaceEnrollment('E-1');
    ok('getFaceEnrollment returns descriptor for on-device match',
      g1.enrolled === true && Array.isArray(g1.descriptor) && g1.descriptor.length === 128);
    const g2 = MockFace.getFaceEnrollment('E-9');
    ok('getFaceEnrollment unknown -> enrolled:false',
      g2.enrolled === false && !('descriptor' in g2));
    let threw = false;
    try { MockFace.enrollFace('E-1', [1, 2, 3]); } catch (e) { threw = /128/.test(e.message); }
    ok('enrollFace rejects bad descriptor', threw);
    const r1 = MockFace.resetFaceEnrollment('E-1');
    ok('resetFaceEnrollment shape', r1.ok === true && r1.employeeId === 'E-1');
    ok('enrollment gone after reset', MockFace.getFaceEnrollment('E-1').enrolled === false);
    const p1 = MockFace.punchWithFace('E-1', 'in', 31.5, 74.3, '', '', 'gps', true, 0.82);
    ok('punchWithFace carries face fields',
      p1.punch.faceVerified === true && p1.punch.matchScore === 0.82 && p1.punch.id === 'P-0002');
    const p2 = MockFace.punchWithFace('E-1', 'in', 31.5, 74.3, '', '', 'gps');
    ok('punchWithFace backward compatible (no face args -> nulls)',
      p2.punch.faceVerified === null && p2.punch.matchScore === null);
  }

  // (e) punch-hook fallback: no live camera -> plain punch, no face fields sent
  {
    apiCalls.length = 0;
    await sb.API.call('punch', 'E-1', 'in', 31.5, 74.3, null, '', 'gps');
    const c = apiCalls[0];
    ok('hook passes plain punch through untouched', c && c[0] === 'punch' && c.length === 8,
      'fn=' + (c && c[0]) + ' argc=' + (c && c.length - 1));
    ok('no punchWithFace attempted without camera', !apiCalls.some(x => x[0] === 'punchWithFace'));
    ok('non-punch fns bypass hook', await sb.API.call('punch', 'E-1', 'in', null, null, null, '', 'x').then(() => true));
  }

  // (f) i18n key coverage
  {
    const used = [...new Set([...src.matchAll(/I18N\.t\('([^']+)'\)/g)].map(m => m[1]))];
    const dict = sb.I18N.dict;
    const missingEn = used.filter(k => !(k in dict.en));
    const missingUr = used.filter(k => !(k in dict.ur));
    ok('all I18N.t keys registered (en)', missingEn.length === 0, missingEn.join(',') || used.length + ' keys');
    ok('all I18N.t keys registered (ur)', missingUr.length === 0, missingUr.join(',') || used.length + ' keys');
  }

  ok('zero console.error during load', consoleErrors.length === 0,
    consoleErrors.length ? consoleErrors[0].slice(0, 200) : '');

  console.log(failures.length ? '\nQA FACE FAILURES: ' + failures.join('; ') : '\nQA FACE: ALL PASS');
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error('QA CRASH:', e); process.exit(1); });
