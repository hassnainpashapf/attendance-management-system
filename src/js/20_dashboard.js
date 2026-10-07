/* 20_dashboard.js — Dashboard: KPI count-ups, today's punches bar chart,
   live Leaflet map of today's punches, alerts list. */
(function(){
'use strict';

App.nav.push({group:'MAIN', path:'#/dashboard', label:'Dashboard', icon:'dashboard', perm:'dashboard'});

function drawPunches(canvasId, trend){
  const c=document.getElementById(canvasId);
  if(!c || typeof Chart==='undefined') return;
  const pts=(trend||[]).slice(-14);
  new Chart(c,{
    type:'bar',
    data:{labels:pts.map(p=>fmtDate(p.d).replace(/^0/,'')), datasets:[{
      label:'Present', data:pts.map(p=>Number(p.present)||0),
      backgroundColor:'rgba(13,148,136,.75)', hoverBackgroundColor:'#0d9488',
      borderRadius:6, maxBarThickness:26
    }]},
    options:{responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:ctx=>' '+fmtNum(ctx.parsed.y)+' present'}}},
      scales:{y:{beginAtZero:true, ticks:{precision:0}}, x:{grid:{display:false}}}}
  });
}

function alertRow(icon, title, sub, accent){
  const chip={red:'bg-red-50 text-red-500',amber:'bg-amber-50 text-amber-500',blue:'bg-blue-50 text-blue-500',teal:'bg-teal-50 text-teal-600'}[accent]||'bg-slate-100 text-slate-500';
  return `<div class="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
    <div class="w-9 h-9 rounded-xl ${chip} flex items-center justify-center shrink-0">${icon}</div>
    <div class="min-w-0"><div class="text-sm font-medium text-slate-700 truncate">${title}</div>
    <div class="text-xs text-slate-400 truncate">${sub}</div></div></div>`;
}
const docIco='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" class="w-4 h-4"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>';
const leaveIco='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" class="w-4 h-4"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18"/></svg>';
const corrIco='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" class="w-4 h-4"><path d="M12 3.5L22 20H2z"/><path d="M12 10v4.5M12 17.8v.2"/></svg>';

