/* 140_tenants.js — superadmin: tenant table, create-tenant modal, stats, impersonation. */
(function(){
'use strict';

App.nav.push({group:'SYSTEM', path:'#/tenants', label:'Tenants', icon:'tenants', perm:'tenants', superadmin:true});

App.routes['#/tenants'] = async (el)=>{
  if(Session.user.role!=='superadmin'){
    el.innerHTML=pageHead('Tenants','')+'<div class="bg-white rounded-2xl border border-slate-200/70 p-12 text-center text-slate-500">Superadmin access only.</div>';
    return;
  }
  const cid=uid('ten');
  el.innerHTML=pageHead('Tenants','All companies on the platform',
    `<button class="${btnP}" id="${cid}-add">+ Create Tenant</button>`)+
  `<div id="${cid}-stats" class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-5"></div>
   <div id="${cid}-body"></div>`;
  const statsEl=document.getElementById(cid+'-stats');
  const body=document.getElementById(cid+'-body');

  async function load(){
    const stats=await API.call('getPlatformStats');
    const rows=await API.call('listTenants');
    statsEl.innerHTML=
      statCard('Tenants',fmtNum(stats.tenants),'Total companies','teal',App.ICONS.tenants,stats.tenants)+
      statCard('Active',fmtNum(stats.active),'Paying / live','emerald',App.ICONS.tenants,stats.active)+
      statCard('Trial',fmtNum(stats.trial),'In trial','amber',App.ICONS.tenants,stats.trial)+
      statCard('Employees',fmtNum(stats.totalEmployees),'Across tenants','blue',App.ICONS.employees,stats.totalEmployees)+
      statCard('Punches',fmtNum(stats.totalPunches),'All time','violet',App.ICONS.punch,stats.totalPunches);
    animateCounters(statsEl);
    body.innerHTML=tableHTML([
      {label:'Company', get:t=>`<div><div class="font-semibold text-slate-700">${esc(t.companyName)}</div><div class="text-xs text-slate-400 font-mono">Code: ${esc(t.loginCode)}</div></div>`},
      {label:'Plan', get:t=>badge(t.plan||'Starter', t.plan==='Growth'?'teal':'slate')},
      {label:'Status', get:t=>t.status==='active'?badge('Active','emerald'):t.status==='trial'?badge('Trial','amber'):badge(t.status,'slate')},
      {label:'Users', num:1, get:t=>fmtNum(t.users||0)},
      {label:'Employees', num:1, get:t=>fmtNum(t.employees||0)},
      {label:'Created', get:t=>fmtDate(t.createdAt)},
      {label:'', get:t=>`<div class="flex gap-1 justify-end">
        <button class="${btnS} !px-3 !py-1.5 !text-xs" data-imp="${t.tenantId}">Login as</button>
        <button class="${btnS} !px-3 !py-1.5 !text-xs" data-edit="${t.tenantId}">Edit</button>
        <button class="${btnS} !px-3 !py-1.5 !text-xs !text-red-600" data-del="${t.tenantId}">Delete</button></div>`},
    ], rows, {empty:'No tenants yet.'});
    body.querySelectorAll('[data-imp]').forEach(b=>b.onclick=async()=>{
      const r=await API.call('impersonate',b.dataset.imp);
      Session.savedUser=Session.user;
      Session.user={...r.user, token:r.token};
      Session.bootstrap=await API.call('getBootstrap');
      toast('Impersonating '+r.user.name,'info');
      location.hash='#/dashboard'; App.boot();
    });
    body.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{
      const t=rows.find(x=>x.tenantId===b.dataset.edit);
      const m=modal('Edit Tenant',`
        ${field('Company name','companyName',{value:t.companyName,req:true})}
        <div class="grid grid-cols-2 gap-4 mt-4">
          ${field('Plan','plan',{type:'select',value:t.plan,options:[{value:'Starter',label:'Starter'},{value:'Growth',label:'Growth'},{value:'Enterprise',label:'Enterprise'}]})}
          ${field('Status','status',{type:'select',value:t.status,options:[{value:'trial',label:'Trial'},{value:'active',label:'Active'},{value:'suspended',label:'Suspended'}]})}
        </div>
        <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="tCancel">Cancel</button><button class="${btnP}" id="tSave">Save</button></div>`);
      m.el.querySelector('#tCancel').onclick=()=>m.close();
      m.el.querySelector('#tSave').onclick=async()=>{
        await API.call('updateTenant',t.tenantId,collectForm(m.el)); m.close(); toast('Tenant updated','success'); load();
      };
    });
    body.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
      if(!await confirmDlg('Delete tenant?','The company, its users and all data will be removed. This cannot be undone.','Delete')) return;
      await API.call('deleteTenant',b.dataset.del); toast('Tenant deleted','success'); load();
    });
  }
  document.getElementById(cid+'-add').onclick=()=>{
    const m=modal('Create Tenant',`
      <p class="text-sm text-slate-500 mb-4">Provisions a new spreadsheet, seeds all tabs, creates the admin user and registers the login code.</p>
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2">${field('Company name','companyName',{req:true,ph:'e.g. Sunrise Builders'})}</div>
        ${field('Plan','plan',{type:'select',options:[{value:'Starter',label:'Starter'},{value:'Growth',label:'Growth'},{value:'Enterprise',label:'Enterprise'}]})}
        ${field('Admin full name','adminName',{req:true})}
        ${field('Admin username','adminUser',{req:true,ph:'admin'})}
        ${field('Admin password','adminPass',{type:'password',req:true})}
      </div>
      <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="tCancel">Cancel</button><button class="${btnP}" id="tGo">Create tenant</button></div>`);
    m.el.querySelector('#tCancel').onclick=()=>m.close();
    m.el.querySelector('#tGo').onclick=async()=>{
      const d=collectForm(m.el);
      if(!d.companyName||!d.adminName||!d.adminUser||!d.adminPass){ toast('Fill all fields','warn'); return; }
      const t=await API.call('createTenant',d.companyName,d.plan,d.adminName,d.adminUser,d.adminPass);
      m.close(); toast('Tenant "'+d.companyName+'" created — login code '+t.loginCode,'success'); load();
    };
  };
  await load();
};
})();
