/* 130_settings.js — company profile, SMTP fields, Google-login note,
   Backup Now, role permissions matrix. */
(function(){
'use strict';

App.nav.push({group:'SYSTEM', path:'#/settings', label:I18N.t('c4.nav.settings'), labelKey:'c4.nav.settings', icon:'settings', perm:'settings'});

const MODULES=[
  ['dashboard','Dashboard'],['punch','My Punch'],['attendance','Attendance'],
  ['employees','Employees'],['sites','Sites'],['shifts','Shifts & Roster'],
  ['leave','Leave'],['overtime','Overtime'],['payroll','Payroll'],
  ['documents','Documents'],['reports','Reports'],['settings','Settings'],
];

App.routes['#/settings'] = async (el)=>{
  const cid=uid('set');
  const canEdit=perm('settings','edit');
  const vHead=(ico,title,sub)=>`
    <div class="flex items-center gap-3 mb-5">
      <span class="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">${ico}</span>
      <div class="min-w-0"><h3 class="font-bold text-slate-800 leading-tight">${title}</h3>
      ${sub?`<p class="text-xs text-slate-400 mt-0.5">${sub}</p>`:''}</div>
    </div>`;
  const V_ICO_BLD='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 21v-4h6v4M8.5 7.5h2M8.5 11h2M13.5 7.5h2M13.5 11h2"/></svg>';
  const V_ICO_MAIL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>';
  const V_ICO_BK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><path d="M12 3v11m0 0l-4-4m4 4l4-4"/><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>';
  const V_ICO_BELL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M10.3 21a2 2 0 003.4 0"/></svg>';
  const V_ICO_LOG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none"/></svg>';
  const V_ICO_SHIELD='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><path d="M12 3l7 3v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6z"/><path d="M9.5 12l2 2 3.5-4"/></svg>';
  el.innerHTML=`
  <div class="flex items-center gap-2 text-[13px] text-slate-400 mb-4 anim-fadeUp">
    <span class="text-base">⌂</span><a href="#/dashboard" class="hover:text-slate-600">Dashboard</a><span>›</span><span class="text-slate-700 font-semibold">Settings</span>
  </div>
  <div class="mb-6 anim-fadeUp"><h1 class="text-[26px] font-bold text-slate-900 tracking-tight">Settings</h1>
  <p class="text-sm text-slate-400 mt-1">Company profile, notifications and access control</p></div>
  <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
    <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.04)] p-6">
      ${vHead(V_ICO_BLD,'Company profile','Shown on logins, payslips and reports.')}
      <div id="${cid}-profile"></div>
    </div>
    <div class="space-y-4">
      <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.04)] p-6">
        ${vHead(V_ICO_MAIL,'Email notifications (SMTP)','Used for leave decisions, expiring documents and payroll alerts.')}
        <div id="${cid}-smtp"></div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.04)] p-6">
        <h3 class="font-bold text-slate-800 mb-1">ZKTeco biometric device</h3>
        <p class="text-xs text-slate-400 mb-5">Connect a ZKTeco fingerprint/face device. Punches from the device appear in attendance automatically.</p>
        <div id="${cid}-zkt"></div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.04)] p-6">
        <h3 class="font-bold text-slate-800 mb-1">Sign-in options</h3>
        <div class="flex items-start gap-3 mt-4">
          <div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">G</div>
          <div class="text-sm"><div class="font-semibold text-slate-700">Sign in with Google</div>
          <div class="text-slate-400 text-xs mt-1">In production, admins can link their Google Workspace account for one-click sign-in. Enable it from the Apps Script project settings, then toggle it here.</div></div>
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.04)] p-6">
        ${vHead(V_ICO_BK,'Backup','Save a copy of the company spreadsheet to Google Drive.')}
        <button class="${btnS}" id="${cid}-backup">Backup Now</button>
        <div id="${cid}-backupMsg" class="mt-3 text-sm"></div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.04)] p-6">
        ${vHead(V_ICO_BELL,I18N.t('t3.notifications'),I18N.t('t3.notifSub'))}
        <div id="${cid}-notif"></div>
      </div>
    </div>
  </div>
  ${canEdit?`<div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.04)] p-6 mt-4">
    <div class="flex items-center justify-between mb-5">
      <div class="flex items-center gap-3">
        <span class="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">${V_ICO_LOG}</span>
        <div><h3 class="font-bold text-slate-800 leading-tight">${I18N.t('t3.logTitle')}</h3>
        <p class="text-xs text-slate-400 mt-0.5">${I18N.t('t3.logSub')}</p></div>
      </div>
      <button class="${btnS} !py-1.5 !text-xs shrink-0" id="${cid}-logRefresh">${I18N.t('t3.refresh')}</button>
    </div>
    <div id="${cid}-msglog"></div>
  </div>`:''}
  ${canEdit?`<div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.04)] p-6 mt-4">
    ${vHead(V_ICO_SHIELD,'Role permissions','Control which roles can view or edit each module.')}
    <div id="${cid}-perms"></div>
    <button class="${btnP} mt-4" id="${cid}-savePerms">Save permissions</button>
  </div>`:''}`;

  const s=await API.call('getSettings');
  const prof=document.getElementById(cid+'-profile');
  prof.innerHTML=`
    <div class="grid grid-cols-2 gap-4">
      <div class="col-span-2">${field('Company name','companyName',{value:s.companyName,req:true})}</div>
      <div class="col-span-2">${field('Address','address',{value:s.address||'',type:'textarea',rows:2})}</div>
      ${field('Phone','phone',{value:s.phone||''})}
      ${field('Email','email',{value:s.email||'',type:'email'})}
    </div>
    ${canEdit?`<button class="${btnP} mt-5" id="${cid}-saveProfile">Save profile</button>`:''}`;
  const sp=document.getElementById(cid+'-saveProfile');
  if(sp) sp.onclick=async()=>{
    await API.call('saveSettings',collectForm(prof));
    toast('Company profile saved','success');
  };

  const smtp=document.getElementById(cid+'-smtp');
  smtp.innerHTML=`
    <div class="grid grid-cols-2 gap-4">
      ${field('SMTP host','smtpHost',{value:s.smtpHost||'',ph:'smtp.gmail.com'})}
      ${field('SMTP port','smtpPort',{value:s.smtpPort||'587'})}
      <div class="col-span-2">${field('SMTP username','smtpUser',{value:s.smtpUser||''})}</div>
      <div class="col-span-2">${field('SMTP password','smtpPass',{type:'password',value:s.smtpPass||''})}</div>
    </div>
    ${canEdit?`<button class="${btnP} mt-5" id="${cid}-saveSmtp">Save SMTP settings</button>`:''}`;
  const ss=document.getElementById(cid+'-saveSmtp');
  if(ss) ss.onclick=async()=>{ await API.call('saveSettings',collectForm(smtp)); toast('SMTP settings saved','success'); };

  /* ZKTeco device settings — premium card */
  const zk=document.getElementById(cid+'-zkt');
  if(zk){
    let z={};
    try{ z=await API.call('getZktSettings'); }catch(e){ z={}; }
    const zOn = z.zkt_enabled==='1'||z.zkt_enabled===1;
    const zCfg = !!(z.zkt_device_id && z.zkt_api_key);
    const zReady = zOn && zCfg && !!z.zkt_ip;
    const stTx = zReady?'Ready':zCfg?'Incomplete':'Not set up';
    const stC = zReady?'bg-emerald-400/25':zCfg?'bg-amber-400/25':'bg-white/15';
    const dtC = zReady?'bg-emerald-300':zCfg?'bg-amber-300':'bg-white/70';
    zk.innerHTML=`
      <div class="rounded-2xl overflow-hidden border border-slate-200/70 shadow-sm mb-4">
        <div class="px-5 py-4 flex items-center gap-3 bg-gradient-to-br from-teal-700 via-teal-600 to-teal-500">
          <div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white text-xl shrink-0">◉</div>
          <div class="min-w-0"><div class="text-white font-bold text-[15px]">Biometric device</div><div class="text-teal-100/90 text-xs">ZKTeco fingerprint / face terminal</div></div>
          <span class="ml-auto inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full text-white ring-1 ring-white/40 ${stC}"><span class="w-1.5 h-1.5 rounded-full ${dtC}"></span>${stTx}</span>
        </div>
        <div class="p-5 bg-white">
          <div class="flex items-center justify-between mb-4">
            <div class="text-sm font-semibold text-slate-700">Device connection</div>
            <label class="relative inline-flex cursor-pointer items-center ${canEdit?'':'opacity-60 pointer-events-none'}">
              <input type="checkbox" name="zkt_enabled" ${zOn?'checked':''} class="sr-only peer">
              <div class="w-9 h-5 bg-slate-200 peer-checked:bg-teal-600 rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-4 after:shadow"></div>
              <span class="ml-2 text-xs font-medium text-slate-500">Enabled</span>
            </label>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>${field('Device ID','zkt_device_id',{value:z.zkt_device_id||'',ph:'e.g. ZKT-Office-01'})}</div>
            <div>${field('API key','zkt_api_key',{type:'password',value:z.zkt_api_key||'',ph:'Secret key'})}</div>
            <div>${field('Device IP (port-forwarded)','zkt_ip',{value:z.zkt_ip||'',ph:'e.g. 203.0.113.45'})}</div>
            <div>${field('Device port','zkt_port',{type:'number',value:z.zkt_port||'4370'})}</div>
          </div>
          <div class="mt-4 rounded-xl bg-slate-50 border border-slate-200/70 p-4">
            <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Setup</div>
            ${['Forward TCP port 4370 on your router to the ZKTeco device.','Enter the public IP + port above, with a Device ID and API key.','Save — punches sync automatically. Employee codes must match.']
              .map((t,i)=>`<div class="flex items-start gap-2 mb-1.5 last:mb-0"><span class="w-5 h-5 rounded-full bg-teal-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">${i+1}</span><span class="text-xs text-slate-600">${t}</span></div>`).join('')}
          </div>
        </div>
      </div>
      <div class="rounded-2xl border border-slate-200/70 bg-white shadow-sm p-5 mb-4">
        <div class="flex items-center justify-between mb-2"><div class="text-xs font-bold uppercase tracking-wider text-slate-400">Webhook URL</div><button class="text-[11px] font-semibold text-teal-600" id="${cid}-copyWh">Copy</button></div>
        <code class="block text-[11px] text-slate-600 break-all bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono">${esc(z.webhookUrl||'')}</code>
        ${z.zkt_last_sync?`<div class="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200/60 rounded-full px-2.5 py-1">✓ Last sync: ${esc(z.zkt_last_sync)}</div>`:`<div class="mt-3 inline-flex items-center gap-1.5 text-[11px] text-slate-400 bg-slate-100 rounded-full px-2.5 py-1">No sync yet</div>`}
      </div>
      ${canEdit?`<button class="${btnP}" id="${cid}-saveZkt">Save ZKTeco settings</button>`:''}`;
    const cp=document.getElementById(cid+'-copyWh');
    if(cp) cp.onclick=()=>{ try{ navigator.clipboard.writeText(z.webhookUrl||''); toast('Webhook URL copied','success'); }catch(e){ toast('Copy failed','error'); } };
    const sz=document.getElementById(cid+'-saveZkt');
    if(sz) sz.onclick=async()=>{
      const d=collectForm(zk);
      d.zkt_enabled=zk.querySelector('[name="zkt_enabled"]').checked?'1':'0';
      await API.call('saveZktSettings',d);
      toast('ZKTeco settings saved','success');
    };
  }

  const bb=document.getElementById(cid+'-backup');
  if(bb) bb.onclick=async()=>{
    bb.disabled=true; bb.innerHTML='<span class="spinner" style="border-color:rgba(13,148,136,.3);border-top-color:#0d9488"></span>';
    try{
      const r=await API.call('backupNow');
      document.getElementById(cid+'-backupMsg').innerHTML=`<span class="text-emerald-600 font-medium">✓ Backup created:</span> <span class="text-slate-600">${esc(r.name)}</span>`;
      toast('Backup created','success');
    }catch(e){ toast(e.message,'error'); }
    bb.disabled=false; bb.textContent='Backup Now';
  };

  /* TRACK 3: notifications card + message log */
  const nt=document.getElementById(cid+'-notif');
  if(nt&&window.Alerts){ nt.innerHTML=Alerts.notifHTML(s,canEdit); Alerts.initNotif(cid+'-notif',canEdit); }
  const ml=document.getElementById(cid+'-msglog');
  if(ml&&window.Alerts){
    Alerts.renderLog(ml);
    const rf=document.getElementById(cid+'-logRefresh');
    if(rf) rf.onclick=()=>Alerts.renderLog(ml);
  }

  if(canEdit){
    const perms=await API.call('listRolePermissions');
    const roles=Object.keys(perms);
    const pe=document.getElementById(cid+'-perms');
    pe.innerHTML=`<div class="overflow-x-auto"><table class="w-full text-sm">
      <thead><tr class="border-b border-slate-100">
        <th class="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Module</th>
        ${roles.map(r=>`<th class="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400 capitalize">${esc(r)}</th>`).join('')}
      </tr></thead><tbody class="divide-y divide-slate-50">
      ${MODULES.map(([mk,ml])=>`<tr class="hover:bg-teal-50/40">
        <td class="px-3 py-2.5 font-medium text-slate-700">${ml}</td>
        ${roles.map(r=>{ const p=(perms[r]||{})[mk]||{};
          return `<td class="px-3 py-2.5 text-center">
            <label class="inline-flex items-center gap-1 text-[11px] text-slate-500 mr-2"><input type="checkbox" data-r="${r}" data-m="${mk}" data-a="view" ${p.view?'checked':''} class="w-3.5 h-3.5 rounded accent-teal-600"> view</label>
            <label class="inline-flex items-center gap-1 text-[11px] text-slate-500"><input type="checkbox" data-r="${r}" data-m="${mk}" data-a="edit" ${p.edit?'checked':''} class="w-3.5 h-3.5 rounded accent-teal-600"> edit</label>
          </td>`;}).join('')}
      </tr>`).join('')}
      </tbody></table></div>`;
    document.getElementById(cid+'-savePerms').onclick=async()=>{
      const matrix={};
      pe.querySelectorAll('input[type="checkbox"]').forEach(x=>{
        matrix[x.dataset.r]=matrix[x.dataset.r]||{};
        matrix[x.dataset.r][x.dataset.m]=matrix[x.dataset.r][x.dataset.m]||{};
        matrix[x.dataset.r][x.dataset.m][x.dataset.a]=x.checked?1:0;
      });
      await API.call('saveRolePermissions',matrix);
      toast('Permissions saved — they apply on next sign-in','success');
    };
  }
};
})();
