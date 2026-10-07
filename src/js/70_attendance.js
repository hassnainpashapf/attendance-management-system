/* 70_attendance.js — attendance log with filters, live map, bulk-mark modal,
   delete punch, corrections tab with approve/reject. (Verola premium style) */
(function(){
'use strict';

App.nav.push({group:'MAIN', path:'#/attendance', label:I18N.t('c4.nav.attendance'), labelKey:'c4.nav.attendance', icon:'attendance', perm:'attendance'});

/* ---------- Verola bits (shared style with payroll) ---------- */
function vAvatar(name){ return avatar(name); }

function vTabs(tab){
  return `<div class="flex gap-2 mb-5 flex-wrap">${[['log',I18N.t('c4.att.tabLog')],['map',I18N.t('c4.att.tabMap')],['corrections',I18N.t('c4.att.tabCorrections')]].map(([k,l])=>
    `<a href="#/attendance${k==='log'?'':'?tab='+k}" class="px-4 py-2 rounded-xl text-sm font-semibold transition ${tab===k?'bg-slate-900 text-white shadow':'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'}">${l}</a>`).join('')}</div>`;
}
const V_BLACK='px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold shadow active:scale-[.98] transition';
function vKpi(label, value, sub, ico, trend){
  /* trend: {pct:number, label:string} or null — Verola pill badge like the reference */
  const up = trend && trend.pct >= 0;
  const tr = (trend && isFinite(trend.pct))
    ? `<div class="flex items-center gap-1.5 mt-1.5"><span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${up?'bg-emerald-50 text-emerald-600':'bg-red-50 text-red-600'}">${up?'↗':'↘'} ${Math.abs(trend.pct).toFixed(1)}%</span><span class="text-xs text-slate-400">${esc(trend.label||'vs last week')}</span></div>`
    : (sub?`<div class="text-xs text-slate-400 mt-1.5">${sub}</div>`:'');
  return `<div class="bg-white rounded-2xl border border-slate-200/70 p-5 shadow-[0_1px_3px_rgba(15,23,42,.04)]">
    <div class="flex items-center gap-2.5 mb-4">
      <span class="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">${ico}</span>
      <span class="text-[13px] text-slate-500 font-medium">${label}</span>
      <span class="ml-auto w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 text-slate-400 text-sm font-bold flex items-center justify-center shrink-0 select-none">···</span>
    </div>
    <div class="text-[26px] font-bold text-slate-900 tabular-nums tracking-tight">${value}</div>
    ${tr}
  </div>`;
}
function vPill(text, color, icon){
  const c={emerald:'bg-emerald-50 text-emerald-700 ring-emerald-200',amber:'bg-amber-50 text-amber-700 ring-amber-200',red:'bg-red-50 text-red-600 ring-red-200',slate:'bg-slate-100 text-slate-500 ring-slate-200',teal:'bg-teal-50 text-teal-700 ring-teal-200',blue:'bg-blue-50 text-blue-700 ring-blue-200'}[color]||'bg-slate-100 text-slate-500 ring-slate-200';
  return `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${c} ring-1 whitespace-nowrap">${icon?`<span class="text-[10px]">${icon}</span>`:''}${text}</span>`;
}
/* Verola pagination via shared helpers (00_utils.js): vPaginationHTML + vPaginateBind */
function vBindPaginate(pg, st, render){
  pg.innerHTML = vPaginationHTML(st.total, st.page, st.per);
  vPaginateBind(pg, (a,b)=>{
    const pages=Math.max(1, Math.ceil(st.total/st.per));
    if(a==='prev'){ if(st.page>1){ st.page--; render(); } }
    else if(a==='next'){ if(st.page<pages){ st.page++; render(); } }
    else if(a==='per'){ st.per=b; st.page=1; render(); }
    else { st.page=a; render(); }
  });
}
const V_TH='px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap';

App.routes['#/attendance'] = async (el, params)=>{
  const cid=uid('att');
  const tab=(params&&params.tab)||'log';
  const canEdit=perm('attendance','edit');
  el.innerHTML=vTabs(tab)+`<div id="${cid}-body"></div>`;
  const body=document.getElementById(cid+'-body');

  if(tab==='map'){
    body.innerHTML=`<div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.04)] p-6 anim-fadeUp">
      <div class="flex items-center justify-between mb-4"><h3 class="font-bold text-slate-800 text-[15px]">${I18N.t('c4.att.liveMapToday')}</h3>
      <button class="${btnS}" id="${cid}-refresh">↻ ${I18N.t('c4.common.refresh')}</button></div>
      <div id="${cid}-livemap" class="h-[480px] border border-slate-200/70 rounded-xl overflow-hidden"></div></div>`;
    const draw=async()=>{
      const mapEl=document.getElementById(cid+'-livemap'); if(!mapEl) return;
      mapEl.innerHTML='';
      const map=buildMap(mapEl,[31.5,74.35],11);
      if(!map) return;
      const pts=await API.call('getLiveMap');
      (pts||[]).forEach(p=>{
        const m=L.circleMarker([p.lat,p.lng],{radius:7,color:p.outOfZone?'#ef4444':'#0d9488',fillColor:p.outOfZone?'#ef4444':'#0d9488',fillOpacity:.9,weight:2})
          .addTo(map).bindPopup(`<b>${esc(p.employeeName)}</b><br>${p.type==='in'?I18N.t('c4.common.checkedIn'):I18N.t('c4.common.checkedOut')} · ${esc(p.time)}<br>${esc(p.siteName)}${p.outOfZone?I18N.t('c4.att.oozPopup'):''}${p.selfie?I18N.t('c4.att.selfieAttached'):''}`);
      });
      const sites=await API.call('listSites');
      (sites||[]).filter(s=>s.active).forEach(s=>{
        L.circle([Number(s.lat),Number(s.lng)],{radius:Number(s.radiusM)||150,color:'#0ea5e9',weight:1.5,fillOpacity:.05}).addTo(map)
          .bindPopup(`<b>${esc(s.name)}</b><br>${I18N.t('c4.common.geofenceN').replace('{n}',fmtNum(s.radiusM))}`);
      });
      setTimeout(()=>map.invalidateSize(),150);
      const rf=document.getElementById(cid+'-refresh'); if(rf) rf.onclick=draw;
    };
    await draw();
    return;
  }

  if(tab==='corrections'){
    const rows=await API.call('listCorrections');
    const st={page:1,per:8,total:rows.length};
    body.innerHTML=`
    <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.04)] overflow-hidden anim-fadeUp">
      <div id="${cid}-tbl"></div>
      <div id="${cid}-pg"></div>
    </div>`;
    const tbl=document.getElementById(cid+'-tbl'), pg=document.getElementById(cid+'-pg');
    function render(){
      const slice=rows.slice((st.page-1)*st.per, st.page*st.per);
      tbl.innerHTML=`<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="bg-[#fafbfc] border-b border-slate-100">
        ${[I18N.t('c4.common.employee'),I18N.t('c4.att.colPunch'),I18N.t('c4.att.colRequest'),I18N.t('c4.common.status')].map(h=>`<th class="${V_TH}">${h} <span class="text-slate-300">↕</span></th>`).join('')}
        <th class="${V_TH} text-right">Actions</th></tr></thead>
        <tbody class="divide-y divide-slate-50">${slice.length?slice.map(c=>`<tr class="hover:bg-slate-50/70 transition-colors">
          <td class="px-5 py-4"><div class="flex items-center gap-2.5">${vAvatar(c.employeeName)}<span class="font-medium text-slate-700 whitespace-nowrap">${esc(c.employeeName)}</span></div></td>
          <td class="px-5 py-4 text-slate-600 whitespace-nowrap tabular-nums">${esc(c.punchDate)} · ${c.punchType==='in'?I18N.t('c4.common.checkIn'):I18N.t('c4.common.checkOut')} ${esc(c.punchTime)}</td>
          <td class="px-5 py-4"><span class="text-slate-500 text-[13px]">${esc(c.note)}</span></td>
          <td class="px-5 py-4">${c.status==='pending'?vPill(I18N.t('c4.common.pending'),'amber','◷'):c.status==='approved'?vPill(I18N.t('c4.common.approved'),'emerald','✓'):vPill(I18N.t('c4.common.rejected'),'red','✕')}</td>
          <td class="px-5 py-4 text-right">${c.status==='pending'&&canEdit?`<div class="flex gap-1.5 justify-end">
            <button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 transition" data-ok="${c.id}">${I18N.t('c4.common.approve')}</button>
            <button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600 ring-1 ring-red-200 hover:bg-red-100 transition" data-no="${c.id}">${I18N.t('c4.common.reject')}</button></div>`
            :`<span class="text-xs text-slate-400">${esc(c.decidedBy||'')}</span>`}</td>
        </tr>`).join(''):`<tr><td colspan="5" class="px-4 py-14 text-center"><div class="text-slate-300 text-3xl mb-2">◌</div><div class="text-sm text-slate-400">${I18N.t('c4.att.emptyCorrections')}</div></td></tr>`}
        </tbody></table></div>`;
      vBindPaginate(pg, st, render);
      tbl.querySelectorAll('[data-ok]').forEach(b=>b.onclick=async()=>{ await API.call('decideCorrection',b.dataset.ok,'approved'); toast(I18N.t('c4.att.correctionApproved'),'success'); App.route(); });
      tbl.querySelectorAll('[data-no]').forEach(b=>b.onclick=async()=>{ await API.call('decideCorrection',b.dataset.no,'rejected'); toast(I18N.t('c4.att.correctionRejected'),'success'); App.route(); });
    }
    render();
    return;
  }

  /* ---------- punch log ---------- */
  const emps=await API.call('listEmployees').catch(()=>[]);
  const sites=await API.call('listSites').catch(()=>[]);
  const dash=await API.call('getDashboard').catch(()=>({}));
  const k=dash.kpis||dash||{};
  /* real trend for Present: last-7-day avg vs prior-7-day avg (same as dashboard) */
  let presentTrend=null;
  try{
    const tv=(dash.punchesTrend||[]).slice(-14).map(p=>Number(p.present)||0);
    const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
    const prev=avg(tv.slice(0,Math.max(0,tv.length-7))), cur=avg(tv.slice(Math.max(0,tv.length-7)));
    if(prev>0 && isFinite(cur)) presentTrend={pct:(cur-prev)/Math.abs(prev)*100, label:'vs last week'};
  }catch(e){}
  const icoP=App.ICONS&&App.ICONS.punch?App.ICONS.punch:'';
  const icoE=App.ICONS&&App.ICONS.employees?App.ICONS.employees:'';
  const icoS=App.ICONS&&App.ICONS.shifts?App.ICONS.shifts:'';
  const icoL=App.ICONS&&App.ICONS.sites?App.ICONS.sites:'';

  body.innerHTML=`
  <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
    <div class="inline-flex items-center gap-1 bg-slate-100 rounded-xl p-1" id="${cid}-range">
      <button data-range="7" class="px-4 py-2 rounded-lg text-[13px] font-semibold bg-white shadow-sm text-slate-800 ring-1 ring-slate-200">7 Days</button>
      <button data-range="30" class="px-4 py-2 rounded-lg text-[13px] font-semibold text-slate-400 hover:text-slate-600">30 Days</button>
    </div>
    <div class="flex gap-2">
      <button class="${btnS}" id="${cid}-csv">⤓ ${I18N.t('c4.att.exportCsv')}</button>
      ${canEdit?`<button class="${V_BLACK}" id="${cid}-bulk">+ ${I18N.t('c4.att.bulkMark')}</button>`:''}
    </div>
  </div>
  <div class="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5 anim-fadeUp">
    ${vKpi(I18N.t('c4.dash.kpiPresent'), fmtNum(k.presentToday||0), I18N.t('c4.dash.kpiPresentSub'), icoP, presentTrend)}
    ${vKpi(I18N.t('c4.dash.kpiAbsent'), fmtNum(k.absentToday||0), I18N.t('c4.dash.kpiAbsentSub'), icoE)}
    ${vKpi(I18N.t('c4.dash.kpiLate'), fmtNum(k.lateToday||0), I18N.t('c4.dash.kpiLateSub'), icoS)}
    ${vKpi(I18N.t('c4.dash.kpiOoz'), fmtNum(k.outOfZoneToday||0), I18N.t('c4.dash.kpiOozSub'), icoL)}
  </div>
  <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.04)] overflow-hidden">
    <div class="flex flex-wrap items-end gap-2.5 p-4 border-b border-slate-100">
      <div class="relative flex-1 min-w-[180px] max-w-xs">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
        <input id="${cid}-q" placeholder="Search..." class="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:outline-none">
      </div>
      <label class="block"><span class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">${I18N.t('c4.common.from')}</span><input type="date" name="from" value="${addDays(todayISO(),-7)}" class="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:outline-none"></label>
      <label class="block"><span class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">${I18N.t('c4.common.to')}</span><input type="date" name="to" value="${todayISO()}" class="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:outline-none"></label>
      <label class="block"><span class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">${I18N.t('c4.common.employee')}</span><select id="${cid}-fEmp" class="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 focus:outline-none max-w-[180px]">
        <option value="">${I18N.t('c4.att.allEmployees')}</option>${emps.filter(e=>e.active).map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('')}
      </select></label>
      <label class="block"><span class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">${I18N.t('c4.common.site')}</span><select id="${cid}-fSite" class="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 focus:outline-none max-w-[180px]">
        <option value="">${I18N.t('c4.att.allSites')}</option>${sites.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}
      </select></label>
      <label class="inline-flex items-center gap-2 text-[13px] cursor-pointer font-medium text-slate-600 bg-slate-50 border border-slate-200/70 rounded-xl px-3 py-2.5 mb-[1px]"><input type="checkbox" id="${cid}-ooz" class="w-4 h-4 rounded accent-slate-900">${I18N.t('c4.att.oozOnly')}</label>
      <button class="${V_BLACK}" id="${cid}-go">${I18N.t('c4.common.apply')}</button>
    </div>
    <div id="${cid}-rows"></div>
    <div id="${cid}-pg"></div>
  </div>`;

  const rowsEl=document.getElementById(cid+'-rows');
  const pgEl=document.getElementById(cid+'-pg');
  const st={q:'',page:1,per:8,total:0};
  let allRows=[];
  const fEmp=document.getElementById(cid+'-fEmp'), fSite=document.getElementById(cid+'-fSite');

  function filtered(){
    const q=st.q.trim().toLowerCase();
    if(!q) return allRows;
    return allRows.filter(p=>String(p.employeeName+' '+(p.employeeCode||'')).toLowerCase().includes(q));
  }
  function renderTable(){
    const rows=filtered();
    st.total=rows.length;
    const slice=rows.slice((st.page-1)*st.per, st.page*st.per);
    rowsEl.innerHTML=`<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="bg-[#fafbfc] border-b border-slate-100">
      ${[I18N.t('c4.common.date'),I18N.t('c4.common.employee'),I18N.t('c4.att.colType'),I18N.t('c4.att.colTime'),I18N.t('c4.common.site'),I18N.t('c4.att.colDistance'),I18N.t('c4.att.colZone'),I18N.t('c4.att.colSource')].map((h,i)=>`<th class="${V_TH} ${i===5?'text-right':''}">${h} <span class="text-slate-300">↕</span></th>`).join('')}
      <th class="${V_TH} text-right">Actions</th></tr></thead>
      <tbody class="divide-y divide-slate-50">${slice.length?slice.map(p=>`<tr class="hover:bg-slate-50/70 transition-colors">
        <td class="px-5 py-4 tabular-nums text-slate-600 whitespace-nowrap">${fmtDate(p.date)}</td>
        <td class="px-5 py-4"><div class="flex items-center gap-2.5">${vAvatar(p.employeeName)}<div><div class="font-medium text-slate-700 whitespace-nowrap">${esc(p.employeeName)}</div><div class="text-[11px] text-slate-400">${esc(p.employeeCode||'')}</div></div></div></td>
        <td class="px-5 py-4">${p.type==='in'?vPill(I18N.t('c4.common.checkIn'),'emerald','✓'):vPill(I18N.t('c4.common.checkOut'),'slate','◷')}</td>
        <td class="px-5 py-4 tabular-nums font-semibold text-slate-700 whitespace-nowrap">${esc(p.time)}</td>
        <td class="px-5 py-4 text-slate-600 whitespace-nowrap">${esc(p.siteName||'—')}</td>
        <td class="px-5 py-4 text-right tabular-nums text-slate-600">${p.distanceM!=null?fmtNum(p.distanceM)+' m':'<span class="text-slate-300">—</span>'}</td>
        <td class="px-5 py-4">${p.outOfZone?vPill(I18N.t('c4.common.outOfZone'),'red','!'):vPill(I18N.t('c4.common.inZone'),'teal','✓')}</td>
        <td class="px-5 py-4 text-xs text-slate-400">${esc(p.source||'')}</td>
        <td class="px-5 py-4 text-right"><div class="flex gap-1.5 justify-end">
          ${p.selfie?`<button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-500 hover:border-slate-300 transition" data-img="${p.id}">${I18N.t('c4.att.selfieBtn')}</button>`:''}
          ${canEdit?`<button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-500 hover:border-slate-300 transition" data-corr="${p.id}">${I18N.t('c4.att.requestFix')}</button>
          <button class="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition font-bold" data-del="${p.id}">✕</button>`:''}</div></td>
      </tr>`).join(''):`<tr><td colspan="9" class="px-4 py-14 text-center"><div class="text-slate-300 text-3xl mb-2">◌</div><div class="text-sm text-slate-400">${I18N.t('c4.att.emptyLog')}</div></td></tr>`}
      </tbody></table></div>`;
    vBindPaginate(pgEl, st, renderTable);
    rowsEl.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
      if(!await confirmDlg(I18N.t('c4.att.delPunchTitle'),I18N.t('c4.emp.cannotUndo'),I18N.t('c4.common.delete'))) return;
      await API.call('deletePunch',b.dataset.del); toast(I18N.t('c4.att.punchDeleted'),'success'); load();
    });
    rowsEl.querySelectorAll('[data-corr]').forEach(b=>b.onclick=()=>{
      const m=modal(I18N.t('c4.att.reqCorrectionTitle'),`${field(I18N.t('c4.att.fWhatCorrected'),'note',{type:'textarea',ph:I18N.t('c4.att.phCorrection'),req:true})}
        <div class="flex justify-end gap-2 mt-5"><button class="${btnS}" id="cCancel">${I18N.t('c4.common.cancel')}</button><button class="${V_BLACK}" id="cSend">${I18N.t('c4.att.sendRequest')}</button></div>`);
      m.el.querySelector('#cCancel').onclick=()=>m.close();
      m.el.querySelector('#cSend').onclick=async()=>{
        const note=formVal(m.el,'note'); if(!note){toast(I18N.t('c4.att.describeCorrection'),'warn');return;}
        await API.call('requestCorrection',b.dataset.corr,note); m.close(); toast(I18N.t('c4.att.correctionRequested'),'success');
      };
    });
    rowsEl.querySelectorAll('[data-img]').forEach(b=>b.onclick=async()=>{
      const p=allRows.find(x=>x.id===b.dataset.img);
      if(p&&p.selfie) modal(I18N.t('c4.att.selfieTitle').replace('{name}',p.employeeName),`<img src="${p.selfie}" class="rounded-2xl w-full" alt="selfie"><p class="text-xs text-slate-400 mt-3">${fmtDate(p.date)} · ${esc(p.time)} · ${esc(p.siteName||'')}</p>`);
      else toast(I18N.t('c4.att.noSelfie'),'warn');
    });
  }
  async function load(){
    const f={
      from:formVal(body,'from'), to:formVal(body,'to'),
      employeeId:fEmp.value, siteId:fSite.value,
      outOfZone:document.getElementById(cid+'-ooz').checked||'',
    };
    allRows=await API.call('listAttendance',f);
    st.page=1; renderTable();
  }
  const qIn=document.getElementById(cid+'-q');
  qIn.oninput=debounce(()=>{ st.q=qIn.value; st.page=1; renderTable(); },300);
  const goBtn=document.getElementById(cid+'-go'); if(goBtn) goBtn.onclick=load;
  fEmp.onchange=load;
  fSite.onchange=load;
  const csvBtn=document.getElementById(cid+'-csv'); if(csvBtn) csvBtn.onclick=async()=>{
    const r=await API.call('exportCSV','attendance',{from:formVal(body,'from'),to:formVal(body,'to')});
    downloadCSV(r.filename,r.csv); toast(I18N.t('c4.att.csvDownloaded'),'success');
  };
  body.querySelectorAll('#'+cid+'-range [data-range]').forEach(b=>b.onclick=()=>{
    body.querySelectorAll('#'+cid+'-range [data-range]').forEach(x=>x.className='px-4 py-2 rounded-lg text-[13px] font-semibold text-slate-400 hover:text-slate-600');
    b.className='px-4 py-2 rounded-lg text-[13px] font-semibold bg-white shadow-sm text-slate-800 ring-1 ring-slate-200';
    const n=+b.dataset.range;
    body.querySelector('[name="to"]').value=todayISO();
    body.querySelector('[name="from"]').value=addDays(todayISO(),-n);
    load();
  });
  await load();

  const bulkB=document.getElementById(cid+'-bulk');
  if(bulkB) bulkB.onclick=async()=>{
    const m=modal(I18N.t('c4.att.bulkTitle'),`
      <div class="grid grid-cols-2 gap-4 mb-4">
        ${field(I18N.t('c4.common.date'),'date',{type:'date',value:todayISO(),req:true})}
        ${field(I18N.t('c4.att.fType'),'type',{type:'select',options:[{value:'in',label:I18N.t('c4.common.checkIn')},{value:'out',label:I18N.t('c4.common.checkOut')}]})}
      </div>
      ${field(I18N.t('c4.att.fNote'),'note',{ph:I18N.t('c4.att.phNote')})}
      <div class="max-h-64 overflow-y-auto border border-slate-200/70 rounded-2xl mt-4 mb-4 divide-y divide-slate-50">
        ${emps.filter(e=>e.active).map(e=>`<label class="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer">
          <input type="checkbox" name="bemp" value="${e.id}" class="w-4 h-4 rounded accent-slate-900">
          <span class="text-sm font-medium text-slate-700">${esc(e.name)}</span><span class="text-xs text-slate-400 ml-auto">${esc(e.code)}</span></label>`).join('')}
      </div>
      <div class="flex justify-end gap-2"><button class="${btnS}" id="bCancel">${I18N.t('c4.common.cancel')}</button><button class="${V_BLACK}" id="bGo">${I18N.t('c4.att.markSelected')}</button></div>`);
    m.el.querySelector('#bCancel').onclick=()=>m.close();
    m.el.querySelector('#bGo').onclick=async()=>{
      const ids=[...m.el.querySelectorAll('[name="bemp"]:checked')].map(x=>x.value);
      if(!ids.length){ toast(I18N.t('c4.att.selectOne'),'warn'); return; }
      const r=await API.call('bulkMark',formVal(m.el,'date'),ids,formVal(m.el,'type'),formVal(m.el,'note'));
      m.close(); toast(I18N.t('c4.att.markedN').replace('{n}',r.count),'success'); load();
    };
  };
};
})();
