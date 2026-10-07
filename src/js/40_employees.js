/* 40_employees.js — employee table, add/edit modal, device bind/unbind,
   CSV import, departments tab. */
(function(){
'use strict';

App.nav.push({group:'WORKFORCE', path:'#/employees', label:'Employees', icon:'employees', perm:'employees'});

App.routes['#/employees'] = async (el, params)=>{
  const cid=uid('emp');
  const tab=(params&&params.tab)||'list';
  el.innerHTML=pageHead('Employees','Workforce directory',
    `${perm('employees','edit')?`<button class="${btnP}" id="${cid}-add">+ Add Employee</button><button class="${btnS}" id="${cid}-import">Import CSV</button>`:''}`)+
  `<div class="flex gap-2 mb-5">
    <a href="#/employees" class="px-4 py-2 rounded-xl text-sm font-semibold ${tab==='list'?'bg-teal-600 text-white shadow':'bg-white text-slate-500 border border-slate-200'}">Employees</a>
    <a href="#/employees?tab=departments" class="px-4 py-2 rounded-xl text-sm font-semibold ${tab==='departments'?'bg-teal-600 text-white shadow':'bg-white text-slate-500 border border-slate-200'}">Departments</a>
  </div>
  <div class="mb-4"><input id="${cid}-q" placeholder="Search name, code, phone…" class="bg-white border border-slate-200 rounded-xl px-4 py-2.5 w-full max-w-sm text-sm focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 focus:outline-none"></div>
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
      body.innerHTML=(perm('employees','edit')?`<div class="flex justify-end mb-3"><button class="${btnS}" id="${cid}-addDept">+ Department</button></div>`:'')+tableHTML([
        {label:'Department', get:d=>`<span class="font-semibold text-slate-700">${esc(d.name)}</span>`},
        {label:'Headcount', num:1, get:d=>fmtNum(d.headcount)},
        {label:'', get:d=>perm('employees','edit')?`<div class="flex gap-1 justify-end"><button class="${btnS} !px-3 !py-1.5 !text-xs" data-ed="${d.id}">Edit</button><button class="${btnS} !px-3 !py-1.5 !text-xs !text-red-600" data-del="${d.id}">Delete</button></div>`:''},
      ], depts.filter(d=>d.name.toLowerCase().includes(q)), {empty:'No departments yet'});
      if(perm('employees','edit')){
        const addD=document.getElementById(cid+'-addDept');
        if(addD) addD.onclick=()=>{
          const m=modal('Add Department', `${field('Department name','name',{req:true})}<div class="flex justify-end gap-2 mt-5"><button class="${btnS}" id="dCancel">Cancel</button><button class="${btnP}" id="dSave">Save</button></div>`);
          m.el.querySelector('#dCancel').onclick=()=>m.close();
          m.el.querySelector('#dSave').onclick=async()=>{ const nm=formVal(m.el,'name'); if(!nm){toast('Name required','warn');return;} await API.call('saveDepartment',{name:nm}); m.close(); toast('Department saved','success'); load(); };
        };
        body.querySelectorAll('[data-ed]').forEach(b=>b.onclick=async()=>{
          const d=depts.find(x=>x.id===b.dataset.ed);
          const m=modal('Edit Department', `${field('Department name','name',{value:d.name,req:true})}<div class="flex justify-end gap-2 mt-5"><button class="${btnS}" id="dCancel">Cancel</button><button class="${btnP}" id="dSave">Save</button></div>`);
          m.el.querySelector('#dCancel').onclick=()=>m.close();
          m.el.querySelector('#dSave').onclick=async()=>{ await API.call('saveDepartment',{id:d.id,name:formVal(m.el,'name')}); m.close(); toast('Department saved','success'); load(); };
        });
        body.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
          if(!await confirmDlg('Delete department?','This cannot be undone.','Delete')) return;
          try{ await API.call('deleteDepartment',b.dataset.del); toast('Deleted','success'); load(); }catch(e){ toast(e.message,'error'); }
        });
      }
      return;
    }
    const rows=emps.filter(e=>(e.name+' '+e.code+' '+(e.phone||'')).toLowerCase().includes(q));
    body.innerHTML=tableHTML([
      {label:'Employee', get:e=>`<div class="flex items-center gap-3"><div class="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-sm">${esc((e.name||'?')[0])}</div><div><div class="font-semibold text-slate-700">${esc(e.name)}</div><div class="text-xs text-slate-400">${esc(e.code)} · ${esc(e.designation||'—')}</div></div></div>`},
      {label:'Department', get:e=>esc(e.department||'—')},
      {label:'Phone', get:e=>esc(e.phone||'—')},
      {label:'Salary', num:1, get:e=>`<span class="tabular-nums">${fmt(e.salary)}</span>`},
      {label:'Device', get:e=>e.deviceId?`<span class="font-mono text-xs bg-slate-100 px-2 py-1 rounded-lg">${esc(e.deviceId)}</span>`:'<span class="text-slate-300 text-xs">not bound</span>'},
      {label:'Status', get:e=>e.active?badge('Active','emerald'):badge('Inactive','slate')},
      {label:'', get:e=>perm('employees','edit')?`<div class="flex gap-1 justify-end">
        <button class="${btnS} !px-3 !py-1.5 !text-xs" data-edit="${e.id}">Edit</button>
        <button class="${btnS} !px-3 !py-1.5 !text-xs" data-dev="${e.id}">${e.deviceId?'Unbind':'Bind'}</button>
        <button class="${btnS} !px-3 !py-1.5 !text-xs !text-red-600" data-del="${e.id}">Delete</button></div>`:''},
    ], rows, {empty:'No employees found'});
    bindRow();
  }
  function bindRow(){
    body.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEditor(emps.find(e=>e.id===b.dataset.edit)));
    body.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
      if(!await confirmDlg('Delete employee?','Their attendance history stays, but the profile is removed.','Delete')) return;
      await API.call('deleteEmployee',b.dataset.del); toast('Employee deleted','success'); load();
    });
    body.querySelectorAll('[data-dev]').forEach(b=>b.onclick=async()=>{
      const e=emps.find(x=>x.id===b.dataset.dev);
      if(e.deviceId){
        await API.call('unbindDevice',e.id); toast('Device unbound','success'); load();
      }else{
        const m=modal('Bind device',`<p class="text-sm text-slate-500 mb-4">Bind a biometric / ZKTeco device ID to <b>${esc(e.name)}</b>. Punches from any other device will be rejected.</p>
          ${field('Device ID','deviceId',{ph:'ZK-1001',req:true})}
          <div class="flex justify-end gap-2 mt-5"><button class="${btnS}" id="dCancel">Cancel</button><button class="${btnP}" id="dSave">Bind</button></div>`);
        m.el.querySelector('#dCancel').onclick=()=>m.close();
        m.el.querySelector('#dSave').onclick=async()=>{
          await API.call('bindDevice',e.id,formVal(m.el,'deviceId')); m.close(); toast('Device bound','success'); load();
        };
      }
    });
  }
  function openEditor(e){
    const isNew=!e; e=e||{name:'',code:'',departmentId:'d1',designation:'',phone:'',email:'',salary:0,joinDate:todayISO(),active:true};
    const m=modal(isNew?'Add Employee':'Edit Employee',`
      <div class="grid grid-cols-2 gap-4">
        ${field('Full name','name',{value:e.name,req:true})}
        ${field('Employee code','code',{value:e.code,ph:'EMP-011'})}
        ${field('Department','departmentId',{type:'select',value:e.departmentId,options:depts.map(d=>({value:d.id,label:d.name}))})}
        ${field('Designation','designation',{value:e.designation||''})}
        ${field('Phone','phone',{value:e.phone||'',ph:'0300-0000000'})}
        ${field('Email','email',{value:e.email||'',type:'email'})}
        ${field('Monthly salary (Rs)','salary',{value:e.salary||0,type:'number',min:0})}
        ${field('Joining date','joinDate',{value:e.joinDate||todayISO(),type:'date'})}
        <div class="col-span-2">${field('Active','active',{type:'checkbox',value:e.active})}</div>
      </div>
      <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="eCancel">Cancel</button><button class="${btnP}" id="eSave">Save employee</button></div>`,{wide:true});
    m.el.querySelector('#eCancel').onclick=()=>m.close();
    m.el.querySelector('#eSave').onclick=async()=>{
      const data=collectForm(m.el);
      if(!data.name){ toast('Name is required','warn'); return; }
      await API.call('saveEmployee',{...(isNew?{}:{id:e.id}),...data});
      m.close(); toast('Employee saved','success'); load();
    };
  }
  const addB=document.getElementById(cid+'-add'); if(addB) addB.onclick=()=>openEditor(null);
  const impB=document.getElementById(cid+'-import');
  if(impB) impB.onclick=()=>{
    const m=modal('Import employees (CSV)',`
      <p class="text-sm text-slate-500 mb-3">Upload a CSV with headers: <code class="bg-slate-100 px-1 rounded">name,code,designation,phone,email,salary,joinDate</code></p>
      <input type="file" id="csvFile" accept=".csv" class="text-sm mb-4">
      <div class="flex justify-end gap-2"><button class="${btnS}" id="iCancel">Cancel</button><button class="${btnP}" id="iGo">Import</button></div>`);
    m.el.querySelector('#iCancel').onclick=()=>m.close();
    m.el.querySelector('#iGo').onclick=()=>{
      const f=m.el.querySelector('#csvFile').files[0];
      if(!f){ toast('Choose a CSV file','warn'); return; }
      const rd=new FileReader();
      rd.onload=async()=>{
        try{
          const lines=String(rd.result).split(/\r?\n/).filter(l=>l.trim());
          const heads=lines[0].split(',').map(h=>h.trim().toLowerCase());
          const rows=lines.slice(1).map(l=>{ const cells=l.split(','); const o={}; heads.forEach((h2,i)=>o[h2]=(cells[i]||'').trim()); return o; });
          const r=await API.call('importEmployeesCSV',rows);
          m.close(); toast(r.imported+' employee(s) imported','success'); load();
        }catch(e2){ toast(e2.message,'error'); }
      };
      rd.readAsText(f);
    };
  };
  document.getElementById(cid+'-q').addEventListener('input',debounce(render,200));
  await load();
};
})();
