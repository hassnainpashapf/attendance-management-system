/* 120_reports.js — attendance % summary table + Chart.js, export CSV buttons. */
(function(){
'use strict';

App.nav.push({group:'MAIN', path:'#/reports', label:'Reports', icon:'reports', perm:'reports'});

App.routes['#/reports'] = async (el)=>{
  const cid=uid('rep');
  el.innerHTML=pageHead('Reports','Attendance analytics and data exports',
    `<button class="${btnS}" id="${cid}-csv-att">Attendance CSV</button>
     <button class="${btnS}" id="${cid}-csv-emp">Employees CSV</button>
     <button class="${btnS}" id="${cid}-csv-pay">Payroll CSV</button>
     <button class="${btnS}" id="${cid}-csv-leave">Leaves CSV</button>`)+`
  <div class="bg-white rounded-2xl border border-slate-200/70 p-4 mb-4 flex flex-wrap gap-3 items-end anim-fadeUp">
    ${field('From','from',{type:'date',value:addDays(todayISO(),-29)})}
    ${field('To','to',{type:'date',value:todayISO()})}
    <button class="${btnP}" id="${cid}-go">Generate</button>
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
        ${statCard('Avg attendance',avg+'%','Across all staff','teal',App.ICONS.reports,avg,'')}
        ${statCard('Total present-days',fmtNum(rows.reduce((a,r)=>a+r.present,0)),'In period','emerald',App.ICONS.attendance,rows.reduce((a,r)=>a+r.present,0))}
        ${statCard('Late arrivals',fmtNum(rows.reduce((a,r)=>a+r.late,0)),'In period','amber',App.ICONS.shifts,rows.reduce((a,r)=>a+r.late,0))}
        ${statCard('Out-of-zone',fmtNum(rows.reduce((a,r)=>a+r.outOfZone,0)),'Flagged punches','red',App.ICONS.sites,rows.reduce((a,r)=>a+r.outOfZone,0))}
      </div>
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
        <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6 xl:col-span-2">
          <h3 class="font-display font-bold text-slate-800 mb-5">Attendance % by employee</h3>
          <div class="h-80"><canvas id="${cid}-chart"></canvas></div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6">
          <h3 class="font-display font-bold text-slate-800 mb-4">Top performers</h3>
          ${best.map(r=>`<div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 text-sm"><span class="font-medium text-slate-700">${esc(r.employeeName)}</span>${badge(r.pct+'%','emerald')}</div>`).join('')||'<p class="text-sm text-slate-400">—</p>'}
          <h3 class="font-display font-bold text-slate-800 mt-6 mb-4">Needs attention</h3>
          ${worst.map(r=>`<div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 text-sm"><span class="font-medium text-slate-700">${esc(r.employeeName)}</span>${badge(r.pct+'%',r.pct<70?'red':'amber')}</div>`).join('')||'<p class="text-sm text-slate-400">—</p>'}
        </div>
      </div>`+
      tableHTML([
        {label:'Employee', get:r=>`<div><div class="font-medium text-slate-700">${esc(r.employeeName)}</div><div class="text-xs text-slate-400">${esc(r.employeeCode)}</div></div>`},
        {label:'Present', num:1, get:r=>`<span class="tabular-nums">${fmtNum(r.present)}</span>`},
        {label:'Absent', num:1, get:r=>`<span class="tabular-nums ${r.absent?'text-red-500':''}">${fmtNum(r.absent)}</span>`},
        {label:'Late', num:1, get:r=>`<span class="tabular-nums ${r.late?'text-amber-600':''}">${fmtNum(r.late)}</span>`},
        {label:'Out of zone', num:1, get:r=>`<span class="tabular-nums">${fmtNum(r.outOfZone)}</span>`},
        {label:'Attendance', get:r=>`<div class="flex items-center gap-2"><div class="w-24 h-2 bg-slate-100 rounded-full overflow-hidden"><div class="h-full rounded-full ${r.pct>=90?'bg-emerald-500':r.pct>=75?'bg-teal-500':r.pct>=60?'bg-amber-500':'bg-red-500'}" style="width:${r.pct}%"></div></div><span class="text-sm font-semibold tabular-nums">${r.pct}%</span></div>`},
      ], rows, {empty:'No data for this period.'});
    const c=document.getElementById(cid+'-chart');
    if(c&&typeof Chart!=='undefined'){
      const top=rows.slice().sort((a,b)=>b.pct-a.pct).slice(0,15);
      new Chart(c,{type:'bar',
        data:{labels:top.map(r=>r.employeeName.split(' ')[0]),datasets:[{label:'Attendance %',data:top.map(r=>r.pct),
          backgroundColor:top.map(r=>r.pct>=90?'rgba(16,185,129,.8)':r.pct>=75?'rgba(13,148,136,.8)':r.pct>=60?'rgba(245,158,11,.8)':'rgba(239,68,68,.8)'),
          borderRadius:6,maxBarThickness:30}]},
        options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
          plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,max:100,ticks:{callback:v=>v+'%'}}}}});
    }
    animateCounters(body);
  }
  document.getElementById(cid+'-go').onclick=load;
  const dl=async(kind)=>{ const r=await API.call('exportCSV',kind,{}); downloadCSV(r.filename,r.csv); toast(kind+' CSV downloaded','success'); };
  document.getElementById(cid+'-csv-att').onclick=()=>dl('attendance');
  document.getElementById(cid+'-csv-emp').onclick=()=>dl('employees');
  document.getElementById(cid+'-csv-pay').onclick=()=>dl('payroll');
  document.getElementById(cid+'-csv-leave').onclick=()=>dl('leaves');
  await load();
};
})();