App.routes['#/dashboard'] = async (el)=>{
  if(!perm('dashboard','view')){
    el.innerHTML=pageHead('Dashboard','Today at a glance')+'<div class="bg-white rounded-2xl border border-slate-200/70 p-12 text-center text-slate-500">No access to the dashboard.</div>';
    return;
  }
  const cid=uid('dash');
  el.innerHTML=pageHead('Dashboard','Today at a glance',`<button class="${btnS}" id="${cid}-refresh">Refresh</button>`)+
    `<div id="${cid}-body"><div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">${Array.from({length:8},()=>'<div class="bg-white rounded-2xl border border-slate-200/70 p-5"><div class="h-3 bg-slate-100 rounded-full w-1/2 mb-3 shimmer"></div><div class="h-8 bg-slate-100 rounded-lg w-3/4 shimmer"></div></div>').join('')}</div>
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-4"><div class="bg-white rounded-2xl border border-slate-200/70 p-6 xl:col-span-2"><div class="h-64 shimmer rounded-xl"></div></div><div class="bg-white rounded-2xl border border-slate-200/70 p-6"><div class="h-64 shimmer rounded-xl"></div></div></div></div>`;

  const render=async()=>{
    let body=document.getElementById(cid+'-body'); if(!body) return;
    try{
      const d=await API.call('getDashboard');
      body=document.getElementById(cid+'-body'); if(!body) return;
      const k=d.kpis||{}, a=d.alerts||{};
      const kpiHtml=
        statCard('Present Today', fmtNum(k.presentToday), 'Checked in', 'emerald', App.ICONS.punch, k.presentToday||0)+
        statCard('Absent Today', fmtNum(k.absentToday), 'No check-in yet', 'red', App.ICONS.employees, k.absentToday||0)+
        statCard('Late Arrivals', fmtNum(k.lateToday), 'After grace period', 'amber', App.ICONS.shifts, k.lateToday||0)+
        statCard('Out of Zone', fmtNum(k.outOfZoneToday), 'Punches outside geofence', 'violet', App.ICONS.sites, k.outOfZoneToday||0)+
        statCard('Total Employees', fmtNum(k.totalEmployees), 'Active staff', 'teal', App.ICONS.employees, k.totalEmployees||0)+
        statCard('Active Sites', fmtNum(k.activeSites), 'Geofenced locations', 'blue', App.ICONS.sites, k.activeSites||0)+
        statCard('Pending Leaves', fmtNum(k.pendingLeaves), 'Awaiting decision', 'cyan', leaveIco, k.pendingLeaves||0)+
        statCard('Corrections', fmtNum(k.pendingCorrections), 'Awaiting review', 'slate', corrIco, k.pendingCorrections||0);

      const alertsHtml=[
        ...(a.expiringDocs||[]).map(x=>alertRow(docIco, esc(x.title), esc(x.employeeName)+' · '+x.daysLeft+'d left', x.daysLeft<0?'red':'amber')),
        ...(a.pendingLeaves||[]).map(x=>alertRow(leaveIco, esc(x.employeeName)+' — '+esc(x.typeName), fmtDate(x.from)+' → '+fmtDate(x.to)+' · '+x.days+'d', 'blue')),
        ...(a.pendingCorrections||[]).map(x=>alertRow(corrIco, 'Correction — '+esc(x.employeeName), esc(x.note).slice(0,60), 'amber')),
        ...(a.outOfZoneToday||[]).map(x=>alertRow(corrIco, esc(x.employeeName)+' out of zone', esc(x.siteName)+' · '+fmtNum(x.distanceM)+' m away', 'red')),
      ].join('') || '<div class="py-8 text-center text-slate-400 text-sm">All clear — no alerts</div>';

      const recentHtml=(d.recentPunches||[]).map(p=>`
        <div class="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
          <div class="w-9 h-9 rounded-xl ${p.type==='in'?'bg-emerald-50 text-emerald-600':'bg-slate-100 text-slate-500'} flex items-center justify-center font-bold text-xs shrink-0">${esc((p.employeeName||'?')[0])}</div>
          <div class="flex-1 min-w-0"><div class="text-sm font-medium text-slate-700 truncate">${esc(p.employeeName)}</div>
            <div class="text-xs text-slate-400">${p.type==='in'?'Checked in':'Checked out'} · ${esc(p.siteName)} ${p.outOfZone?'· <span class="text-red-500 font-semibold">out of zone</span>':''}</div></div>
          <div class="text-xs text-slate-400 tabular-nums">${esc(p.time)}</div>
        </div>`).join('') || '<div class="py-8 text-center text-slate-400 text-sm">No punches yet today</div>';

      body.innerHTML=`
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5 anim-fadeUp">${kpiHtml}</div>
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
          <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6 xl:col-span-2">
            <div class="flex items-center justify-between mb-5"><h3 class="font-display font-bold text-slate-800">Daily presence</h3><span class="text-xs font-medium text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">Last 14 days</span></div>
            <div class="h-64"><canvas id="${cid}-chart"></canvas></div>
          </div>
          <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6">
            <h3 class="font-display font-bold text-slate-800 mb-4">Live map — today</h3>
            <div id="${cid}-map" class="h-64 border border-slate-200/70"></div>
            <p class="text-[11px] text-slate-400 mt-2">GPS check-ins plotted against site geofences.</p>
          </div>
        </div>
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6">
            <div class="flex items-center justify-between mb-4"><h3 class="font-display font-bold text-slate-800">Alerts</h3>
              <a href="#/documents" class="text-xs text-teal-600 hover:underline font-semibold">Documents →</a></div>
            ${alertsHtml}
          </div>
          <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6">
            <div class="flex items-center justify-between mb-4"><h3 class="font-display font-bold text-slate-800">Recent punches</h3>
              <a href="#/attendance" class="text-xs text-teal-600 hover:underline font-semibold">All attendance →</a></div>
            ${recentHtml}
          </div>
        </div>`;
      drawPunches(cid+'-chart', d.punchesTrend);
      animateCounters(body);
      /* live map */
      try{
        const pts=await API.call('getLiveMap');
        const mapEl=document.getElementById(cid+'-map');
        if(mapEl && typeof L!=='undefined'){
          const map=buildMap(mapEl,[31.5,74.35],11);
          (pts||[]).forEach(p=>{
            L.circleMarker([p.lat,p.lng],{radius:6,color:p.outOfZone?'#ef4444':'#0d9488',fillColor:p.outOfZone?'#ef4444':'#0d9488',fillOpacity:.85,weight:2,opacity:.9})
              .addTo(map).bindPopup(`<b>${esc(p.employeeName)}</b><br>${p.type==='in'?'Checked in':'Checked out'} · ${esc(p.time)}<br>${esc(p.siteName)}`);
          });
          const sites=await API.call('listSites');
          (sites||[]).filter(s=>s.active).forEach(s=>{
            L.circle([Number(s.lat),Number(s.lng)],{radius:Number(s.radiusM)||150,color:'#0ea5e9',weight:1.5,fillOpacity:.06}).addTo(map)
              .bindPopup(`<b>${esc(s.name)}</b><br>Geofence ${fmtNum(s.radiusM)} m`);
          });
          setTimeout(()=>map.invalidateSize(),150);
        }
      }catch(e){ /* map optional */ }
    }catch(e){
      body.innerHTML=`<div class="bg-red-50/70 border border-red-200/70 rounded-2xl p-6 text-center">
        <p class="text-red-700 font-medium">Failed to load dashboard</p>
        <p class="text-red-500 text-sm mt-1">${esc(e.message||'Server error')}</p>
        <button class="${btnS} mt-4" id="${cid}-retry">Retry</button></div>`;
      const rt=document.getElementById(cid+'-retry'); if(rt) rt.onclick=render;
    }
  };
  const rf=document.getElementById(cid+'-refresh'); if(rf) rf.onclick=render;
  await render();
};
})();
