/* 150_face.js — TRACK 1: on-device face check-in (Phase 2).
   Enrollment UI on #/face (camera, 1-3 samples, averaged 128-d descriptor saved
   via enrollFace). At punch time an API.call wrapper captures a live frame from
   the punch page camera, compares the descriptor on-device (Euclidean distance,
   threshold 0.6) and routes through punchWithFace so the punch record carries
   faceVerified + matchScore. If face-api.js fails to load, no enrollment exists,
   or anything else goes wrong, the plain punch flow continues untouched
   (faceVerified=null). Raw face images never leave the device.
   Hard rule: no literal colon-slash-slash sequence anywhere in this file (GAS sanitizer); CDN URLs
   are built with the 'https:' + '//...' concat pattern. Block comments only. */
(function(){
'use strict';

/* ---------------- i18n (track framework hook) ---------------- */
if (typeof I18N === 'undefined') {
  window.I18N = { dict: { en: {}, ur: {} }, lang: 'en',
    t: function(k){ var d = this.dict[this.lang] || {}; return d[k] !== undefined ? d[k] : k; } };
}
Object.assign(I18N.dict.en, {
  't1.nav': 'Face Check-in',
  't1.title': 'Face Check-in',
  't1.subtitle': 'On-device face enrollment and verification',
  't1.selectEmployee': 'Employee',
  't1.chooseEmployee': 'Select an employee to begin enrollment.',
  't1.enableCamera': 'Enable camera',
  't1.cameraOn': 'Camera on',
  't1.captureSample': 'Capture sample',
  't1.samples': 'Samples',
  't1.sampleN': 'Sample',
  't1.maxSamples': 'Maximum 3 samples reached.',
  't1.minSamples': 'Capture at least 1 sample (up to 3) before saving.',
  't1.saveEnrollment': 'Save enrollment',
  't1.saving': 'Saving…',
  't1.saved': 'Face enrollment saved.',
  't1.enrolled': 'Enrolled',
  't1.notEnrolled': 'Not enrolled',
  't1.enrolledAt': 'Enrolled at',
  't1.reenrollHint': 'Capturing new samples overwrites the existing enrollment.',
  't1.reset': 'Reset enrollment',
  't1.resetDone': 'Face enrollment removed.',
  't1.confirmReset': 'Remove the face enrollment for this employee?',
  't1.needFace': 'No face detected — please face the camera and try again.',
  't1.libLoading': 'Loading face-recognition library…',
  't1.libFailed': 'Face library could not load — punching still works without face verification.',
  't1.verified': 'Face verified',
  't1.notVerified': 'Face not verified',
  't1.noEnroll': 'No face enrollment — face check skipped.',
  't1.step1': '1 · Employee',
  't1.step2': '2 · Capture samples',
  't1.status': 'Enrollment status'
});
Object.assign(I18N.dict.ur, {
  't1.nav': 'چہرے سے حاضری',
  't1.title': 'چہرے سے حاضری',
  't1.subtitle': 'ڈیوائس پر چہرے کا اندراج اور تصدیق',
  't1.selectEmployee': 'ملازم',
  't1.chooseEmployee': 'اندراج شروع کرنے کے لیے ملازم منتخب کریں۔',
  't1.enableCamera': 'کیمرہ آن کریں',
  't1.cameraOn': 'کیمرہ آن ہے',
  't1.captureSample': 'نمونہ لیں',
  't1.samples': 'نمونے',
  't1.sampleN': 'نمونہ',
  't1.maxSamples': 'زیادہ سے زیادہ 3 نمونے ہو گئے۔',
  't1.minSamples': 'محفوظ کرنے سے پہلے کم از کم 1 نمونہ (زیادہ سے زیادہ 3) لیں۔',
  't1.saveEnrollment': 'اندراج محفوظ کریں',
  't1.saving': 'محفوظ ہو رہا ہے…',
  't1.saved': 'چہرے کا اندراج محفوظ ہو گیا۔',
  't1.enrolled': 'اندراج شدہ',
  't1.notEnrolled': 'اندراج نہیں',
  't1.enrolledAt': 'اندراج کی تاریخ',
  't1.reenrollHint': 'نئے نمونے لینے سے پرانا اندراج بدل جائے گا۔',
  't1.reset': 'اندراج حذف کریں',
  't1.resetDone': 'چہرے کا اندراج حذف کر دیا گیا۔',
  't1.confirmReset': 'اس ملازم کا چہرے کا اندراج حذف کر دیں؟',
  't1.needFace': 'چہرہ نظر نہیں آیا — کیمرے کی طرف دیکھیں اور دوبارہ کوشش کریں۔',
  't1.libLoading': 'چہرہ شناخت لائبریری لوڈ ہو رہی ہے…',
  't1.libFailed': 'لائبریری لوڈ نہ ہو سکی — چہرے کی تصدیق کے بغیر حاضری درج ہو گی۔',
  't1.verified': 'چہرہ تصدیق شدہ',
  't1.notVerified': 'چہرہ تصدیق نہیں ہوا',
  't1.noEnroll': 'چہرے کا اندراج نہیں — جانچ چھوڑ دی گئی۔',
  't1.step1': '1 · ملازم',
  't1.step2': '2 · نمونے لیں',
  't1.status': 'اندراج کی صورتحال'
});

/* ---------------- pure matching math (exposed for QA) ---------------- */
var FACE_THRESHOLD = 0.6;
var MAX_SAMPLES = 3;

function euclid(a, b){
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return null;
  var s = 0;
  for (var i = 0; i < a.length; i++){
    var x = a[i], y = b[i];
    if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) return null;
    var d = x - y; s += d * d;
  }
  return Math.sqrt(s);
}
function averageDescriptors(samples){
  if (!Array.isArray(samples) || !samples.length) return null;
  var n = -1, acc = null, count = 0;
  for (var k = 0; k < samples.length; k++){
    var s = samples[k];
    if (!Array.isArray(s) || !s.length) continue;
    if (n < 0){ n = s.length; acc = new Array(n).fill(0); }
    if (s.length !== n) continue;
    var ok = true;
    for (var i = 0; i < n; i++){
      var v = s[i];
      if (typeof v !== 'number' || !isFinite(v)){ ok = false; break; }
      acc[i] += v;
    }
    if (ok) count++;
  }
  if (!count) return null;
  return acc.map(function(v){ return v / count; });
}
function matchScore(dist){
  if (dist === null || dist === undefined || !isFinite(dist)) return null;
  return Math.max(0, Math.min(1, 1 - dist));
}
function verifyFace(live, enrolled, threshold){
  threshold = (threshold === undefined) ? FACE_THRESHOLD : threshold;
  var dist = euclid(live, enrolled);
  if (dist === null) return { faceVerified: null, matchScore: null, distance: null };
  return { faceVerified: dist <= threshold, matchScore: matchScore(dist), distance: dist };
}
function validDescriptor(d){
  return Array.isArray(d) && d.length === 128 &&
    d.every(function(v){ return typeof v === 'number' && isFinite(v); });
}
/* Backward-compatible punch payload extension: empty object when no check ran */
function buildFacePunchFields(v){
  if (!v || v.faceVerified === null || v.faceVerified === undefined) return {};
  return { faceVerified: !!v.faceVerified, matchScore: v.matchScore };
}

window.T1Face = { FACE_THRESHOLD: FACE_THRESHOLD, MAX_SAMPLES: MAX_SAMPLES,
  euclid: euclid, averageDescriptors: averageDescriptors, matchScore: matchScore,
  verifyFace: verifyFace, validDescriptor: validDescriptor,
  buildFacePunchFields: buildFacePunchFields };

/* ---------------- face-api.js lazy loader ---------------- */
var FACE_LIB_URL = 'https:' + '//cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
var FACE_MODEL_URL = 'https:' + '//cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
var _libPromise = null;

function loadScriptOnce(src){
  return new Promise(function(resolve, reject){
    var s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = function(){ resolve(); };
    s.onerror = function(){ reject(new Error('Face library failed to load')); };
    document.head.appendChild(s);
  });
}
function ensureFaceLib(){
  if (window.faceapi && window.faceapi.nets && window.faceapi.nets.tinyFaceDetector &&
      window.faceapi.nets.tinyFaceDetector.isLoaded) return Promise.resolve(window.faceapi);
  if (_libPromise) return _libPromise;
  _libPromise = loadScriptOnce(FACE_LIB_URL).then(function(){
    var fa = window.faceapi;
    if (!fa) throw new Error('Face library failed to load');
    return Promise.all([
      fa.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
      fa.nets.faceLandmark68Net.loadFromUri(FACE_MODEL_URL),
      fa.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL)
    ]).then(function(){ return fa; });
  });
  return _libPromise;
}
function descriptorFromVideo(video){
  return ensureFaceLib().then(function(fa){
    return fa.detectSingleFace(video, new fa.TinyFaceDetectorOptions())
      .withFaceLandmarks().withFaceDescriptor();
  }).then(function(det){
    return det ? Array.from(det.descriptor) : null;
  });
}

