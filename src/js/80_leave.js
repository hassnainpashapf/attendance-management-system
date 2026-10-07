/* 80_leave.js — leave types, balances, requests approve/reject, holidays. */
(function(){
'use strict';

App.nav.push({group:'PEOPLE', path:'#/leave', label:'Leave', icon:'leave', perm:'leave'});

App.routes['#/leave'] = async (el, params)=>{
  const cid=uid('leave');
  const tab=(params&&params.tab)||'requests';
  const canEdit=perm('leave','edit');
  el.innerHTML=pageHead('Leave Management','Requests, balances, types and holidays',
    `${canEdit?`<button class="${btnS}" id="${cid}-holiday">+ Holiday</button><button class="${btnS}" id="${cid}-type">+ Leave Type</button>`:''}<button class="${btnP}" id="${cid}-req">Request Leave</button>`)+`
  <div class="flex gap-2 mb-5 flex-wrap">
    ${[['requests','Requests'],['balances','Balances'],['types','Leave Types'],['holidays','Holidays']].map(([k,l])=>
      `<a href="#/leave${k==='requests'?'':'?tab='+k}" class="px-4 py-2 rounded-xl text-sm font-semibold ${tab===k?'bg-teal-600 text-white shadow':'bg-white text-slate-500 border border-slate-200'}">${l}</a>`).join('')}
  </div>
  <div id="${cid}-body"></div>`;
  const body=document.getElementById(cid+'-body');
  const emps=await API.call('listEmployees').catch(()=>[]);
  const types=await API.call('listLeaveTypes').catch(()=>[]);

  if(tab==='types'){
    body.innerHTML=tableHTML([
      {label:'Type', get:t=>`<span class="font-semibold text-slate-700">${esc(t.name)}</span>`},
      {label:'Annual quota', num:1, get:t=>t.quota?fmtNum(t.quota)+' days':'—'},
      {label:'Paid', get:t=>t.paid?badge('Paid','emerald'):badge('Unpaid','slate')},
      {label:'', get:t=>canEdit?`<div class="flex gap-1 justify-end"><button class="${btnS} !px-3 !py-1.5 !text-xs" data-te="${t.id}">Edit</button><button class="${btnS} !px-3 !py-1.5 !text-xs !text-red-600" data-td="${t.id}">Delete</button></div>`:''},
    ], types, {empty:'No leave types yet.'});
    body.querySelectorAll('[data-te]').forEach(b=>b.onclick=()=>typeEditor(types.find(t=>t.id===b.dataset.te)));
    body.querySelectorAll('[data-td]').forEach(b=>b.onclick=async()=>{
      if(!await confirmDlg('Delete leave type?','Existing requests keep their type name.','Delete')) return;
      await API.call('deleteLeaveType',b.dataset.td); toast('Deleted','success'); App.route();
    });
    const tb=document.getElementById(cid+'-type'); if(tb) tb.onclick=()=>typeEditor(null);
  }
  else if(tab==='balances'){
    const rows=await API.call('getLeaveBalances',new Date().getFullYear());
    body.innerHTML=tableHTML([
      {label:'Employee', get:r=>`<div><div class="font-medium text-slate-700">${esc(r.employeeName)}</div><div class="text-xs text-slate-400">${esc(r.employeeCode)}</div></div>`},
      ...types.map(t=>({label:t.name, get:r=>{ const x=(r.types||[]).find(y=>y.typeId===t.id)||{used:0,quota:t.quota,left:t.quota};
        return `<div class="text-center"><div class="text-sm font-semibold tabular-nums ${x.left<=2&&x.quota?'text-amber-600':'text-slate-700'}">${x.left}<span class="text-slate-400 font-normal">/${x.quota||'∞'}</span></div><div class="text-[10px] text-slate-400">left</div></div>`;}})),
    ], rows, {empty:'No employees.'});
  }
  else if(tab==='holidays'){
    const rows=await API.call('listHolidays');
    body.innerHTML=tableHTML([
      {label:'Date', get:h=>`<span class="tabular-nums font-medium">${fmtDate(h.date)}</span>`},
      {label:'Holiday', get:h=>`<span class="font-medium text-slate-700">${esc(h.name)}</span>`},
      {label:'', get:h=>canEdit?`<div class="flex justify-end"><button class="${btnS} !px-3 !py-1.5 !text-xs !text-red-600" data-hd="${h.id}">Delete</button></div>`:''},
    ], rows, {empty:'No holidays defined.'});
    body.querySelectorAll('[data-hd]').forEach(b=>b.onclick=async()=>{
      await API.call('deleteHoliday',b.dataset.hd); toast('Holiday removed','success'); App.route();
    });
    const hb=document.getElementById(cid+'-holiday');
    if(hb) hb.onclick=()=>{
      const m=modal('Add Holiday',`${field('Date','date',{type:'date',value:todayISO(),req:true})}${field('Name','name',{req:true,ph:'e.g. Eid ul-Fitr'})}
        <div class="flex justify-end gap-2 mt-5"><button class="${btnS}" id="hCancel">Cancel</button><button class="${btnP}" id="hSave">Save</button></div>`);
      m.el.querySelector('#hCancel').onclick=()=>m.close();
      m.el.querySelector('#hSave').onclick=async()=>{
        if(!formVal(m.el,'date')||!formVal(m.el,'name')){toast('Date and name required','warn');return;}
        await API.call('saveHoliday',collectForm(m.el)); m.close(); toast('Holiday added','success'); App.route();
      };
    };
  }
  else{
    const rows=await API.call('listLeaveRequests');
    body.innerHTML=tableHTML([
      {label:'Employee', get:r=>`<span class="font-medium text-slate-700">${esc(r.employeeName)}</span>`},
      {label:'Type', get:r=>esc(r.typeName)},
      {label:'From', get:r=>fmtDate(r.from)},
      {label:'To', get:r=>fmtDate(r.to)},
      {label:'Days', num:1, get:r=>fmtNum(r.days)},
      {label:'Reason', get:r=>`<span class="text-slate-500 text-xs">${esc(r.reason||'—')}</span>`},
      {label:'Status', get:r=>r.status==='pending'?badge('Pending','amber'):r.status==='approved'?badge('Approved','emerald'):badge('Rejected','red')},
      {label:'', get:r=>r.status==='pending'&&canEdit?`<div class="flex gap-1 justify-end">
        <button class="${btnS} !px-3 !py-1.5 !text-xs !text-emerald-700" data-ok="${r.id}">Approve</button>
        <button class="${btnS} !px-3 !py-1.5 !text-xs !text-red-600" data-no="${r.id}">Reject</button></div>`:`<span class="text-xs text-slate-400">${esc(r.decidedBy||'')}</span>`},
    ], rows, {empty:'No leave requests.'});
    body.querySelectorAll('[data-ok]').forEach(b=>b.onclick=async()=>{ await API.call('decideLeave',b.dataset.ok,'approved'); toast('Leave approved','success'); App.route(); });
    body.querySelectorAll('[data-no]').forEach(b=>b.onclick=async()=>{ await API.call('decideLeave',b.dataset.no,'rejected'); toast('Leave rejected','success'); App.route(); });
  }

  function typeEditor(t){
    const isNew=!t; t=t||{name:'',quota:0,paid:true};
    const m=modal(isNew?'Add Leave Type':'Edit Leave Type',`
      ${field('Type name','name',{value:t.name,req:true})}
      <div class="grid grid-cols-2 gap-4 mt-4">
        ${field('Annual quota (days)','quota',{value:t.quota,type:'number',min:0})}
        <div class="flex items-end pb-2.5">${field('Paid leave','paid',{type:'checkbox',value:t.paid})}</div>
      </div>
      <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="tCancel">Cancel</button><button class="${btnP}" id="tSave">Save</button></div>`);
    m.el.querySelector('#tCancel').onclick=()=>m.close();
    m.el.querySelector('#tSave').onclick=async()=>{
      const data=collectForm(m.el); if(!data.name){toast('Name required','warn');return;}
      await API.call('saveLeaveType',{...(isNew?{}:{id:t.id}),...data}); m.close(); toast('Leave type saved','success'); App.route();
    };
  }

  document.getElementById(cid+'-req').onclick=()=>{
    const m=modal('Request Leave',`
      <div class="grid grid-cols-2 gap-4">
        ${field('Employee','employeeId',{type:'select',options:emps.filter(e=>e.active).map(e=>({value:e.id,label:e.name}))})}
        ${field('Leave type','typeId',{type:'select',options:types.map(t=>({value:t.id,label:t.name+' ('+t.quota+'d/yr)'}))})}
        ${field('From','from',{type:'date',value:todayISO(),req:true})}
        ${field('To','to',{type:'date',value:todayISO(),req:true})}
        <div class="col-span-2">${field('Reason','reason',{type:'textarea',ph:'Brief reason for leave'})}</div>
      </div>
      <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="lCancel">Cancel</button><button class="${btnP}" id="lSend">Submit request</button></div>`);
    m.el.querySelector('#lCancel').onclick=()=>m.close();
    m.el.querySelector('#lSend').onclick=async()=>{
      const d=collectForm(m.el);
      if(!d.from||!d.to){toast('Dates required','warn');return;}
      await API.call('requestLeave',d.employeeId,d.typeId,d.from,d.to,d.reason);
      m.close(); toast('Leave request submitted','success'); App.route();
    };
  };
};
})();
