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
    /* Verola premium toggle (same as ZKTeco card) */
    const vTgl = (name, checked)=>`
      <label class="relative inline-flex cursor-pointer items-center shrink-0 ${canEdit?'':'opacity-60 pointer-events-none'}">
        <input type="checkbox" name="${name}" ${checked?'checked':''} ${dis} class="sr-only peer">
        <div class="w-9 h-5 bg-slate-200 peer-checked:bg-teal-600 rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-4 after:shadow"></div>
      </label>`;
    const vChan = (ico, icoCls, title, sub, tglName, tglOn, body)=>`
      <div class="rounded-2xl border border-slate-200/70 p-5 mb-4 bg-white">
        <div class="flex items-center gap-3 mb-4">
          <span class="w-10 h-10 rounded-xl ${icoCls} flex items-center justify-center shrink-0">${ico}</span>
          <div class="min-w-0 flex-1"><div class="font-bold text-slate-800 text-sm leading-tight">${title}</div>
          ${sub?`<div class="text-xs text-slate-400 mt-0.5">${sub}</div>`:''}</div>
          ${vTgl(tglName, tglOn)}
        </div>
        ${body}
      </div>`;
    const ICO_WA='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><path d="M21 11.5a8.5 8.5 0 01-12.4 7.5L3 21l2-5.4A8.5 8.5 0 1121 11.5z"/><path d="M9 9.8c.6 2.6 3.1 5.1 5.7 5.7l1-1.4 2.1 1c-.4 1.4-1.3 1.9-2.7 1.5-2.9-1-6.2-4.3-7.2-7.2-.4-1.4.1-2.3 1.5-2.7l1 2.1z"/></svg>';
    const ICO_SMS='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>';
    const ICO_SLACK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><path d="M9 4L7 20M17 4l-2 16M4.5 9h15M3.5 15h15"/></svg>';
    const ICO_EV='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M10.3 21a2 2 0 003.4 0"/></svg>';
    return `
    ${vChan(ICO_WA,'bg-emerald-50 text-emerald-600',T('t3.whatsapp'),T('t3.waEnabled'),'wa_enabled',on(s.wa_enabled),`
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2">${field(T('t3.waToken'),'wa_token',{type:'password',value:s.wa_token||'',cls:dis})}</div>
        ${field(T('t3.waPhoneId'),'wa_phone_number_id',{value:s.wa_phone_number_id||'',ph:'e.g. 123456789012345'})}
        ${field(T('t3.waTemplate'),'wa_template_name',{value:s.wa_template_name||'',ph:'optional'})}
      </div>
      <p class="text-[11px] text-slate-400 mt-2">${T('t3.waTemplateHint')}</p>`)}
    ${vChan(ICO_SMS,'bg-sky-50 text-sky-600',T('t3.sms'),T('t3.smsEnabled'),'sms_enabled',on(s.sms_enabled),`
      ${field(T('t3.smsUrl'),'sms_webhook_url',{value:s.sms_webhook_url||'',ph:'webhook.example.com/sms-hook'})}
      <p class="text-[11px] text-slate-400 mt-2">${T('t3.smsUrlHint')}</p>`)}
    ${vChan(ICO_SLACK,'bg-violet-50 text-violet-600','Slack','Enabled','slack_enabled',on(s.slack_enabled),`
      ${field('Incoming webhook URL','slack_webhook_url',{value:s.slack_webhook_url||'',ph:'hooks.slack.com/services/…',cls:dis})}
      <p class="text-[11px] text-slate-400 mt-2">Create an incoming webhook in your Slack workspace (Apps → Incoming Webhooks) and paste the URL here. Check-in and check-out alerts are posted to that channel.</p>`)}
    <div class="rounded-2xl border border-slate-200/70 p-5 mb-4 bg-white">
      <div class="flex items-center gap-3 mb-4">
        <span class="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">${ICO_EV}</span>
        <div class="font-bold text-slate-800 text-sm">${T('t3.events')}</div>
      </div>
      <div class="grid grid-cols-2 gap-2.5">
        ${[['alert_late','t3.evLate'],['alert_absent','t3.evAbsent'],['alert_leave_decision','t3.evLeave'],['alert_out_of_zone','t3.evZone'],['alert_checkin','Check-in (Slack)'],['alert_checkout','Check-out (Slack)']]
          .map(([k,l])=>`<label class="flex items-center gap-2.5 text-sm text-slate-600 cursor-pointer bg-slate-50 hover:bg-slate-100 border border-slate-200/60 rounded-xl px-3.5 py-2.5 transition"><input type="checkbox" name="${k}" ${on(s[k])?'checked':''} ${dis} class="w-4 h-4 rounded accent-teal-600 shrink-0"> ${l.startsWith('t3.')?T(l):l}</label>`).join('')}
      </div>
      <div class="mt-4 max-w-[220px]">${field(T('t3.grace'),'absence_grace_minutes',{type:'number',min:0,value:s.absence_grace_minutes||60})}</div>
      <p class="text-[11px] text-slate-400 mt-1">${T('t3.graceHint')}</p>
    </div>
    ${canEdit?`
    <div class="rounded-2xl bg-slate-50 border border-slate-200/70 p-5 mb-4">
      <div class="flex flex-wrap items-end gap-3">
        <div class="flex-1 min-w-[180px]">${field(T('t3.testTo'),'t3_test_to',{ph:'03XXXXXXXXX'})}</div>
        <button class="${btnS} !text-xs" data-t3test="whatsapp">${T('t3.testWa')}</button>
        <button class="${btnS} !text-xs" data-t3test="sms">${T('t3.testSms')}</button>
        <button class="${btnS} !text-xs" data-t3test="slack">Test Slack</button>
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
        const ch = b.dataset.t3test;
        const to = formVal(root, 't3_test_to');
        if(!to && ch !== 'slack'){ toast(T('t3.testNeedNo'),'warn'); return; }
        b.disabled = true;
        try{
          const r = await API.call('testAlert', ch, to);
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