/* ---------------- punch-time hook (DOM/API interception, no edits to 30_punch.js) ---------------- */
function liveVideoEl(){
  var vids = document.querySelectorAll('video');
  for (var i = 0; i < vids.length; i++){
    var v = vids[i];
    /* Only a genuinely live camera feed counts: this also keeps offline queue
       syncs (no live video at sync time) on the plain punch path. */
    if (v.srcObject && v.videoWidth > 0 && !v.paused) return v;
  }
  return null;
}
function announceFaceResult(v){
  var label = v.faceVerified ? I18N.t('t1.verified') : I18N.t('t1.notVerified');
  var pct = (v.matchScore === null) ? '' : ' · ' + Math.round(v.matchScore * 100) + '%';
  toast(esc(label) + pct, v.faceVerified ? 'success' : 'warn');
  try {
    var hosts = document.querySelectorAll('[id$="-msg"]');
    for (var i = 0; i < hosts.length; i++){
      var d = document.createElement('div');
      d.className = 'mt-2 text-sm rounded-xl px-4 py-2.5 border ' +
        (v.faceVerified ? 'text-emerald-700 bg-emerald-50 border-emerald-200/70'
                        : 'text-red-700 bg-red-50 border-red-200/70');
      d.textContent = label + pct;
      hosts[i].insertBefore(d, hosts[i].firstChild);
    }
  } catch (e) { /* never break the punch page */ }
}
async function punchWithFaceCheck(origCall, args){
  var employeeId = args[0];
  try {
    var video = liveVideoEl();
    if (!video) return origCall.apply(window.API, ['punch'].concat(args));
    var enr = null;
    try { enr = await window.API.call('getFaceEnrollment', employeeId); }
    catch (e) { enr = null; }
    if (!enr || !enr.enrolled || !validDescriptor(enr.descriptor)){
      toast(I18N.t('t1.noEnroll'), 'info');
      return origCall.apply(window.API, ['punch'].concat(args));
    }
    var live = await descriptorFromVideo(video);
    var v = verifyFace(live, enr.descriptor, FACE_THRESHOLD);
    if (v.faceVerified === null){
      toast(I18N.t('t1.needFace'), 'warn');
      return origCall.apply(window.API, ['punch'].concat(args));
    }
    var r = await origCall('punchWithFace', args[0], args[1], args[2], args[3],
                           args[4], args[5], args[6], v.faceVerified, v.matchScore);
    announceFaceResult(v);
    return r;
  } catch (e) {
    /* Any face failure must never block attendance */
    return origCall.apply(window.API, ['punch'].concat(args));
  }
}
(function installPunchHook(){
  if (typeof API === 'undefined' || !API || API.__t1wrapped) return;
  API.__t1wrapped = true;
  var origCall = API.call.bind(API);
  API.call = function(fn){
    var args = Array.prototype.slice.call(arguments, 1);
    if (fn !== 'punch') return origCall.apply(API, [fn].concat(args));
    return punchWithFaceCheck(origCall, args);
  };
})();

