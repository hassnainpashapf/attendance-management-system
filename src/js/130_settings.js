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
  el.innerHTML=pageHead('Settings','Company profile, notifications and access control')+`
  <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
    <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6">
      <h3 class="font-display font-bold text-slate-800 mb-1">Company profile</h3>
      <p class="text-sm text-slate-400 mb-5">Shown on logins, payslips and reports.</p>
      <div id="${cid}-profile"></div>
    </div>
    <div class="space-y-4">
      <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6">
        <h3 class="font-display font-bold text-slate-800 mb-1">Email notifications (SMTP)</h3>
        <p class="text-sm text-slate-400 mb-5">Used for leave decisions, expiring documents and payroll alerts.</p>
        <div id="${cid}-smtp"></div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6">
        <h3 class="font-display font-bold text-slate-800 mb-1">Sign-in options</h3>
        <div class="flex items-start gap-3 mt-4">
          <div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">G</div>
          <div class="text-sm"><div class="font-semibold text-slate-700">Sign in with Google</div>
          <div class="text-slate-400 text-xs mt-1">In production, admins can link their Google Workspace account for one-click sign-in. Enable it from the Apps Script project settings, then toggle it here.</div></div>
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6">
        <h3 class="font-display font-bold text-slate-800 mb-1">Backup</h3>
        <p class="text-sm text-slate-400 mb-4">Save a copy of the company spreadsheet to Google Drive.</p>
        <button class="${btnS}" id="${cid}-backup">Backup Now</button>
        <div id="${cid}-backupMsg" class="mt-3 text-sm"></div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6">
        <h3 class="font-display font-bold text-slate-800 mb-1">${I18N.t('t3.notifications')}</h3>
        <p class="text-sm text-slate-400 mb-5">${I18N.t('t3.notifSub')}</p>
        <div id="${cid}-notif"></div>
      </div>
    </div>
  </div>
  ${canEdit?`<div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6 mt-4">
    <div class="flex items-center justify-between mb-1">
      <h3 class="font-display font-bold text-slate-800">${I18N.t('t3.logTitle')}</h3>
      <button class="${btnS} !py-1.5 !text-xs" id="${cid}-logRefresh">${I18N.t('t3.refresh')}</button>
    </div>
    <p class="text-sm text-slate-400 mb-5">${I18N.t('t3.logSub')}</p>
    <div id="${cid}-msglog"></div>
  </div>`:''}
  ${canEdit?`<div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6 mt-4">
    <h3 class="font-display font-bold text-slate-800 mb-1">Role permissions</h3>
    <p class="text-sm text-slate-400 mb-5">Control which roles can view or edit each module.</p>
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
