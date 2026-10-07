/* 120_reports.js — attendance % summary table + Chart.js, export CSV buttons.
   Verola premium style: breadcrumb header, KPI cards, chart cards, premium table. */
(function(){
'use strict';

App.nav.push({group:'MAIN', path:'#/reports', label:I18N.t('c4.nav.reports'), labelKey:'c4.nav.reports', icon:'reports', perm:'reports'});

/* ---------- Verola tokens (local copies) ---------- */
function txRep(k, fb){ const v=I18N.t(k); return (v===k||!v)?fb:v; }
function vRepKpi(label, value, ico, sub, trend){
  return `<div class="bg-white rounded-2xl border border-slate-200/70 p-5 shadow-[0_1px_3px_rgba(15,23,42,.04)]">
    <div class="flex items-center gap-2.5 mb-4">
      <span class="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">${ico}</span>
      <span class="text-[13px] text-slate-500 font-medium">${label}</span>
      <span class="ml-auto w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 text-slate-400 text-sm font-bold flex items-center justify-center shrink-0 select-none">···</span>
    </div>
    <div class="text-[26px] font-bold text-slate-900 tabular-nums tracking-tight">${value}</div>
    ${trend?`<div class="flex items-center gap-1.5 mt-1.5">${trend}</div>`:sub?`<div class="text-xs text-slate-400 mt-1.5">${sub}</div>`:''}
  </div>`;
}
/* Verola trend badge: vRepTrend(pct, period) -> colored "▲ 9.1%" pill + period text */
function vRepTrend(pct, period){
  const down=pct<0, flat=pct===0;
  const cls=flat?'bg-slate-100 text-slate-500':down?'bg-red-50 text-red-600':'bg-emerald-50 text-emerald-600';
  const arrow=flat?'–':down?'▼':'▲';
  return `<span class="inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-md ${cls}">${arrow} ${Math.abs(pct).toFixed(1)}%</span><span class="text-[11px] text-slate-400">${period||''}</span>`;
}
function vRepAvatar(name){
  const init=(String(name||'?').trim().split(/\s+/).map(w=>w[0]).join('')||'?').slice(0,2).toUpperCase();
  return `<span class="w-8 h-8 rounded-full bg-slate-200 text-slate-500 text-[11px] font-bold inline-flex items-center justify-center shrink-0">${esc(init)}</span>`;
}
const V_REP_AVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>';
const V_REP_DAY='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>';
const V_REP_LATE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3 2"/></svg>';
const V_REP_OOZ='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>';

App.routes['#/reports'] = async (el)=>{
  const cid=uid('rep');
  el.innerHTML=`
    <div class="flex items-center justify-between mb-4 anim-fadeUp">
      <h2 class="text-lg font-bold text-slate-900 tracking-tight">${I18N.t('c4.nav.reports')}</h2>
      <div class="flex gap-2">
        <button class="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 hover:border-slate-300 active:scale-[.98] transition" id="${cid}-csv-att">${I18N.t('c4.rep.csvAtt')}</button>
        <button class="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 hover:border-slate-300 active:scale-[.98] transition" id="${cid}-csv-emp">${I18N.t('c4.rep.csvEmp')}</button>
        <button class="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold shadow active:scale-[.98] transition" id="${cid}-csv-pay">${I18N.t('c4.rep.csvPay')}</button>
      </div>
    </div>
    <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.04)] p-5 mb-5 anim-fadeUp">
      <div class="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">${txRep('c4.rep.reportPeriod','Report period')}</div>
      <div class="flex flex-wrap gap-3 items-end">
        ${field(I18N.t('c4.common.from'),'from',{type:'date',value:addDays(todayISO(),-29)})}
        ${field(I18N.t('c4.common.to'),'to',{type:'date',value:todayISO()})}
        <button class="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold shadow active:scale-[.98] transition" id="${cid}-go">${I18N.t('c4.common.generate')}</button>
        <button class="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 hover:border-slate-300 active:scale-[.98] transition" id="${cid}-csv-leave">${I18N.t('c4.rep.csvLeave')}</button>
      </div>
    </div>
    <div id="${cid}-body"></div>`;
  const body=document.getElementById(cid+'-body');

  async function load(){
    const from=formVal(el,'from')||addDays(todayISO(),-29);
    const to=formVal(el,'to')||todayISO();
    body.innerHTML=`<div class="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">${Array.from({length:4},()=>'<div class="bg-white rounded-2xl border border-slate-200/70 p-5"><div class="h-9 w-9 rounded-xl bg-slate-100 shimmer mb-4"></div><div class="h-8 bg-slate-100 rounded-lg w-2/3 shimmer mb-2"></div><div class="h-3 bg-slate-100 rounded-full w-1/2 shimmer"></div></div>').join('')}</div>
    <div class="bg-white rounded-2xl border border-slate-200/70 p-6"><div class="h-40 shimmer rounded-xl"></div></div>`;
    const rows=await API.call('attendanceSummary',from,to);
    const avg=rows.length?Math.round(rows.reduce((a,r)=>a+r.pct,0)/rows.length):0;
    const best=rows.slice().sort((a,b)=>b.pct-a.pct).slice(0,5);
    const worst=rows.slice().sort((a,b)=>a.pct-b.pct).slice(0,5);
    const totPresent=rows.reduce((a,r)=>a+r.present,0);
    const totLate=rows.reduce((a,r)=>a+r.late,0);
    const totOoz=rows.reduce((a,r)=>a+r.outOfZone,0);
    body.innerHTML=`
      <div class="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5 anim-fadeUp">
        ${vRepKpi(I18N.t('c4.rep.kpiAvg'),avg+'%',V_REP_AVG,I18N.t('c4.rep.kpiAvgSub'))}
        ${vRepKpi(I18N.t('c4.rep.kpiPresentDays'),fmtNum(totPresent),V_REP_DAY,I18N.t('c4.rep.kpiPeriod'))}
        ${vRepKpi(I18N.t('c4.rep.kpiLate'),fmtNum(totLate),V_REP_LATE,I18N.t('c4.rep.kpiPeriod'))}
        ${vRepKpi(I18N.t('c4.rep.kpiOoz'),fmtNum(totOoz),V_REP_OOZ,I18N.t('c4.rep.kpiOozSub'))}
      </div>
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
        <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.04)] p-6 xl:col-span-2">
          <h3 class="font-bold text-slate-800 text-[15px] mb-5">${I18N.t('c4.rep.attPctByEmp')}</h3>
          <div class="h-80"><canvas id="${cid}-chart"></canvas></div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.04)] p-6">
          <h3 class="font-bold text-slate-800 text-[15px] mb-4">${I18N.t('c4.rep.topPerformers')}</h3>
          ${best.map(r=>`<div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 text-sm"><span class="font-medium text-slate-700">${esc(r.employeeName)}</span>${badge(r.pct+'%','emerald')}</div>`).join('')||'<p class="text-sm text-slate-400">—</p>'}
          <h3 class="font-bold text-slate-800 text-[15px] mt-6 mb-4">${I18N.t('c4.rep.needsAttention')}</h3>
          ${worst.map(r=>`<div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 text-sm"><span class="font-medium text-slate-700">${esc(r.employeeName)}</span>${badge(r.pct+'%',r.pct<70?'red':'amber')}</div>`).join('')||'<p class="text-sm text-slate-400">—</p>'}
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.04)] overflow-hidden">
        <div class="flex flex-wrap items-center gap-2.5 p-4 border-b border-slate-100">
          <div class="relative flex-1 min-w-[180px] max-w-xs">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
            <input id="${cid}-q" placeholder="${I18N.t('c4.common.search')}..." class="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:outline-none">
          </div>
        </div>
        <div id="${cid}-tbl"></div>
      </div>`;
    const tbl=document.getElementById(cid+'-tbl');
    const st={q:'', sortKey:'pct', sortDir:-1};
    function rSortArrow(k){ return st.sortKey===k?`<span class="text-slate-700">${st.sortDir===1?'↑':'↓'}</span>`:'<span class="text-slate-300">↕</span>'; }
    function rTh(label, key, right){
      return `<th data-rsort="${key||''}" class="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap ${right?'text-right':''} ${key?'cursor-pointer select-none hover:text-slate-600':''}">${label}${key?' '+rSortArrow(key):''}</th>`;
    }
    function renderTbl(){
      const q=st.q.trim().toLowerCase();
      const frows=rows.filter(r=>!q||String(r.employeeName+' '+r.employeeCode).toLowerCase().includes(q));
      const sk=st.sortKey, sd=st.sortDir;
      frows.sort((a,b)=>{
        let x=a[sk], y=b[sk];
        if(typeof x==='string'){ x=x.toLowerCase(); y=String(y).toLowerCase(); }
        return (x<y?-1:x>y?1:0)*sd;
      });
      tbl.innerHTML=`<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b border-slate-100 bg-[#fafbfc]">
        ${rTh(I18N.t('c4.common.employee'),'employeeName')}${rTh(I18N.t('c4.rep.colPresent'),'present',1)}${rTh(I18N.t('c4.rep.colAbsent'),'absent',1)}${rTh(I18N.t('c4.rep.colLate'),'late',1)}${rTh(I18N.t('c4.common.outOfZone'),'outOfZone',1)}${rTh(I18N.t('c4.rep.colAttendance'),'pct',1)}
        </tr></thead><tbody class="divide-y divide-slate-50">${frows.length?frows.map(r=>`
        <tr class="hover:bg-slate-50/70 transition-colors">
          <td class="px-4 py-4"><div class="flex items-center gap-2.5">${vRepAvatar(r.employeeName)}<div><div class="font-medium text-slate-700">${esc(r.employeeName)}</div><div class="text-xs text-slate-400 tabular-nums">${esc(r.employeeCode)}</div></div></div></td>
          <td class="px-4 py-4 text-right tabular-nums font-medium text-slate-700">${fmtNum(r.present)}</td>
          <td class="px-4 py-4 text-right tabular-nums font-medium ${r.absent?'text-red-500':'text-slate-400'}">${fmtNum(r.absent)}</td>
          <td class="px-4 py-4 text-right tabular-nums font-medium ${r.late?'text-amber-600':'text-slate-400'}">${fmtNum(r.late)}</td>
          <td class="px-4 py-4 text-right tabular-nums text-slate-600">${fmtNum(r.outOfZone)}</td>
          <td class="px-4 py-4"><div class="flex items-center gap-2 justify-end"><div class="w-24 h-2 bg-slate-100 rounded-full overflow-hidden"><div class="h-full rounded-full ${r.pct>=90?'bg-emerald-500':r.pct>=75?'bg-blue-600':r.pct>=60?'bg-amber-500':'bg-red-500'}" style="width:${r.pct}%"></div></div><span class="text-sm font-semibold tabular-nums text-slate-700">${r.pct}%</span></div></td>
        </tr>`).join(''):`<tr><td colspan="6" class="px-4 py-14 text-center"><div class="text-slate-300 text-3xl mb-2">◌</div><div class="text-sm text-slate-400">${I18N.t('c4.rep.emptyRep')}</div></td></tr>`}
        </tbody></table></div>
        <div class="flex items-center px-4 py-3.5 border-t border-slate-100"><span class="text-xs text-slate-400">${txRep('c4.common.showingN','Showing {n} employees').replace('{n}',frows.length)}</span></div>`;
      tbl.querySelectorAll('[data-rsort]').forEach(th=>{ if(!th.dataset.rsort) return; th.onclick=()=>{
        const k=th.dataset.rsort;
        if(st.sortKey===k) st.sortDir*=-1; else { st.sortKey=k; st.sortDir=1; }
        renderTbl();
      };});
    }
    renderTbl();
    document.getElementById(cid+'-q').oninput=debounce(e=>{ st.q=e.target.value; renderTbl(); },300);
    const c=document.getElementById(cid+'-chart');
    if(c&&typeof Chart!=='undefined'){
      const top=rows.slice().sort((a,b)=>b.pct-a.pct).slice(0,15);
      new Chart(c,{type:'bar',
        data:{labels:top.map(r=>r.employeeName.split(' ')[0]),datasets:[{label:I18N.t('c4.rep.chartAttPct'),data:top.map(r=>r.pct),
          backgroundColor:top.map(r=>r.pct>=90?'#10b981':r.pct>=75?'#2563eb':r.pct>=60?'#f59e0b':'#ef4444'),
          hoverBackgroundColor:top.map(r=>r.pct>=90?'#059669':r.pct>=75?'#1d4ed8':r.pct>=60?'#d97706':'#dc2626'),
          borderRadius:6,maxBarThickness:28}]},
        options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
          plugins:{legend:{display:false},
            tooltip:{backgroundColor:'#ffffff',titleColor:'#0f172a',bodyColor:'#334155',
              borderColor:'#e2e8f0',borderWidth:1,padding:12,cornerRadius:12,boxPadding:5,usePointStyle:true,
              titleFont:{size:13,weight:'700'},bodyFont:{size:12.5},
              callbacks:{label:ctx=>' '+ctx.parsed.x+'%'}}},
          scales:{x:{beginAtZero:true,max:100,ticks:{callback:v=>v+'%',color:'#94a3b8',font:{size:11},padding:8},grid:{color:'#f1f5f9'},border:{display:false}},
                  y:{grid:{display:false},border:{display:false},ticks:{color:'#64748b',font:{size:11}}}}}});
    }
    animateCounters(body);
  }
  const goBtn=document.getElementById(cid+'-go'); if(goBtn) goBtn.onclick=load;
  const dl=async(kind)=>{ const r=await API.call('exportCSV',kind,{}); downloadCSV(r.filename,r.csv); toast(I18N.t('c4.rep.csvDownloadedKind').replace('{kind}',kind),'success'); };
  const csvAtt=document.getElementById(cid+'-csv-att'); if(csvAtt) csvAtt.onclick=()=>dl('attendance');
  const csvEmp=document.getElementById(cid+'-csv-emp'); if(csvEmp) csvEmp.onclick=()=>dl('employees');
  const csvPay=document.getElementById(cid+'-csv-pay'); if(csvPay) csvPay.onclick=()=>dl('payroll');
  const csvLeave=document.getElementById(cid+'-csv-leave'); if(csvLeave) csvLeave.onclick=()=>dl('leaves');
  await load();
};
})();