/* ---------------- #/face enrollment page ---------------- */
if (typeof App !== 'undefined' && App.nav){
  App.ICONS.face = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 shrink-0"><circle cx="12" cy="12" r="8.5"/><circle cx="9.2" cy="10" r="0.9" fill="currentColor" stroke="none"/><circle cx="14.8" cy="10" r="0.9" fill="currentColor" stroke="none"/><path d="M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-0.6 3.5-1.8"/></svg>';
  App.nav.push({ group: 'WORKFORCE', path: '#/face', label: I18N.t('t1.nav'), labelKey: 't1.nav', icon: 'face', perm: 'employees' });

  App.routes['#/face'] = async function(el){
    if (!perm('employees', 'view')){
      el.innerHTML = pageHead(I18N.t('t1.title'), I18N.t('t1.subtitle')) +
        '<div class="text-sm text-red-600">Permission denied.</div>';
      return;
    }
    var cid = uid('face');
    var employees = await API.call('listEmployees').catch(function(){ return []; });
    var active = (employees || []).filter(function(e){ return e.active; });
    var opts = active.map(function(e){ return { value: e.id, label: e.name + ' (' + e.code + ')' }; });
    var vTitle = '<div class="mb-6 anim-fadeUp"><h1 class="text-[26px] font-bold text-slate-900 tracking-tight">' + esc(I18N.t('t1.title')) + '</h1>' +
      '<p class="text-sm text-slate-400 mt-1">' + esc(I18N.t('t1.subtitle')) + '</p></div>';
    var vStepHead = function(n, title){
      var clean = String(title || '').replace(/^\d+\s*[·•]\s*/, '');
      return '<div class="flex items-center gap-2.5 mb-4">' +
        '<span class="w-6 h-6 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0">' + n + '</span>' +
        '<h3 class="font-bold text-slate-800">' + esc(clean) + '</h3></div>';
    };
    el.innerHTML = vTitle + '\n' +
    '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-5xl">' +
      '<div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.04)] p-6 anim-fadeUp">' +
        vStepHead(1, I18N.t('t1.step1')) +
        field(I18N.t('t1.selectEmployee'), 'faceEmp', { type: 'select',
          options: [{ value: '', label: I18N.t('t1.chooseEmployee') }].concat(opts), cls: 'mb-4' }) +
        '<div id="' + cid + '-status"></div>' +
        '<div class="text-xs text-slate-400 mt-2">' + esc(I18N.t('t1.reenrollHint')) + '</div>' +
      '</div>' +
      '<div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.04)] p-6 anim-fadeUp">' +
        vStepHead(2, I18N.t('t1.step2')) +
        '<div class="rounded-2xl overflow-hidden bg-slate-900 aspect-[4/3] relative mb-4">' +
          '<video id="' + cid + '-vid" class="w-full h-full object-cover" autoplay playsinline muted></video>' +
          '<canvas id="' + cid + '-cap" class="hidden"></canvas>' +
          '<div id="' + cid + '-novideo" class="absolute inset-0 hidden items-center justify-center text-slate-400 text-sm text-center p-6"></div>' +
        '</div>' +
        '<div id="' + cid + '-libmsg" class="text-xs text-slate-400 mb-3">' + esc(I18N.t('t1.libLoading')) + '</div>' +
        '<div class="flex gap-2 mb-4">' +
          '<button id="' + cid + '-camon" class="' + btnS + ' flex-1">' + esc(I18N.t('t1.enableCamera')) + '</button>' +
          '<button id="' + cid + '-snap" class="' + btnS + ' flex-1" disabled>' + esc(I18N.t('t1.captureSample')) + '</button>' +
        '</div>' +
        '<div id="' + cid + '-samples" class="text-sm text-slate-600 mb-4"></div>' +
        '<div class="flex gap-2">' +
          '<button id="' + cid + '-save" class="' + btnP + ' flex-1" disabled>' + esc(I18N.t('t1.saveEnrollment')) + '</button>' +
          '<button id="' + cid + '-reset" class="' + btnD + '">' + esc(I18N.t('t1.reset')) + '</button>' +
        '</div>' +
        '<div id="' + cid + '-msg" class="mt-4"></div>' +
      '</div>' +
    '</div>';

    var $ = function(id){ return document.getElementById(cid + '-' + id); };
    var state = { empId: '', stream: null, samples: [], libReady: false };
    var vid = $('vid'), cap = $('cap');

    /* face-api loads in the background; enrollment needs it, punch works without */
    ensureFaceLib().then(function(){
      state.libReady = true;
      $('libmsg').textContent = '';
    }).catch(function(){
      $('libmsg').textContent = I18N.t('t1.libFailed');
    });

    function refreshStatus(){
      var box = $('status');
      if (!state.empId){ box.innerHTML = ''; return; }
      box.innerHTML = '<div class="text-sm text-slate-400">…</div>';
      API.call('getFaceEnrollment', state.empId).then(function(enr){
        if (enr && enr.enrolled){
          box.innerHTML =
            '<div class="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 flex items-center gap-3">' +
              '<div class="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">✓</div>' +
              '<div><div class="text-sm font-semibold text-emerald-800">' + esc(I18N.t('t1.enrolled')) + '</div>' +
              '<div class="text-xs text-emerald-600">' + esc(I18N.t('t1.enrolledAt')) + ': ' + esc(enr.enrolledAt || '—') + '</div></div>' +
            '</div>';
        } else {
          box.innerHTML =
            '<div class="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm text-slate-500">' +
              esc(I18N.t('t1.notEnrolled')) + '</div>';
        }
      }).catch(function(){ box.innerHTML = ''; });
    }
    function refreshSamples(){
      var box = $('samples');
      var list = state.samples.length ? ' <span class="text-slate-400">(' + state.samples.map(function(_, i){
            return esc(I18N.t('t1.sampleN')) + ' ' + (i + 1);
          }).join(', ') + ')</span>' : '';
      box.innerHTML = '<span class="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ' +
        (state.samples.length ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500') + '">' +
        esc(I18N.t('t1.samples')) + ': ' + state.samples.length + ' / ' + MAX_SAMPLES + '</span>' + list;
      $('save').disabled = !(state.empId && state.samples.length);
    }

    var empSel = document.querySelector('[name="faceEmp"]');
    if (empSel) empSel.addEventListener('change', function(){
      state.empId = empSel.value; state.samples = [];
      refreshStatus(); refreshSamples();
    });

    $('camon').onclick = async function(){
      try {
        var stream = await navigator.mediaDevices.getUserMedia(
          { video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
        state.stream = stream; vid.srcObject = stream;
        $('snap').disabled = false; $('camon').disabled = true;
        $('camon').textContent = I18N.t('t1.cameraOn');
      } catch (e){
        var nv = $('novideo'); nv.textContent = String(e.message || e); nv.style.display = 'flex';
      }
    };
    $('snap').onclick = async function(){
      if (!state.stream) return;
      if (state.samples.length >= MAX_SAMPLES){ toast(I18N.t('t1.maxSamples'), 'warn'); return; }
      $('snap').disabled = true;
      try {
        if (!state.libReady) await ensureFaceLib();
        var vw = vid.videoWidth || 640, vh = vid.videoHeight || 480;
        var scale = Math.min(1, 320 / Math.max(vw, vh));
        cap.width = Math.round(vw * scale); cap.height = Math.round(vh * scale);
        cap.getContext('2d').drawImage(vid, 0, 0, cap.width, cap.height);
        var d = await descriptorFromVideo(cap);
        if (!d || !validDescriptor(d)){ toast(I18N.t('t1.needFace'), 'warn'); return; }
        state.samples.push(d);
        toast(I18N.t('t1.sampleN') + ' ' + state.samples.length + ' / ' + MAX_SAMPLES, 'success');
      } catch (e){
        toast(I18N.t('t1.libFailed'), 'warn');
      } finally {
        refreshSamples();
        $('snap').disabled = false;
      }
    };
    $('save').onclick = async function(){
      var msg = $('msg');
      if (!state.empId || !state.samples.length){ msg.innerHTML = ''; return; }
      var avg = T1Face.averageDescriptors(state.samples);
      if (!validDescriptor(avg)){
        msg.innerHTML = '<div class="text-sm text-red-600">' + esc(I18N.t('t1.minSamples')) + '</div>';
        return;
      }
      $('save').disabled = true; $('save').textContent = I18N.t('t1.saving');
      try {
        await API.call('enrollFace', state.empId, avg);
        state.samples = [];
        msg.innerHTML = '<div class="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200/70 rounded-xl px-4 py-3">' +
          esc(I18N.t('t1.saved')) + '</div>';
        toast(I18N.t('t1.saved'), 'success');
        refreshStatus();
      } catch (e){
        msg.innerHTML = '<div class="text-sm text-red-600 bg-red-50 border border-red-200/70 rounded-xl px-4 py-3">' +
          esc(e.message || e) + '</div>';
      } finally {
        refreshSamples();
        $('save').textContent = I18N.t('t1.saveEnrollment');
      }
    };
    $('reset').onclick = async function(){
      if (!state.empId) return;
      if (!(await confirmDlg(I18N.t('t1.reset'), I18N.t('t1.confirmReset'), I18N.t('t1.reset')))) return;
      try {
        await API.call('resetFaceEnrollment', state.empId);
        toast(I18N.t('t1.resetDone'), 'success');
        refreshStatus();
      } catch (e){ toast(esc(e.message || e), 'error'); }
    };
    refreshSamples();
  };
}

})();
