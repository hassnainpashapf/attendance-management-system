/* 100_payroll.js — payroll runs, payslips (view/print), advances, final
   settlement calculator, contractors + bills, pay components.
   The "runs" tab is a Verola-style premium dashboard (KPIs, trend chart,
   deductions donut, payslip table). Other tabs keep existing functionality. */
(function(){
'use strict';

App.nav.push({group:'MONEY', path:'#/payroll', label:I18N.t('c4.nav.payroll'), labelKey:'c4.nav.payroll', icon:'payroll', perm:'payroll'});

/* ---------- Verola dashboard bits ---------- */
function vShortRs(n){ n=Number(n)||0; const a=Math.abs(n);
  if(a>=1000) return 'Rs '+(n/1000).toLocaleString('en-PK',{maximumFractionDigits:1})+'k';
  return 'Rs '+fmtNum(Math.round(n)); }
function vPct(cur, prev){ cur=Number(cur)||0; prev=Number(prev)||0;
  if(!prev) return null; return (cur-prev)/Math.abs(prev)*100; }
function vKpi(label, value, pct, ico){
  const up=(pct||0)>=0, arrow=up?'▲':'▼', col=up?'text-emerald-600':'text-red-500';
  const pt=(pct==null||!isFinite(pct))?'<span class="text-slate-300">—</span>'
    :`<span class="${col} font-semibold">${arrow} ${Math.abs(pct).toFixed(1)}%</span>`;
  return `<div class="bg-white rounded-2xl border border-slate-200/70 p-5 shadow-[0_1px_3px_rgba(15,23,42,.04)]">
    <div class="flex items-center gap-2.5 mb-4">
      <span class="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">${ico}</span>
      <span class="text-[13px] text-slate-500 font-medium">${label}</span>
    </div>
    <div class="text-[26px] font-bold text-slate-900 tabular-nums tracking-tight">${value}</div>
    <div class="text-xs text-slate-400 mt-1.5">${pt} <span class="ml-1">Last 30 days</span></div>
  </div>`;
}
function vAvatar(name){
  const init=(String(name||'?').trim().split(/\s+/).map(w=>w[0]).join('')||'?').slice(0,2).toUpperCase();
  return `<span class="w-8 h-8 rounded-full bg-slate-200 text-slate-500 text-[11px] font-bold inline-flex items-center justify-center shrink-0">${esc(init)}</span>`;
}
function vStatus(paid){
  return paid
    ?'<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 whitespace-nowrap"><span class="text-[10px]">✓</span>Success</span>'
    :'<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200 whitespace-nowrap"><span class="text-[10px]">◷</span>Pending</span>';
}
function vMon(m){ try{ return new Date(m+'-01').toLocaleDateString('en',{month:'short'}); }catch(e){ return m; } }
function vSlipNo(s,i){ const d=String(s.id||'').replace(/\D/g,''); return '#'+(d?d.padStart(5,'0').slice(-5):String(4910+i)); }

const V_TABS=[['runs','Payroll Runs'],['salaries','Salaries'],['advances','Advances'],['settlement','Final Settlement'],['contractors','Contractors'],['components','Pay Components']];
const V_DONUT_COLORS=['#2563eb','#7dd3fc','#f59e0b','#22c55e','#cbd5e1','#a78bfa','#f472b6','#94a3b8'];
const V_ICO_EXP='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3 2"/></svg>';
const V_ICO_TAX='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6"/></svg>';
const V_ICO_NET='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>';
const V_ICO_HC='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.8-3 3-5 5.5-5s4.7 2 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.6c2 .6 3.2 2.3 3.7 4.4"/></svg>';

App.routes['#/payroll'] = async (el, params)=>{
  const cid=uid('pay');
  const tab=(params&&params.tab)||'runs';
  const canEdit=perm('payroll','edit');
  const emps=await API.call('listEmployees').catch(()=>[]);
  const tabBar=`<div class="flex gap-2 mb-5 flex-wrap">${V_TABS.map(([k,l])=>
    `<a href="#/payroll${k==='runs'?'':'?tab='+k}" class="px-4 py-2 rounded-xl text-sm font-semibold transition ${tab===k?'bg-slate-900 text-white shadow':'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'}">${l}</a>`).join('')}</div>`;

  if(tab==='runs'){
    el.innerHTML=`${tabBar}<div id="${cid}-body"></div>`;
    await renderRunsDash(document.getElementById(cid+'-body'), cid, canEdit, emps);
  }
  else{
    el.innerHTML=pageHead('Payroll','Runs, payslips, advances and contractors',
      `${canEdit?`<button class="${btnS}" id="${cid}-adv">Grant Advance</button><button class="${btnP}" id="${cid}-run">Run Payroll</button>`:''}`)+tabBar+`<div id="${cid}-body"></div>`;
    await renderOtherTab(document.getElementById(cid+'-body'), cid, canEdit, emps, tab);
  }
  wireHeaderActions(cid, canEdit, emps);
};

/* ================= RUNS DASHBOARD ================= */
async function renderRunsDash(body, cid, canEdit, emps){
  body.innerHTML=`<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">${Array.from({length:4},()=>'<div class="bg-white rounded-2xl border border-slate-200/70 p-5"><div class="h-9 w-9 rounded-xl bg-slate-100 shimmer mb-4"></div><div class="h-8 bg-slate-100 rounded-lg w-2/3 shimmer mb-2"></div><div class="h-3 bg-slate-100 rounded-full w-1/2 shimmer"></div></div>').join('')}</div>
  <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
    <div class="bg-white rounded-2xl border border-slate-200/70 p-6 xl:col-span-2"><div class="h-64 shimmer rounded-xl"></div></div>
    <div class="bg-white rounded-2xl border border-slate-200/70 p-6"><div class="h-64 shimmer rounded-xl"></div></div>
  </div>
  <div class="bg-white rounded-2xl border border-slate-200/70 p-6"><div class="h-40 shimmer rounded-xl"></div></div>`;

  const [runs, components]=await Promise.all([
    API.call('listPayrollRuns').catch(()=>[]),
    API.call('listPayComponents').catch(()=>[])
  ]);
  const empMap={}; emps.forEach(e=>empMap[String(e.id)]=e);
  const activeEmps=emps.filter(e=>e.active);
  const depts=[...new Set(activeEmps.map(e=>e.department).filter(Boolean))].sort();

  /* trend: per-run totals for last N runs (parallel fetch) */
  const trendRuns=runs.slice(0,12);
  const slipLists=await Promise.all(trendRuns.map(r=>API.call('listPayslips',r.id).catch(()=>[])));
  const trend=trendRuns.map((r,i)=>{
    const sl=slipLists[i]||[];
    let gross=0,tax=0,ben=0,net=0;
    sl.forEach(s=>{ const sal=+s.salary||0, al=+s.allowances||0, dd=+s.deductions||0, ar=+s.advanceRecovery||0;
      gross+=sal+al; tax+=dd+ar; ben+=al; net+=+s.net||0; });
    return {month:r.month, gross, tax, ben, net, count:sl.length};
  }).reverse();

  const latest=trend[trend.length-1], prev=trend[trend.length-2];
  const m30=Date.now()-30*864e5;
  const newHires=activeEmps.filter(e=>{ try{ return new Date(e.joinDate).getTime()>=m30; }catch(x){ return false; } }).length;
  const kpis=[
    vKpi('Payroll Expense','Rs '+fmtNum(Math.round(latest?latest.gross:0)), vPct(latest&&latest.gross, prev&&prev.gross), V_ICO_EXP),
    vKpi('Tax & deductions','Rs '+fmtNum(Math.round(latest?latest.tax:0)), vPct(latest&&latest.tax, prev&&prev.tax), V_ICO_TAX),
    vKpi('Net disbursed','Rs '+fmtNum(Math.round(latest?latest.net:0)), vPct(latest&&latest.net, prev&&prev.net), V_ICO_NET),
    vKpi('Headcount', fmtNum(activeEmps.length), activeEmps.length?vPct(activeEmps.length, activeEmps.length-newHires):null, V_ICO_HC)
  ];

  /* donut: deduction components grouped by name */
  const dedGroups={};
  (components||[]).filter(c=>c.kind==='deduction').forEach(c=>{ dedGroups[c.name]=(dedGroups[c.name]||0)+(+c.amount||0); });
  const dedEntries=Object.keys(dedGroups).map(k=>({name:k, amt:dedGroups[k]})).sort((a,b)=>b.amt-a.amt);
  const dedTotal=dedEntries.reduce((s,e)=>s+e.amt,0);

  const rangeBtn=(n,l)=>`<button data-range="${n}" class="px-4 py-2 rounded-lg text-[13px] font-semibold ${n===3?'bg-white shadow-sm text-slate-800 ring-1 ring-slate-200':'text-slate-400 hover:text-slate-600'}">${l}</button>`;

  body.innerHTML=`
  <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
    <div class="inline-flex items-center gap-1 bg-slate-100 rounded-xl p-1" id="${cid}-range">
      ${rangeBtn(3,'30 Days')}${rangeBtn(6,'3 Months')}${rangeBtn(12,'1 Year')}
    </div>
    <div class="flex gap-2">
      <button class="${btnS}" id="${cid}-export">⤓ Export</button>
      ${canEdit?`<button class="${btnS}" id="${cid}-adv2">Grant Advance</button><button class="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold shadow active:scale-[.98] transition" id="${cid}-run2">▷ Run Payroll</button>`:''}
    </div>
  </div>
  <div class="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5 anim-fadeUp">${kpis.join('')}</div>
  <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
    <div class="bg-white rounded-2xl border border-slate-200/70 p-6 xl:col-span-2 shadow-[0_1px_3px_rgba(15,23,42,.04)]">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 class="font-bold text-slate-800 text-[15px]">Payroll cost trend</h3>
        <div class="flex gap-2 text-xs font-medium text-slate-600">
          <span class="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200/70 rounded-lg px-2.5 py-1"><span class="w-2.5 h-2.5 rounded bg-amber-500"></span>Tax</span>
          <span class="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200/70 rounded-lg px-2.5 py-1"><span class="w-2.5 h-2.5 rounded bg-sky-300"></span>Gross</span>
          <span class="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200/70 rounded-lg px-2.5 py-1"><span class="w-2.5 h-2.5 rounded bg-blue-700"></span>Benefits</span>
        </div>
      </div>
      <div class="h-64"><canvas id="${cid}-trend"></canvas></div>
    </div>
    <div class="bg-white rounded-2xl border border-slate-200/70 p-6 shadow-[0_1px_3px_rgba(15,23,42,.04)]">
      <h3 class="font-bold text-slate-800 text-[15px] mb-4">Deductions</h3>
      ${dedEntries.length?`
      <div class="relative w-44 h-44 mx-auto"><canvas id="${cid}-donut"></canvas>
        <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span class="text-[11px] text-slate-400">Total</span>
          <span class="text-lg font-bold text-slate-900 tabular-nums">${vShortRs(dedTotal)}</span>
        </div>
      </div>
      <div class="mt-5 space-y-2.5">${dedEntries.map((e,i)=>`
        <div class="flex items-center gap-2.5 text-[13px]">
          <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${V_DONUT_COLORS[i%V_DONUT_COLORS.length]}"></span>
          <span class="text-slate-600">${esc(e.name)}</span>
          <span class="ml-auto font-semibold text-slate-700 tabular-nums">${vShortRs(e.amt)}</span>
        </div>`).join('')}</div>`
      :`<div class="py-10 text-center text-sm text-slate-400">No deduction components yet.<br>Add them under Pay Components.</div>`}
    </div>
  </div>
  <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.04)] overflow-hidden">
    <div class="flex flex-wrap items-center gap-2.5 p-4 border-b border-slate-100">
      <div class="relative flex-1 min-w-[180px] max-w-xs">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
        <input id="${cid}-q" placeholder="Search..." class="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:outline-none">
      </div>
      <select id="${cid}-fRun" class="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 focus:outline-none">
        ${runs.map(r=>`<option value="${r.id}">⛉ ${esc(r.month)}</option>`).join('')||'<option value="">No runs</option>'}
      </select>
      <select id="${cid}-fStatus" class="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 focus:outline-none">
        <option value="all">▽ All Status</option><option value="paid">Paid</option><option value="unpaid">Pending</option>
      </select>
      <select id="${cid}-fDept" class="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 focus:outline-none">
        <option value="all">▤ Department</option>${depts.map(d=>`<option>${esc(d)}</option>`).join('')}
      </select>
      ${canEdit?`<button class="${btnS} ml-auto" id="${cid}-import">⤓ Import Data</button>`:''}
    </div>
    <div id="${cid}-tbl"></div>
    <div id="${cid}-pg" class="flex flex-wrap items-center gap-2 px-4 py-3.5 border-t border-slate-100"></div>
  </div>`;

  /* ---- charts ---- */
  let trendChart=null;
  const drawTrend=(n)=>{
    const elc=document.getElementById(cid+'-trend'); if(!elc||typeof Chart==='undefined') return;
    if(trendChart) trendChart.destroy();
    const d=trend.slice(-n);
    trendChart=new Chart(elc,{type:'line',
      data:{labels:d.map(t=>vMon(t.month)),datasets:[
        {label:'Tax',data:d.map(t=>Math.round(t.tax)),borderColor:'#f59e0b',backgroundColor:'rgba(245,158,11,.10)',fill:true,tension:.35,pointRadius:3,pointBackgroundColor:'#f59e0b',borderWidth:2},
        {label:'Gross',data:d.map(t=>Math.round(t.gross)),borderColor:'#7dd3fc',fill:false,tension:.35,pointRadius:3,pointBackgroundColor:'#7dd3fc',borderWidth:2},
        {label:'Benefits',data:d.map(t=>Math.round(t.ben)),borderColor:'#1d4ed8',fill:false,tension:.35,pointRadius:3,pointBackgroundColor:'#1d4ed8',borderWidth:2}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+c.dataset.label+' '+vShortRs(c.parsed.y)}}},
        scales:{y:{ticks:{callback:v=>vShortRs(v),color:'#94a3b8',font:{size:11}},grid:{color:'#f1f5f9'}},x:{grid:{display:false},ticks:{color:'#94a3b8',font:{size:11}}}}}});
  };
  drawTrend(3);
  body.querySelectorAll('#'+cid+'-range [data-range]').forEach(b=>b.onclick=()=>{
    body.querySelectorAll('#'+cid+'-range [data-range]').forEach(x=>x.className='px-4 py-2 rounded-lg text-[13px] font-semibold text-slate-400 hover:text-slate-600');
    b.className='px-4 py-2 rounded-lg text-[13px] font-semibold bg-white shadow-sm text-slate-800 ring-1 ring-slate-200';
    drawTrend(+b.dataset.range);
  });
  const dEl=document.getElementById(cid+'-donut');
  if(dEl&&typeof Chart!=='undefined'&&dedEntries.length){
    new Chart(dEl,{type:'doughnut',
      data:{labels:dedEntries.map(e=>e.name),datasets:[{data:dedEntries.map(e=>e.amt),
        backgroundColor:dedEntries.map((_,i)=>V_DONUT_COLORS[i%V_DONUT_COLORS.length]),borderWidth:3,borderColor:'#fff'}]},
      options:{responsive:true,maintainAspectRatio:true,cutout:'76%',
        plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+c.label+': '+vShortRs(c.parsed)}}}}});
  }

  /* ---- payslip table ---- */
  const slipCache={}; trendRuns.forEach((r,i)=>slipCache[r.id]=slipLists[i]||[]);
  const st={runId:runs[0]?runs[0].id:'',q:'',status:'all',dept:'all',page:1,per:8};
  const tbl=document.getElementById(cid+'-tbl'), pg=document.getElementById(cid+'-pg');
  let curRows=[], curRun=runs[0]||null;
  if(!tbl.__menuCloser){
    tbl.__menuCloser=true;
    document.addEventListener('click',()=>{ const t=document.getElementById(cid+'-tbl'); if(t) t.querySelectorAll('[data-vm]').forEach(x=>x.classList.add('hidden')); });
  }
  async function ensureSlips(){
    if(!st.runId) return [];
    if(!slipCache[st.runId]) slipCache[st.runId]=await API.call('listPayslips',st.runId).catch(()=>[]);
    return slipCache[st.runId];
  }
  function filteredRows(all){
    const q=st.q.trim().toLowerCase();
    return (all||[]).filter(s=>{
      const e=empMap[String(s.employeeId)]||{};
      if(q&&!(String(s.employeeName+' '+s.employeeCode).toLowerCase().includes(q))) return false;
      if(st.status==='paid'&&!s.paid) return false;
      if(st.status==='unpaid'&&s.paid) return false;
      if(st.dept!=='all'&&(e.department||'')!==st.dept) return false;
      return true;
    });
  }
  async function renderTable(){
    const all=await ensureSlips();
    const rows=filteredRows(all);
    const pages=Math.max(1,Math.ceil(rows.length/st.per));
    if(st.page>pages) st.page=pages;
    const slice=rows.slice((st.page-1)*st.per, st.page*st.per);
    curRows=rows; curRun=runs.find(r=>r.id===st.runId)||null;
    tbl.innerHTML=`<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b border-slate-100">
      <th class="px-4 py-3 w-10"><input type="checkbox" class="w-4 h-4 rounded accent-slate-900" id="${cid}-chkAll"></th>
      ${['Payroll ID','Employee','Department','Status','Gross pay','Deductions','Net pay'].map((h,i)=>`<th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap ${i>=4?'text-right':''}">${h} <span class="text-slate-300">↕</span></th>`).join('')}
      <th class="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Actions</th></tr></thead>
      <tbody class="divide-y divide-slate-50">${slice.length?slice.map((s,i)=>{
        const e=empMap[String(s.employeeId)]||{};
        const gross=(+s.salary||0)+(+s.allowances||0), ded=(+s.deductions||0)+(+s.advanceRecovery||0);
        return `<tr class="hover:bg-slate-50/70 transition-colors">
        <td class="px-4 py-3"><input type="checkbox" class="w-4 h-4 rounded accent-slate-900"></td>
        <td class="px-4 py-3 text-slate-500 tabular-nums whitespace-nowrap">${vSlipNo(s,i)}</td>
        <td class="px-4 py-3"><div class="flex items-center gap-2.5">${vAvatar(s.employeeName)}<span class="font-medium text-slate-700 whitespace-nowrap">${esc(s.employeeName)}</span></div></td>
        <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${esc(e.department||'—')}</td>
        <td class="px-4 py-3">${vStatus(s.paid)}</td>
        <td class="px-4 py-3 text-right tabular-nums font-medium text-slate-700">${vShortRs(gross)}</td>
        <td class="px-4 py-3 text-right tabular-nums font-medium text-red-500">-${vShortRs(ded)}</td>
        <td class="px-4 py-3 text-right tabular-nums font-semibold text-emerald-600">${vShortRs(s.net)}</td>
        <td class="px-4 py-3 text-right"><div class="relative inline-block">
          <button class="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300 font-bold" data-vmenu="${s.id}">…</button>
          <div class="hidden absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1" data-vm id="vm-${cid}-${s.id}">
            <button class="block w-full text-left px-4 py-2 text-[13px] text-slate-600 hover:bg-slate-50" data-vview="${s.id}">View payslip</button>
            ${!s.paid&&canEdit?`<button class="block w-full text-left px-4 py-2 text-[13px] text-emerald-700 hover:bg-emerald-50" data-vpaid="${s.id}">Mark paid</button>`:''}
          </div></div></td></tr>`;
      }).join(''):`<tr><td colspan="9" class="px-4 py-14 text-center"><div class="text-slate-300 text-3xl mb-2">◌</div><div class="text-sm text-slate-400">${runs.length?'No payslips match.':'No payroll runs yet — run your first payroll.'}</div></td></tr>`}
      </tbody></table></div>`;
    /* pagination */
    const from=rows.length?(st.page-1)*st.per+1:0, to=Math.min(rows.length,st.page*st.per);
    let nums=''; for(let p=1;p<=pages;p++){ if(p===1||p===pages||Math.abs(p-st.page)<=1) nums+=`<button data-pg="${p}" class="min-w-[32px] h-8 px-2 rounded-lg text-[13px] font-semibold ${p===st.page?'bg-slate-900 text-white':'text-slate-500 hover:bg-slate-100'}">${p}</button>`; else if(!nums.endsWith('…')) nums+='<span class="text-slate-300">…</span>'; }
    pg.innerHTML=`
      <button data-pgprev class="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40" ${st.page<=1?'disabled':''}>‹</button>${nums}
      <button data-pgnext class="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40" ${st.page>=pages?'disabled':''}>›</button>
      <span class="ml-auto text-xs text-slate-400">Showing ${from} to ${to} of ${rows.length} entries</span>
      <select id="${cid}-per" class="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-600">${[8,16,50].map(n=>`<option ${n===st.per?'selected':''}>${n}</option>`).join('')}</select>`;
    if(pg){
      const bPrev=pg.querySelector('[data-pgprev]'); if(bPrev) bPrev.onclick=()=>{ if(st.page>1){st.page--;renderTable();} };
      const bNext=pg.querySelector('[data-pgnext]'); if(bNext) bNext.onclick=()=>{ if(st.page<pages){st.page++;renderTable();} };
      pg.querySelectorAll('[data-pg]').forEach(b=>b.onclick=()=>{ st.page=+b.dataset.pg; renderTable(); });
    }
    const perSel=document.getElementById(cid+'-per'); if(perSel) perSel.onchange=()=>{ st.per=+perSel.value; st.page=1; renderTable(); };
    const chkAll=document.getElementById(cid+'-chkAll');
    if(chkAll) chkAll.onchange=()=>tbl.querySelectorAll('tbody input[type="checkbox"]').forEach(x=>x.checked=chkAll.checked);
    /* row menus */
    tbl.querySelectorAll('[data-vmenu]').forEach(b=>b.onclick=(e)=>{
      e.stopPropagation();
      const m=document.getElementById('vm-'+cid+'-'+b.dataset.vmenu);
      const wasHidden=m.classList.contains('hidden');
      tbl.querySelectorAll('[data-vm]').forEach(x=>x.classList.add('hidden'));
      if(wasHidden) m.classList.remove('hidden');
    });
    tbl.querySelectorAll('[data-vview]').forEach(b=>b.onclick=async()=>{
      const r=await API.call('getPayslip',b.dataset.vview);
      payslipModal({employeeName:r.employee.name, employeeCode:r.employee.code, month:r.run.month,
        designation:r.employee.designation, department:r.employee.departmentName||r.employee.department,
        salary:r.payslip.salary, allowances:r.payslip.allowances, deductions:r.payslip.deductions,
        advanceRecovery:r.payslip.advanceRecovery, net:r.payslip.net, paid:r.payslip.paid});
    });
    tbl.querySelectorAll('[data-vpaid]').forEach(b=>b.onclick=async()=>{
      await API.call('markPayslipPaid',b.dataset.vpaid); toast('Marked paid','success');
      delete slipCache[st.runId]; renderTable();
    });
  }
  const qIn=document.getElementById(cid+'-q');
  qIn.oninput=debounce(()=>{ st.q=qIn.value; st.page=1; renderTable(); },300);
  document.getElementById(cid+'-fRun').onchange=async e=>{ st.runId=e.target.value; st.page=1; await renderTable(); };
  document.getElementById(cid+'-fStatus').onchange=e=>{ st.status=e.target.value; st.page=1; renderTable(); };
  document.getElementById(cid+'-fDept').onchange=e=>{ st.dept=e.target.value; st.page=1; renderTable(); };
  await renderTable();

  /* export */
  const exB=document.getElementById(cid+'-export');
  if(exB) exB.onclick=()=>{
    const rows=curRows, run=curRun||{};
    const csv='Payroll ID,Employee,Code,Department,Status,Gross (Rs),Deductions (Rs),Net (Rs)\n'+rows.map((s,i)=>{
      const e=empMap[String(s.employeeId)]||{};
      const gross=(+s.salary||0)+(+s.allowances||0), ded=(+s.deductions||0)+(+s.advanceRecovery||0);
      return [vSlipNo(s,i),'"'+String(s.employeeName||'').replace(/"/g,'""')+'"',s.employeeCode,'"'+String(e.department||'').replace(/"/g,'""')+'"',s.paid?'Paid':'Pending',gross,ded,s.net].join(',');
    }).join('\n');
    downloadCSV('payroll-'+(run.month||'all')+'.csv', csv);
    toast('Exported '+rows.length+' payslips','success');
  };
  const adv2=document.getElementById(cid+'-adv2'); if(adv2) adv2.onclick=()=>grantAdvanceModal(emps);
  const run2=document.getElementById(cid+'-run2'); if(run2) run2.onclick=()=>runPayrollModal(emps);
  const impB=document.getElementById(cid+'-import'); if(impB) impB.onclick=()=>importModal(emps);
}

/* ================= OTHER TABS (unchanged functionality) ================= */
async function renderOtherTab(body, cid, canEdit, emps, tab){
  if(tab==='advances'){
    const rows=await API.call('listAdvances');
    body.innerHTML=tableHTML([
      {label:'Employee', get:a=>`<span class="font-medium text-slate-700">${esc(a.employeeName)}</span>`},
      {label:'Date', get:a=>fmtDate(a.date)},
      {label:'Amount', num:1, get:a=>`<span class="tabular-nums">${fmt(a.amount)}</span>`},
      {label:'Recovered', num:1, get:a=>`<span class="tabular-nums text-emerald-600">${fmt(a.recovered)}</span>`},
      {label:'Balance', num:1, get:a=>`<span class="tabular-nums font-semibold">${fmt(a.balance)}</span>`},
      {label:'Status', get:a=>a.status==='open'?badge('Open','amber'):badge('Closed','slate')},
    ], rows, {empty:'No advances granted.'});
  }
  else if(tab==='settlement'){
    body.innerHTML=`<div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6 max-w-2xl">
      <h3 class="font-display font-bold text-slate-800 mb-1">Final settlement calculator</h3>
      <p class="text-sm text-slate-400 mb-5">Pro-rata salary for the current month + approved overtime − open advance balances.</p>
      ${field('Employee','employeeId',{type:'select',options:emps.filter(e=>e.active).map(e=>({value:e.id,label:e.name+' ('+e.code+')'}))})}
      <button class="${btnP} mt-4" id="${cid}-calc">Calculate</button>
      <div id="${cid}-result" class="mt-5"></div></div>`;
    const calcBtn=document.getElementById(cid+'-calc'); if(calcBtn) calcBtn.onclick=async()=>{
      const eid=formVal(body,'employeeId');
      const r=await API.call('finalSettlement',eid);
      document.getElementById(cid+'-result').innerHTML=`
        <div class="rounded-2xl border border-slate-200/70 overflow-hidden">
          <div class="bg-slate-50 px-5 py-3 border-b border-slate-200/60 font-semibold text-slate-700 text-sm">${esc(r.employee.name)} <span class="text-slate-400 font-normal">· ${esc(r.employee.code)}</span></div>
          <div class="divide-y divide-slate-50 text-sm">
            <div class="flex justify-between px-5 py-3"><span class="text-slate-500">Pro-rata salary (this month)</span><span class="tabular-nums font-medium">+ ${fmt(r.proRataSalary)}</span></div>
            <div class="flex justify-between px-5 py-3"><span class="text-slate-500">Approved overtime pending</span><span class="tabular-nums font-medium">+ ${fmt(r.pendingOvertime)}</span></div>
            <div class="flex justify-between px-5 py-3"><span class="text-slate-500">Open advance balance (${r.advances.length} advance${r.advances.length===1?'':'s'})</span><span class="tabular-nums font-medium text-red-600">− ${fmt(r.advanceDue)}</span></div>
            <div class="flex justify-between px-5 py-3.5 bg-teal-50/60"><span class="font-bold text-slate-800">Net payable</span><span class="tabular-nums font-bold text-teal-700 text-base">${fmt(r.netPayable)}</span></div>
          </div></div>`;
    };
  }
  else if(tab==='contractors'){
    const cts=await API.call('listContractors');
    const bills=await API.call('listContractorBills');
    body.innerHTML=`<div class="flex justify-end mb-3">${canEdit?`<button class="${btnS}" id="${cid}-addCt">+ Contractor</button>`:''}</div>`+
    tableHTML([
      {label:'Contractor', get:c=>`<div><div class="font-semibold text-slate-700">${esc(c.name)}</div><div class="text-xs text-slate-400">${esc(c.phone||'')}</div></div>`},
      {label:'Rate', num:1, get:c=>`<span class="tabular-nums">${fmt(c.rate)}/day</span>`},
      {label:'Billed total', num:1, get:c=>`<span class="tabular-nums font-semibold">${fmt(c.billed)}</span>`},
      {label:'Status', get:c=>c.active?badge('Active','emerald'):badge('Inactive','slate')},
      {label:'', get:c=>canEdit?`<div class="flex gap-1 justify-end"><button class="${btnS} !px-3 !py-1.5 !text-xs" data-bill="${c.id}">+ Bill</button><button class="${btnS} !px-3 !py-1.5 !text-xs" data-cedit="${c.id}">Edit</button></div>`:''},
    ], cts, {empty:'No contractors yet.'})+
    `<h3 class="font-display font-bold text-slate-800 mt-8 mb-3">Contractor bills</h3>`+
    tableHTML([
      {label:'Month', get:b=>`<span class="tabular-nums">${esc(b.month)}</span>`},
      {label:'Contractor', get:b=>`<span class="font-medium text-slate-700">${esc(b.contractorName)}</span>`},
      {label:'Note', get:b=>`<span class="text-xs text-slate-500">${esc(b.note||'—')}</span>`},
      {label:'Amount', num:1, get:b=>`<span class="tabular-nums font-semibold">${fmt(b.amount)}</span>`},
      {label:'Status', get:b=>b.status==='pending'?badge('Pending','amber'):b.status==='approved'?badge('Approved','emerald'):badge('Paid','teal')},
      {label:'', get:b=>canEdit&&b.status==='pending'?`<div class="flex gap-1 justify-end"><button class="${btnS} !px-3 !py-1.5 !text-xs !text-emerald-700" data-bok="${b.id}">Approve</button><button class="${btnS} !px-3 !py-1.5 !text-xs" data-bpaid="${b.id}">Mark paid</button></div>`:''},
    ], bills, {empty:'No bills yet.'});
    const addCt=document.getElementById(cid+'-addCt');
    if(addCt) addCt.onclick=()=>contractorEditor(null);
    body.querySelectorAll('[data-cedit]').forEach(b=>b.onclick=()=>contractorEditor(cts.find(c=>c.id===b.dataset.cedit)));
    body.querySelectorAll('[data-bill]').forEach(b=>b.onclick=()=>{
      const c=cts.find(x=>x.id===b.dataset.bill);
      const m=modal('New bill — '+c.name,`
        ${field('Month','month',{type:'month',value:monthISO(),req:true})}
        <div class="grid grid-cols-2 gap-4 mt-4">${field('Amount (Rs)','amount',{type:'number',min:0,req:true})}</div>
        <div class="mt-4">${field('Note','note',{type:'textarea',ph:'Work description'})}</div>
        <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="bCancel">Cancel</button><button class="${btnP}" id="bSave">Save bill</button></div>`);
      m.el.querySelector('#bCancel').onclick=()=>m.close();
      m.el.querySelector('#bSave').onclick=async()=>{
        await API.call('saveContractorBill',{contractorId:c.id,month:formVal(m.el,'month'),amount:formNum(m.el,'amount'),note:formVal(m.el,'note')});
        m.close(); toast('Bill saved','success'); App.route();
      };
    });
    body.querySelectorAll('[data-bok]').forEach(b=>b.onclick=async()=>{ await API.call('decideContractorBill',b.dataset.bok,'approved'); toast('Bill approved','success'); App.route(); });
    body.querySelectorAll('[data-bpaid]').forEach(b=>b.onclick=async()=>{ await API.call('decideContractorBill',b.dataset.bpaid,'paid'); toast('Bill marked paid','success'); App.route(); });
  }
  else if(tab==='components'){
    const rows=await API.call('listPayComponents');
    body.innerHTML=(canEdit?`<div class="flex justify-end mb-3"><button class="${btnS}" id="${cid}-addPc">+ Component</button></div>`:'')+tableHTML([
      {label:'Component', get:c=>`<span class="font-medium text-slate-700">${esc(c.name)}</span>`},
      {label:'Kind', get:c=>c.kind==='allowance'?badge('Allowance','emerald'):badge('Deduction','red')},
      {label:'Amount', num:1, get:c=>`<span class="tabular-nums">${fmt(c.amount)}</span>`},
      {label:'Approved', get:c=>c.approved?badge('Yes','teal'):badge('No','slate')},
      {label:'', get:c=>canEdit?`<div class="flex gap-1 justify-end"><button class="${btnS} !px-3 !py-1.5 !text-xs" data-pcedit="${c.id}">Edit</button><button class="${btnS} !px-3 !py-1.5 !text-xs !text-red-600" data-pcdel="${c.id}">Delete</button></div>`:''},
    ], rows, {empty:'No pay components.'});
    const addPc=document.getElementById(cid+'-addPc');
    if(addPc) addPc.onclick=()=>componentEditor(null);
    body.querySelectorAll('[data-pcedit]').forEach(b=>b.onclick=()=>componentEditor(rows.find(c=>c.id===b.dataset.pcedit)));
    body.querySelectorAll('[data-pcdel]').forEach(b=>b.onclick=async()=>{
      if(!await confirmDlg('Delete component?','It will no longer apply to future payroll runs.','Delete')) return;
      await API.call('deletePayComponent',b.dataset.pcdel); toast('Deleted','success'); App.route();
    });
  }
  else if(tab==='salaries'){
    await SalaryUI.renderSalariesTab(body, { emps, canEdit });
  }
}

/* ================= SHARED MODALS ================= */
function payslipModal(s){
  const m=modal('Payslip — '+s.employeeName,`
    <div id="psPrint">
      <div class="text-center mb-5">
        <div class="font-display font-bold text-lg text-slate-800">Attendance Management System</div>
        <div class="text-xs text-slate-400">Payslip for ${esc(s.month)} · ${esc(s.employeeName)} (${esc(s.employeeCode)})</div>
        <div class="text-xs text-slate-400">${esc(s.designation||'')} · ${esc(s.department||'')}</div>
      </div>
      <table class="w-full text-sm"><tbody class="divide-y divide-slate-100">
        <tr><td class="py-2 text-slate-500">Basic salary</td><td class="py-2 text-right tabular-nums">${fmt(s.salary)}</td></tr>
        <tr><td class="py-2 text-slate-500">Allowances</td><td class="py-2 text-right tabular-nums text-emerald-600">+ ${fmt(s.allowances)}</td></tr>
        <tr><td class="py-2 text-slate-500">Deductions</td><td class="py-2 text-right tabular-nums text-red-500">− ${fmt(s.deductions)}</td></tr>
        <tr><td class="py-2 text-slate-500">Advance recovery</td><td class="py-2 text-right tabular-nums text-amber-600">− ${fmt(s.advanceRecovery)}</td></tr>
        <tr><td class="py-2.5 font-bold text-slate-800">Net pay</td><td class="py-2.5 text-right tabular-nums font-bold text-teal-700 text-base">${fmt(s.net)}</td></tr>
      </tbody></table>
      <div class="mt-3 text-center">${s.paid?badge('Paid','teal'):badge('Unpaid','amber')}</div>
    </div>
    <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="pClose">Close</button><button class="${btnP}" id="pPrint">Print</button></div>`);
  m.el.querySelector('#pClose').onclick=()=>m.close();
  m.el.querySelector('#pPrint').onclick=()=>printHTML(m.el.querySelector('#psPrint').innerHTML,'Payslip '+s.employeeName+' '+s.month);
}

function contractorEditor(c){
  const isNew=!c; c=c||{name:'',company:'',phone:'',rate:0,active:true};
  const m=modal(isNew?'Add Contractor':'Edit Contractor',`
    <div class="grid grid-cols-2 gap-4">
      <div class="col-span-2">${field('Contractor / firm name','name',{value:c.name,req:true})}</div>
      ${field('Company','company',{value:c.company||''})}
      ${field('Phone','phone',{value:c.phone||''})}
      ${field('Daily rate (Rs)','rate',{value:c.rate,type:'number',min:0})}
      <div class="flex items-end pb-2.5">${field('Active','active',{type:'checkbox',value:c.active})}</div>
    </div>
    <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="cCancel">Cancel</button><button class="${btnP}" id="cSave">Save</button></div>`);
  m.el.querySelector('#cCancel').onclick=()=>m.close();
  m.el.querySelector('#cSave').onclick=async()=>{
    const d=collectForm(m.el); if(!d.name){toast('Name required','warn');return;}
    await API.call('saveContractor',{...(isNew?{}:{id:c.id}),...d}); m.close(); toast('Contractor saved','success'); App.route();
  };
}

function componentEditor(c){
  const isNew=!c; c=c||{name:'',kind:'allowance',amount:0,appliesTo:'all',approved:true};
  const m=modal(isNew?'Add Pay Component':'Edit Pay Component',`
    <div class="grid grid-cols-2 gap-4">
      <div class="col-span-2">${field('Component name','name',{value:c.name,req:true})}</div>
      ${field('Kind','kind',{type:'select',value:c.kind,options:[{value:'allowance',label:'Allowance'},{value:'deduction',label:'Deduction'}]})}
      ${field('Amount (Rs)','amount',{value:c.amount,type:'number',min:0})}
      <div class="col-span-2 flex items-end pb-2.5">${field('Approved (applies to payroll runs)','approved',{type:'checkbox',value:c.approved})}</div>
    </div>
    <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="cCancel">Cancel</button><button class="${btnP}" id="cSave">Save</button></div>`);
  m.el.querySelector('#cCancel').onclick=()=>m.close();
  m.el.querySelector('#cSave').onclick=async()=>{
    const d=collectForm(m.el); if(!d.name){toast('Name required','warn');return;}
    await API.call('savePayComponent',{...(isNew?{}:{id:c.id}),...d}); m.close(); toast('Component saved','success'); App.route();
  };
}

function runPayrollModal(emps){
  const m=modal('Run Payroll',`
    ${field('Payroll month','month',{type:'month',value:monthISO(),req:true})}
    <div class="max-h-64 overflow-y-auto border border-slate-200/70 rounded-2xl mt-4 mb-4 divide-y divide-slate-50">
      <label class="flex items-center gap-3 px-4 py-2.5 bg-slate-50 font-semibold text-sm text-slate-600 cursor-pointer">
        <input type="checkbox" id="allEmp" checked class="w-4 h-4 rounded accent-teal-600"> Select all</label>
      ${emps.filter(e=>e.active).map(e=>`<label class="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer">
        <input type="checkbox" name="pemp" value="${e.id}" checked class="w-4 h-4 rounded accent-teal-600">
        <span class="text-sm font-medium text-slate-700">${esc(e.name)}</span><span class="text-xs text-slate-400 ml-auto tabular-nums">${fmt(e.salary)}</span></label>`).join('')}
    </div>
    <div class="flex justify-end gap-2"><button class="${btnS}" id="pCancel">Cancel</button><button class="${btnP}" id="pGo">Run payroll</button></div>`);
  m.el.querySelector('#pCancel').onclick=()=>m.close();
  m.el.querySelector('#allEmp').onchange=e=>m.el.querySelectorAll('[name="pemp"]').forEach(x=>x.checked=e.target.checked);
  m.el.querySelector('#pGo').onclick=async()=>{
    const ids=[...m.el.querySelectorAll('[name="pemp"]:checked')].map(x=>x.value);
    if(!ids.length){ toast('Select at least one employee','warn'); return; }
    const r=await API.call('runPayroll',formVal(m.el,'month'),ids);
    m.close(); toast('Payroll run created for '+r.month,'success'); App.route();
  };
}

function grantAdvanceModal(emps){
  const m=modal('Grant Advance',`
    <div class="grid grid-cols-1 gap-4">
      ${field('Employee','employeeId',{type:'select',options:emps.filter(e=>e.active).map(e=>({value:e.id,label:e.name}))})}
      ${field('Amount (Rs)','amount',{type:'number',min:1,req:true})}
      ${field('Installments','installments',{type:'number',value:3,min:1})}
    </div>
    <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="aCancel">Cancel</button><button class="${btnP}" id="aGo">Grant</button></div>`);
  m.el.querySelector('#aCancel').onclick=()=>m.close();
  m.el.querySelector('#aGo').onclick=async()=>{
    const d=collectForm(m.el);
    if(!d.amount){toast('Amount required','warn');return;}
    await API.call('grantAdvance',d.employeeId,d.amount,d.installments);
    m.close(); toast('Advance granted','success'); location.hash='#/payroll?tab=advances'; App.route();
  };
}

function importModal(emps){
  const m=modal('Import salaries',`
    <p class="text-sm text-slate-500 mb-4">Upload a CSV with header <code class="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">code,salary</code> to bulk-update employee salaries. Codes must match employee codes in the system.</p>
    <input type="file" id="impFile" accept=".csv,text/csv" class="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-slate-900 file:text-white hover:file:bg-slate-700">
    <div id="impPrev" class="mt-4"></div>
    <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="iCancel">Cancel</button><button class="${btnP}" id="iGo" disabled>Import</button></div>`);
  m.el.querySelector('#iCancel').onclick=()=>m.close();
  let parsed=[];
  m.el.querySelector('#impFile').onchange=e=>{
    const f=e.target.files[0]; if(!f) return;
    const rd=new FileReader();
    rd.onload=()=>{
      const lines=String(rd.result||'').split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
      const byCode={}; emps.forEach(x=>byCode[String(x.code).toLowerCase()]=x);
      parsed=[]; const bad=[];
      lines.slice(1).forEach(l=>{
        const [code,sal]=l.split(',').map(x=>(x||'').trim());
        const emp=byCode[String(code).toLowerCase()], amt=Number(sal);
        if(emp&&isFinite(amt)&&amt>=0) parsed.push({emp, salary:amt});
        else bad.push(l);
      });
      m.el.querySelector('#impPrev').innerHTML=
        `<div class="text-sm mb-2"><span class="font-semibold text-emerald-700">${parsed.length} matched</span>${bad.length?` · <span class="font-semibold text-red-600">${bad.length} skipped</span>`:''}</div>`+
        (parsed.length?`<div class="max-h-48 overflow-y-auto border border-slate-200/70 rounded-xl divide-y divide-slate-50">`+parsed.slice(0,20).map(p=>
          `<div class="flex justify-between px-4 py-2 text-sm"><span class="text-slate-600">${esc(p.emp.name)} <span class="text-slate-400">(${esc(p.emp.code)})</span></span><span class="tabular-nums">${fmt(p.emp.salary)} → <b>${fmt(p.salary)}</b></span></div>`).join('')+`</div>`:'');
      m.el.querySelector('#iGo').disabled=!parsed.length;
    };
    rd.readAsText(f);
  };
  m.el.querySelector('#iGo').onclick=async()=>{
    const go=m.el.querySelector('#iGo'); go.disabled=true; go.textContent='Importing...';
    let ok=0;
    for(const p of parsed){
      try{ await API.call('saveEmployee',{...p.emp, salary:p.salary}); ok++; }catch(e){}
    }
    m.close(); toast('Updated '+ok+' of '+parsed.length+' salaries','success'); App.route();
  };
}

function wireHeaderActions(cid, canEdit, emps){
  const runB=document.getElementById(cid+'-run');
  if(runB) runB.onclick=()=>runPayrollModal(emps);
  const advB=document.getElementById(cid+'-adv');
  if(advB) advB.onclick=()=>grantAdvanceModal(emps);
}
})();
