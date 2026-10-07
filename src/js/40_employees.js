/* 40_employees.js — employee table, add/edit modal, device bind/unbind,
   CSV import, departments tab. Verola premium styling (pixel-perfect). */
(function(){
'use strict';

App.nav.push({group:'WORKFORCE', path:'#/employees', label:I18N.t('c4.nav.employees'), labelKey:'c4.nav.employees', icon:'employees', perm:'employees'});

/* one-time document click closes any open "..." menus */
if(!window._vactDocBound){ window._vactDocBound=true; document.addEventListener('click', ()=>{ document.querySelectorAll('.vact-menu').forEach(m=>m.remove()); }); }
function closeVactMenus(){ document.querySelectorAll('.vact-menu').forEach(m=>m.remove()); }

const SEARCH_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="w-4 h-4"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';

App.routes['#/employees'] = async (el, params)=>{
  const cid=uid('emp');
  const tab=(params&&params.tab)||'list';
  const canEdit=perm('employees','edit');
  const T=k=>I18N.t(k);
  el.innerHTML=pageHead(T('c4.nav.employees'), T('c4.emp.sub'),
    `${canEdit?`<button class="${btnS}" id="${cid}-import">${T('c4.emp.importCsv')}</button><button class="${btnP}" id="${cid}-add">${T('c4.emp.addEmployee')}</button>`:''}`)+
  `<div class="flex gap-2 mb-5">
    <a href="#/employees" class="px-4 py-2 rounded-xl text-sm font-semibold transition ${tab==='list'?'bg-slate-900 text-white shadow':'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'}">${T('c4.emp.tabEmployees')}</a>
    <a href="#/employees?tab=departments" class="px-4 py-2 rounded-xl text-sm font-semibold transition ${tab==='departments'?'bg-slate-900 text-white shadow':'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'}">${T('c4.emp.tabDepartments')}</a>
  </div>
  <div id="${cid}-filters"></div>
  <div id="${cid}-body"></div>`;

  const body=document.getElementById(cid+'-body');
  const filtersEl=document.getElementById(cid+'-filters');
  let emps=[], depts=[];
  let q='', statusF='all', deptF='all', page=1, filteredTotal=0;
  const PER=10;

  async function load(){
    emps=await API.call('listEmployees');
    depts=await API.call('listDepartments');
    renderFilters();
    render();
  }

  /* Verola filter row: search + status pills + department pill-select */
  function renderFilters(){
    if(tab!=='list'){ filtersEl.innerHTML=''; return; }
    const pills=[['all',T('c4.emp.allStatus')||'All Status'],['active',T('c4.common.active')],['inactive',T('c4.common.inactive')]];
    filtersEl.innerHTML=`<div class="flex flex-wrap items-center gap-2.5 mb-4 anim-fadeUp">
      <div class="relative">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">${SEARCH_SVG}</span>
        <input id="${cid}-q" placeholder="${esc(T('c4.emp.searchPh'))}" value="${esc(q)}" class="bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none transition w-56">
      </div>
      ${pills.map(([k,l])=>`<button data-sf="${k}" class="px-4 py-2.5 rounded-xl text-sm font-medium transition ${statusF===k?'bg-slate-900 text-white shadow':'bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'}">${esc(l)}</button>`).join('')}
      <select id="${cid}-deptF" class="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-medium text-slate-600 hover:border-slate-300 focus:border-slate-400 focus:outline-none cursor-pointer transition">
        <option value="all">${esc(T('c4.emp.allDepts')||'All Departments')}</option>
        ${depts.map(d=>`<option value="${esc(d.id)}" ${deptF===d.id?'selected':''}>${esc(d.name)}</option>`).join('')}
      </select>
    </div>`;
    const qi=filtersEl.querySelector('#'+cid+'-q');
    qi.addEventListener('input', debounce(()=>{ q=qi.value; page=1; render(); },200));
    filtersEl.querySelectorAll('[data-sf]').forEach(b=>b.onclick=()=>{
      statusF=b.dataset.sf; page=1;
      filtersEl.querySelectorAll('[data-sf]').forEach(x=>{
        const on=x.dataset.sf===statusF;
        x.className=`px-4 py-2.5 rounded-xl text-sm font-medium transition ${on?'bg-slate-900 text-white shadow':'bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`;
      });
      render();
    });
    filtersEl.querySelector('#'+cid+'-deptF').onchange=e=>{ deptF=e.target.value; page=1; render(); };
  }

  function filtered(){
    const ql=q.toLowerCase();
    return emps.filter(e=>
      (statusF==='all' || (statusF==='active'?e.active:!e.active)) &&
      (deptF==='all' || e.departmentId===deptF) &&
      (e.name+' '+e.code+' '+(e.phone||'')).toLowerCase().includes(ql)
    );
  }

  function render(){
    if(tab==='departments'){ renderDepts(); return; }
    const rows=filtered();
    filteredTotal=rows.length;
    const pages=Math.max(1, Math.ceil(filteredTotal/PER));
    if(page>pages) page=pages;
    const slice=rows.slice((page-1)*PER, page*PER);
    body.innerHTML=tableHTML([
      {label:T('c4.emp.colEmployee'), get:e=>`<div class="flex items-center gap-3">${avatar(e.name)}<div><div class="font-semibold text-slate-700">${esc(e.name)}</div><div class="text-xs text-slate-400">${esc(e.code)} · ${esc(e.designation||'—')}</div></div></div>`},
      {label:T('c4.emp.colDepartment'), get:e=>`<span class="text-slate-600">${esc(e.department||'—')}</span>`},
      {label:T('c4.emp.colPhone'), get:e=>`<span class="text-slate-600">${esc(e.phone||'—')}</span>`},
      {label:T('c4.emp.colSalary'), num:1, get:e=>`<span class="tabular-nums font-medium text-slate-700">${fmt(e.salary)}</span>`},
      {label:T('c4.emp.colDevice'), get:e=>e.deviceId?`<span class="font-mono text-xs bg-slate-100 px-2 py-1 rounded-lg text-slate-600">${esc(e.deviceId)}</span>`:'<span class="text-slate-300 text-xs">'+T('c4.emp.notBound')+'</span>'},
      {label:T('c4.common.status'), get:e=>badge(e.active?T('c4.common.active'):T('c4.common.inactive'), e.active?'emerald':'slate')},
      {label:'', get:e=>canEdit?`<div class="flex justify-end">${vActionsMenu().replace('data-vact','data-vact="'+esc(e.id)+'"')}</div>`:''},
    ], slice, {empty:T('c4.emp.emptyEmps'), checkbox:true})+vPaginationHTML(filteredTotal, page, PER);
    /* select-all */
    const allCb=body.querySelector('[data-vcb-all]');
    if(allCb) allCb.onchange=()=>{ body.querySelectorAll('[data-vcb]').forEach(c=>{ c.checked=allCb.checked; }); };
    vPaginateBind(body, p=>{
      if(p==='prev') page=Math.max(1,page-1);
      else if(p==='next') page=Math.min(pages,page+1);
      else if(typeof p==='number') page=p;
      render();
    });
    bindActionMenus();
  }

  /* Verola "..." actions dropdown */
  function bindActionMenus(){
    body.querySelectorAll('[data-vact]').forEach(btn=>{
      btn.onclick=ev=>{
        ev.stopPropagation();
        closeVactMenus();
        const e=emps.find(x=>x.id===btn.dataset.vact);
        if(!e) return;
        const menu=document.createElement('div');
        menu.className='vact-menu fixed z-50 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 min-w-[150px]';
        menu.innerHTML=`
          <button data-m="edit" class="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition">${T('c4.common.edit')}</button>
          <button data-m="dev" class="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition">${e.deviceId?T('c4.common.unbind'):T('c4.common.bind')}</button>
          <button data-m="del" class="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition">${T('c4.common.delete')}</button>`;
        document.body.appendChild(menu);
        const r=btn.getBoundingClientRect();
        menu.style.top=Math.min(r.bottom+6, window.innerHeight-150)+'px';
        menu.style.left=Math.max(8, Math.min(r.right-160, window.innerWidth-170))+'px';
        menu.querySelector('[data-m="edit"]').onclick=()=>{ closeVactMenus(); openEditor(e); };
        menu.querySelector('[data-m="dev"]').onclick=()=>{ closeVactMenus(); toggleDevice(e); };
        menu.querySelector('[data-m="del"]').onclick=()=>{ closeVactMenus(); deleteEmp(e); };
      };
    });
  }

  async function deleteEmp(e){
    if(!await confirmDlg(T('c4.emp.delEmpTitle'),T('c4.emp.delEmpMsg'),T('c4.common.delete'))) return;
    await API.call('deleteEmployee',e.id); toast(T('c4.emp.empDeleted'),'success'); load();
  }

  async function toggleDevice(e){
    if(e.deviceId){
      await API.call('unbindDevice',e.id); toast(T('c4.emp.deviceUnbound'),'success'); load();
    }else{
      const m=modal(T('c4.emp.bindTitle'),`<p class="text-sm text-slate-500 mb-4">${T('c4.emp.bindMsg').replace('{name}',esc(e.name))}</p>
        ${field(T('c4.emp.fDeviceId'),'deviceId',{ph:'ZK-1001',req:true})}
        <div class="flex justify-end gap-2 mt-5"><button class="${btnS}" id="dCancel">${T('c4.common.cancel')}</button><button class="${btnP}" id="dSave">${T('c4.common.bind')}</button></div>`);
      m.el.querySelector('#dCancel').onclick=()=>m.close();
      m.el.querySelector('#dSave').onclick=async()=>{
        await API.call('bindDevice',e.id,formVal(m.el,'deviceId')); m.close(); toast(T('c4.emp.deviceBound'),'success'); load();
      };
    }
  }

  function renderDepts(){
    body.innerHTML=(canEdit?`<div class="flex justify-end mb-3"><button class="${btnP}" id="${cid}-addDept">${T('c4.emp.addDept')}</button></div>`:'')+tableHTML([
      {label:T('c4.emp.colDepartment'), get:d=>`<div class="flex items-center gap-3">${avatar(d.name)}<span class="font-semibold text-slate-700">${esc(d.name)}</span></div>`},
      {label:T('c4.emp.colHeadcount'), num:1, get:d=>fmtNum(d.headcount)},
      {label:'', get:d=>canEdit?`<div class="flex gap-1 justify-end"><button class="${btnS} !px-3 !py-1.5 !text-xs" data-ed="${d.id}">${T('c4.common.edit')}</button><button class="${btnS} !px-3 !py-1.5 !text-xs !text-red-600" data-del="${d.id}">${T('c4.common.delete')}</button></div>`:''},
    ], depts, {empty:T('c4.emp.emptyDepts')});
    if(!canEdit) return;
    const addD=document.getElementById(cid+'-addDept');
    if(addD) addD.onclick=()=>{
      const m=modal(T('c4.emp.addDeptTitle'), `${field(T('c4.emp.deptName'),'name',{req:true})}<div class="flex justify-end gap-2 mt-5"><button class="${btnS}" id="dCancel">${T('c4.common.cancel')}</button><button class="${btnP}" id="dSave">${T('c4.common.save')}</button></div>`);
      m.el.querySelector('#dCancel').onclick=()=>m.close();
      m.el.querySelector('#dSave').onclick=async()=>{ const nm=formVal(m.el,'name'); if(!nm){toast(T('c4.emp.nameRequired'),'warn');return;} await API.call('saveDepartment',{name:nm}); m.close(); toast(T('c4.emp.deptSaved'),'success'); load(); };
    };
    body.querySelectorAll('[data-ed]').forEach(b=>b.onclick=()=>{
      const d=depts.find(x=>x.id===b.dataset.ed);
      const m=modal(T('c4.emp.editDeptTitle'), `${field(T('c4.emp.deptName'),'name',{value:d.name,req:true})}<div class="flex justify-end gap-2 mt-5"><button class="${btnS}" id="dCancel">${T('c4.common.cancel')}</button><button class="${btnP}" id="dSave">${T('c4.common.save')}</button></div>`);
      m.el.querySelector('#dCancel').onclick=()=>m.close();
      m.el.querySelector('#dSave').onclick=async()=>{ await API.call('saveDepartment',{id:d.id,name:formVal(m.el,'name')}); m.close(); toast(T('c4.emp.deptSaved'),'success'); load(); };
    });
    body.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
      if(!await confirmDlg(T('c4.emp.delDeptTitle'),T('c4.emp.cannotUndo'),T('c4.common.delete'))) return;
      try{ await API.call('deleteDepartment',b.dataset.del); toast(T('c4.emp.deleted'),'success'); load(); }catch(e2){ toast(e2.message,'error'); }
    });
  }

  function openEditor(e){
    const isNew=!e; e=e||{name:'',code:'',departmentId:'d1',designation:'',phone:'',email:'',salary:0,joinDate:todayISO(),active:true};
    const m=modal(isNew?T('c4.emp.addEmpTitle'):T('c4.emp.editEmpTitle'),`
      <div class="flex items-center gap-4 mb-5 p-4 rounded-2xl bg-slate-50 border border-slate-200/60">
        ${avatar(e.name||'?', 'w-11 h-11 text-sm')}
        <div><div class="font-bold text-slate-800">${isNew?T('c4.emp.addEmpTitle'):esc(e.name)}</div><div class="text-xs text-slate-400">${isNew?T('c4.emp.sub'):esc(e.code||'')}</div></div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        ${field(T('c4.emp.fFullName'),'name',{value:e.name,req:true})}
        ${field(T('c4.emp.fEmpCode'),'code',{value:e.code,ph:'EMP-011'})}
        ${field(T('c4.emp.colDepartment'),'departmentId',{type:'select',value:e.departmentId,options:depts.map(d=>({value:d.id,label:d.name}))})}
        ${field(T('c4.emp.fDesignation'),'designation',{value:e.designation||''})}
        ${field(T('c4.emp.fPhone'),'phone',{value:e.phone||'',ph:'0300-0000000'})}
        ${field(T('c4.emp.fEmail'),'email',{value:e.email||'',type:'email'})}
        ${field(T('c4.emp.fSalary'),'salary',{value:e.salary||0,type:'number',min:0})}
        ${field(T('c4.emp.fJoinDate'),'joinDate',{value:e.joinDate||todayISO(),type:'date'})}
        <div class="col-span-2">${field(T('c4.emp.fActive'),'active',{type:'checkbox',value:e.active})}</div>
      </div>
      <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="eCancel">${T('c4.common.cancel')}</button><button class="${btnP}" id="eSave">${T('c4.emp.saveEmployee')}</button></div>`,{wide:true});
    m.el.querySelector('#eCancel').onclick=()=>m.close();
    m.el.querySelector('#eSave').onclick=async()=>{
      const data=collectForm(m.el);
      if(!data.name){ toast(T('c4.emp.nameIsRequired'),'warn'); return; }
      await API.call('saveEmployee',{...(isNew?{}:{id:e.id}),...data});
      m.close(); toast(T('c4.emp.empSaved'),'success'); load();
    };
  }

  const addB=document.getElementById(cid+'-add'); if(addB) addB.onclick=()=>openEditor(null);
  const impB=document.getElementById(cid+'-import');
  if(impB) impB.onclick=()=>{
    const m=modal(T('c4.emp.importTitle'),`
      <p class="text-sm text-slate-500 mb-3">${T('c4.emp.importHelp')}<code class="bg-slate-100 px-1 rounded">name,code,designation,phone,email,salary,joinDate</code></p>
      <input type="file" id="csvFile" accept=".csv" class="text-sm mb-4">
      <div class="flex justify-end gap-2"><button class="${btnS}" id="iCancel">${T('c4.common.cancel')}</button><button class="${btnP}" id="iGo">${T('c4.common.import')}</button></div>`);
    m.el.querySelector('#iCancel').onclick=()=>m.close();
    m.el.querySelector('#iGo').onclick=()=>{
      const f=m.el.querySelector('#csvFile').files[0];
      if(!f){ toast(T('c4.emp.chooseCsv'),'warn'); return; }
      const rd=new FileReader();
      rd.onload=async()=>{
        try{
          const lines=String(rd.result).split(/\r?\n/).filter(l=>l.trim());
          const heads=lines[0].split(',').map(h=>h.trim().toLowerCase());
          const rows=lines.slice(1).map(l=>{ const cells=l.split(','); const o={}; heads.forEach((h2,i)=>o[h2]=(cells[i]||'').trim()); return o; });
          const r=await API.call('importEmployeesCSV',rows);
          m.close(); toast(T('c4.emp.importedN').replace('{n}',r.imported),'success'); load();
        }catch(e2){ toast(e2.message,'error'); }
      };
      rd.readAsText(f);
    };
  };
  await load();
};
})();
