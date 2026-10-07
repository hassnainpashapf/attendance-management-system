/* 80_leave.js — leave types, balances, requests approve/reject, holidays.
   (Verola premium style) */
(function(){
'use strict';

App.nav.push({group:'PEOPLE', path:'#/leave', label:I18N.t('c4.nav.leave'), labelKey:'c4.nav.leave', icon:'leave', perm:'leave'});

/* ---------- Verola bits (shared style with payroll) ---------- */
function vAvatar(name){
  const init=(String(name||'?').trim().split(/\s+/).map(w=>w[0]).join('')||'?').slice(0,2).toUpperCase();
  return `<span class="w-8 h-8 rounded-full bg-slate-200 text-slate-500 text-[11px] font-bold inline-flex items-center justify-center shrink-0">${esc(init)}</span>`;
}
function vCrumb(page){
  return `<div class="flex items-center gap-2 text-[13px] text-slate-400 mb-4 anim-fadeUp">
    <span class="text-base">⌂</span><a href="#/dashboard" class="hover:text-slate-600">${I18N.t('c4.nav.dashboard')}</a><span>›</span><span class="text-slate-700 font-semibold">${page}</span></div>`;
}
function vTabs(tab){
  return `<div class="flex gap-2 flex-wrap">${[['requests',I18N.t('c4.leave.tabRequests')],['balances',I18N.t('c4.leave.tabBalances')],['types',I18N.t('c4.leave.tabTypes')],['holidays',I18N.t('c4.leave.tabHolidays')]].map(([k,l])=>
    `<a href="#/leave${k==='requests'?'':'?tab='+k}" class="px-4 py-2 rounded-xl text-sm font-semibold transition ${tab===k?'bg-slate-900 text-white shadow':'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'}">${l}</a>`).join('')}</div>`;
}
const V_BLACK='px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold shadow active:scale-[.98] transition';
function vKpi(label, value, sub, ico){
  return `<div class="bg-white rounded-2xl border border-slate-200/70 p-5 shadow-[0_1px_3px_rgba(15,23,42,.04)]">
    <div class="flex items-center gap-2.5 mb-4">
      <span class="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">${ico}</span>
      <span class="text-[13px] text-slate-500 font-medium">${label}</span>
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

App.routes['#/leave'] = async (el, params)=>{
  const cid=uid('leave');
  const tab=(params&&params.tab)||'requests';
  const canEdit=perm('leave','edit');
  const emps=await API.call('listEmployees').catch(()=>[]);
  const types=await API.call('listLeaveTypes').catch(()=>[]);

  el.innerHTML=vCrumb(I18N.t('c4.nav.leave'))+`
  <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
    ${vTabs(tab)}
    <div class="flex gap-2 flex-wrap">
      ${canEdit?`<button class="${btnS}" id="${cid}-holiday">+ ${I18N.t('c4.leave.addHoliday')}</button><button class="${btnS}" id="${cid}-type">+ ${I18N.t('c4.leave.addLeaveType')}</button>`:''}
      <button class="${V_BLACK}" id="${cid}-req">+ ${I18N.t('c4.leave.requestLeave')}</button>
    </div>
  </div>
  <div id="${cid}-body"></div>`;
  const body=document.getElementById(cid+'-body');

  if(tab==='types'){
    body.innerHTML=`<div class="${V_CARD}"><div id="${cid}-tbl"></div></div>
      <div class="flex justify-end mt-4">${canEdit?`<button class="${btnS}" id="${cid}-addT">+ ${I18N.t('c4.leave.addLeaveType')}</button>`:''}</div>`;
    const tbl=document.getElementById(cid+'-tbl');
    tbl.innerHTML=`<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b border-slate-100">
      ${[I18N.t('c4.leave.colType'),I18N.t('c4.leave.colQuota'),I18N.t('c4.leave.colPaid')].map((h,i)=>`<th class="${V_TH} ${i===1?'text-right':''}">${h} <span class="text-slate-300">↕</span></th>`).join('')}
      <th class="${V_TH} text-right">Actions</th></tr></thead>
      <tbody class="divide-y divide-slate-50">${types.length?types.map(t=>`<tr class="hover:bg-slate-50/70 transition-colors">
        <td class="px-4 py-3"><span class="font-semibold text-slate-700">${esc(t.name)}</span></td>
        <td class="px-4 py-3 text-right tabular-nums text-slate-600">${t.quota?I18N.t('c4.leave.daysN').replace('{n}',fmtNum(t.quota)):'—'}</td>
        <td class="px-4 py-3">${t.paid?vPill(I18N.t('c4.common.paid'),'emerald','✓'):vPill(I18N.t('c4.common.unpaid'),'slate','')}</td>
        <td class="px-4 py-3 text-right">${canEdit?`<div class="flex gap-1.5 justify-end">
          <button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-500 hover:border-slate-300 transition" data-te="${t.id}">${I18N.t('c4.common.edit')}</button>
          <button class="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition font-bold" data-td="${t.id}">✕</button></div>`:''}</td>
      </tr>`).join(''):`<tr><td colspan="4" class="px-4 py-14 text-center"><div class="text-slate-300 text-3xl mb-2">◌</div><div class="text-sm text-slate-400">${I18N.t('c4.leave.emptyTypes')}</div></td></tr>`}
      </tbody></table></div>`;
    tbl.querySelectorAll('[data-te]').forEach(b=>b.onclick=()=>typeEditor(types.find(t=>t.id===b.dataset.te)));
    tbl.querySelectorAll('[data-td]').forEach(b=>b.onclick=async()=>{
      if(!await confirmDlg(I18N.t('c4.leave.delTypeTitle'),I18N.t('c4.leave.delTypeMsg'),I18N.t('c4.common.delete'))) return;
      await API.call('deleteLeaveType',b.dataset.td); toast(I18N.t('c4.emp.deleted'),'success'); App.route();
    });
    const tb=document.getElementById(cid+'-type'); if(tb) tb.onclick=()=>typeEditor(null);
    const addT=document.getElementById(cid+'-addT'); if(addT) addT.onclick=()=>typeEditor(null);
  }
  else if(tab==='balances'){
    const rows=await API.call('getLeaveBalances',new Date().getFullYear());
    body.innerHTML=`<div class="${V_CARD}"><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b border-slate-100">
      <th class="${V_TH}">${I18N.t('c4.common.employee')} <span class="text-slate-300">↕</span></th>
      ${types.map(t=>`<th class="${V_TH} text-center">${esc(t.name)}</th>`).join('')}</tr></thead>
      <tbody class="divide-y divide-slate-50">${rows.length?rows.map(r=>`<tr class="hover:bg-slate-50/70 transition-colors">
        <td class="px-4 py-3"><div class="flex items-center gap-2.5">${vAvatar(r.employeeName)}<div><div class="font-medium text-slate-700 whitespace-nowrap">${esc(r.employeeName)}</div><div class="text-[11px] text-slate-400">${esc(r.employeeCode)}</div></div></div></td>
        ${types.map(t=>{ const x=(r.types||[]).find(y=>y.typeId===t.id)||{used:0,quota:t.quota,left:t.quota};
          const pct=t.quota?Math.min(100,Math.round((x.used||0)/t.quota*100)):0;
          return `<td class="px-4 py-3"><div class="text-center">
            <div class="text-sm font-semibold tabular-nums ${x.left<=2&&x.quota?'text-amber-600':'text-slate-700'}">${x.left}<span class="text-slate-400 font-normal">/${x.quota||'∞'}</span></div>
            <div class="w-20 h-1.5 bg-slate-100 rounded-full mx-auto mt-1.5 overflow-hidden"><div class="h-full rounded-full ${pct>80?'bg-red-400':pct>50?'bg-amber-400':'bg-emerald-400'}" style="width:${pct}%"></div></div>
            <div class="text-[10px] text-slate-400 mt-1">${I18N.t('c4.leave.leftWord')}</div></div></td>`; }).join('')}
      </tr>`).join(''):`<tr><td colspan="${1+types.length}" class="px-4 py-14 text-center"><div class="text-slate-300 text-3xl mb-2">◌</div><div class="text-sm text-slate-400">${I18N.t('c4.leave.emptyBalances')}</div></td></tr>`}
      </tbody></table></div></div>`;
  }
  else if(tab==='holidays'){
    const rows=await API.call('listHolidays');
    body.innerHTML=`<div class="${V_CARD}"><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b border-slate-100">
      <th class="${V_TH}">${I18N.t('c4.common.date')} <span class="text-slate-300">↕</span></th>
      <th class="${V_TH}">${I18N.t('c4.leave.colHoliday')} <span class="text-slate-300">↕</span></th>
      <th class="${V_TH} text-right">Actions</th></tr></thead>
      <tbody class="divide-y divide-slate-50">${rows.length?rows.map(h=>`<tr class="hover:bg-slate-50/70 transition-colors">
        <td class="px-4 py-3"><span class="inline-flex items-center gap-2 tabular-nums font-semibold text-slate-700 bg-slate-50 border border-slate-200/70 rounded-lg px-2.5 py-1">${fmtDate(h.date)}</span></td>
        <td class="px-4 py-3"><span class="font-medium text-slate-700">${esc(h.name)}</span></td>
        <td class="px-4 py-3 text-right">${canEdit?`<button class="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition font-bold" data-hd="${h.id}">✕</button>`:''}</td>
      </tr>`).join(''):`<tr><td colspan="3" class="px-4 py-14 text-center"><div class="text-slate-300 text-3xl mb-2">◌</div><div class="text-sm text-slate-400">${I18N.t('c4.leave.emptyHolidays')}</div></td></tr>`}
      </tbody></table></div></div>`;
    body.querySelectorAll('[data-hd]').forEach(b=>b.onclick=async()=>{
      await API.call('deleteHoliday',b.dataset.hd); toast(I18N.t('c4.leave.holidayRemoved'),'success'); App.route();
    });
    const hb=document.getElementById(cid+'-holiday');
    if(hb) hb.onclick=()=>{
      const m=modal(I18N.t('c4.leave.addHolidayTitle'),`${field(I18N.t('c4.common.date'),'date',{type:'date',value:todayISO(),req:true})}${field(I18N.t('c4.common.name'),'name',{req:true,ph:I18N.t('c4.leave.phHoliday')})}
        <div class="flex justify-end gap-2 mt-5"><button class="${btnS}" id="hCancel">${I18N.t('c4.common.cancel')}</button><button class="${V_BLACK}" id="hSave">${I18N.t('c4.common.save')}</button></div>`);
      m.el.querySelector('#hCancel').onclick=()=>m.close();
      m.el.querySelector('#hSave').onclick=async()=>{
        if(!formVal(m.el,'date')||!formVal(m.el,'name')){toast(I18N.t('c4.leave.dateNameRequired'),'warn');return;}
        await API.call('saveHoliday',collectForm(m.el)); m.close(); toast(I18N.t('c4.leave.holidayAdded'),'success'); App.route();
      };
    };
  }
  else{
    /* ---------- requests (Verola dashboard) ---------- */
    const rows=await API.call('listLeaveRequests');
    const today=todayISO();
    const mStart=today.slice(0,7);
    const pendingN=rows.filter(r=>r.status==='pending').length;
    const apprMonth=rows.filter(r=>r.status==='approved'&&String(r.from||'').slice(0,7)===mStart).length;
    const onLeave=rows.filter(r=>r.status==='approved'&&r.from<=today&&r.to>=today).length;
    const icoL=App.ICONS&&App.ICONS.leave?App.ICONS.leave:'';
    const icoE=App.ICONS&&App.ICONS.employees?App.ICONS.employees:'';
    const icoS=App.ICONS&&App.ICONS.shifts?App.ICONS.shifts:'';
    const st={q:'',type:'all',status:'all',page:1,per:8,total:0};
    body.innerHTML=`
    <div class="grid grid-cols-2 xl:grid-cols-3 gap-4 mb-5 anim-fadeUp">
      ${vKpi(I18N.t('c4.leave.kpiPending'), fmtNum(pendingN), I18N.t('c4.leave.kpiPendingSub'), icoL)}
      ${vKpi(I18N.t('c4.leave.kpiApprovedMonth'), fmtNum(apprMonth), I18N.t('c4.leave.kpiApprovedMonthSub'), icoS)}
      ${vKpi(I18N.t('c4.leave.kpiOnLeave'), fmtNum(onLeave), I18N.t('c4.leave.kpiOnLeaveSub'), icoE)}
    </div>
    <div class="${V_CARD}">
      <div class="flex flex-wrap items-center gap-2.5 p-4 border-b border-slate-100">
        <div class="relative flex-1 min-w-[180px] max-w-xs">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
          <input id="${cid}-q" placeholder="Search..." class="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:outline-none">
        </div>
        <select id="${cid}-fType" class="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 focus:outline-none">
          <option value="all">▤ ${I18N.t('c4.leave.colType')}</option>${types.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}
        </select>
        <select id="${cid}-fStatus" class="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 focus:outline-none">
          <option value="all">▽ ${I18N.t('c4.common.status')}</option>
          <option value="pending">${I18N.t('c4.common.pending')}</option>
          <option value="approved">${I18N.t('c4.common.approved')}</option>
          <option value="rejected">${I18N.t('c4.common.rejected')}</option>
        </select>
      </div>
      <div id="${cid}-tbl"></div>
      <div id="${cid}-pg" class="flex flex-wrap items-center gap-2 px-4 py-3.5 border-t border-slate-100"></div>
    </div>`;
    const tbl=document.getElementById(cid+'-tbl'), pg=document.getElementById(cid+'-pg');
    function filtered(){
      const q=st.q.trim().toLowerCase();
      return rows.filter(r=>{
        if(q&&!(String(r.employeeName).toLowerCase().includes(q))) return false;
        if(st.type!=='all'&&String(r.typeId)!==st.type) return false;
        if(st.status!=='all'&&r.status!==st.status) return false;
        return true;
      });
    }
    function render(){
      const fr=filtered(); st.total=fr.length;
      const slice=fr.slice((st.page-1)*st.per, st.page*st.per);
      tbl.innerHTML=`<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b border-slate-100">
        ${[I18N.t('c4.common.employee'),I18N.t('c4.leave.colType'),I18N.t('c4.common.from'),I18N.t('c4.common.to'),I18N.t('c4.leave.colDays'),I18N.t('c4.common.reason'),I18N.t('c4.common.status')].map((h,i)=>`<th class="${V_TH} ${i===4?'text-right':''}">${h} <span class="text-slate-300">↕</span></th>`).join('')}
        <th class="${V_TH} text-right">Actions</th></tr></thead>
        <tbody class="divide-y divide-slate-50">${slice.length?slice.map(r=>`<tr class="hover:bg-slate-50/70 transition-colors">
          <td class="px-4 py-3"><div class="flex items-center gap-2.5">${vAvatar(r.employeeName)}<span class="font-medium text-slate-700 whitespace-nowrap">${esc(r.employeeName)}</span></div></td>
          <td class="px-4 py-3"><span class="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 whitespace-nowrap">${esc(r.typeName)}</span></td>
          <td class="px-4 py-3 tabular-nums text-slate-600 whitespace-nowrap">${fmtDate(r.from)}</td>
          <td class="px-4 py-3 tabular-nums text-slate-600 whitespace-nowrap">${fmtDate(r.to)}</td>
          <td class="px-4 py-3 text-right tabular-nums font-semibold text-slate-700">${fmtNum(r.days)}</td>
          <td class="px-4 py-3"><span class="text-slate-500 text-[13px] line-clamp-2 max-w-[220px]">${esc(r.reason||'—')}</span></td>
          <td class="px-4 py-3">${r.status==='pending'?vPill(I18N.t('c4.common.pending'),'amber','◷'):r.status==='approved'?vPill(I18N.t('c4.common.approved'),'emerald','✓'):vPill(I18N.t('c4.common.rejected'),'red','✕')}</td>
          <td class="px-4 py-3 text-right">${r.status==='pending'&&canEdit?`<div class="flex gap-1.5 justify-end">
            <button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 transition" data-ok="${r.id}">${I18N.t('c4.common.approve')}</button>
            <button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600 ring-1 ring-red-200 hover:bg-red-100 transition" data-no="${r.id}">${I18N.t('c4.common.reject')}</button></div>`
            :`<span class="text-xs text-slate-400">${esc(r.decidedBy||'')}</span>`}</td>
        </tr>`).join(''):`<tr><td colspan="8" class="px-4 py-14 text-center"><div class="text-slate-300 text-3xl mb-2">◌</div><div class="text-sm text-slate-400">${I18N.t('c4.leave.emptyRequests')}</div></td></tr>`}
        </tbody></table></div>`;
      vPaginate(pg, st, render);
      tbl.querySelectorAll('[data-ok]').forEach(b=>b.onclick=async()=>{ await API.call('decideLeave',b.dataset.ok,'approved'); toast(I18N.t('c4.leave.leaveApproved'),'success'); App.route(); });
      tbl.querySelectorAll('[data-no]').forEach(b=>b.onclick=async()=>{ await API.call('decideLeave',b.dataset.no,'rejected'); toast(I18N.t('c4.leave.leaveRejected'),'success'); App.route(); });
    }
    const qIn=document.getElementById(cid+'-q');
    qIn.oninput=debounce(()=>{ st.q=qIn.value; st.page=1; render(); },300);
    document.getElementById(cid+'-fType').onchange=e=>{ st.type=e.target.value; st.page=1; render(); };
    document.getElementById(cid+'-fStatus').onchange=e=>{ st.status=e.target.value; st.page=1; render(); };
    render();
  }

  function typeEditor(t){
    const isNew=!t; t=t||{name:'',quota:0,paid:true};
    const m=modal(isNew?I18N.t('c4.leave.addTypeTitle'):I18N.t('c4.leave.editTypeTitle'),`
      ${field(I18N.t('c4.leave.fTypeName'),'name',{value:t.name,req:true})}
      <div class="grid grid-cols-2 gap-4 mt-4">
        ${field(I18N.t('c4.leave.fQuota'),'quota',{value:t.quota,type:'number',min:0})}
        <div class="flex items-end pb-2.5">${field(I18N.t('c4.leave.fPaidLeave'),'paid',{type:'checkbox',value:t.paid})}</div>
      </div>
      <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="tCancel">${I18N.t('c4.common.cancel')}</button><button class="${V_BLACK}" id="tSave">${I18N.t('c4.common.save')}</button></div>`);
    m.el.querySelector('#tCancel').onclick=()=>m.close();
    m.el.querySelector('#tSave').onclick=async()=>{
      const data=collectForm(m.el); if(!data.name){toast(I18N.t('c4.emp.nameRequired'),'warn');return;}
      await API.call('saveLeaveType',{...(isNew?{}:{id:t.id}),...data}); m.close(); toast(I18N.t('c4.leave.typeSaved'),'success'); App.route();
    };
  }

  const reqBtn=document.getElementById(cid+'-req'); if(reqBtn) reqBtn.onclick=()=>{
    const m=modal(I18N.t('c4.leave.reqLeaveTitle'),`
      <div class="grid grid-cols-2 gap-4">
        ${field(I18N.t('c4.common.employee'),'employeeId',{type:'select',options:emps.filter(e=>e.active).map(e=>({value:e.id,label:e.name}))})}
        ${field(I18N.t('c4.leave.fLeaveType'),'typeId',{type:'select',options:types.map(t=>({value:t.id,label:t.name+' '+I18N.t('c4.leave.quotaYr').replace('{n}',t.quota)}))})}
        ${field(I18N.t('c4.common.from'),'from',{type:'date',value:todayISO(),req:true})}
        ${field(I18N.t('c4.common.to'),'to',{type:'date',value:todayISO(),req:true})}
        <div class="col-span-2">${field(I18N.t('c4.common.reason'),'reason',{type:'textarea',ph:I18N.t('c4.leave.phReason')})}</div>
      </div>
      <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="lCancel">${I18N.t('c4.common.cancel')}</button><button class="${V_BLACK}" id="lSend">${I18N.t('c4.leave.submitRequest')}</button></div>`);
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
