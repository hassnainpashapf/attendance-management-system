/* 170_rules.js — TRACK 6: HR rules engine frontend.
   New-file only: nothing here edits 130_settings.js, 11_layout.js or any other
   module. Adds the admin-only "#/rules" page (nav + route registered at load,
   same pattern as 130_settings.js) which lists every HR rule with its
   description, shows where each value comes from (rule row / Settings /
   built-in default), and lets admins save changes through getRules/saveRule. */
(function(){
'use strict';

/* ---------- minimal I18N shim (same shape as 165_geofence.js) ---------- */
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
  't6.nav': 'HR Rules',
  't6.title': 'HR Rules',
  't6.subtitle': 'Attendance, leave and payroll rules applied across the company',
  't6.group.attendance': 'Attendance',
  't6.group.payroll': 'Payroll',
  't6.src.rule': 'Rule',
  't6.src.settings': 'Settings',
  't6.src.default': 'Default',
  't6.save': 'Save changes',
  't6.saved': 'Rules saved',
  't6.saveFail': 'Could not save rules',
  't6.loadFail': 'Could not load rules',
  't6.adminOnly': 'Only admins can change rules — you have view access.',
  't6.noChanges': 'No changes to save'
});
Object.assign(I18N.dict.ur, {
  't6.nav': 'HR قواعد',
  't6.title': 'HR قواعد',
  't6.subtitle': 'کمپنی بھر میں لاگو حاضری، چھٹی اور تنخواہ کے قواعد',
  't6.group.attendance': 'حاضری',
  't6.group.payroll': 'تنخواہ',
  't6.src.rule': 'قاعدہ',
  't6.src.settings': 'سیٹنگز',
  't6.src.default': 'ڈیفالٹ',
  't6.save': 'تبدیلیاں محفوظ کریں',
  't6.saved': 'قواعد محفوظ ہو گئے',
  't6.saveFail': 'قواعد محفوظ نہیں ہو سکے',
  't6.loadFail': 'قواعد لوڈ نہیں ہو سکے',
  't6.adminOnly': 'صرف منتظم قواعد تبدیل کر سکتے ہیں — آپ صرف دیکھ سکتے ہیں۔',
  't6.noChanges': 'محفوظ کرنے کے لیے کوئی تبدیلی نہیں'
});

/* ---------- nav + route (runtime registration, no existing file touched) ---------- */
App.nav.push({group:'SYSTEM', path:'#/rules', label:I18N.t('t6.nav'), labelKey:'t6.nav', icon:'settings', perm:'settings'});

const T6_BADGE = {
  rule: 'bg-teal-50 text-teal-700 ring-teal-600/20',
  settings: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  default: 'bg-slate-100 text-slate-500 ring-slate-500/20'
};

function t6Editor(cid, r, canEdit){
  const dis = canEdit ? '' : ' disabled';
  const base = 't6v-' + r.key;
  if(r.valueType === 'bool'){
    return `<label class="relative inline-flex cursor-pointer items-center${canEdit?'':' opacity-60 pointer-events-none'}">
      <input type="checkbox" id="${cid}-${base}" data-key="${esc(r.key)}" class="sr-only peer"${r.value?' checked':''}${dis}>
      <div class="w-9 h-5 bg-slate-200 peer-checked:bg-teal-600 rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-4 after:shadow"></div>
    </label>`;
  }
  if(r.options && r.options.length){
    return `<select id="${cid}-${base}" data-key="${esc(r.key)}" class="w-44 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 bg-white focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 outline-none"${dis}>
      ${r.options.map(o=>`<option value="${esc(o)}"${String(r.value)===o?' selected':''}>${esc(o)}</option>`).join('')}
    </select>`;
  }
  if(r.valueType === 'time'){
    return `<input type="time" id="${cid}-${base}" data-key="${esc(r.key)}" value="${esc(r.value||'')}" class="w-44 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 bg-white focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 outline-none"${dis}>`;
  }
  return `<input type="number" id="${cid}-${base}" data-key="${esc(r.key)}" value="${esc(r.value)}"${r.valueType==='int'?' step="1"':''} class="w-44 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 bg-white focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 outline-none"${dis}>`;
}

