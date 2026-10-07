/* 80_leave.js — leave types, balances, requests approve/reject, holidays. */
(function(){
'use strict';

App.nav.push({group:'PEOPLE', path:'#/leave', label:I18N.t('c4.nav.leave'), labelKey:'c4.nav.leave', icon:'leave', perm:'leave'});

App.routes['#/leave'] = async (el, params)=>{
  const cid=uid('leave');
  const tab=(params&&params.tab)||'requests';
  const canEdit=perm('leave','edit');
  el.innerHTML=pageHead(I18N.t('c4.leave.title'),I18N.t('c4.leave.sub'),
    `${canEdit?`<button class="${btnS}" id="${cid}-holiday">${I18N.t('c4.leave.addHoliday')}</button><button class="${btnS}" id="${cid}-type">${I18N.t('c4.leave.addLeaveType')}</button>`:''}<button class="${btnP}" id="${cid}-req">${I18N.t('c4.leave.requestLeave')}</button>`)+`
  <div class="flex gap-2 mb-5 flex-wrap">
    ${[['requests',I18N.t('c4.leave.tabRequests')],['balances',I18N.t('c4.leave.tabBalances')],['types',I18N.t('c4.leave.tabTypes')],['holidays',I18N.t('c4.leave.tabHolidays')]].map(([k,l])=>
      `<a href="#/leave${k==='requests'?'':'?tab='+k}" class="px-4 py-2 rounded-xl text-sm font-semibold ${tab===k?'bg-teal-600 text-white shadow':'bg-white text-slate-500 border border-slate-200'}">${l}</a>`).join('')}
  </div>
  <div id="${cid}-body"></div>`;
  const body=document.getElementById(cid+'-body');
  const emps=await API.call('listEmployees').catch(()=>[]);
  const types=await API.call('listLeaveTypes').catch(()=>[]);

  if(tab==='types'){
    body.innerHTML=tableHTML([
      {label:I18N.t('c4.leave.colType'), get:t=>`<span class="font-semibold text-slate-700">${esc(t.name)}</span>`},
      {label:I18N.t('c4.leave.colQuota'), num:1, get:t=>t.quota?I18N.t('c4.leave.daysN').replace('{n}',fmtNum(t.quota)):'—'},
      {label:I18N.t('c4.leave.colPaid'), get:t=>t.paid?badge(I18N.t('c4.common.paid'),'emerald'):badge(I18N.t('c4.common.unpaid'),'slate')},
      {label:'', get:t=>canEdit?`<div class="flex gap-1 justify-end"><button class="${btnS} !px-3 !py-1.5 !text-xs" data-te="${t.id}">${I18N.t('c4.common.edit')}</button><button class="${btnS} !px-3 !py-1.5 !text-xs !text-red-600" data-td="${t.id}">${I18N.t('c4.common.delete')}</button></div>`:''},
    ], types, {empty:I18N.t('c4.leave.emptyTypes')});
    body.querySelectorAll('[data-te]').forEach(b=>b.onclick=()=>typeEditor(types.find(t=>t.id===b.dataset.te)));
    body.querySelectorAll('[data-td]').forEach(b=>b.onclick=async()=>{
      if(!await confirmDlg(I18N.t('c4.leave.delTypeTitle'),I18N.t('c4.leave.delTypeMsg'),I18N.t('c4.common.delete'))) return;
      await API.call('deleteLeaveType',b.dataset.td); toast(I18N.t('c4.emp.deleted'),'success'); App.route();
    });
    const tb=document.getElementById(cid+'-type'); if(tb) tb.onclick=()=>typeEditor(null);
  }
  else if(tab==='balances'){
    const rows=await API.call('getLeaveBalances',new Date().getFullYear());
    body.innerHTML=tableHTML([
      {label:I18N.t('c4.common.employee'), get:r=>`<div><div class="font-medium text-slate-700">${esc(r.employeeName)}</div><div class="text-xs text-slate-400">${esc(r.employeeCode)}</div></div>`},
      ...types.map(t=>({label:t.name, get:r=>{ const x=(r.types||[]).find(y=>y.typeId===t.id)||{used:0,quota:t.quota,left:t.quota};
        return `<div class="text-center"><div class="text-sm font-semibold tabular-nums ${x.left<=2&&x.quota?'text-amber-600':'text-slate-700'}">${x.left}<span class="text-slate-400 font-normal">/${x.quota||'∞'}</span></div><div class="text-[10px] text-slate-400">${I18N.t('c4.leave.leftWord')}</div></div>`;}})),
    ], rows, {empty:I18N.t('c4.leave.emptyBalances')});
  }
  else if(tab==='holidays'){
    const rows=await API.call('listHolidays');
    body.innerHTML=tableHTML([
      {label:I18N.t('c4.common.date'), get:h=>`<span class="tabular-nums font-medium">${fmtDate(h.date)}</span>`},
      {label:I18N.t('c4.leave.colHoliday'), get:h=>`<span class="font-medium text-slate-700">${esc(h.name)}</span>`},
      {label:'', get:h=>canEdit?`<div class="flex justify-end"><button class="${btnS} !px-3 !py-1.5 !text-xs !text-red-600" data-hd="${h.id}">${I18N.t('c4.common.delete')}</button></div>`:''},
    ], rows, {empty:I18N.t('c4.leave.emptyHolidays')});
    body.querySelectorAll('[data-hd]').forEach(b=>b.onclick=async()=>{
      await API.call('deleteHoliday',b.dataset.hd); toast(I18N.t('c4.leave.holidayRemoved'),'success'); App.route();
    });
    const hb=document.getElementById(cid+'-holiday');
    if(hb) hb.onclick=()=>{
      const m=modal(I18N.t('c4.leave.addHolidayTitle'),`${field(I18N.t('c4.common.date'),'date',{type:'date',value:todayISO(),req:true})}${field(I18N.t('c4.common.name'),'name',{req:true,ph:I18N.t('c4.leave.phHoliday')})}
        <div class="flex justify-end gap-2 mt-5"><button class="${btnS}" id="hCancel">${I18N.t('c4.common.cancel')}</button><button class="${btnP}" id="hSave">${I18N.t('c4.common.save')}</button></div>`);
      m.el.querySelector('#hCancel').onclick=()=>m.close();
      m.el.querySelector('#hSave').onclick=async()=>{
        if(!formVal(m.el,'date')||!formVal(m.el,'name')){toast(I18N.t('c4.leave.dateNameRequired'),'warn');return;}
        await API.call('saveHoliday',collectForm(m.el)); m.close(); toast(I18N.t('c4.leave.holidayAdded'),'success'); App.route();
      };
    };
  }
  else{
    const rows=await API.call('listLeaveRequests');
    body.innerHTML=tableHTML([
      {label:I18N.t('c4.common.employee'), get:r=>`<span class="font-medium text-slate-700">${esc(r.employeeName)}</span>`},
      {label:I18N.t('c4.leave.colType'), get:r=>esc(r.typeName)},
      {label:I18N.t('c4.common.from'), get:r=>fmtDate(r.from)},
      {label:I18N.t('c4.common.to'), get:r=>fmtDate(r.to)},
      {label:I18N.t('c4.leave.colDays'), num:1, get:r=>fmtNum(r.days)},
      {label:I18N.t('c4.common.reason'), get:r=>`<span class="text-slate-500 text-xs">${esc(r.reason||'—')}</span>`},
      {label:I18N.t('c4.common.status'), get:r=>r.status==='pending'?badge(I18N.t('c4.common.pending'),'amber'):r.status==='approved'?badge(I18N.t('c4.common.approved'),'emerald'):badge(I18N.t('c4.common.rejected'),'red')},
      {label:'', get:r=>r.status==='pending'&&canEdit?`<div class="flex gap-1 justify-end">
        <button class="${btnS} !px-3 !py-1.5 !text-xs !text-emerald-700" data-ok="${r.id}">${I18N.t('c4.common.approve')}</button>
        <button class="${btnS} !px-3 !py-1.5 !text-xs !text-red-600" data-no="${r.id}">${I18N.t('c4.common.reject')}</button></div>`:`<span class="text-xs text-slate-400">${esc(r.decidedBy||'')}</span>`},
    ], rows, {empty:I18N.t('c4.leave.emptyRequests')});
    body.querySelectorAll('[data-ok]').forEach(b=>b.onclick=async()=>{ await API.call('decideLeave',b.dataset.ok,'approved'); toast(I18N.t('c4.leave.leaveApproved'),'success'); App.route(); });
    body.querySelectorAll('[data-no]').forEach(b=>b.onclick=async()=>{ await API.call('decideLeave',b.dataset.no,'rejected'); toast(I18N.t('c4.leave.leaveRejected'),'success'); App.route(); });
  }

  function typeEditor(t){
    const isNew=!t; t=t||{name:'',quota:0,paid:true};
    const m=modal(isNew?I18N.t('c4.leave.addTypeTitle'):I18N.t('c4.leave.editTypeTitle'),`
      ${field(I18N.t('c4.leave.fTypeName'),'name',{value:t.name,req:true})}
      <div class="grid grid-cols-2 gap-4 mt-4">
        ${field(I18N.t('c4.leave.fQuota'),'quota',{value:t.quota,type:'number',min:0})}
        <div class="flex items-end pb-2.5">${field(I18N.t('c4.leave.fPaidLeave'),'paid',{type:'checkbox',value:t.paid})}</div>
      </div>
      <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="tCancel">${I18N.t('c4.common.cancel')}</button><button class="${btnP}" id="tSave">${I18N.t('c4.common.save')}</button></div>`);
    m.el.querySelector('#tCancel').onclick=()=>m.close();
    m.el.querySelector('#tSave').onclick=async()=>{
      const data=collectForm(m.el); if(!data.name){toast(I18N.t('c4.emp.nameRequired'),'warn');return;}
      await API.call('saveLeaveType',{...(isNew?{}:{id:t.id}),...data}); m.close(); toast(I18N.t('c4.leave.typeSaved'),'success'); App.route();
    };
  }

  document.getElementById(cid+'-req').onclick=()=>{
    const m=modal(I18N.t('c4.leave.reqLeaveTitle'),`
      <div class="grid grid-cols-2 gap-4">
        ${field(I18N.t('c4.common.employee'),'employeeId',{type:'select',options:emps.filter(e=>e.active).map(e=>({value:e.id,label:e.name}))})}
        ${field(I18N.t('c4.leave.fLeaveType'),'typeId',{type:'select',options:types.map(t=>({value:t.id,label:t.name+' '+I18N.t('c4.leave.quotaYr').replace('{n}',t.quota)}))})}
        ${field(I18N.t('c4.common.from'),'from',{type:'date',value:todayISO(),req:true})}
        ${field(I18N.t('c4.common.to'),'to',{type:'date',value:todayISO(),req:true})}
        <div class="col-span-2">${field(I18N.t('c4.common.reason'),'reason',{type:'textarea',ph:I18N.t('c4.leave.phReason')})}</div>
      </div>
      <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="lCancel">${I18N.t('c4.common.cancel')}</button><button class="${btnP}" id="lSend">${I18N.t('c4.leave.submitRequest')}</button></div>`);
    m.el.querySelector('#lCancel').onclick=()=>m.close();
    m.el.querySelector('#lSend').onclick=async()=>{
      const d=collectForm(m.el);
      if(!d.from||!d.to){toast(I18N.t('c4.leave.datesRequired'),'warn');return;}
      await API.call('requestLeave',d.employeeId,d.typeId,d.from,d.to,d.reason);
      m.close(); toast(I18N.t('c4.leave.leaveSubmitted'),'success'); App.route();
    };
  };
};
})();
