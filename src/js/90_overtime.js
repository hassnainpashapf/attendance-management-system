/* 90_overtime.js — overtime request list with approve/revoke.
   (Verola premium style) */
(function(){
'use strict';

App.nav.push({group:'PEOPLE', path:'#/overtime', label:I18N.t('c4.nav.overtime'), labelKey:'c4.nav.overtime', icon:'overtime', perm:'overtime'});

/* ---------- Verola bits (shared style with payroll) ---------- */
function vAvatar(name){ return avatar(name); }

function vCrumb(page){
  return `<div class="flex items-center gap-2 text-[13px] text-slate-400 mb-4 anim-fadeUp">
    <span class="text-base">⌂</span><a href="#/dashboard" class="hover:text-slate-600">${I18N.t('c4.nav.dashboard')}</a><span>›</span><span class="text-slate-700 font-semibold">${page}</span></div>`;
}
const V_BLACK='px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold shadow active:scale-[.98] transition';
function vKpi(label, value, sub, ico){
  return `<div class="bg-white rounded-2xl border border-slate-200/70 p-5 shadow-[0_1px_3px_rgba(15,23,42,.04)]">
    <div class="flex items-center gap-2.5 mb-4">
      <span class="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">${ico}</span>
      <span class="text-[13px] text-slate-500 font-medium">${label}</span>
      <span class="ml-auto w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 text-slate-400 text-sm font-bold flex items-center justify-center shrink-0 select-none">···</span>
    </div>
    <div class="text-[26px] font-bold text-slate-900 tabular-nums tracking-tight">${value}</div>
    ${sub?`<div class="text-xs text-slate-400 mt-1.5">${sub}</div>`:''}
  </div>`;
}
function vPill(text, color, icon){
  const c={emerald:'bg-emerald-50 text-emerald-700 ring-emerald-200',amber:'bg-amber-50 text-amber-700 ring-amber-200',red:'bg-red-50 text-red-600 ring-red-200',slate:'bg-slate-100 text-slate-500 ring-slate-200',teal:'bg-teal-50 text-teal-700 ring-teal-200',blue:'bg-blue-50 text-blue-700 ring-blue-200'}[color]||'bg-slate-100 text-slate-500 ring-slate-200';
  return `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${c} ring-1 whitespace-nowrap">${icon?`<span class="text-[10px]">${icon}</span>`:''}${text}</span>`;
}
function vPaginate(pg, st, render){
  const pages=Math.max(1,Math.ceil(st.total/st.per));
  if(st.page>pages) st.page=pages;
  const from=st.total?(st.page-1)*st.per+1:0, to=Math.min(st.total,st.page*st.per);
  let nums=''; for(let p=1;p<=pages;p++){ if(p===1||p===pages||Math.abs(p-st.page)<=1) nums+=`<button data-pg="${p}" class="min-w-[32px] h-8 px-2 rounded-lg text-[13px] font-semibold ${p===st.page?'bg-slate-900 text-white':'text-slate-500 hover:bg-slate-100'}">${p}</button>`; else if(!nums.endsWith('…')) nums+='<span class="text-slate-300">…</span>'; }
  pg.innerHTML=`
    <button data-pgprev class="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40" ${st.page<=1?'disabled':''}>‹</button>${nums}
    <button data-pgnext class="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40" ${st.page>=pages?'disabled':''}>›</button>
    <span class="ml-auto text-xs text-slate-400">Showing ${from} to ${to} of ${st.total} entries</span>
    <select data-per class="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-600">${[8,16,50].map(n=>`<option ${n===st.per?'selected':''}>${n}</option>`).join('')}</select>`;
  if(!pg) return;
  const bPrev=pg.querySelector('[data-pgprev]'); if(bPrev) bPrev.onclick=()=>{ if(st.page>1){st.page--;render();} };
  const bNext=pg.querySelector('[data-pgnext]'); if(bNext) bNext.onclick=()=>{ if(st.page<pages){st.page++;render();} };
  pg.querySelectorAll('[data-pg]').forEach(b=>b.onclick=()=>{ st.page=+b.dataset.pg; render(); });
  const bPer=pg.querySelector('[data-per]'); if(bPer) bPer.onchange=e=>{ st.per=+e.target.value; st.page=1; render(); };
}
const V_TH='px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap';
const V_CARD='bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.04)] overflow-hidden anim-fadeUp';

App.routes['#/overtime'] = async (el)=>{
  const cid=uid('ot');
  const canEdit=perm('overtime','edit');
  const emps=await API.call('listEmployees').catch(()=>[]);

  el.innerHTML=`
  <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
    <div class="inline-flex items-center gap-1 bg-slate-100 rounded-xl p-1" id="${cid}-range">
      <button data-range="all" class="px-4 py-2 rounded-lg text-[13px] font-semibold bg-white shadow-sm text-slate-800 ring-1 ring-slate-200">${I18N.t('c4.ot.allStatuses')}</button>
      <button data-range="pending" class="px-4 py-2 rounded-lg text-[13px] font-semibold text-slate-400 hover:text-slate-600">${I18N.t('c4.common.pending')}</button>
      <button data-range="approved" class="px-4 py-2 rounded-lg text-[13px] font-semibold text-slate-400 hover:text-slate-600">${I18N.t('c4.common.approved')}</button>
      <button data-range="rejected" class="px-4 py-2 rounded-lg text-[13px] font-semibold text-slate-400 hover:text-slate-600">${I18N.t('c4.common.rejected')}</button>
    </div>
    <button class="${V_BLACK}" id="${cid}-add">+ ${I18N.t('c4.ot.logOvertime')}</button>
  </div>
  <div id="${cid}-body"></div>`;
  const body=document.getElementById(cid+'-body');
  const st={status:'',q:'',page:1,per:8,total:0};
  const icoO=App.ICONS&&App.ICONS.overtime?App.ICONS.overtime:'';
  const icoS=App.ICONS&&App.ICONS.shifts?App.ICONS.shifts:'';
  const icoP=App.ICONS&&App.ICONS.payroll?App.ICONS.payroll:'';
  const icoL=App.ICONS&&App.ICONS.leave?App.ICONS.leave:'';

  async function load(){
    const rows=await API.call('listOvertime',st.status);
    const totalHrs=rows.reduce((a,r)=>a+Number(r.hours||0),0);
    const totalAmt=rows.filter(r=>r.status==='approved').reduce((a,r)=>a+Number(r.amount||0),0);
    const pendingN=rows.filter(r=>r.status==='pending').length;
    body.innerHTML=`
      <div class="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5 anim-fadeUp">
        ${vKpi(I18N.t('c4.ot.kpiRequests'), fmtNum(rows.length), I18N.t('c4.ot.kpiRequestsSub'), icoO)}
        ${vKpi(I18N.t('c4.ot.kpiHours'), fmtNum(totalHrs), I18N.t('c4.ot.kpiHoursSub'), icoS)}
        ${vKpi(I18N.t('c4.ot.kpiPayout'), fmt(totalAmt), I18N.t('c4.ot.kpiPayoutSub'), icoP)}
        ${vKpi(I18N.t('c4.ot.kpiPending'), fmtNum(pendingN), I18N.t('c4.ot.kpiPendingSub'), icoL)}
      </div>
      <div class="${V_CARD}">
        <div class="flex flex-wrap items-center gap-2.5 p-4 border-b border-slate-100">
          <div class="relative flex-1 min-w-[180px] max-w-xs">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
            <input id="${cid}-q" placeholder="Search..." value="${esc(st.q)}" class="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:outline-none">
          </div>
        </div>
        <div id="${cid}-tbl"></div>
        <div id="${cid}-pg" class="flex flex-wrap items-center gap-2 px-4 py-3.5 border-t border-slate-100"></div>
      </div>`;
    const tbl=document.getElementById(cid+'-tbl'), pg=document.getElementById(cid+'-pg');
    function filtered(){
      const q=st.q.trim().toLowerCase();
      if(!q) return rows;
      return rows.filter(r=>String(r.employeeName).toLowerCase().includes(q));
    }
    function render(){
      const fr=filtered(); st.total=fr.length;
      const slice=fr.slice((st.page-1)*st.per, st.page*st.per);
      tbl.innerHTML=`<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b border-slate-100">
        ${[I18N.t('c4.common.date'),I18N.t('c4.common.employee'),I18N.t('c4.ot.colHours'),I18N.t('c4.ot.colRate'),I18N.t('c4.ot.colAmount'),I18N.t('c4.common.reason'),I18N.t('c4.common.status')].map((h,i)=>`<th class="${V_TH} ${i>=2&&i<=4?'text-right':''}">${h} <span class="text-slate-300">↕</span></th>`).join('')}
        <th class="${V_TH} text-right">Actions</th></tr></thead>
        <tbody class="divide-y divide-slate-50">${slice.length?slice.map(r=>`<tr class="hover:bg-slate-50/70 transition-colors">
          <td class="px-4 py-3 tabular-nums text-slate-600 whitespace-nowrap">${fmtDate(r.date)}</td>
          <td class="px-4 py-3"><div class="flex items-center gap-2.5">${vAvatar(r.employeeName)}<span class="font-medium text-slate-700 whitespace-nowrap">${esc(r.employeeName)}</span></div></td>
          <td class="px-4 py-3 text-right"><span class="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 tabular-nums">${r.hours}h</span></td>
          <td class="px-4 py-3 text-right tabular-nums text-slate-600">${I18N.t('c4.ot.perHour').replace('{s}',fmt(r.rate))}</td>
          <td class="px-4 py-3 text-right tabular-nums font-semibold text-slate-800">${fmt(r.amount)}</td>
          <td class="px-4 py-3"><span class="text-slate-500 text-[13px] line-clamp-2 max-w-[220px]">${esc(r.reason||'—')}</span></td>
          <td class="px-4 py-3">${r.status==='pending'?vPill(I18N.t('c4.common.pending'),'amber','◷'):r.status==='approved'?vPill(I18N.t('c4.common.approved'),'emerald','✓'):vPill(I18N.t('c4.common.rejected'),'red','✕')}</td>
          <td class="px-4 py-3 text-right">${r.status==='pending'&&canEdit?`<div class="flex gap-1.5 justify-end">
            <button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 transition" data-ok="${r.id}">${I18N.t('c4.common.approve')}</button>
            <button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600 ring-1 ring-red-200 hover:bg-red-100 transition" data-no="${r.id}">${I18N.t('c4.common.reject')}</button></div>`
            :(r.status==='approved'&&canEdit?`<button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-500 hover:border-slate-300 transition" data-revoke="${r.id}">${I18N.t('c4.common.revoke')}</button>`
            :`<span class="text-xs text-slate-400">${esc(r.approvedBy||'')}</span>`)}</td>
        </tr>`).join(''):`<tr><td colspan="8" class="px-4 py-14 text-center"><div class="text-slate-300 text-3xl mb-2">◌</div><div class="text-sm text-slate-400">${I18N.t('c4.ot.emptyOt')}</div></td></tr>`}
        </tbody></table></div>`;
      vPaginate(pg, st, render);
      tbl.querySelectorAll('[data-ok]').forEach(b=>b.onclick=async()=>{ await API.call('decideOvertime',b.dataset.ok,'approved'); toast(I18N.t('c4.ot.otApproved'),'success'); load(); });
      tbl.querySelectorAll('[data-no]').forEach(b=>b.onclick=async()=>{ await API.call('decideOvertime',b.dataset.no,'rejected'); toast(I18N.t('c4.ot.otRejected'),'success'); load(); });
      tbl.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=async()=>{ await API.call('decideOvertime',b.dataset.revoke,'rejected'); toast(I18N.t('c4.ot.approvalRevoked'),'success'); load(); });
    }
    const qIn=document.getElementById(cid+'-q');
    qIn.oninput=debounce(()=>{ st.q=qIn.value; st.page=1; render(); },300);
    render();
  }
  el.querySelectorAll('#'+cid+'-range [data-range]').forEach(b=>b.onclick=()=>{
    el.querySelectorAll('#'+cid+'-range [data-range]').forEach(x=>x.className='px-4 py-2 rounded-lg text-[13px] font-semibold text-slate-400 hover:text-slate-600');
    b.className='px-4 py-2 rounded-lg text-[13px] font-semibold bg-white shadow-sm text-slate-800 ring-1 ring-slate-200';
    st.status=b.dataset.range==='all'?'':b.dataset.range;
    st.page=1; load();
  });
  const addBtn=document.getElementById(cid+'-add'); if(addBtn) addBtn.onclick=()=>{
    const m=modal(I18N.t('c4.ot.logOtTitle'),`
      <div class="grid grid-cols-2 gap-4">
        ${field(I18N.t('c4.common.employee'),'employeeId',{type:'select',options:emps.filter(e=>e.active).map(e=>({value:e.id,label:e.name}))})}
        ${field(I18N.t('c4.common.date'),'date',{type:'date',value:todayISO(),req:true})}
        ${field(I18N.t('c4.ot.fHours'),'hours',{type:'number',value:2,min:0.5,step:0.5,req:true})}
        ${field(I18N.t('c4.ot.fRate'),'rate',{type:'number',value:250,min:0,req:true})}
        <div class="col-span-2">${field(I18N.t('c4.common.reason'),'reason',{type:'textarea',ph:I18N.t('c4.ot.phOtReason')})}</div>
      </div>
      <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="oCancel">${I18N.t('c4.common.cancel')}</button><button class="${V_BLACK}" id="oSave">${I18N.t('c4.common.save')}</button></div>`);
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
