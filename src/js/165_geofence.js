/* 165_geofence.js — TRACK 5: geofence auto-punch support for the native Android app.
   New-file only: nothing here edits 30_punch.js or any other module. The punch
   page hook is applied lazily (hashchange + retry), so script load order never
   matters. Exposes window.AndroidGetPunchConfig() for the native WebView
   bridge and injects a small "Automatic attendance" toggle card into the
   punch page DOM. */
(function(){
'use strict';

/* ---------- minimal I18N shim (first track to need it defines it) ---------- */
if(!window.I18N){
  window.I18N = {
    lang: (window.AMS_LANG || 'en'),
    dict: { en: {}, ur: {} },
    t: function(k){
      var d = window.I18N.dict || {};
      var lang = window.I18N.lang || 'en';
      if(d[lang] && d[lang][k] != null) return d[lang][k];
      if(d.en && d.en[k] != null) return d.en[k];
      return k;
    }
  };
}
Object.assign(I18N.dict.en, {
  't5.autoTitle': 'Automatic attendance',
  't5.autoDesc': 'When ON, the Android app may check you in or out automatically when you enter or leave your assigned site geofences. Manual punches always work.',
  't5.isOn': 'Automatic attendance is ON for this employee.',
  't5.isOff': 'Automatic attendance is OFF — the app will not auto-punch.',
  't5.saved': 'Preference saved',
  't5.saveFail': 'Could not save preference'
});
Object.assign(I18N.dict.ur, {
  't5.autoTitle': 'خودکار حاضری',
  't5.autoDesc': 'آن ہونے پر اینڈرائیڈ ایپ آپ کے مقررہ سائٹ کے دائرے میں داخل ہونے یا نکلنے پر خودکار حاضری لگا سکتی ہے۔ دستی حاضری ہمیشہ کام کرتی ہے۔',
  't5.isOn': 'اس ملازم کے لیے خودکار حاضری آن ہے۔',
  't5.isOff': 'خودکار حاضری آف ہے — ایپ خودکار حاضری نہیں لگائے گی۔',
  't5.saved': 'ترجیح محفوظ ہو گئی',
  't5.saveFail': 'ترجیح محفوظ نہیں ہو سکی'
});

/* ---------- cached config shared by the bridge and the toggle ---------- */
const T5 = {
  cache: { autoPunch: true, sites: [], deviceId: '', employeeId: '' },
  myEmployeeId(){
    try{
      const sel = document.querySelector('[name="empId"]');
      if(sel && sel.value) return sel.value;
    }catch(e){}
    const u = (typeof Session !== 'undefined' && Session.user) || {};
    return u.employeeId || '';
  },
  /* Refresh the cached toggle state, geofences and bound device id. Safe to
     call in mock mode or offline: failures keep the last known values. */
  async refresh(employeeId){
    const eid = employeeId || T5.myEmployeeId();
    if(!eid) return T5.cache;
    try{
      const g = await API.call('getAutoPunch', eid);
      if(g) T5.cache.autoPunch = !!g.autoPunch;
    }catch(e){}
    try{
      const sites = await API.call('getAssignedGeofences', eid);
      if(Array.isArray(sites)) T5.cache.sites = sites.map(s=>({
        siteId: s.siteId, name: s.name,
        lat: Number(s.lat), lng: Number(s.lng), radiusM: Number(s.radiusM) || 200
      }));
    }catch(e){}
    try{
      const emps = await API.call('listEmployees');
      const me = (emps || []).filter(x=>String(x.id) === String(eid))[0];
      if(me) T5.cache.deviceId = me.deviceId || '';
    }catch(e){}
    T5.cache.employeeId = eid;
    return T5.cache;
  }
};
window.T5 = T5;

/* ---------- native bridge: JSON STRING, no selfie or face data ---------- */
/* The session token is read exactly like 01_api.js does: Session.user, which
   is parsed from localStorage key 'ams_session' (set at login). */
window.AndroidGetPunchConfig = function(){
  const u = (typeof Session !== 'undefined' && Session.user) || {};
  const cfg = {
    token: u.token || '',
    tenantId: u.tenantId || '',
    employeeId: T5.cache.employeeId || u.employeeId || '',
    autoPunch: !!T5.cache.autoPunch,
    deviceId: T5.cache.deviceId || '',
    sites: T5.cache.sites || []
  };
  /* refresh in the background so the next call is fresh; never throws */
  try{ T5.refresh(cfg.employeeId).catch(()=>{}); }catch(e){}
  return JSON.stringify(cfg);
};
/* Async variant the app can await when it needs guaranteed-fresh values. */
window.AndroidRefreshPunchConfig = async function(employeeId){
  await T5.refresh(employeeId);
  return window.AndroidGetPunchConfig();
};

/* ---------- "Automatic attendance" toggle card on the punch page ---------- */
function t5CardHTML(on){
  return `<div class="max-w-5xl mt-4" id="t5-auto-card">
    <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6 anim-fadeUp">
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <h3 class="font-display font-bold text-slate-800">${esc(I18N.t('t5.autoTitle'))}</h3>
          <p class="text-sm text-slate-500 mt-1">${esc(I18N.t('t5.autoDesc'))}</p>
        </div>
        <label class="relative inline-flex cursor-pointer items-center shrink-0" title="${esc(I18N.t('t5.autoTitle'))}">
          <input type="checkbox" id="t5-auto-toggle" class="sr-only peer"${on ? ' checked' : ''}>
          <span class="block w-11 h-6 rounded-full bg-slate-200 peer-checked:bg-teal-500 transition-colors"></span>
          <span class="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5 pointer-events-none"></span>
        </label>
      </div>
      <div id="t5-auto-status" class="text-xs text-slate-400 mt-3">${esc(I18N.t(on ? 't5.isOn' : 't5.isOff'))}</div>
    </div>
  </div>`;
}

function injectToggle(){
  try{
    if(!Session.user) return false;
    if(document.getElementById('t5-auto-card')) return true;
    /* punch page marker: 30_punch.js renders a "<cid>-msg" div */
    const msg = document.querySelector('[id$="-msg"]');
    if(!msg) return false;
    const grid = msg.closest('.grid');
    if(!grid || !grid.parentNode) return false;
    const eid = T5.myEmployeeId();
    if(!eid) return false;
    grid.insertAdjacentHTML('afterend', t5CardHTML(true));
    const tgl = document.getElementById('t5-auto-toggle');
    const status = document.getElementById('t5-auto-status');
    if(!tgl || !status) return false;
    const paint = on=>{
      tgl.checked = !!on;
      status.textContent = I18N.t(on ? 't5.isOn' : 't5.isOff');
    };
    /* load the real toggle state + warm the bridge cache */
    T5.refresh(eid).then(()=>paint(T5.cache.autoPunch)).catch(()=>{});
    tgl.addEventListener('change', async ()=>{
      tgl.disabled = true;
      try{
        const r = await API.call('setAutoPunch', eid, tgl.checked);
        T5.cache.autoPunch = !!(r && r.autoPunch);
        paint(T5.cache.autoPunch);
        toast(I18N.t('t5.saved'), 'success');
      }catch(e){
        paint(!tgl.checked);
        toast((e && e.message) || I18N.t('t5.saveFail'), 'error');
      }
      tgl.disabled = false;
    });
    return true;
  }catch(e){ return false; }
}

/* Hook the punch route lazily: the route renders asynchronously, so retry
   until the marker appears (or give up quietly). */
let t5Timer = null;
function maybeHookT5(){
  if((location.hash || '') !== '#/punch') return;
  let tries = 0;
  if(t5Timer) clearInterval(t5Timer);
  t5Timer = setInterval(()=>{
    tries++;
    let done = false;
    try{ done = injectToggle(); }catch(e){ done = false; }
    if(done || tries > 24) clearInterval(t5Timer);
  }, 250);
}
window.addEventListener('hashchange', maybeHookT5);
maybeHookT5();
})();
