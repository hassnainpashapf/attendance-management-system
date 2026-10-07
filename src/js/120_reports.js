/* 120_reports.js — attendance % summary table + Chart.js, export CSV buttons. */
(function(){
'use strict';

App.nav.push({group:'MAIN', path:'#/reports', label:I18N.t('c4.nav.reports'), labelKey:'c4.nav.reports', icon:'reports', perm:'reports'});

App.routes['#/reports'] = async (el)=>{
  const cid=uid('rep');
  el.innerHTML=pageHead(I18N.t('c4.nav.reports'),I18N.t('c4.rep.sub'),
    `<button class="${btnS}" id="${cid}-csv-att">${I18N.t('c4.rep.csvAtt')}</button>
     <button class="${btnS}" id="${cid}-csv-emp">${I18N.t('c4.rep.csvEmp')}</button>
     <button class="${btnS}" id="${cid}-csv-pay">${I18N.t('c4.rep.csvPay')}</button>
     <button class="${btnS}" id="${cid}-csv-leave">${I18N.t('c4.rep.csvLeave')}</button>`)+`
  <div class="bg-white rounded-2xl border border-slate-200/70 p-4 mb-4 flex flex-wrap gap-3 items-end anim-fadeUp">
    ${field(I18N.t('c4.common.from'),'from',{type:'date',value:addDays(todayISO(),-29)})}
    ${field(I18N.t('c4.common.to'),'to',{type:'date',value:todayISO()})}
    <button class="${btnP}" id="${cid}-go">${I18N.t('c4.common.generate')}</button>
  </div>
  <div id="${cid}-body"></div>`;
  const body=document.getElementById(cid+'-body');

  async function load(){
    const from=formVal(body,'from')||addDays(todayISO(),-29);
    const to=formVal(body,'to')||todayISO();
    const rows=await API.call('attendanceSummary',from,to);
    const avg=rows.length?Math.round(rows.reduce((a,r)=>a+r.pct,0)/rows.length):0;
    const best=rows.slice().sort((a,b)=>b.pct-a.pct).slice(0,5);
    const worst=rows.slice().sort((a,b)=>a.pct-b.pct).slice(0,5);
    body.innerHTML=`
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        ${statCard(I18N.t('c4.rep.kpiAvg'),avg+'%',I18N.t('c4.rep.kpiAvgSub'),'teal',App.ICONS.reports,avg,'')}
        ${statCard(I18N.t('c4.rep.kpiPresentDays'),fmtNum(rows.reduce((a,r)=>a+r.present,0)),I18N.t('c4.rep.kpiPeriod'),'emerald',App.ICONS.attendance,rows.reduce((a,r)=>a+r.present,0))}
        ${statCard(I18N.t('c4.rep.kpiLate'),fmtNum(rows.reduce((a,r)=>a+r.late,0)),I18N.t('c4.rep.kpiPeriod'),'amber',App.ICONS.shifts,rows.reduce((a,r)=>a+r.late,0))}
        ${statCard(I18N.t('c4.rep.kpiOoz'),fmtNum(rows.reduce((a,r)=>a+r.outOfZone,0)),I18N.t('c4.rep.kpiOozSub'),'red',App.ICONS.sites,rows.reduce((a,r)=>a+r.outOfZone,0))}
      </div>
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
        <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6 xl:col-span-2">
          <h3 class="font-display font-bold text-slate-800 mb-5">${I18N.t('c4.rep.attPctByEmp')}</h3>
          <div class="h-80"><canvas id="${cid}-chart"></canvas></div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6">
          <h3 class="font-display font-bold text-slate-800 mb-4">${I18N.t('c4.rep.topPerformers')}</h3>
          ${best.map(r=>`<div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 text-sm"><span class="font-medium text-slate-700">${esc(r.employeeName)}</span>${badge(r.pct+'%','emerald')}</div>`).join('')||'<p class="text-sm text-slate-400">—</p>'}
          <h3 class="font-display font-bold text-slate-800 mt-6 mb-4">${I18N.t('c4.rep.needsAttention')}</h3>
          ${worst.map(r=>`<div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 text-sm"><span class="font-medium text-slate-700">${esc(r.employeeName)}</span>${badge(r.pct+'%',r.pct<70?'red':'amber')}</div>`).join('')||'<p class="text-sm text-slate-400">—</p>'}
        </div>
      </div>`+
      tableHTML([
        {label:I18N.t('c4.common.employee'), get:r=>`<div><div class="font-medium text-slate-700">${esc(r.employeeName)}</div><div class="text-xs text-slate-400">${esc(r.employeeCode)}</div></div>`},
        {label:I18N.t('c4.rep.colPresent'), num:1, get:r=>`<span class="tabular-nums">${fmtNum(r.present)}</span>`},
        {label:I18N.t('c4.rep.colAbsent'), num:1, get:r=>`<span class="tabular-nums ${r.absent?'text-red-500':''}">${fmtNum(r.absent)}</span>`},
        {label:I18N.t('c4.rep.colLate'), num:1, get:r=>`<span class="tabular-nums ${r.late?'text-amber-600':''}">${fmtNum(r.late)}</span>`},
        {label:I18N.t('c4.common.outOfZone'), num:1, get:r=>`<span class="tabular-nums">${fmtNum(r.outOfZone)}</span>`},
        {label:I18N.t('c4.rep.colAttendance'), get:r=>`<div class="flex items-center gap-2"><div class="w-24 h-2 bg-slate-100 rounded-full overflow-hidden"><div class="h-full rounded-full ${r.pct>=90?'bg-emerald-500':r.pct>=75?'bg-teal-500':r.pct>=60?'bg-amber-500':'bg-red-500'}" style="width:${r.pct}%"></div></div><span class="text-sm font-semibold tabular-nums">${r.pct}%</span></div>`},
      ], rows, {empty:I18N.t('c4.rep.emptyRep')});
    const c=document.getElementById(cid+'-chart');
    if(c&&typeof Chart!=='undefined'){
      const top=rows.slice().sort((a,b)=>b.pct-a.pct).slice(0,15);
      new Chart(c,{type:'bar',
        data:{labels:top.map(r=>r.employeeName.split(' ')[0]),datasets:[{label:I18N.t('c4.rep.chartAttPct'),data:top.map(r=>r.pct),
          backgroundColor:top.map(r=>r.pct>=90?'rgba(16,185,129,.8)':r.pct>=75?'rgba(13,148,136,.8)':r.pct>=60?'rgba(245,158,11,.8)':'rgba(239,68,68,.8)'),
          borderRadius:6,maxBarThickness:30}]},
        options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
          plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,max:100,ticks:{callback:v=>v+'%'}}}}});
    }
    animateCounters(body);
  }
  document.getElementById(cid+'-go').onclick=load;
  const dl=async(kind)=>{ const r=await API.call('exportCSV',kind,{}); downloadCSV(r.filename,r.csv); toast(I18N.t('c4.rep.csvDownloadedKind').replace('{kind}',kind),'success'); };
  document.getElementById(cid+'-csv-att').onclick=()=>dl('attendance');
  document.getElementById(cid+'-csv-emp').onclick=()=>dl('employees');
  document.getElementById(cid+'-csv-pay').onclick=()=>dl('payroll');
  document.getElementById(cid+'-csv-leave').onclick=()=>dl('leaves');
  await load();
};
})();
