/* 20_dashboard.js — Dashboard in Verola premium style: breadcrumb, range
   pills, KPI cards with trends, presence line chart, live Leaflet map,
   alerts list, recent punches table. All data flow unchanged. */
(function(){
'use strict';

App.nav.push({group:'MAIN', path:'#/dashboard', label:I18N.t('c4.nav.dashboard'), labelKey:'c4.nav.dashboard', icon:'dashboard', perm:'dashboard'});

/* ---------- Verola dashboard bits (IIFE-local) ---------- */
function dPct(cur, prev){ cur=Number(cur)||0; prev=Number(prev)||0;
  if(!prev) return null; return (cur-prev)/Math.abs(prev)*100; }
function dKpi(label, value, raw, pct, sub, ico){
  const up=(pct||0)>=0, arrow=up?'↗':'↘';
  const pill=up
    ?'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100'
    :'bg-red-50 text-red-600 ring-1 ring-red-100';
  const tr=(pct==null||!isFinite(pct))
    ?`<span class="text-slate-400">${esc(sub||'')}</span>`
    :`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${pill}">${arrow} ${Math.abs(pct).toFixed(1)}%</span> <span class="ml-1.5 text-slate-400">vs last week</span>`;
  return `<div class="bg-white rounded-2xl border border-slate-200/70 p-5 shadow-[0_1px_3px_rgba(15,23,42,.04)]">
    <div class="flex items-center gap-2.5 mb-4">
      <span class="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">${ico}</span>
      <span class="text-[13px] text-slate-500 font-medium">${label}</span>
      <span class="ml-auto w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 text-slate-400 text-sm font-bold flex items-center justify-center shrink-0 select-none">···</span>
    </div>
    <div class="text-[26px] font-bold text-slate-900 tabular-nums tracking-tight" data-countup="${raw}">${value}</div>
    <div class="text-xs mt-1.5">${tr}</div>
  </div>`;
}
function dAvatar(name){
  const init=(String(name||'?').trim()[0]||'?').toUpperCase();
  return `<span class="w-8 h-8 rounded-full bg-slate-200 text-slate-500 text-[11px] font-bold inline-flex items-center justify-center shrink-0">${esc(init)}</span>`;
}
function dTypeBadge(type){
  return type==='in'
    ?'<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 whitespace-nowrap"><span class="text-[10px]">✓</span>'+esc(I18N.t('c4.common.checkedIn'))+'</span>'
    :'<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 ring-1 ring-slate-200 whitespace-nowrap"><span class="text-[10px]">↩</span>'+esc(I18N.t('c4.common.checkedOut'))+'</span>';
}
function dRangeBtn(cid, n, l, active){
  return `<button data-days="${n}" class="px-4 py-2 rounded-lg text-[13px] font-semibold transition ${active?'bg-white shadow-sm text-slate-800 ring-1 ring-slate-200':'text-slate-400 hover:text-slate-600'}">${l}</button>`;
}
const D_ICO_PRESENT='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>';
const D_ICO_ABSENT='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.8-3 3-5 5.5-5s4.7 2 5.5 5"/><path d="M16 8l5 5M21 8l-5 5"/></svg>';
const D_ICO_LATE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3 2"/></svg>';
const D_ICO_OOZ='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><path d="M12 3.5L22 20H2z"/><path d="M12 10v4.5M12 17.8v.2"/></svg>';
const D_ICO_EMP='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.8-3 3-5 5.5-5s4.7 2 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.6c2 .6 3.2 2.3 3.7 4.4"/></svg>';
const D_ICO_SITE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';
const D_ICO_LEAVE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18"/></svg>';
const D_ICO_CORR='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M13.5 6.5l3 3"/></svg>';

function drawPresence(canvasId, trend, days){
  const c=document.getElementById(canvasId);
  if(!c || typeof Chart==='undefined') return;
  if(c._chart) c._chart.destroy();
  const pts=(trend||[]).slice(-days);
  const vHover={id:'vHoverLine',afterDraw(ch){try{const a=ch.tooltip;if(!a||!a.getActiveElements)return;const ae=a.getActiveElements();if(!ae.length)return;const x=ae[0].element.x;const g=ch.ctx;g.save();g.setLineDash([5,5]);g.strokeStyle='#cbd5e1';g.lineWidth=1;g.beginPath();g.moveTo(x,ch.scales.y.top);g.lineTo(x,ch.scales.y.bottom);g.stroke();g.restore();}catch(e){}}};
  c._chart=new Chart(c,{
    type:'line',plugins:[vHover],
    data:{labels:pts.map(p=>fmtDate(p.d).replace(/^0/,'')), datasets:[{
      label:I18N.t('c4.dash.chartPresent'), data:pts.map(p=>Number(p.present)||0),
      borderColor:'#1d4ed8', backgroundColor:'rgba(29,78,216,.08)', fill:true,
      tension:.4, pointRadius:0, pointHoverRadius:4.5, pointHoverBackgroundColor:'#1d4ed8',
      pointHoverBorderColor:'#fff', pointHoverBorderWidth:2, borderWidth:2.2
    }]},
    options:{responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:false},
        tooltip:{backgroundColor:'#ffffff',titleColor:'#0f172a',bodyColor:'#334155',
          borderColor:'#e2e8f0',borderWidth:1,padding:12,cornerRadius:12,boxPadding:5,usePointStyle:true,
          titleFont:{size:13,weight:'700'},bodyFont:{size:12.5},
          callbacks:{label:ctx=>' '+fmtNum(ctx.parsed.y)+' '+I18N.t('c4.dash.chartPresent').toLowerCase()}}},
      scales:{y:{beginAtZero:true, ticks:{precision:0, color:'#94a3b8', font:{size:11}, padding:8}, grid:{color:'#f1f5f9'}, border:{display:false}},
              x:{grid:{display:false}, border:{display:false}, ticks:{color:'#94a3b8', font:{size:11}}}}}
  });
}

