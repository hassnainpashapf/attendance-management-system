/* 140_tenants.js — superadmin: tenant table, create-tenant modal, stats, impersonation.
   Verola premium style: breadcrumb header, KPI cards, premium table. */
(function(){
'use strict';

App.nav.push({group:'SYSTEM', path:'#/tenants', label:I18N.t('c4.nav.tenants'), labelKey:'c4.nav.tenants', icon:'tenants', perm:'tenants', superadmin:true});

/* ---------- Verola tokens (local copies) ---------- */
function txTen(k, fb){ const v=I18N.t(k); return (v===k||!v)?fb:v; }
function vTenAvatar(name){
  const init=(String(name||'?').trim().split(/\s+/).map(w=>w[0]).join('')||'?').slice(0,2).toUpperCase();
  return `<span class="w-8 h-8 rounded-full bg-slate-900 text-white text-[11px] font-bold inline-flex items-center justify-center shrink-0">${esc(init)}</span>`;
}
function vTenKpi(label, value, ico, sub){
  return `<div class="bg-white rounded-2xl border border-slate-200/70 p-5 shadow-[0_1px_3px_rgba(15,23,42,.04)]">
    <div class="flex items-center gap-2.5 mb-4">
      <span class="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">${ico}</span>
      <span class="text-[13px] text-slate-500 font-medium">${label}</span>
    </div>
    <div class="text-[26px] font-bold text-slate-900 tabular-nums tracking-tight">${value}</div>
    ${sub?`<div class="text-xs text-slate-400 mt-1.5">${sub}</div>`:''}
  </div>`;
}
const V_TEN_CMP='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><rect x="3.5" y="7" width="17" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M3.5 12h17"/></svg>';
const V_TEN_ACT='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>';
const V_TEN_TRI='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3 2"/></svg>';
const V_TEN_EMP='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.8-3 3-5 5.5-5s4.7 2 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.6c2 .6 3.2 2.3 3.7 4.4"/></svg>';
const V_TEN_PNC='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><path d="M7 3h10l-2 7h-6zM12 10v7M8.5 21h7"/></svg>';

App.routes['#/tenants'] = async (el)=>{
  if(Session.user.role!=='superadmin'){
    el.innerHTML=`<div class="flex items-center gap-2 text-[13px] text-slate-400 mb-4"><span class="text-base">⌂</span><span class="text-slate-700 font-semibold">${I18N.t('c4.nav.tenants')}</span></div>`+
    '<div class="bg-white rounded-2xl border border-slate-200/70 p-12 text-center text-slate-500">'+I18N.t('c4.ten.superadminOnly')+'</div>';
    return;
  }
  const cid=uid('ten');
  el.innerHTML=`
    <div class="flex items-center gap-2 text-[13px] text-slate-400 mb-4 anim-fadeUp">
      <span class="text-base">⌂</span><a href="#/dashboard" class="hover:text-slate-600">${I18N.t('c4.nav.dashboard')}</a><span>›</span><span class="text-slate-700 font-semibold">${I18N.t('c4.nav.tenants')}</span>
      <div class="ml-auto"><button class="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold shadow active:scale-[.98] transition" id="${cid}-add">+ ${I18N.t('c4.ten.createTenant')}</button></div>
    </div>
    <div id="${cid}-stats" class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-5"></div>
    <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.04)] overflow-hidden anim-fadeUp">
      <div class="flex flex-wrap items-center gap-2.5 p-4 border-b border-slate-100">
        <div class="relative flex-1 min-w-[180px] max-w-xs">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
          <input id="${cid}-q" placeholder="${I18N.t('c4.common.search')}..." class="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:outline-none">
        </div>
        <select id="${cid}-fStatus" class="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 focus:outline-none">
          <option value="all">▽ ${I18N.t('c4.common.all')}</option>
          <option value="active">${I18N.t('c4.common.active')}</option>
          <option value="trial">${I18N.t('c4.ten.trial')}</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>
      <div id="${cid}-body"></div>
    </div>`;
  const statsEl=document.getElementById(cid+'-stats');
  const body=document.getElementById(cid+'-body');
  const st={q:'', f:'all', rows:[]};

  function planBadge(p){
    return p==='Growth'?badge(p,'teal'):p==='Enterprise'?badge(p,'blue'):badge(p||'Starter','slate');
  }
  function statusBadge(s){
    return s==='active'?badge(I18N.t('c4.common.active'),'emerald')
      :s==='trial'?badge(I18N.t('c4.ten.trial'),'amber')
      :badge(s,'slate');
  }

  function render(){
    const q=st.q.trim().toLowerCase();
    const rows=st.rows.filter(t=>{
      if(q&&!(String(t.companyName+' '+t.loginCode).toLowerCase().includes(q))) return false;
      if(st.f!=='all'&&t.status!==st.f) return false;
      return true;
    });
    body.innerHTML=`<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b border-slate-100">
      ${[I18N.t('c4.ten.colCompany'),I18N.t('c4.ten.colPlan'),I18N.t('c4.common.status'),I18N.t('c4.ten.colUsers'),I18N.t('c4.nav.employees'),I18N.t('c4.ten.colCreated')].map((h,i)=>
        `<th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap ${i>=3?'text-right':''}">${h}</th>`).join('')}
      <th class="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">${txTen('c4.common.actions','')}</th></tr></thead>
      <tbody class="divide-y divide-slate-50">${rows.length?rows.map(t=>`
        <tr class="hover:bg-slate-50/70 transition-colors">
          <td class="px-4 py-3"><div class="flex items-center gap-2.5">${vTenAvatar(t.companyName)}
            <div><div class="font-medium text-slate-700 whitespace-nowrap">${esc(t.companyName)}</div>
            <div class="text-xs text-slate-400 font-mono">${I18N.t('c4.ten.codeLabel')} ${esc(t.loginCode)}</div></div></div></td>
          <td class="px-4 py-3">${planBadge(t.plan)}</td>
          <td class="px-4 py-3">${statusBadge(t.status)}</td>
          <td class="px-4 py-3 text-right tabular-nums font-medium text-slate-700">${fmtNum(t.users||0)}</td>
          <td class="px-4 py-3 text-right tabular-nums font-medium text-slate-700">${fmtNum(t.employees||0)}</td>
          <td class="px-4 py-3 text-right"><span class="tabular-nums text-slate-600">${fmtDate(t.createdAt)}</span></td>
          <td class="px-4 py-3 text-right"><div class="flex gap-1.5 justify-end">
            <button class="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50" data-imp="${t.tenantId}">${I18N.t('c4.ten.loginAs')}</button>
            <button class="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50" data-edit="${t.tenantId}">${I18N.t('c4.common.edit')}</button>
            <button class="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-red-600 hover:border-red-200 hover:bg-red-50" data-del="${t.tenantId}">${I18N.t('c4.common.delete')}</button></div></td>
        </tr>`).join(''):`<tr><td colspan="7" class="px-4 py-14 text-center"><div class="text-slate-300 text-3xl mb-2">◌</div><div class="text-sm text-slate-400">${I18N.t('c4.ten.emptyTenants')}</div></td></tr>`}
      </tbody></table></div>
      <div class="flex items-center px-4 py-3.5 border-t border-slate-100"><span class="text-xs text-slate-400">${txTen('c4.common.showingN','Showing {n} companies').replace('{n}',rows.length)}</span></div>`;
    body.querySelectorAll('[data-imp]').forEach(b=>b.onclick=async()=>{
      const r=await API.call('impersonate',b.dataset.imp);
      Session.savedUser=Session.user;
      Session.user={...r.user, token:r.token};
      Session.bootstrap=await API.call('getBootstrap');
      toast(I18N.t('c4.ten.impersonatingN').replace('{name}',r.user.name),'info');
      location.hash='#/dashboard'; App.boot();
    });
    body.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{
      const t=st.rows.find(x=>x.tenantId===b.dataset.edit);
      const m=modal(I18N.t('c4.ten.editTenantTitle'),`
        ${field(I18N.t('c4.ten.fCompanyName'),'companyName',{value:t.companyName,req:true})}
        <div class="grid grid-cols-2 gap-4 mt-4">
          ${field(I18N.t('c4.ten.fPlan'),'plan',{type:'select',value:t.plan,options:[{value:'Starter',label:'Starter'},{value:'Growth',label:'Growth'},{value:'Enterprise',label:'Enterprise'}]})}
          ${field(I18N.t('c4.ten.fStatus'),'status',{type:'select',value:t.status,options:[{value:'trial',label:'Trial'},{value:'active',label:'Active'},{value:'suspended',label:'Suspended'}]})}
        </div>
        <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="tCancel">${I18N.t('c4.common.cancel')}</button><button class="${btnP}" id="tSave">${I18N.t('c4.common.save')}</button></div>`);
      m.el.querySelector('#tCancel').onclick=()=>m.close();
      m.el.querySelector('#tSave').onclick=async()=>{
        await API.call('updateTenant',t.tenantId,collectForm(m.el)); m.close(); toast(I18N.t('c4.ten.tenantUpdated'),'success'); load();
      };
    });
    body.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
      if(!await confirmDlg(I18N.t('c4.ten.delTenantTitle'),I18N.t('c4.ten.delTenantMsg'),I18N.t('c4.common.delete'))) return;
      await API.call('deleteTenant',b.dataset.del); toast(I18N.t('c4.ten.tenantDeleted'),'success'); load();
    });
  }

  async function load(){
    statsEl.innerHTML=Array.from({length:5},()=>'<div class="bg-white rounded-2xl border border-slate-200/70 p-5"><div class="h-9 w-9 rounded-xl bg-slate-100 shimmer mb-4"></div><div class="h-8 bg-slate-100 rounded-lg w-2/3 shimmer mb-2"></div><div class="h-3 bg-slate-100 rounded-full w-1/2 shimmer"></div></div>').join('');
    const [stats, rows]=await Promise.all([
      API.call('getPlatformStats'),
      API.call('listTenants')
    ]);
    st.rows=rows;
    statsEl.innerHTML=
      vTenKpi(I18N.t('c4.ten.kpiTenants'),fmtNum(stats.tenants),V_TEN_CMP,I18N.t('c4.ten.kpiTenantsSub'))+
      vTenKpi(I18N.t('c4.common.active'),fmtNum(stats.active),V_TEN_ACT,I18N.t('c4.ten.kpiActiveSub'))+
      vTenKpi(I18N.t('c4.ten.kpiTrial'),fmtNum(stats.trial),V_TEN_TRI,I18N.t('c4.ten.kpiTrialSub'))+
      vTenKpi(I18N.t('c4.nav.employees'),fmtNum(stats.totalEmployees),V_TEN_EMP,I18N.t('c4.ten.kpiEmpsSub'))+
      vTenKpi(I18N.t('c4.ten.kpiPunches'),fmtNum(stats.totalPunches),V_TEN_PNC,I18N.t('c4.ten.kpiPunchesSub'));
    animateCounters(statsEl);
    render();
  }
  document.getElementById(cid+'-add').onclick=()=>{
    const m=modal(I18N.t('c4.ten.createTenantTitle'),`
      <p class="text-sm text-slate-500 mb-4">${I18N.t('c4.ten.createTenantHelp')}</p>
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2">${field(I18N.t('c4.ten.fCompanyName'),'companyName',{req:true,ph:'e.g. Sunrise Builders'})}</div>
        ${field(I18N.t('c4.ten.fPlan'),'plan',{type:'select',options:[{value:'Starter',label:'Starter'},{value:'Growth',label:'Growth'},{value:'Enterprise',label:'Enterprise'}]})}
        ${field(I18N.t('c4.ten.fAdminName'),'adminName',{req:true})}
        ${field(I18N.t('c4.ten.fAdminUser'),'adminUser',{req:true,ph:'admin'})}
        ${field(I18N.t('c4.ten.fAdminPass'),'adminPass',{type:'password',req:true})}
      </div>
      <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="tCancel">${I18N.t('c4.common.cancel')}</button><button class="${btnP}" id="tGo">${I18N.t('c4.ten.createTenantBtn')}</button></div>`);
    m.el.querySelector('#tCancel').onclick=()=>m.close();
    m.el.querySelector('#tGo').onclick=async()=>{
      const d=collectForm(m.el);
      if(!d.companyName||!d.adminName||!d.adminUser||!d.adminPass){ toast(I18N.t('c4.ten.fillAll'),'warn'); return; }
      const t=await API.call('createTenant',d.companyName,d.plan,d.adminName,d.adminUser,d.adminPass);
      m.close(); toast(I18N.t('c4.ten.tenantCreated').replace('{company}',d.companyName).replace('{code}',t.loginCode),'success'); load();
    };
  };
  document.getElementById(cid+'-q').oninput=debounce(e=>{ st.q=e.target.value; render(); },300);
  document.getElementById(cid+'-fStatus').onchange=e=>{ st.f=e.target.value; render(); };
  await load();
};
})();
