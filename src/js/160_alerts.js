/* 160_alerts.js — TRACK 3 frontend: Notifications card for the Settings page,
   message-log viewer with resend, and a one-time API.call wrapper that fires
   runAlertChecks after punch/devicePunch and alertLeaveDecision after
   decideLeave, so the punch/leave flows need no edits. */
(function(){
'use strict';

/* I18N framework ships with another track; provide a minimal shim so this
   module never crashes if it loads first. Guarded so we never clobber it. */
if(!window.I18N){
  window.I18N = {
    dict: { en: {}, ur: {} },
    lang: 'en',
    t: function(k){ var d = window.I18N.dict || {}; return (d[window.I18N.lang] && d[window.I18N.lang][k]) || (d.en && d.en[k]) || k; }
  };
}
Object.assign(I18N.dict.en, {
  't3.notifications': 'Notifications (WhatsApp / SMS)',
  't3.notifSub': 'Automatic WhatsApp or SMS alerts for attendance events. WhatsApp is used when configured, otherwise the SMS webhook.',
  't3.whatsapp': 'WhatsApp (Cloud API)',
  't3.waEnabled': 'Enable WhatsApp alerts',
  't3.waToken': 'Access token',
  't3.waPhoneId': 'Phone number ID',
  't3.waTemplate': 'Template name (optional)',
  't3.waTemplateHint': 'Leave empty to send plain text. If set, the approved template is sent instead of text.',
  't3.sms': 'SMS (webhook)',
  't3.smsEnabled': 'Enable SMS alerts',
  't3.smsUrl': 'Webhook URL',
  't3.smsUrlHint': 'Receives POST JSON { to, message }. Only used when WhatsApp is not configured.',
  't3.events': 'Alert events',
  't3.evLate': 'Late arrival',
  't3.evAbsent': 'Absent (no check-in)',
  't3.evLeave': 'Leave approved / rejected',
  't3.evZone': 'Out-of-zone punch',
  't3.grace': 'Absence grace (minutes)',
  't3.graceHint': 'An employee counts as absent only after this many minutes past their shift start.',
  't3.testTo': 'Test number',
  't3.testWa': 'Test WhatsApp',
  't3.testSms': 'Test SMS',
  't3.save': 'Save notification settings',
  't3.saved': 'Notification settings saved',
  't3.testSent': 'Test alert sent — check the message log below',
  't3.testNeedNo': 'Enter a test phone number first',
  't3.pendingNote': 'Until credentials are saved, alerts are logged as “pending-config” and nothing is sent.',
  't3.logTitle': 'Message log',
  't3.logSub': 'Every alert attempt is recorded here. Resend retries an entry with the current settings.',
  't3.refresh': 'Refresh',
  't3.cTime': 'Time',
  't3.cChannel': 'Channel',
  't3.cTo': 'To',
  't3.cEvent': 'Event',
  't3.cStatus': 'Status',
  't3.cError': 'Error',
  't3.resend': 'Resend',
  't3.resent': 'Alert resent',
  't3.noLogs': 'No alerts logged yet.',
  't3.stSent': 'sent',
  't3.stFailed': 'failed',
  't3.stPending': 'pending-config'
});
Object.assign(I18N.dict.ur, {
  't3.notifications': 'اطلاعات (واٹس ایپ / ایس ایم ایس)',
  't3.notifSub': 'حاضری کے واقعات پر خودکار واٹس ایپ یا ایس ایم ایس الرٹس۔ ترتیب ہونے پر واٹس ایپ استعمال ہوتا ہے، ورنہ ایس ایم ایس ویب ہک۔',
  't3.whatsapp': 'واٹس ایپ (کلاؤڈ API)',
  't3.waEnabled': 'واٹس ایپ الرٹس فعال کریں',
  't3.waToken': 'ایکسیس ٹوکن',
  't3.waPhoneId': 'فون نمبر ID',
  't3.waTemplate': 'ٹیمپلیٹ کا نام (اختیاری)',
  't3.waTemplateHint': 'سادہ متن بھیجنے کے لیے خالی چھوڑیں۔ درج ہو تو منظور شدہ ٹیمپلیٹ بھیجا جائے گا۔',
  't3.sms': 'ایس ایم ایس (ویب ہک)',
  't3.smsEnabled': 'ایس ایم ایس الرٹس فعال کریں',
  't3.smsUrl': 'ویب ہک URL',
  't3.smsUrlHint': 'POST JSON { to, message } وصول کرتا ہے۔ صرف اس صورت میں استعمال ہوتا ہے جب واٹس ایپ ترتیب نہ ہو۔',
  't3.events': 'الرٹ کے واقعات',
  't3.evLate': 'دیر سے آمد',
  't3.evAbsent': 'غیر حاضر (چیک اِن نہیں)',
  't3.evLeave': 'چھٹی منظور / مسترد',
  't3.evZone': 'زون سے باہر پنچ',
  't3.grace': 'غیر حاضری کی مہلت (منٹ)',
  't3.graceHint': 'ملازم شفٹ شروع ہونے کے اتنے منٹ بعد ہی غیر حاضر شمار ہوگا۔',
  't3.testTo': 'ٹیسٹ نمبر',
  't3.testWa': 'واٹس ایپ ٹیسٹ',
  't3.testSms': 'ایس ایم ایس ٹیسٹ',
  't3.save': 'اطلاعات کی ترتیبات محفوظ کریں',
  't3.saved': 'اطلاعات کی ترتیبات محفوظ ہو گئیں',
  't3.testSent': 'ٹیسٹ الرٹ بھیج دیا گیا — نیچے پیغامات کی فہرست دیکھیں',
  't3.testNeedNo': 'پہلے ٹیسٹ فون نمبر درج کریں',
  't3.pendingNote': 'اسناد محفوظ ہونے تک الرٹس “pending-config” کے طور پر لاگ ہوں گے اور کچھ نہیں بھیجا جائے گا۔',
  't3.logTitle': 'پیغامات کی فہرست',
  't3.logSub': 'ہر الرٹ کی کوشش یہاں درج ہوتی ہے۔ دوبارہ بھیجنا موجودہ ترتیبات سے کوشش دہراتا ہے۔',
  't3.refresh': 'تازہ کریں',
  't3.cTime': 'وقت',
  't3.cChannel': 'چینل',
  't3.cTo': 'وصول کنندہ',
  't3.cEvent': 'واقعہ',
  't3.cStatus': 'حیثیت',
  't3.cError': 'خرابی',
  't3.resend': 'دوبارہ بھیجیں',
  't3.resent': 'الرٹ دوبارہ بھیج دیا گیا',
  't3.noLogs': 'ابھی کوئی الرٹ لاگ نہیں ہوا۔',
  't3.stSent': 'بھیجا گیا',
  't3.stFailed': 'ناکام',
  't3.stPending': 'pending-config'
});

const T = k => I18N.t(k);
/* settings values arrive as strings/booleans; treat '1' like true */
function on(v){ return v===true || v===1 || v==='1' || v==='true' || v==='TRUE'; }
function statusBadge(st){
  if(st==='sent') return badge(T('t3.stSent'),'emerald');
  if(st==='failed') return badge(T('t3.stFailed'),'red');
  return badge(T('t3.stPending'),'amber');
}
const EV_LABEL = { late:'t3.evLate', absent:'t3.evAbsent', leave_approved:'t3.evLeave',
  leave_rejected:'t3.evLeave', out_of_zone:'t3.evZone', test:'t3.testWa' };
function evLabel(ev){
  const k = EV_LABEL[ev];
  if(!k) return ev;
  const t = T(k);
  return (t === k) ? ev : t;
}

const Alerts = {
  on,

  /* Notifications card body for the Settings page. Field names match the
     settings keys, so collectForm() + saveSettings() round-trip directly. */
  notifHTML(s, canEdit){
    s = s || {};
    const dis = canEdit ? '' : 'disabled';
    return `
    <div class="rounded-xl border border-slate-200/70 p-4 mb-4">
      <div class="flex items-center gap-2 mb-3">
        <span class="text-base">💬</span><span class="font-semibold text-slate-700 text-sm">${T('t3.whatsapp')}</span>
        <label class="ml-auto inline-flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
          <input type="checkbox" name="wa_enabled" ${on(s.wa_enabled)?'checked':''} ${dis} class="w-4 h-4 rounded accent-teal-600"> ${T('t3.waEnabled')}
        </label>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2">${field(T('t3.waToken'),'wa_token',{type:'password',value:s.wa_token||'',cls:dis})}</div>
        ${field(T('t3.waPhoneId'),'wa_phone_number_id',{value:s.wa_phone_number_id||'',ph:'e.g. 123456789012345'})}
        ${field(T('t3.waTemplate'),'wa_template_name',{value:s.wa_template_name||'',ph:'optional'})}
      </div>
      <p class="text-[11px] text-slate-400 mt-2">${T('t3.waTemplateHint')}</p>
    </div>
    <div class="rounded-xl border border-slate-200/70 p-4 mb-4">
      <div class="flex items-center gap-2 mb-3">
        <span class="text-base">📩</span><span class="font-semibold text-slate-700 text-sm">${T('t3.sms')}</span>
        <label class="ml-auto inline-flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
          <input type="checkbox" name="sms_enabled" ${on(s.sms_enabled)?'checked':''} ${dis} class="w-4 h-4 rounded accent-teal-600"> ${T('t3.smsEnabled')}
        </label>
      </div>
      ${field(T('t3.smsUrl'),'sms_webhook_url',{value:s.sms_webhook_url||'',ph:'webhook.example.com/sms-hook'})}
      <p class="text-[11px] text-slate-400 mt-2">${T('t3.smsUrlHint')}</p>
    </div>
    <div class="rounded-xl border border-slate-200/70 p-4 mb-4">
      <div class="font-semibold text-slate-700 text-sm mb-3">${T('t3.events')}</div>
      <div class="grid grid-cols-2 gap-2.5">
        ${[['alert_late','t3.evLate'],['alert_absent','t3.evAbsent'],['alert_leave_decision','t3.evLeave'],['alert_out_of_zone','t3.evZone']]
          .map(([k,l])=>`<label class="flex items-center gap-2 text-sm text-slate-600 cursor-pointer"><input type="checkbox" name="${k}" ${on(s[k])?'checked':''} ${dis} class="w-4 h-4 rounded accent-teal-600"> ${T(l)}</label>`).join('')}
      </div>
      <div class="mt-4 max-w-[220px]">${field(T('t3.grace'),'absence_grace_minutes',{type:'number',min:0,value:s.absence_grace_minutes||60})}</div>
      <p class="text-[11px] text-slate-400 mt-1">${T('t3.graceHint')}</p>
    </div>
    ${canEdit?`
    <div class="rounded-xl bg-slate-50 border border-slate-200/70 p-4 mb-4">
      <div class="flex flex-wrap items-end gap-3">
        <div class="flex-1 min-w-[180px]">${field(T('t3.testTo'),'t3_test_to',{ph:'03XXXXXXXXX'})}</div>
        <button class="${btnS} !text-xs" data-t3test="whatsapp">${T('t3.testWa')}</button>
        <button class="${btnS} !text-xs" data-t3test="sms">${T('t3.testSms')}</button>
      </div>
      <p class="text-[11px] text-slate-400 mt-2">${T('t3.pendingNote')}</p>
    </div>
    <button class="${btnP}" data-t3save>${T('t3.save')}</button>`:''}`;
  },

  initNotif(rootId, canEdit){
    const root = document.getElementById(rootId);
    if(!root) return;
    const sv = root.querySelector('[data-t3save]');
    if(sv) sv.onclick = async ()=>{
      const d = collectForm(root);
      delete d.t3_test_to;
      await API.call('saveSettings', d);
      toast(T('t3.saved'),'success');
    };
    root.querySelectorAll('[data-t3test]').forEach(b=>{
      b.onclick = async ()=>{
        const to = formVal(root, 't3_test_to');
        if(!to){ toast(T('t3.testNeedNo'),'warn'); return; }
        b.disabled = true;
        try{
          const r = await API.call('testAlert', b.dataset.t3test, to);
          toast(T('t3.testSent')+' ('+r.status+')', r.status==='sent'?'success':'warn');
          const ml = document.querySelector('[data-t3log]');
          if(ml) Alerts.renderLog(ml);
        }catch(e){ toast(e.message,'error'); }
        b.disabled = false;
      };
    });
  },

  /* Message log table with per-row resend. */
  async renderLog(el){
    el.setAttribute('data-t3log','1');
    el.innerHTML = '<div class="py-8 text-center"><span class="spinner"></span></div>';
    let rows = [];
    try{ rows = await API.call('listMessageLog', 100); }catch(e){ el.innerHTML = `<div class="text-sm text-red-600">${esc(e.message)}</div>`; return; }
    if(!rows.length){ el.innerHTML = `<div class="text-sm text-slate-400 py-6 text-center">${T('t3.noLogs')}</div>`; return; }
    el.innerHTML = tableHTML([
      {label:T('t3.cTime'), get:r=>`<span class="tabular-nums text-xs whitespace-nowrap">${fmtDateTime(r.ts)}</span>`},
      {label:T('t3.cChannel'), get:r=>r.channel==='whatsapp'?badge('WhatsApp','emerald'):r.channel==='sms'?badge('SMS','sky'):badge('—','slate')},
      {label:T('t3.cTo'), get:r=>`<span class="font-mono text-xs">${esc(r.to||'—')}</span>`},
      {label:T('t3.cEvent'), get:r=>`<span class="text-xs font-medium text-slate-600">${esc(evLabel(r.event))}</span>`},
      {label:T('t3.cStatus'), get:r=>statusBadge(r.status)},
      {label:T('t3.cError'), get:r=>r.error?`<span class="text-xs text-red-500 max-w-[220px] block truncate" title="${esc(r.error)}">${esc(r.error)}</span>`:'<span class="text-slate-300">—</span>'},
      {label:'', get:r=>`<div class="flex justify-end"><button class="${btnS} !px-3 !py-1.5 !text-xs" data-t3resend="${esc(r.id)}">${T('t3.resend')}</button></div>`},
    ], rows, {empty:T('t3.noLogs'), compact:true});
    el.querySelectorAll('[data-t3resend]').forEach(b=>{
      b.onclick = async ()=>{
        b.disabled = true;
        try{
          const r = await API.call('resendAlert', b.dataset.t3resend);
          toast(T('t3.resent')+' ('+r.status+')', r.status==='sent'?'success':'warn');
          Alerts.renderLog(el);
        }catch(e){ toast(e.message,'error'); b.disabled=false; }
      };
    });
  },

  /* Fire alert checks after punch / leave decisions without touching those
     flows' files. Idempotent: safe to call once per page load. */
  patch(){
    if(window.__t3patched) return;
    window.__t3patched = true;
    const SKIP = {runAlertChecks:1, alertLeaveDecision:1, checkAbsences:1, listMessageLog:1, resendAlert:1, testAlert:1, sendAlert:1};
    const apply = ()=>{
      if(!window.API || !window.API.call || window.API.call.__t3) return false;
      const orig = window.API.call.bind(window.API);
      const wrapped = async function(fn){
        const args = Array.prototype.slice.call(arguments, 1);
        const r = await orig.apply(null, [fn].concat(args));
        try{
          if(!SKIP[fn]){
            if(fn==='punch' && r && r.punch) orig('runAlertChecks', args[0]).catch(function(){});
            else if(fn==='devicePunch' && r && r.punch) orig('runAlertChecks', args[1]).catch(function(){});
            else if(fn==='decideLeave') orig('alertLeaveDecision', args[0]).catch(function(){});
          }
        }catch(e){}
        return r;
      };
      wrapped.__t3 = true;
      window.API.call = wrapped;
      return true;
    };
    if(!apply()){
      const iv = setInterval(()=>{ if(apply()) clearInterval(iv); }, 300);
      setTimeout(()=>clearInterval(iv), 10000);
    }
  }
};

window.Alerts = Alerts;
Alerts.patch();
})();
