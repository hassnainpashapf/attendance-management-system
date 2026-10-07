/* 90_overtime.js — overtime request list with approve/revoke. */
(function(){
'use strict';

App.nav.push({group:'PEOPLE', path:'#/overtime', label:'Overtime', icon:'overtime', perm:'overtime'});

App.routes['#/overtime'] = async (el)=>{
  const cid=uid('ot');
  const canEdit=perm('overtime','edit');
  el.innerHTML=pageHead('Overtime','Extra hours worked beyond shift',
    `<button class="${btnP}" id="${cid}-add">+ Log Overtime</button>`)+
  `<div class="flex gap-2 mb-5">
    <select id="${cid}-f" class="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500/40 focus:outline-none">
      <option value="">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
    </select>
  </div><div id="${cid}-body"></div>`;
  const body=document.getElementById(cid+'-body');
  const fEl=document.getElementById(cid+'-f');
  const emps=await API.call('listEmployees').catch(()=>[]);

  async function load(){
    const rows=await API.call('listOvertime',fEl.value||'');
    const totalHrs=rows.reduce((a,r)=>a+Number(r.hours||0),0);
    const totalAmt=rows.filter(r=>r.status==='approved').reduce((a,r)=>a+Number(r.amount||0),0);
    body.innerHTML=`
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        ${statCard('Requests',fmtNum(rows.length),'In this view','violet',App.ICONS.overtime,rows.length)}
        ${statCard('Hours logged',fmtNum(totalHrs),'Total hours','blue',App.ICONS.shifts,totalHrs)}
        ${statCard('Approved payout',fmt(totalAmt),'Approved only','emerald',App.ICONS.payroll,Math.round(totalAmt),'Rs ')}
        ${statCard('Pending',fmtNum(rows.filter(r=>r.status==='pending').length),'Awaiting decision','amber',App.ICONS.leave,rows.filter(r=>r.status==='pending').length)}
      </div>`+tableHTML([
      {label:'Date', get:r=>`<span class="tabular-nums">${fmtDate(r.date)}</span>`},
      {label:'Employee', get:r=>`<span class="font-medium text-slate-700">${esc(r.employeeName)}</span>`},
      {label:'Hours', num:1, get:r=>`<span class="tabular-nums font-semibold">${r.hours}</span>`},
      {label:'Rate', num:1, get:r=>`<span class="tabular-nums">${fmt(r.rate)}/hr</span>`},
      {label:'Amount', num:1, get:r=>`<span class="tabular-nums font-semibold text-slate-800">${fmt(r.amount)}</span>`},
      {label:'Reason', get:r=>`<span class="text-slate-500 text-xs">${esc(r.reason||'—')}</span>`},
      {label:'Status', get:r=>r.status==='pending'?badge('Pending','amber'):r.status==='approved'?badge('Approved','emerald'):badge('Rejected','red')},
      {label:'', get:r=>r.status==='pending'&&canEdit?`<div class="flex gap-1 justify-end">
        <button class="${btnS} !px-3 !py-1.5 !text-xs !text-emerald-700" data-ok="${r.id}">Approve</button>
        <button class="${btnS} !px-3 !py-1.5 !text-xs !text-red-600" data-no="${r.id}">Reject</button></div>`
        :(r.status==='approved'&&canEdit?`<div class="flex justify-end"><button class="${btnS} !px-3 !py-1.5 !text-xs" data-revoke="${r.id}">Revoke</button></div>`:`<span class="text-xs text-slate-400">${esc(r.approvedBy||'')}</span>`)},
    ], rows, {empty:'No overtime records.'});
    body.querySelectorAll('[data-ok]').forEach(b=>b.onclick=async()=>{ await API.call('decideOvertime',b.dataset.ok,'approved'); toast('Overtime approved','success'); load(); });
    body.querySelectorAll('[data-no]').forEach(b=>b.onclick=async()=>{ await API.call('decideOvertime',b.dataset.no,'rejected'); toast('Overtime rejected','success'); load(); });
    body.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=async()=>{ await API.call('decideOvertime',b.dataset.revoke,'rejected'); toast('Approval revoked','success'); load(); });
  }
  fEl.onchange=load;
  document.getElementById(cid+'-add').onclick=()=>{
    const m=modal('Log Overtime',`
      <div class="grid grid-cols-2 gap-4">
        ${field('Employee','employeeId',{type:'select',options:emps.filter(e=>e.active).map(e=>({value:e.id,label:e.name}))})}
        ${field('Date','date',{type:'date',value:todayISO(),req:true})}
        ${field('Hours','hours',{type:'number',value:2,min:0.5,step:0.5,req:true})}
        ${field('Rate (Rs/hr)','rate',{type:'number',value:250,min:0,req:true})}
        <div class="col-span-2">${field('Reason','reason',{type:'textarea',ph:'Why was overtime needed?'})}</div>
      </div>
      <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="oCancel">Cancel</button><button class="${btnP}" id="oSave">Save</button></div>`);
    m.el.querySelector('#oCancel').onclick=()=>m.close();
    m.el.querySelector('#oSave').onclick=async()=>{
      const d=collectForm(m.el);
      await API.call('requestOvertime',d.employeeId,d.date,d.hours,d.rate,d.reason);
      m.close(); toast('Overtime logged','success'); load();
    };
  };
  await load();
};
})();
