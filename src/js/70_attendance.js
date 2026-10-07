/* 70_attendance.js — attendance log with filters, live map, bulk-mark modal,
   delete punch, corrections tab with approve/reject. */
(function(){
'use strict';

App.nav.push({group:'MAIN', path:'#/attendance', label:I18N.t('c4.nav.attendance'), labelKey:'c4.nav.attendance', icon:'attendance', perm:'attendance'});

App.routes['#/attendance'] = async (el, params)=>{
  const cid=uid('att');
  const tab=(params&&params.tab)||'log';
  const canEdit=perm('attendance','edit');
  el.innerHTML=pageHead(I18N.t('c4.nav.attendance'),I18N.t('c4.att.sub'),
    `${canEdit?`<button class="${btnP}" id="${cid}-bulk">${I18N.t('c4.att.bulkMark')}</button>`:''}`)+`
  <div class="flex gap-2 mb-5">
    ${[['log',I18N.t('c4.att.tabLog')],['map',I18N.t('c4.att.tabMap')],['corrections',I18N.t('c4.att.tabCorrections')]].map(([k,l])=>
      `<a href="#/attendance${k==='log'?'':'?tab='+k}" class="px-4 py-2 rounded-xl text-sm font-semibold ${tab===k?'bg-teal-600 text-white shadow':'bg-white text-slate-500 border border-slate-200'}">${l}</a>`).join('')}
  </div>
  <div id="${cid}-body"></div>`;
  const body=document.getElementById(cid+'-body');
  const bulkB=document.getElementById(cid+'-bulk');

  if(tab==='map'){
    body.innerHTML=`<div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6">
      <div class="flex items-center justify-between mb-4"><h3 class="font-display font-bold text-slate-800">${I18N.t('c4.att.liveMapToday')}</h3>
      <button class="${btnS}" id="${cid}-refresh">${I18N.t('c4.common.refresh')}</button></div>
      <div id="${cid}-livemap" class="h-[480px] border border-slate-200/70"></div></div>`;
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
    body.innerHTML=tableHTML([
      {label:I18N.t('c4.common.employee'), get:c=>`<span class="font-medium text-slate-700">${esc(c.employeeName)}</span>`},
      {label:I18N.t('c4.att.colPunch'), get:c=>`${esc(c.punchDate)} · ${c.punchType==='in'?I18N.t('c4.common.checkIn'):I18N.t('c4.common.checkOut')} ${esc(c.punchTime)}`},
      {label:I18N.t('c4.att.colRequest'), get:c=>`<span class="text-slate-600">${esc(c.note)}</span>`},
      {label:I18N.t('c4.common.status'), get:c=>c.status==='pending'?badge(I18N.t('c4.common.pending'),'amber'):c.status==='approved'?badge(I18N.t('c4.common.approved'),'emerald'):badge(I18N.t('c4.common.rejected'),'red')},
      {label:'', get:c=>c.status==='pending'&&canEdit?`<div class="flex gap-1 justify-end">
        <button class="${btnS} !px-3 !py-1.5 !text-xs !text-emerald-700" data-ok="${c.id}">${I18N.t('c4.common.approve')}</button>
        <button class="${btnS} !px-3 !py-1.5 !text-xs !text-red-600" data-no="${c.id}">${I18N.t('c4.common.reject')}</button></div>`:`<span class="text-xs text-slate-400">${esc(c.decidedBy||'')}</span>`},
    ], rows, {empty:I18N.t('c4.att.emptyCorrections')});
    body.querySelectorAll('[data-ok]').forEach(b=>b.onclick=async()=>{ await API.call('decideCorrection',b.dataset.ok,'approved'); toast(I18N.t('c4.att.correctionApproved'),'success'); App.route(); });
    body.querySelectorAll('[data-no]').forEach(b=>b.onclick=async()=>{ await API.call('decideCorrection',b.dataset.no,'rejected'); toast(I18N.t('c4.att.correctionRejected'),'success'); App.route(); });
    return;
  }

  /* punch log */
  const emps=await API.call('listEmployees').catch(()=>[]);
  const sites=await API.call('listSites').catch(()=>[]);
  body.innerHTML=`
    <div class="bg-white rounded-2xl border border-slate-200/70 p-4 mb-4 flex flex-wrap gap-3 items-end anim-fadeUp">
      ${field(I18N.t('c4.common.from'),'from',{type:'date',value:addDays(todayISO(),-7)})}
      ${field(I18N.t('c4.common.to'),'to',{type:'date',value:todayISO()})}
      ${field(I18N.t('c4.common.employee'),'employeeId',{type:'select',options:[{value:'',label:I18N.t('c4.att.allEmployees')}].concat(emps.filter(e=>e.active).map(e=>({value:e.id,label:e.name})))})}
      ${field(I18N.t('c4.common.site'),'siteId',{type:'select',options:[{value:'',label:I18N.t('c4.att.allSites')}].concat(sites.map(s=>({value:s.id,label:s.name})))})}
      <label class="flex items-center gap-2 text-sm cursor-pointer pb-2.5"><input type="checkbox" id="${cid}-ooz" class="w-4 h-4 rounded accent-teal-600"><span class="font-medium text-slate-600">${I18N.t('c4.att.oozOnly')}</span></label>
      <button class="${btnP}" id="${cid}-go">${I18N.t('c4.common.apply')}</button>
      <button class="${btnS}" id="${cid}-csv">${I18N.t('c4.att.exportCsv')}</button>
    </div>
    <div id="${cid}-rows"></div>`;
  const rowsEl=document.getElementById(cid+'-rows');
  async function load(){
    const f={
      from:formVal(body,'from'), to:formVal(body,'to'),
      employeeId:formVal(body,'employeeId'), siteId:formVal(body,'siteId'),
      outOfZone:document.getElementById(cid+'-ooz').checked||'',
    };
    const rows=await API.call('listAttendance',f);
    rowsEl.innerHTML=tableHTML([
      {label:I18N.t('c4.common.date'), get:p=>`<span class="tabular-nums">${fmtDate(p.date)}</span>`},
      {label:I18N.t('c4.common.employee'), get:p=>`<div><div class="font-medium text-slate-700">${esc(p.employeeName)}</div><div class="text-xs text-slate-400">${esc(p.employeeCode||'')}</div></div>`},
      {label:I18N.t('c4.att.colType'), get:p=>p.type==='in'?badge(I18N.t('c4.common.checkIn'),'emerald'):badge(I18N.t('c4.common.checkOut'),'slate')},
      {label:I18N.t('c4.att.colTime'), get:p=>`<span class="tabular-nums font-medium">${esc(p.time)}</span>`},
      {label:I18N.t('c4.common.site'), get:p=>esc(p.siteName||'—')},
      {label:I18N.t('c4.att.colDistance'), num:1, get:p=>p.distanceM!=null?`<span class="tabular-nums">${fmtNum(p.distanceM)} m</span>`:'<span class="text-slate-300">—</span>'},
      {label:I18N.t('c4.att.colZone'), get:p=>p.outOfZone?badge(I18N.t('c4.common.outOfZone'),'red'):badge(I18N.t('c4.common.inZone'),'teal')},
      {label:I18N.t('c4.att.colSource'), get:p=>`<span class="text-xs text-slate-400">${esc(p.source||'')}</span>`},
      {label:'', get:p=>`<div class="flex gap-1 justify-end">
        ${p.selfie?`<button class="${btnS} !px-2.5 !py-1.5 !text-xs" data-img="${p.id}">${I18N.t('c4.att.selfieBtn')}</button>`:''}
        ${canEdit?`<button class="${btnS} !px-2.5 !py-1.5 !text-xs" data-corr="${p.id}">${I18N.t('c4.att.requestFix')}</button>
        <button class="${btnS} !px-2.5 !py-1.5 !text-xs !text-red-600" data-del="${p.id}">✕</button>`:''}</div>`},
    ], rows, {empty:I18N.t('c4.att.emptyLog')});
    rowsEl.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
      if(!await confirmDlg(I18N.t('c4.att.delPunchTitle'),I18N.t('c4.emp.cannotUndo'),I18N.t('c4.common.delete'))) return;
      await API.call('deletePunch',b.dataset.del); toast(I18N.t('c4.att.punchDeleted'),'success'); load();
    });
    rowsEl.querySelectorAll('[data-corr]').forEach(b=>b.onclick=()=>{
      const m=modal(I18N.t('c4.att.reqCorrectionTitle'),`${field(I18N.t('c4.att.fWhatCorrected'),'note',{type:'textarea',ph:I18N.t('c4.att.phCorrection'),req:true})}
        <div class="flex justify-end gap-2 mt-5"><button class="${btnS}" id="cCancel">${I18N.t('c4.common.cancel')}</button><button class="${btnP}" id="cSend">${I18N.t('c4.att.sendRequest')}</button></div>`);
      m.el.querySelector('#cCancel').onclick=()=>m.close();
      m.el.querySelector('#cSend').onclick=async()=>{
        const note=formVal(m.el,'note'); if(!note){toast(I18N.t('c4.att.describeCorrection'),'warn');return;}
        await API.call('requestCorrection',b.dataset.corr,note); m.close(); toast(I18N.t('c4.att.correctionRequested'),'success');
      };
    });
    rowsEl.querySelectorAll('[data-img]').forEach(b=>b.onclick=async()=>{
      const all=await API.call('listAttendance',{from:formVal(body,'from'),to:formVal(body,'to')});
      const p=all.find(x=>x.id===b.dataset.img);
      if(p&&p.selfie) modal(I18N.t('c4.att.selfieTitle').replace('{name}',p.employeeName),`<img src="${p.selfie}" class="rounded-2xl w-full" alt="selfie"><p class="text-xs text-slate-400 mt-3">${fmtDate(p.date)} · ${esc(p.time)} · ${esc(p.siteName||'')}</p>`);
      else toast(I18N.t('c4.att.noSelfie'),'warn');
    });
  }
  document.getElementById(cid+'-go').onclick=load;
  document.getElementById(cid+'-csv').onclick=async()=>{
    const r=await API.call('exportCSV','attendance',{from:formVal(body,'from'),to:formVal(body,'to')});
    downloadCSV(r.filename,r.csv); toast(I18N.t('c4.att.csvDownloaded'),'success');
  };
  await load();

  if(bulkB) bulkB.onclick=async()=>{
    const m=modal(I18N.t('c4.att.bulkTitle'),`
      <div class="grid grid-cols-2 gap-4 mb-4">
        ${field(I18N.t('c4.common.date'),'date',{type:'date',value:todayISO(),req:true})}
        ${field(I18N.t('c4.att.fType'),'type',{type:'select',options:[{value:'in',label:I18N.t('c4.common.checkIn')},{value:'out',label:I18N.t('c4.common.checkOut')}]})}
      </div>
      ${field(I18N.t('c4.att.fNote'),'note',{ph:I18N.t('c4.att.phNote')})}
      <div class="max-h-64 overflow-y-auto border border-slate-200/70 rounded-2xl mt-4 mb-4 divide-y divide-slate-50">
        ${emps.filter(e=>e.active).map(e=>`<label class="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer">
          <input type="checkbox" name="bemp" value="${e.id}" class="w-4 h-4 rounded accent-teal-600">
          <span class="text-sm font-medium text-slate-700">${esc(e.name)}</span><span class="text-xs text-slate-400 ml-auto">${esc(e.code)}</span></label>`).join('')}
      </div>
      <div class="flex justify-end gap-2"><button class="${btnS}" id="bCancel">${I18N.t('c4.common.cancel')}</button><button class="${btnP}" id="bGo">${I18N.t('c4.att.markSelected')}</button></div>`);
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
