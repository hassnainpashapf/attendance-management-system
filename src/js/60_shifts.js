/* 60_shifts.js — shifts CRUD + roster grid by date. */
(function(){
'use strict';

App.nav.push({group:'WORKFORCE', path:'#/shifts', label:'Shifts & Roster', icon:'shifts', perm:'shifts'});

App.routes['#/shifts'] = async (el)=>{
  const cid=uid('shift');
  const canEdit=perm('shifts','edit');
  el.innerHTML=pageHead('Shifts & Roster','Work hours and daily assignments',
    `${canEdit?`<button class="${btnP}" id="${cid}-add">+ Add Shift</button>`:''}`)+`
  <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
    <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6">
      <h3 class="font-display font-bold text-slate-800 mb-4">Shift templates</h3>
      <div id="${cid}-shifts"></div>
    </div>
    <div class="xl:col-span-2 bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 class="font-display font-bold text-slate-800">Daily roster</h3>
        <div class="flex gap-2 items-center">
          <input type="date" id="${cid}-date" value="${todayISO()}" class="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500/40 focus:outline-none">
          ${canEdit?`<button class="${btnS}" id="${cid}-assign">Assign</button>`:''}
        </div>
      </div>
      <div id="${cid}-roster"></div>
    </div>
  </div>`;
  const shiftsEl=document.getElementById(cid+'-shifts');
  const rosterEl=document.getElementById(cid+'-roster');
  const dateEl=document.getElementById(cid+'-date');
  let shifts=[], rosters=[], emps=[], sites=[];

  async function loadShifts(){
    shifts=await API.call('listShifts');
    shiftsEl.innerHTML=shifts.map(s=>`
      <div class="rounded-2xl border border-slate-200/70 p-4 mb-3 flex items-center gap-3 hover:border-teal-300 transition">
        <div class="w-11 h-11 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">${App.ICONS.shifts}</div>
        <div class="flex-1 min-w-0"><div class="font-semibold text-slate-700 text-sm">${esc(s.name)}</div>
          <div class="text-xs text-slate-400 tabular-nums">${esc(s.startTime)} – ${esc(s.endTime)} · grace ${s.graceMin} min</div></div>
        ${canEdit?`<div class="flex gap-1"><button class="${btnS} !px-2.5 !py-1.5 !text-xs" data-se="${s.id}">Edit</button><button class="${btnS} !px-2.5 !py-1.5 !text-xs !text-red-600" data-sd="${s.id}">✕</button></div>`:''}
      </div>`).join('')||'<p class="text-sm text-slate-400">No shifts defined.</p>';
    shiftsEl.querySelectorAll('[data-se]').forEach(b=>b.onclick=()=>openShiftEditor(shifts.find(s=>s.id===b.dataset.se)));
    shiftsEl.querySelectorAll('[data-sd]').forEach(b=>b.onclick=async()=>{
      if(!await confirmDlg('Delete shift?','Roster entries using it stay as-is.','Delete')) return;
      await API.call('deleteShift',b.dataset.sd); toast('Shift deleted','success'); loadShifts();
    });
  }
  async function loadRoster(){
    rosters=await API.call('listRosters',dateEl.value);
    emps=await API.call('listEmployees');
    sites=await API.call('listSites');
    rosterEl.innerHTML=tableHTML([
      {label:'Employee', get:r=>`<span class="font-medium text-slate-700">${esc(r.employeeName||'—')}</span>`},
      {label:'Shift', get:r=>esc(r.shiftName||'—')},
      {label:'Site', get:r=>esc(r.siteName||'—')},
      {label:'', get:r=>canEdit?`<div class="flex gap-1 justify-end"><button class="${btnS} !px-3 !py-1.5 !text-xs !text-red-600" data-rd="${r.id}">Remove</button></div>`:''},
    ], rosters, {empty:'Nobody rostered for this date yet.'});
    rosterEl.querySelectorAll('[data-rd]').forEach(b=>b.onclick=async()=>{
      await API.call('deleteRoster',b.dataset.rd); toast('Removed','success'); loadRoster();
    });
  }
  function openShiftEditor(s){
    const isNew=!s; s=s||{name:'',startTime:'08:00',endTime:'17:00',graceMin:15};
    const m=modal(isNew?'Add Shift':'Edit Shift',`
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2">${field('Shift name','name',{value:s.name,req:true})}</div>
        ${field('Start time','startTime',{value:s.startTime,type:'time',req:true})}
        ${field('End time','endTime',{value:s.endTime,type:'time',req:true})}
        <div class="col-span-2">${field('Grace period (minutes)','graceMin',{value:s.graceMin,type:'number',min:0})}</div>
      </div>
      <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="sCancel">Cancel</button><button class="${btnP}" id="sSave">Save shift</button></div>`);
    m.el.querySelector('#sCancel').onclick=()=>m.close();
    m.el.querySelector('#sSave').onclick=async()=>{
      const data=collectForm(m.el);
      if(!data.name){ toast('Name required','warn'); return; }
      await API.call('saveShift',{...(isNew?{}:{id:s.id}),...data});
      m.close(); toast('Shift saved','success'); loadShifts();
    };
  }
  const addB=document.getElementById(cid+'-add'); if(addB) addB.onclick=()=>openShiftEditor(null);
  dateEl.onchange=loadRoster;
  const asB=document.getElementById(cid+'-assign');
  if(asB) asB.onclick=()=>{
    const m=modal('Assign roster — '+fmtDate(dateEl.value),`
      <div class="grid grid-cols-1 gap-4 mb-4">
        ${field('Employee','employeeId',{type:'select',options:emps.filter(e=>e.active).map(e=>({value:e.id,label:e.name+' ('+e.code+')'}))})}
        ${field('Shift','shiftId',{type:'select',options:shifts.map(s=>({value:s.id,label:s.name+' ('+s.startTime+'–'+s.endTime+')'}))})}
        ${field('Site','siteId',{type:'select',options:[{value:'',label:'— No site —'}].concat(sites.filter(s=>s.active).map(s=>({value:s.id,label:s.name})))})}
      </div>
      <div class="flex justify-end gap-2"><button class="${btnS}" id="rCancel">Cancel</button><button class="${btnP}" id="rSave">Assign</button></div>`);
    m.el.querySelector('#rCancel').onclick=()=>m.close();
    m.el.querySelector('#rSave').onclick=async()=>{
      await API.call('saveRoster',{date:dateEl.value,...collectForm(m.el)});
      m.close(); toast('Roster assigned','success'); loadRoster();
    };
  };
  await loadShifts(); await loadRoster();
};
})();