App.routes['#/rules'] = async (el)=>{
  const cid = uid('rules');
  const canEdit = ((Session.user||{}).role === 'admin');
  const V_ICO_ATT='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3 2"/></svg>';
  const V_ICO_PAY='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/></svg>';
  el.innerHTML = `
    <div class="flex items-center gap-2 text-[13px] text-slate-400 mb-4 anim-fadeUp">
      <span class="text-base">⌂</span><a href="#/dashboard" class="hover:text-slate-600">Dashboard</a><span>›</span><span class="text-slate-700 font-semibold">${esc(I18N.t('t6.title'))}</span>
    </div>
    <div class="mb-6 anim-fadeUp"><h1 class="text-[26px] font-bold text-slate-900 tracking-tight">${esc(I18N.t('t6.title'))}</h1>
    <p class="text-sm text-slate-400 mt-1">${esc(I18N.t('t6.subtitle'))}</p></div>` +
    `<div id="${cid}-body"><div class="bg-white rounded-2xl border border-slate-200/70 p-6"><div class="h-5 shimmer rounded-xl w-1/4 mb-4"></div><div class="h-24 shimmer rounded-xl"></div></div></div>`;

  let rules;
  try{
    rules = await API.call('getRules');
  }catch(e){
    document.getElementById(cid+'-body').innerHTML =
      `<div class="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">${esc(I18N.t('t6.loadFail'))}: ${esc(e.message||'')}</div>`;
    return;
  }
  rules = Array.isArray(rules) ? rules : [];
  const groups = ['attendance', 'payroll'];

  document.getElementById(cid+'-body').innerHTML = groups.map(g=>{
    const rows = rules.filter(r=>r.group===g);
    if(!rows.length) return '';
    const gIco = g==='payroll' ? V_ICO_PAY : V_ICO_ATT;
    return `<div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.04)] p-6 mb-4">
      <div class="flex items-center gap-3 mb-2">
        <span class="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">${gIco}</span>
        <h3 class="font-bold text-slate-800">${esc(I18N.t('t6.group.'+g))}</h3>
      </div>
      <div class="divide-y divide-slate-100">
      ${rows.map(r=>`
        <div class="flex items-center justify-between gap-6 py-4">
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-semibold text-slate-700">${esc(r.key)}</span>
              <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 ring-inset ${T6_BADGE[r.source]||T6_BADGE.default}">${esc(I18N.t('t6.src.'+(r.source||'default')))}</span>
            </div>
            <div class="text-xs text-slate-400 mt-1 max-w-xl">${esc(r.description||'')}</div>
          </div>
          <div class="shrink-0">${t6Editor(cid, r, canEdit)}</div>
        </div>`).join('')}
      </div>
    </div>`;
  }).join('') + (canEdit
    ? `<button class="${btnP}" id="${cid}-save" disabled>${esc(I18N.t('t6.save'))}</button>
       <span id="${cid}-msg" class="ml-3 text-sm text-slate-400"></span>`
    : `<p class="text-sm text-slate-400">${esc(I18N.t('t6.adminOnly'))}</p>`);

  if(!canEdit) return;

  const readVal = r=>{
    const inp = document.getElementById(cid+'-t6v-'+r.key);
    if(!inp) return r.value;
    if(r.valueType==='bool') return inp.checked;
    return inp.value;
  };
  const norm = r=>{
    const v = readVal(r);
    if(r.valueType==='bool') return !!v;
    return String(v);
  };
  const dirty = ()=> rules.some(r=> norm(r) !== (r.valueType==='bool' ? !!r.value : String(r.value)));
  const paint = ()=>{
    const btn = document.getElementById(cid+'-save');
    if(btn) btn.disabled = !dirty();
  };
  rules.forEach(r=>{
    const inp = document.getElementById(cid+'-t6v-'+r.key);
    if(inp) inp.addEventListener('change', paint);
  });

  document.getElementById(cid+'-save').onclick = async ()=>{
    const btn = document.getElementById(cid+'-save');
    const msg = document.getElementById(cid+'-msg');
    const changed = rules.filter(r=> norm(r) !== (r.valueType==='bool' ? !!r.value : String(r.value)));
    if(!changed.length){ toast(I18N.t('t6.noChanges'), 'info'); return; }
    btn.disabled = true;
    try{
      for(const r of changed){
        const res = await API.call('saveRule', r.key, readVal(r));
        r.value = res.value;
        r.source = 'rule';
      }
      toast(I18N.t('t6.saved'), 'success');
      if(msg) msg.textContent = '';
    }catch(e){
      toast((e && e.message) || I18N.t('t6.saveFail'), 'error');
    }
    paint();
  };
};
})();
