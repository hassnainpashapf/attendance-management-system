/* 140_tenants.js — superadmin: tenant table, create-tenant modal, stats, impersonation. */
(function(){
'use strict';

App.nav.push({group:'SYSTEM', path:'#/tenants', label:I18N.t('c4.nav.tenants'), labelKey:'c4.nav.tenants', icon:'tenants', perm:'tenants', superadmin:true});

App.routes['#/tenants'] = async (el)=>{
  if(Session.user.role!=='superadmin'){
    el.innerHTML=pageHead(I18N.t('c4.nav.tenants'),'')+'<div class="bg-white rounded-2xl border border-slate-200/70 p-12 text-center text-slate-500">'+I18N.t('c4.ten.superadminOnly')+'</div>';
    return;
  }
  const cid=uid('ten');
  el.innerHTML=pageHead(I18N.t('c4.nav.tenants'),I18N.t('c4.ten.sub'),
    `<button class="${btnP}" id="${cid}-add">${I18N.t('c4.ten.createTenant')}</button>`)+
  `<div id="${cid}-stats" class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-5"></div>
   <div id="${cid}-body"></div>`;
  const statsEl=document.getElementById(cid+'-stats');
  const body=document.getElementById(cid+'-body');

  async function load(){
    const [stats, rows]=await Promise.all([
      API.call('getPlatformStats'),
      API.call('listTenants')
    ]);
    statsEl.innerHTML=
      statCard(I18N.t('c4.ten.kpiTenants'),fmtNum(stats.tenants),I18N.t('c4.ten.kpiTenantsSub'),'teal',App.ICONS.tenants,stats.tenants)+
      statCard(I18N.t('c4.common.active'),fmtNum(stats.active),I18N.t('c4.ten.kpiActiveSub'),'emerald',App.ICONS.tenants,stats.active)+
      statCard(I18N.t('c4.ten.trial'),fmtNum(stats.trial),I18N.t('c4.ten.kpiTrialSub'),'amber',App.ICONS.tenants,stats.trial)+
      statCard(I18N.t('c4.nav.employees'),fmtNum(stats.totalEmployees),I18N.t('c4.ten.kpiEmpsSub'),'blue',App.ICONS.employees,stats.totalEmployees)+
      statCard(I18N.t('c4.ten.kpiPunches'),fmtNum(stats.totalPunches),I18N.t('c4.ten.kpiPunchesSub'),'violet',App.ICONS.punch,stats.totalPunches);
    animateCounters(statsEl);
    body.innerHTML=tableHTML([
      {label:I18N.t('c4.ten.colCompany'), get:t=>`<div><div class="font-semibold text-slate-700">${esc(t.companyName)}</div><div class="text-xs text-slate-400 font-mono">${I18N.t('c4.ten.codeLabel')} ${esc(t.loginCode)}</div></div>`},
      {label:I18N.t('c4.ten.colPlan'), get:t=>badge(t.plan||'Starter', t.plan==='Growth'?'teal':'slate')},
      {label:I18N.t('c4.common.status'), get:t=>t.status==='active'?badge(I18N.t('c4.common.active'),'emerald'):t.status==='trial'?badge(I18N.t('c4.ten.trial'),'amber'):badge(t.status,'slate')},
      {label:I18N.t('c4.ten.colUsers'), num:1, get:t=>fmtNum(t.users||0)},
      {label:I18N.t('c4.nav.employees'), num:1, get:t=>fmtNum(t.employees||0)},
      {label:I18N.t('c4.ten.colCreated'), get:t=>fmtDate(t.createdAt)},
      {label:'', get:t=>`<div class="flex gap-1 justify-end">
        <button class="${btnS} !px-3 !py-1.5 !text-xs" data-imp="${t.tenantId}">${I18N.t('c4.ten.loginAs')}</button>
        <button class="${btnS} !px-3 !py-1.5 !text-xs" data-edit="${t.tenantId}">${I18N.t('c4.common.edit')}</button>
        <button class="${btnS} !px-3 !py-1.5 !text-xs !text-red-600" data-del="${t.tenantId}">${I18N.t('c4.common.delete')}</button></div>`},
    ], rows, {empty:I18N.t('c4.ten.emptyTenants')});
    body.querySelectorAll('[data-imp]').forEach(b=>b.onclick=async()=>{
      const r=await API.call('impersonate',b.dataset.imp);
      Session.savedUser=Session.user;
      Session.user={...r.user, token:r.token};
      Session.bootstrap=await API.call('getBootstrap');
      toast(I18N.t('c4.ten.impersonatingN').replace('{name}',r.user.name),'info');
      location.hash='#/dashboard'; App.boot();
    });
    body.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{
      const t=rows.find(x=>x.tenantId===b.dataset.edit);
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
  await load();
};
})();
