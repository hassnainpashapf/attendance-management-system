/* 90_overtime.js — overtime request list with approve/revoke. */
(function(){
'use strict';

App.nav.push({group:'PEOPLE', path:'#/overtime', label:I18N.t('c4.nav.overtime'), labelKey:'c4.nav.overtime', icon:'overtime', perm:'overtime'});

App.routes['#/overtime'] = async (el)=>{
  const cid=uid('ot');
  const canEdit=perm('overtime','edit');
  el.innerHTML=pageHead(I18N.t('c4.nav.overtime'),I18N.t('c4.ot.sub'),
    `<button class="${btnP}" id="${cid}-add">${I18N.t('c4.ot.logOvertime')}</button>`)+
  `<div class="flex gap-2 mb-5">
    <select id="${cid}-f" class="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500/40 focus:outline-none">
      <option value="">${I18N.t('c4.ot.allStatuses')}</option><option value="pending">${I18N.t('c4.common.pending')}</option><option value="approved">${I18N.t('c4.common.approved')}</option><option value="rejected">${I18N.t('c4.common.rejected')}</option>
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
        ${statCard(I18N.t('c4.ot.kpiRequests'),fmtNum(rows.length),I18N.t('c4.ot.kpiRequestsSub'),'violet',App.ICONS.overtime,rows.length)}
        ${statCard(I18N.t('c4.ot.kpiHours'),fmtNum(totalHrs),I18N.t('c4.ot.kpiHoursSub'),'blue',App.ICONS.shifts,totalHrs)}
        ${statCard(I18N.t('c4.ot.kpiPayout'),fmt(totalAmt),I18N.t('c4.ot.kpiPayoutSub'),'emerald',App.ICONS.payroll,Math.round(totalAmt),'Rs ')}
        ${statCard(I18N.t('c4.ot.kpiPending'),fmtNum(rows.filter(r=>r.status==='pending').length),I18N.t('c4.ot.kpiPendingSub'),'amber',App.ICONS.leave,rows.filter(r=>r.status==='pending').length)}
      </div>`+tableHTML([
      {label:I18N.t('c4.common.date'), get:r=>`<span class="tabular-nums">${fmtDate(r.date)}</span>`},
      {label:I18N.t('c4.common.employee'), get:r=>`<span class="font-medium text-slate-700">${esc(r.employeeName)}</span>`},
      {label:I18N.t('c4.ot.colHours'), num:1, get:r=>`<span class="tabular-nums font-semibold">${r.hours}</span>`},
      {label:I18N.t('c4.ot.colRate'), num:1, get:r=>`<span class="tabular-nums">${I18N.t('c4.ot.perHour').replace('{s}',fmt(r.rate))}</span>`},
      {label:I18N.t('c4.ot.colAmount'), num:1, get:r=>`<span class="tabular-nums font-semibold text-slate-800">${fmt(r.amount)}</span>`},
      {label:I18N.t('c4.common.reason'), get:r=>`<span class="text-slate-500 text-xs">${esc(r.reason||'—')}</span>`},
      {label:I18N.t('c4.common.status'), get:r=>r.status==='pending'?badge(I18N.t('c4.common.pending'),'amber'):r.status==='approved'?badge(I18N.t('c4.common.approved'),'emerald'):badge(I18N.t('c4.common.rejected'),'red')},
      {label:'', get:r=>r.status==='pending'&&canEdit?`<div class="flex gap-1 justify-end">
        <button class="${btnS} !px-3 !py-1.5 !text-xs !text-emerald-700" data-ok="${r.id}">${I18N.t('c4.common.approve')}</button>
        <button class="${btnS} !px-3 !py-1.5 !text-xs !text-red-600" data-no="${r.id}">${I18N.t('c4.common.reject')}</button></div>`
        :(r.status==='approved'&&canEdit?`<div class="flex justify-end"><button class="${btnS} !px-3 !py-1.5 !text-xs" data-revoke="${r.id}">${I18N.t('c4.common.revoke')}</button></div>`:`<span class="text-xs text-slate-400">${esc(r.approvedBy||'')}</span>`)},
    ], rows, {empty:I18N.t('c4.ot.emptyOt')});
    body.querySelectorAll('[data-ok]').forEach(b=>b.onclick=async()=>{ await API.call('decideOvertime',b.dataset.ok,'approved'); toast(I18N.t('c4.ot.otApproved'),'success'); load(); });
    body.querySelectorAll('[data-no]').forEach(b=>b.onclick=async()=>{ await API.call('decideOvertime',b.dataset.no,'rejected'); toast(I18N.t('c4.ot.otRejected'),'success'); load(); });
    body.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=async()=>{ await API.call('decideOvertime',b.dataset.revoke,'rejected'); toast(I18N.t('c4.ot.approvalRevoked'),'success'); load(); });
  }
  fEl.onchange=load;
  document.getElementById(cid+'-add').onclick=()=>{
    const m=modal(I18N.t('c4.ot.logOtTitle'),`
      <div class="grid grid-cols-2 gap-4">
        ${field(I18N.t('c4.common.employee'),'employeeId',{type:'select',options:emps.filter(e=>e.active).map(e=>({value:e.id,label:e.name}))})}
        ${field(I18N.t('c4.common.date'),'date',{type:'date',value:todayISO(),req:true})}
        ${field(I18N.t('c4.ot.fHours'),'hours',{type:'number',value:2,min:0.5,step:0.5,req:true})}
        ${field(I18N.t('c4.ot.fRate'),'rate',{type:'number',value:250,min:0,req:true})}
        <div class="col-span-2">${field(I18N.t('c4.common.reason'),'reason',{type:'textarea',ph:I18N.t('c4.ot.phOtReason')})}</div>
      </div>
      <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="oCancel">${I18N.t('c4.common.cancel')}</button><button class="${btnP}" id="oSave">${I18N.t('c4.common.save')}</button></div>`);
    m.el.querySelector('#oCancel').onclick=()=>m.close();
    m.el.querySelector('#oSave').onclick=async()=>{
      const d=collectForm(m.el);
      await API.call('requestOvertime',d.employeeId,d.date,d.hours,d.rate,d.reason);
      m.close(); toast(I18N.t('c4.ot.otLogged'),'success'); load();
    };
  };
  await load();
};
})();
