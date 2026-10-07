/* 40_employees.js — employee table, add/edit modal, device bind/unbind,
   CSV import, departments tab. Verola premium styling. */
(function(){
'use strict';

App.nav.push({group:'WORKFORCE', path:'#/employees', label:I18N.t('c4.nav.employees'), labelKey:'c4.nav.employees', icon:'employees', perm:'employees'});

/* Verola tokens (local) */
const vBtnB='px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold shadow active:scale-[.98] transition';
const vBtnBs='px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold active:scale-[.98] transition';
const vBtnSx='px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-600 active:scale-[.98] transition shadow-sm';
function vHead(title, actions){
  return `<div class="flex items-center gap-2 text-[13px] text-slate-400 mb-4 anim-fadeUp"><span class="text-base">⌂</span><a href="#/dashboard" class="hover:text-slate-600">${I18N.t('c4.nav.dashboard')||'Dashboard'}</a><span>›</span><span class="text-slate-700 font-semibold">${title}</span></div>
  <div class="flex flex-wrap items-center justify-between gap-3 mb-5 anim-fadeUp"><div><h1 class="font-display text-[26px] font-bold text-slate-800 tracking-tight">${title}</h1><p class="text-sm text-slate-400 mt-1">${I18N.t('c4.emp.sub')}</p></div><div class="flex gap-2 flex-wrap">${actions||''}</div></div>`;
}
function vAvatar(name){
  const init=(String(name||'?').trim().split(/\s+/).map(w=>w[0]).join('')||'?').slice(0,2).toUpperCase();
  return `<span class="w-8 h-8 rounded-full bg-slate-200 text-slate-500 text-[11px] font-bold inline-flex items-center justify-center shrink-0">${esc(init)}</span>`;
}
function vBadge(ok, yesTxt, noTxt){
  return ok
    ?`<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 whitespace-nowrap"><span class="text-[10px]">✓</span>${yesTxt}</span>`
    :`<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 ring-1 ring-slate-200 whitespace-nowrap"><span class="text-[10px]">–</span>${noTxt}</span>`;
}
function vSearch(cid, ph){
  return `<div class="relative w-full max-w-sm mb-4"><span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span><input id="${cid}-q" placeholder="${ph}" class="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:outline-none"></div>`;
}
const vTab=(href,label,on)=>`<a href="${href}" class="px-4 py-2 rounded-xl text-sm font-semibold transition ${on?'bg-slate-900 text-white shadow':'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'}">${label}</a>`;

App.routes['#/employees'] = async (el, params)=>{
  const cid=uid('emp');
  const tab=(params&&params.tab)||'list';
  el.innerHTML=vHead(I18N.t('c4.nav.employees'),
    `${perm('employees','edit')?`<button class="${btnS}" id="${cid}-import">${I18N.t('c4.emp.importCsv')}</button><button class="${vBtnB}" id="${cid}-add">${I18N.t('c4.emp.addEmployee')}</button>`:''}`)+
  `<div class="flex gap-2 mb-5">
    ${vTab('#/employees',I18N.t('c4.emp.tabEmployees'),tab==='list')}
    ${vTab('#/employees?tab=departments',I18N.t('c4.emp.tabDepartments'),tab==='departments')}
  </div>
  ${vSearch(cid, I18N.t('c4.emp.searchPh'))}
  <div id="${cid}-body"></div>`;

  const body=document.getElementById(cid+'-body');
  let emps=[], depts=[];
  async function load(){
    emps=await API.call('listEmployees');
    depts=await API.call('listDepartments');
    render();
  }
  function render(){
    const q=(document.getElementById(cid+'-q').value||'').toLowerCase();
    if(tab==='departments'){
      body.innerHTML=(perm('employees','edit')?`<div class="flex justify-end mb-3"><button class="${vBtnB}" id="${cid}-addDept">${I18N.t('c4.emp.addDept')}</button></div>`:'')+tableHTML([
        {label:I18N.t('c4.emp.colDepartment'), get:d=>`<div class="flex items-center gap-3">${vAvatar(d.name)}<span class="font-semibold text-slate-700">${esc(d.name)}</span></div>`},
        {label:I18N.t('c4.emp.colHeadcount'), num:1, get:d=>fmtNum(d.headcount)},
        {label:'', get:d=>perm('employees','edit')?`<div class="flex gap-1 justify-end"><button class="${vBtnSx}" data-ed="${d.id}">${I18N.t('c4.common.edit')}</button><button class="${vBtnSx} !text-red-600" data-del="${d.id}">${I18N.t('c4.common.delete')}</button></div>`:''},
      ], depts.filter(d=>d.name.toLowerCase().includes(q)), {empty:I18N.t('c4.emp.emptyDepts')});
      if(perm('employees','edit')){
        const addD=document.getElementById(cid+'-addDept');
        if(addD) addD.onclick=()=>{
          const m=modal(I18N.t('c4.emp.addDeptTitle'), `${field(I18N.t('c4.emp.deptName'),'name',{req:true})}<div class="flex justify-end gap-2 mt-5"><button class="${btnS}" id="dCancel">${I18N.t('c4.common.cancel')}</button><button class="${vBtnB}" id="dSave">${I18N.t('c4.common.save')}</button></div>`);
          m.el.querySelector('#dCancel').onclick=()=>m.close();
          m.el.querySelector('#dSave').onclick=async()=>{ const nm=formVal(m.el,'name'); if(!nm){toast(I18N.t('c4.emp.nameRequired'),'warn');return;} await API.call('saveDepartment',{name:nm}); m.close(); toast(I18N.t('c4.emp.deptSaved'),'success'); load(); };
        };
        body.querySelectorAll('[data-ed]').forEach(b=>b.onclick=async()=>{
          const d=depts.find(x=>x.id===b.dataset.ed);
          const m=modal(I18N.t('c4.emp.editDeptTitle'), `${field(I18N.t('c4.emp.deptName'),'name',{value:d.name,req:true})}<div class="flex justify-end gap-2 mt-5"><button class="${btnS}" id="dCancel">${I18N.t('c4.common.cancel')}</button><button class="${vBtnB}" id="dSave">${I18N.t('c4.common.save')}</button></div>`);
          m.el.querySelector('#dCancel').onclick=()=>m.close();
          m.el.querySelector('#dSave').onclick=async()=>{ await API.call('saveDepartment',{id:d.id,name:formVal(m.el,'name')}); m.close(); toast(I18N.t('c4.emp.deptSaved'),'success'); load(); };
        });
        body.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
          if(!await confirmDlg(I18N.t('c4.emp.delDeptTitle'),I18N.t('c4.emp.cannotUndo'),I18N.t('c4.common.delete'))) return;
          try{ await API.call('deleteDepartment',b.dataset.del); toast(I18N.t('c4.emp.deleted'),'success'); load(); }catch(e){ toast(e.message,'error'); }
        });
      }
      return;
    }
    const rows=emps.filter(e=>(e.name+' '+e.code+' '+(e.phone||'')).toLowerCase().includes(q));
    body.innerHTML=tableHTML([
      {label:I18N.t('c4.emp.colEmployee'), get:e=>`<div class="flex items-center gap-3">${vAvatar(e.name)}<div><div class="font-semibold text-slate-700">${esc(e.name)}</div><div class="text-xs text-slate-400">${esc(e.code)} · ${esc(e.designation||'—')}</div></div></div>`},
      {label:I18N.t('c4.emp.colDepartment'), get:e=>`<span class="text-slate-600">${esc(e.department||'—')}</span>`},
      {label:I18N.t('c4.emp.colPhone'), get:e=>`<span class="text-slate-600">${esc(e.phone||'—')}</span>`},
      {label:I18N.t('c4.emp.colSalary'), num:1, get:e=>`<span class="tabular-nums font-medium text-slate-700">${fmt(e.salary)}</span>`},
      {label:I18N.t('c4.emp.colDevice'), get:e=>e.deviceId?`<span class="font-mono text-xs bg-slate-100 px-2 py-1 rounded-lg text-slate-600">${esc(e.deviceId)}</span>`:'<span class="text-slate-300 text-xs">'+I18N.t('c4.emp.notBound')+'</span>'},
      {label:I18N.t('c4.common.status'), get:e=>vBadge(e.active, I18N.t('c4.common.active'), I18N.t('c4.common.inactive'))},
      {label:'', get:e=>perm('employees','edit')?`<div class="flex gap-1 justify-end">
        <button class="${vBtnSx}" data-edit="${e.id}">${I18N.t('c4.common.edit')}</button>
        <button class="${vBtnSx}" data-dev="${e.id}">${e.deviceId?I18N.t('c4.common.unbind'):I18N.t('c4.common.bind')}</button>
        <button class="${vBtnSx} !text-red-600" data-del="${e.id}">${I18N.t('c4.common.delete')}</button></div>`:''},
    ], rows, {empty:I18N.t('c4.emp.emptyEmps')});
    bindRow();
  }
  function bindRow(){
    body.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEditor(emps.find(e=>e.id===b.dataset.edit)));
    body.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
      if(!await confirmDlg(I18N.t('c4.emp.delEmpTitle'),I18N.t('c4.emp.delEmpMsg'),I18N.t('c4.common.delete'))) return;
      await API.call('deleteEmployee',b.dataset.del); toast(I18N.t('c4.emp.empDeleted'),'success'); load();
    });
    body.querySelectorAll('[data-dev]').forEach(b=>b.onclick=async()=>{
      const e=emps.find(x=>x.id===b.dataset.dev);
      if(e.deviceId){
        await API.call('unbindDevice',e.id); toast(I18N.t('c4.emp.deviceUnbound'),'success'); load();
      }else{
        const m=modal(I18N.t('c4.emp.bindTitle'),`<p class="text-sm text-slate-500 mb-4">${I18N.t('c4.emp.bindMsg').replace('{name}',esc(e.name))}</p>
          ${field(I18N.t('c4.emp.fDeviceId'),'deviceId',{ph:'ZK-1001',req:true})}
          <div class="flex justify-end gap-2 mt-5"><button class="${btnS}" id="dCancel">${I18N.t('c4.common.cancel')}</button><button class="${vBtnB}" id="dSave">${I18N.t('c4.common.bind')}</button></div>`);
        m.el.querySelector('#dCancel').onclick=()=>m.close();
        m.el.querySelector('#dSave').onclick=async()=>{
          await API.call('bindDevice',e.id,formVal(m.el,'deviceId')); m.close(); toast(I18N.t('c4.emp.deviceBound'),'success'); load();
        };
      }
    });
  }
  function openEditor(e){
    const isNew=!e; e=e||{name:'',code:'',departmentId:'d1',designation:'',phone:'',email:'',salary:0,joinDate:todayISO(),active:true};
    const m=modal(isNew?I18N.t('c4.emp.addEmpTitle'):I18N.t('c4.emp.editEmpTitle'),`
      <div class="flex items-center gap-4 mb-5 p-4 rounded-2xl bg-slate-50 border border-slate-200/60">
        ${vAvatar(e.name||'?')}
        <div><div class="font-bold text-slate-800">${isNew?I18N.t('c4.emp.addEmpTitle'):esc(e.name)}</div><div class="text-xs text-slate-400">${isNew?I18N.t('c4.emp.sub'):esc(e.code||'')}</div></div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        ${field(I18N.t('c4.emp.fFullName'),'name',{value:e.name,req:true})}
        ${field(I18N.t('c4.emp.fEmpCode'),'code',{value:e.code,ph:'EMP-011'})}
        ${field(I18N.t('c4.emp.colDepartment'),'departmentId',{type:'select',value:e.departmentId,options:depts.map(d=>({value:d.id,label:d.name}))})}
        ${field(I18N.t('c4.emp.fDesignation'),'designation',{value:e.designation||''})}
        ${field(I18N.t('c4.emp.fPhone'),'phone',{value:e.phone||'',ph:'0300-0000000'})}
        ${field(I18N.t('c4.emp.fEmail'),'email',{value:e.email||'',type:'email'})}
        ${field(I18N.t('c4.emp.fSalary'),'salary',{value:e.salary||0,type:'number',min:0})}
        ${field(I18N.t('c4.emp.fJoinDate'),'joinDate',{value:e.joinDate||todayISO(),type:'date'})}
        <div class="col-span-2">${field(I18N.t('c4.emp.fActive'),'active',{type:'checkbox',value:e.active})}</div>
      </div>
      <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="eCancel">${I18N.t('c4.common.cancel')}</button><button class="${vBtnB}" id="eSave">${I18N.t('c4.emp.saveEmployee')}</button></div>`,{wide:true});
    m.el.querySelector('#eCancel').onclick=()=>m.close();
    m.el.querySelector('#eSave').onclick=async()=>{
      const data=collectForm(m.el);
      if(!data.name){ toast(I18N.t('c4.emp.nameIsRequired'),'warn'); return; }
      await API.call('saveEmployee',{...(isNew?{}:{id:e.id}),...data});
      m.close(); toast(I18N.t('c4.emp.empSaved'),'success'); load();
    };
  }
  const addB=document.getElementById(cid+'-add'); if(addB) addB.onclick=()=>openEditor(null);
  const impB=document.getElementById(cid+'-import');
  if(impB) impB.onclick=()=>{
    const m=modal(I18N.t('c4.emp.importTitle'),`
      <p class="text-sm text-slate-500 mb-3">${I18N.t('c4.emp.importHelp')}<code class="bg-slate-100 px-1 rounded">name,code,designation,phone,email,salary,joinDate</code></p>
      <input type="file" id="csvFile" accept=".csv" class="text-sm mb-4">
      <div class="flex justify-end gap-2"><button class="${btnS}" id="iCancel">${I18N.t('c4.common.cancel')}</button><button class="${vBtnB}" id="iGo">${I18N.t('c4.common.import')}</button></div>`);
    m.el.querySelector('#iCancel').onclick=()=>m.close();
    m.el.querySelector('#iGo').onclick=()=>{
      const f=m.el.querySelector('#csvFile').files[0];
      if(!f){ toast(I18N.t('c4.emp.chooseCsv'),'warn'); return; }
      const rd=new FileReader();
      rd.onload=async()=>{
        try{
          const lines=String(rd.result).split(/\r?\n/).filter(l=>l.trim());
          const heads=lines[0].split(',').map(h=>h.trim().toLowerCase());
          const rows=lines.slice(1).map(l=>{ const cells=l.split(','); const o={}; heads.forEach((h2,i)=>o[h2]=(cells[i]||'').trim()); return o; });
          const r=await API.call('importEmployeesCSV',rows);
          m.close(); toast(I18N.t('c4.emp.importedN').replace('{n}',r.imported),'success'); load();
        }catch(e2){ toast(e2.message,'error'); }
      };
      rd.readAsText(f);
    };
  };
  document.getElementById(cid+'-q').addEventListener('input',debounce(render,200));
  await load();
};
})();