function alertRow(icon, title, sub, accent){
  const chip={red:'bg-red-50 text-red-500',amber:'bg-amber-50 text-amber-500',blue:'bg-blue-50 text-blue-500',teal:'bg-teal-50 text-teal-600'}[accent]||'bg-slate-100 text-slate-500';
  return `<div class="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
    <div class="w-9 h-9 rounded-xl ${chip} flex items-center justify-center shrink-0">${icon}</div>
    <div class="min-w-0"><div class="text-sm font-medium text-slate-700 truncate">${title}</div>
    <div class="text-xs text-slate-400 truncate">${sub}</div></div></div>`;
}
const docIco='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" class="w-4 h-4"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>';
const leaveIco='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" class="w-4 h-4"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18"/></svg>';
const corrIco='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" class="w-4 h-4"><path d="M12 3.5L22 20H2z"/><path d="M12 10v4.5M12 17.8v.2"/></svg>';

App.routes['#/dashboard'] = async (el)=>{
  if(!perm('dashboard','view')){
    el.innerHTML=`<div class="flex items-center gap-2 text-[13px] text-slate-400 mb-4"><span class="text-base">⌂</span><span class="text-slate-700 font-semibold">${I18N.t('c4.nav.dashboard')}</span></div>
    <div class="bg-white rounded-2xl border border-slate-200/70 p-12 text-center text-slate-500">${I18N.t('c4.dash.noAccess')}</div>`;
    return;
  }
  const cid=uid('dash');
  const kpiSkel='<div class="bg-white rounded-2xl border border-slate-200/70 p-5"><div class="h-9 w-9 rounded-xl bg-slate-100 shimmer mb-4"></div><div class="h-8 bg-slate-100 rounded-lg w-2/3 shimmer mb-2"></div><div class="h-3 bg-slate-100 rounded-full w-1/2 shimmer"></div></div>';
  el.innerHTML=`
    <div class="flex items-center gap-2 text-[13px] text-slate-400 mb-4 anim-fadeUp">
      <span class="text-base">⌂</span><span class="text-slate-700 font-semibold">${I18N.t('c4.nav.dashboard')}</span>
    </div>
    <div id="${cid}-body">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">${kpiSkel.repeat(8)}</div>
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
        <div class="bg-white rounded-2xl border border-slate-200/70 p-6 xl:col-span-2"><div class="h-64 shimmer rounded-xl"></div></div>
        <div class="bg-white rounded-2xl border border-slate-200/70 p-6"><div class="h-64 shimmer rounded-xl"></div></div>
      </div>
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div class="bg-white rounded-2xl border border-slate-200/70 p-6"><div class="h-40 shimmer rounded-xl"></div></div>
        <div class="bg-white rounded-2xl border border-slate-200/70 p-6 xl:col-span-2"><div class="h-40 shimmer rounded-xl"></div></div>
      </div>
    </div>`;

  const render=async()=>{
    let body=document.getElementById(cid+'-body'); if(!body) return;
    try{
      /* PERF: fetch dashboard data + map data + sites in parallel (was 3 sequential round-trips) */
      const [d, pts, sites]=await Promise.all([
        API.call('getDashboard'),
        API.call('getLiveMap').catch(()=>[]),
        API.call('listSites').catch(()=>[])
      ]);
      body=document.getElementById(cid+'-body'); if(!body) return;
      const k=d.kpis||{}, a=d.alerts||{};
      const trend=(d.punchesTrend||[]).slice(-14);
      /* trend for Present: last-7-day avg vs prior-7-day avg */
      const tvals=trend.map(p=>Number(p.present)||0);
      const avg7=arr=>arr.length?arr.reduce((s,v)=>s+v,0)/arr.length:0;
      const presentPct=dPct(avg7(tvals.slice(-7)), avg7(tvals.slice(-14,-7)));

      const kpiHtml=
        dKpi(I18N.t('c4.dash.kpiPresent'), fmtNum(k.presentToday), k.presentToday||0, presentPct, I18N.t('c4.dash.kpiPresentSub'), D_ICO_PRESENT)+
        dKpi(I18N.t('c4.dash.kpiAbsent'), fmtNum(k.absentToday), k.absentToday||0, null, I18N.t('c4.dash.kpiAbsentSub'), D_ICO_ABSENT)+
        dKpi(I18N.t('c4.dash.kpiLate'), fmtNum(k.lateToday), k.lateToday||0, null, I18N.t('c4.dash.kpiLateSub'), D_ICO_LATE)+
        dKpi(I18N.t('c4.dash.kpiOoz'), fmtNum(k.outOfZoneToday), k.outOfZoneToday||0, null, I18N.t('c4.dash.kpiOozSub'), D_ICO_OOZ)+
        dKpi(I18N.t('c4.dash.kpiTotalEmp'), fmtNum(k.totalEmployees), k.totalEmployees||0, null, I18N.t('c4.dash.kpiTotalEmpSub'), D_ICO_EMP)+
        dKpi(I18N.t('c4.dash.kpiSites'), fmtNum(k.activeSites), k.activeSites||0, null, I18N.t('c4.dash.kpiSitesSub'), D_ICO_SITE)+
        dKpi(I18N.t('c4.dash.kpiLeaves'), fmtNum(k.pendingLeaves), k.pendingLeaves||0, null, I18N.t('c4.dash.kpiLeavesSub'), D_ICO_LEAVE)+
        dKpi(I18N.t('c4.dash.kpiCorrections'), fmtNum(k.pendingCorrections), k.pendingCorrections||0, null, I18N.t('c4.dash.kpiCorrectionsSub'), D_ICO_CORR);

      const alertsHtml=[
        ...(a.expiringDocs||[]).map(x=>alertRow(docIco, esc(x.title), esc(x.employeeName)+' · '+I18N.t('c4.common.daysLeftN').replace('{n}',x.daysLeft), x.daysLeft<0?'red':'amber')),
        ...(a.pendingLeaves||[]).map(x=>alertRow(leaveIco, esc(x.employeeName)+' — '+esc(x.typeName), fmtDate(x.from)+' → '+fmtDate(x.to)+' · '+I18N.t('c4.dash.daysN').replace('{n}',x.days), 'blue')),
        ...(a.pendingCorrections||[]).map(x=>alertRow(corrIco, I18N.t('c4.dash.correctionPrefix')+esc(x.employeeName), esc(x.note).slice(0,60), 'amber')),
        ...(a.outOfZoneToday||[]).map(x=>alertRow(corrIco, esc(x.employeeName)+' '+I18N.t('c4.dash.oozTitle'), esc(x.siteName)+' · '+I18N.t('c4.punch.mAway').replace('{n}',fmtNum(x.distanceM)), 'red')),
      ].join('') || '<div class="py-8 text-center text-slate-400 text-sm">'+I18N.t('c4.dash.allClear')+'</div>';

      const recentRows=(d.recentPunches||[]).map(p=>`
        <tr class="hover:bg-slate-50/70 transition-colors">
          <td class="px-5 py-3"><div class="flex items-center gap-2.5">${dAvatar(p.employeeName)}<span class="font-medium text-slate-700 whitespace-nowrap">${esc(p.employeeName)}</span></div></td>
          <td class="px-5 py-3"><div class="flex items-center gap-2 flex-wrap">${dTypeBadge(p.type)}${p.outOfZone?'<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-50 text-red-600 ring-1 ring-red-200 whitespace-nowrap">'+I18N.t('c4.dash.oozTitle')+'</span>':''}</div></td>
          <td class="px-5 py-3 text-slate-600 whitespace-nowrap">${esc(p.siteName)}</td>
          <td class="px-5 py-3 text-right tabular-nums text-slate-500 whitespace-nowrap">${esc(p.time)}</td>
        </tr>`).join('');

      body.innerHTML=`
        <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div class="inline-flex items-center gap-1 bg-slate-100 rounded-xl p-1" id="${cid}-range">
            ${dRangeBtn(cid,7,'7 Days',true)}${dRangeBtn(cid,14,'14 Days',false)}
          </div>
          <div class="flex gap-2">
            <button class="${btnS}" id="${cid}-refresh">${I18N.t('c4.common.refresh')}</button>
          </div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5 anim-fadeUp">${kpiHtml}</div>
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
          <div class="bg-white rounded-2xl border border-slate-200/70 p-6 xl:col-span-2 shadow-[0_1px_3px_rgba(15,23,42,.04)]">
            <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 class="font-bold text-slate-800 text-[15px]">${I18N.t('c4.dash.dailyPresence')}</h3>
              <div class="flex items-center gap-2">
                <span class="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200/70 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600"><span class="w-2.5 h-2.5 rounded bg-blue-700"></span>${I18N.t('c4.dash.chartPresent')}</span>
              </div>
            </div>
            <div class="h-64"><canvas id="${cid}-chart"></canvas></div>
          </div>
          <div class="bg-white rounded-2xl border border-slate-200/70 p-6 shadow-[0_1px_3px_rgba(15,23,42,.04)]">
            <h3 class="font-bold text-slate-800 text-[15px] mb-4">${I18N.t('c4.dash.liveMap')}</h3>
            <div id="${cid}-map" class="h-64 rounded-xl border border-slate-200/70"></div>
            <p class="text-[11px] text-slate-400 mt-2">${I18N.t('c4.dash.mapCaption')}</p>
          </div>
        </div>
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div class="bg-white rounded-2xl border border-slate-200/70 p-6 shadow-[0_1px_3px_rgba(15,23,42,.04)]">
            <div class="flex items-center justify-between mb-2">
              <h3 class="font-bold text-slate-800 text-[15px]">${I18N.t('c4.dash.alerts')}</h3>
              <a href="#/documents" class="text-xs text-slate-500 hover:text-slate-700 font-semibold">${I18N.t('c4.dash.documentsLink')}</a>
            </div>
            ${alertsHtml}
          </div>
          <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.04)] overflow-hidden xl:col-span-2">
            <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 class="font-bold text-slate-800 text-[15px]">${I18N.t('c4.dash.recentPunches')}</h3>
              <a href="#/attendance" class="text-xs text-slate-500 hover:text-slate-700 font-semibold">${I18N.t('c4.dash.allAttendance')}</a>
            </div>
            ${recentRows
              ?`<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b border-slate-100">
                  ${['Employee','Type','Site'].map(h=>`<th class="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">${h}</th>`).join('')}
                  <th class="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">Time</th>
                </tr></thead><tbody class="divide-y divide-slate-50">${recentRows}</tbody></table></div>`
              :'<div class="py-10 text-center text-slate-400 text-sm">'+I18N.t('c4.dash.noPunches')+'</div>'}
          </div>
        </div>`;

      /* range pills control the trend window */
      const rangeEl=document.getElementById(cid+'-range');
      if(rangeEl) rangeEl.querySelectorAll('[data-days]').forEach(b=>b.onclick=()=>{
        rangeEl.querySelectorAll('[data-days]').forEach(x=>x.className='px-4 py-2 rounded-lg text-[13px] font-semibold transition text-slate-400 hover:text-slate-600');
        b.className='px-4 py-2 rounded-lg text-[13px] font-semibold transition bg-white shadow-sm text-slate-800 ring-1 ring-slate-200';
        drawPresence(cid+'-chart', trend, +b.dataset.days);
      });
      drawPresence(cid+'-chart', trend, 7);

      const rf=document.getElementById(cid+'-refresh'); if(rf) rf.onclick=render;
      animateCounters(body);
      /* live map (data already fetched in parallel above) */
      try{
        const mapEl=document.getElementById(cid+'-map');
        if(mapEl && typeof L!=='undefined'){
          const map=buildMap(mapEl,[31.5,74.35],11);
          (pts||[]).forEach(p=>{
            L.circleMarker([p.lat,p.lng],{radius:6,color:p.outOfZone?'#ef4444':'#0d9488',fillColor:p.outOfZone?'#ef4444':'#0d9488',fillOpacity:.85,weight:2,opacity:.9})
              .addTo(map).bindPopup(`<b>${esc(p.employeeName)}</b><br>${p.type==='in'?I18N.t('c4.common.checkedIn'):I18N.t('c4.common.checkedOut')} · ${esc(p.time)}<br>${esc(p.siteName)}`);
          });
          (sites||[]).filter(s=>s.active).forEach(s=>{
            L.circle([Number(s.lat),Number(s.lng)],{radius:Number(s.radiusM)||150,color:'#0ea5e9',weight:1.5,fillOpacity:.06}).addTo(map)
              .bindPopup(`<b>${esc(s.name)}</b><br>${I18N.t('c4.common.geofenceN').replace('{n}',fmtNum(s.radiusM))}`);
          });
          setTimeout(()=>map.invalidateSize(),150);
        }
      }catch(e){ /* map optional */ }
    }catch(e){
      body.innerHTML=`<div class="bg-red-50/70 border border-red-200/70 rounded-2xl p-6 text-center">
        <p class="text-red-700 font-medium">${I18N.t('c4.dash.loadFailed')}</p>
        <p class="text-red-500 text-sm mt-1">${esc(e.message||I18N.t('c4.layout.somethingWrong'))}</p>
        <button class="${btnS} mt-4" id="${cid}-retry">${I18N.t('c4.common.retry')}</button></div>`;
      const rt=document.getElementById(cid+'-retry'); if(rt) rt.onclick=render;
    }
  };
  await render();
};
})();
