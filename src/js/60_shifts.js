/* 60_shifts.js — shifts CRUD + roster grid by date. Verola premium styling. */
(function(){
'use strict';

App.nav.push({group:'WORKFORCE', path:'#/shifts', label:I18N.t('c4.nav.shifts'), labelKey:'c4.nav.shifts', icon:'shifts', perm:'shifts'});

/* Verola tokens (local) */
const vBtnB='px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold shadow active:scale-[.98] transition';
const vBtnSx='px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-600 active:scale-[.98] transition shadow-sm';
const vCard='bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.04)] p-6';
function vHead(title, sub, actions){
  return `<div class="flex items-center gap-2 text-[13px] text-slate-400 mb-4 anim-fadeUp"><span class="text-base">⌂</span><a href="#/dashboard" class="hover:text-slate-600">${I18N.t('c4.nav.dashboard')}</a><span>›</span><span class="text-slate-700 font-semibold">${title}</span></div>
  <div class="flex flex-wrap items-center justify-between gap-3 mb-5 anim-fadeUp"><div><h1 class="font-display text-[26px] font-bold text-slate-800 tracking-tight">${title}</h1><p class="text-sm text-slate-400 mt-1">${sub}</p></div><div class="flex gap-2 flex-wrap">${actions||''}</div></div>`;
}
function vAvatar(name){
  const init=(String(name||'?').trim().split(/\s+/).map(w=>w[0]).join('')||'?').slice(0,2).toUpperCase();
  return `<span class="w-8 h-8 rounded-full bg-slate-200 text-slate-500 text-[11px] font-bold inline-flex items-center justify-center shrink-0">${esc(init)}</span>`;
}

App.routes['#/shifts'] = async (el)=>{
  const cid=uid('shift');
  const canEdit=perm('shifts','edit');
  el.innerHTML=vHead(I18N.t('c4.nav.shifts'),I18N.t('c4.shifts.sub'),
    `${canEdit?`<button class="${vBtnB}" id="${cid}-add">${I18N.t('c4.shifts.addShift')}</button>`:''}`)+`
  <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
    <div class="${vCard}">
      <h3 class="font-bold text-slate-800 text-[15px] mb-4">${I18N.t('c4.shifts.shiftTemplates')}</h3>
      <div id="${cid}-shifts"></div>
    </div>
    <div class="xl:col-span-2 ${vCard}">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 class="font-bold text-slate-800 text-[15px]">${I18N.t('c4.shifts.dailyRoster')}</h3>
        <div class="flex gap-2 items-center">
          <input type="date" id="${cid}-date" value="${todayISO()}" class="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-600 focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:outline-none">
          ${canEdit?`<button class="${btnS}" id="${cid}-assign">${I18N.t('c4.shifts.assignBtn')}</button>`:''}
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
      <div class="rounded-2xl border border-slate-200/70 p-4 mb-3 flex items-center gap-3 hover:border-slate-300 hover:shadow-sm transition bg-white">
        <div class="w-11 h-11 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">${App.ICONS.shifts}</div>
        <div class="flex-1 min-w-0"><div class="font-semibold text-slate-700 text-sm">${esc(s.name)}</div>
          <div class="text-xs text-slate-400 tabular-nums mt-0.5">${esc(s.startTime)} – ${esc(s.endTime)} · ${I18N.t('c4.shifts.graceN').replace('{n}',s.graceMin)}</div></div>
        ${canEdit?`<div class="flex gap-1"><button class="${vBtnSx}" data-se="${s.id}">${I18N.t('c4.common.edit')}</button><button class="${vBtnSx} !text-red-600" data-sd="${s.id}">✕</button></div>`:''}
      </div>`).join('')||'<p class="text-sm text-slate-400 py-6 text-center">'+I18N.t('c4.shifts.emptyShifts')+'</p>';
    shiftsEl.querySelectorAll('[data-se]').forEach(b=>b.onclick=()=>openShiftEditor(shifts.find(s=>s.id===b.dataset.se)));
    shiftsEl.querySelectorAll('[data-sd]').forEach(b=>b.onclick=async()=>{
      if(!await confirmDlg(I18N.t('c4.shifts.delShiftTitle'),I18N.t('c4.shifts.delShiftMsg'),I18N.t('c4.common.delete'))) return;
      await API.call('deleteShift',b.dataset.sd); toast(I18N.t('c4.shifts.shiftDeleted'),'success'); loadShifts();
    });
  }
  async function loadRoster(){
    rosters=await API.call('listRosters',dateEl.value);
    emps=await API.call('listEmployees');
    sites=await API.call('listSites');
    rosterEl.innerHTML=tableHTML([
      {label:I18N.t('c4.common.employee'), get:r=>`<div class="flex items-center gap-3">${vAvatar(r.employeeName)}<span class="font-medium text-slate-700">${esc(r.employeeName||'—')}</span></div>`},
      {label:I18N.t('c4.shifts.colShift'), get:r=>`<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 ring-1 ring-slate-200 whitespace-nowrap">${esc(r.shiftName||'—')}</span>`},
      {label:I18N.t('c4.common.site'), get:r=>`<span class="text-slate-600">${esc(r.siteName||'—')}</span>`},
      {label:'', get:r=>canEdit?`<div class="flex gap-1 justify-end"><button class="${vBtnSx} !text-red-600" data-rd="${r.id}">${I18N.t('c4.common.remove')}</button></div>`:''},
    ], rosters, {empty:I18N.t('c4.shifts.emptyRoster')});
    rosterEl.querySelectorAll('[data-rd]').forEach(b=>b.onclick=async()=>{
      await API.call('deleteRoster',b.dataset.rd); toast(I18N.t('c4.shifts.removed'),'success'); loadRoster();
    });
  }
  function openShiftEditor(s){
    const isNew=!s; s=s||{name:'',startTime:'08:00',endTime:'17:00',graceMin:15};
    const m=modal(isNew?I18N.t('c4.shifts.addShiftTitle'):I18N.t('c4.shifts.editShiftTitle'),`
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2">${field(I18N.t('c4.shifts.fShiftName'),'name',{value:s.name,req:true})}</div>
        ${field(I18N.t('c4.shifts.fStartTime'),'startTime',{value:s.startTime,type:'time',req:true})}
        ${field(I18N.t('c4.shifts.fEndTime'),'endTime',{value:s.endTime,type:'time',req:true})}
        <div class="col-span-2">${field(I18N.t('c4.shifts.fGrace'),'graceMin',{value:s.graceMin,type:'number',min:0})}</div>
      </div>
      <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="sCancel">${I18N.t('c4.common.cancel')}</button><button class="${vBtnB}" id="sSave">${I18N.t('c4.shifts.saveShift')}</button></div>`);
    m.el.querySelector('#sCancel').onclick=()=>m.close();
    m.el.querySelector('#sSave').onclick=async()=>{
      const data=collectForm(m.el);
      if(!data.name){ toast(I18N.t('c4.emp.nameRequired'),'warn'); return; }
      await API.call('saveShift',{...(isNew?{}:{id:s.id}),...data});
      m.close(); toast(I18N.t('c4.shifts.shiftSaved'),'success'); loadShifts();
    };
  }
  const addB=document.getElementById(cid+'-add'); if(addB) addB.onclick=()=>openShiftEditor(null);
  dateEl.onchange=loadRoster;
  const asB=document.getElementById(cid+'-assign');
  if(asB) asB.onclick=()=>{
    const m=modal(I18N.t('c4.shifts.assignRosterTitle').replace('{date}',fmtDate(dateEl.value)),`
      <div class="grid grid-cols-1 gap-4 mb-4">
        ${field(I18N.t('c4.common.employee'),'employeeId',{type:'select',options:emps.filter(e=>e.active).map(e=>({value:e.id,label:e.name+' ('+e.code+')'}))})}
        ${field(I18N.t('c4.shifts.fShift'),'shiftId',{type:'select',options:shifts.map(s=>({value:s.id,label:s.name+' ('+s.startTime+'–'+s.endTime+')'}))})}
        ${field(I18N.t('c4.common.site'),'siteId',{type:'select',options:[{value:'',label:I18N.t('c4.shifts.noSite')}].concat(sites.filter(s=>s.active).map(s=>({value:s.id,label:s.name})))})}
      </div>
      <div class="flex justify-end gap-2"><button class="${btnS}" id="rCancel">${I18N.t('c4.common.cancel')}</button><button class="${vBtnB}" id="rSave">${I18N.t('c4.shifts.assignBtn')}</button></div>`);
    m.el.querySelector('#rCancel').onclick=()=>m.close();
    m.el.querySelector('#rSave').onclick=async()=>{
      await API.call('saveRoster',{date:dateEl.value,...collectForm(m.el)});
      m.close(); toast(I18N.t('c4.shifts.rosterAssigned'),'success'); loadRoster();
    };
  };
  await loadShifts(); await loadRoster();
};
})();
