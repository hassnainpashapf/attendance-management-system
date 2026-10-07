/* 70_attendance.js — attendance log with filters, live map, bulk-mark modal,
   delete punch, corrections tab with approve/reject. */
(function(){
'use strict';

App.nav.push({group:'MAIN', path:'#/attendance', label:'Attendance', icon:'attendance', perm:'attendance'});

App.routes['#/attendance'] = async (el, params)=>{
  const cid=uid('att');
  const tab=(params&&params.tab)||'log';
  const canEdit=perm('attendance','edit');
  el.innerHTML=pageHead('Attendance','Punch log, live map and corrections',
    `${canEdit?`<button class="${btnP}" id="${cid}-bulk">Bulk Mark</button>`:''}`)+`
  <div class="flex gap-2 mb-5">
    ${[['log','Punch Log'],['map','Live Map'],['corrections','Corrections']].map(([k,l])=>
      `<a href="#/attendance${k==='log'?'':'?tab='+k}" class="px-4 py-2 rounded-xl text-sm font-semibold ${tab===k?'bg-teal-600 text-white shadow':'bg-white text-slate-500 border border-slate-200'}">${l}</a>`).join('')}
  </div>
  <div id="${cid}-body"></div>`;
  const body=document.getElementById(cid+'-body');
  const bulkB=document.getElementById(cid+'-bulk');

  if(tab==='map'){
    body.innerHTML=`<div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6">
      <div class="flex items-center justify-between mb-4"><h3 class="font-display font-bold text-slate-800">Live map — today's punches</h3>
      <button class="${btnS}" id="${cid}-refresh">Refresh</button></div>
      <div id="${cid}-livemap" class="h-[480px] border border-slate-200/70"></div></div>`;
    const draw=async()=>{
      const mapEl=document.getElementById(cid+'-livemap'); if(!mapEl) return;
      mapEl.innerHTML='';
      const map=buildMap(mapEl,[31.5,74.35],11);
      if(!map) return;
      const pts=await API.call('getLiveMap');
      (pts||[]).forEach(p=>{
        const m=L.circleMarker([p.lat,p.lng],{radius:7,color:p.outOfZone?'#ef4444':'#0d9488',fillColor:p.outOfZone?'#ef4444':'#0d9488',fillOpacity:.9,weight:2})
          .addTo(map).bindPopup(`<b>${esc(p.employeeName)}</b><br>${p.type==='in'?'Checked in':'Checked out'} · ${esc(p.time)}<br>${esc(p.siteName)}${p.outOfZone?'<br><b style="color:#ef4444">Out of zone</b>':''}${p.selfie?'<br>📷 selfie attached':''}`);
      });
      const sites=await API.call('listSites');
      (sites||[]).filter(s=>s.active).forEach(s=>{
        L.circle([Number(s.lat),Number(s.lng)],{radius:Number(s.radiusM)||150,color:'#0ea5e9',weight:1.5,fillOpacity:.05}).addTo(map)
          .bindPopup(`<b>${esc(s.name)}</b><br>Geofence ${fmtNum(s.radiusM)} m`);
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
      {label:'Employee', get:c=>`<span class="font-medium text-slate-700">${esc(c.employeeName)}</span>`},
      {label:'Punch', get:c=>`${esc(c.punchDate)} · ${c.punchType==='in'?'Check-in':'Check-out'} ${esc(c.punchTime)}`},
      {label:'Request', get:c=>`<span class="text-slate-600">${esc(c.note)}</span>`},
      {label:'Status', get:c=>c.status==='pending'?badge('Pending','amber'):c.status==='approved'?badge('Approved','emerald'):badge('Rejected','red')},
      {label:'', get:c=>c.status==='pending'&&canEdit?`<div class="flex gap-1 justify-end">
        <button class="${btnS} !px-3 !py-1.5 !text-xs !text-emerald-700" data-ok="${c.id}">Approve</button>
        <button class="${btnS} !px-3 !py-1.5 !text-xs !text-red-600" data-no="${c.id}">Reject</button></div>`:`<span class="text-xs text-slate-400">${esc(c.decidedBy||'')}</span>`},
    ], rows, {empty:'No correction requests.'});
    body.querySelectorAll('[data-ok]').forEach(b=>b.onclick=async()=>{ await API.call('decideCorrection',b.dataset.ok,'approved'); toast('Correction approved','success'); App.route(); });
    body.querySelectorAll('[data-no]').forEach(b=>b.onclick=async()=>{ await API.call('decideCorrection',b.dataset.no,'rejected'); toast('Correction rejected','success'); App.route(); });
    return;
  }

  /* punch log */
  const emps=await API.call('listEmployees').catch(()=>[]);
  const sites=await API.call('listSites').catch(()=>[]);
  body.innerHTML=`
    <div class="bg-white rounded-2xl border border-slate-200/70 p-4 mb-4 flex flex-wrap gap-3 items-end anim-fadeUp">
      ${field('From','from',{type:'date',value:addDays(todayISO(),-7)})}
      ${field('To','to',{type:'date',value:todayISO()})}
      ${field('Employee','employeeId',{type:'select',options:[{value:'',label:'All employees'}].concat(emps.filter(e=>e.active).map(e=>({value:e.id,label:e.name})))})}
      ${field('Site','siteId',{type:'select',options:[{value:'',label:'All sites'}].concat(sites.map(s=>({value:s.id,label:s.name})))})}
      <label class="flex items-center gap-2 text-sm cursor-pointer pb-2.5"><input type="checkbox" id="${cid}-ooz" class="w-4 h-4 rounded accent-teal-600"><span class="font-medium text-slate-600">Out-of-zone only</span></label>
      <button class="${btnP}" id="${cid}-go">Apply</button>
      <button class="${btnS}" id="${cid}-csv">Export CSV</button>
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
      {label:'Date', get:p=>`<span class="tabular-nums">${fmtDate(p.date)}</span>`},
      {label:'Employee', get:p=>`<div><div class="font-medium text-slate-700">${esc(p.employeeName)}</div><div class="text-xs text-slate-400">${esc(p.employeeCode||'')}</div></div>`},
      {label:'Type', get:p=>p.type==='in'?badge('Check-in','emerald'):badge('Check-out','slate')},
      {label:'Time', get:p=>`<span class="tabular-nums font-medium">${esc(p.time)}</span>`},
      {label:'Site', get:p=>esc(p.siteName||'—')},
      {label:'Distance', num:1, get:p=>p.distanceM!=null?`<span class="tabular-nums">${fmtNum(p.distanceM)} m</span>`:'<span class="text-slate-300">—</span>'},
      {label:'Zone', get:p=>p.outOfZone?badge('Out of zone','red'):badge('In zone','teal')},
      {label:'Source', get:p=>`<span class="text-xs text-slate-400">${esc(p.source||'')}</span>`},
      {label:'', get:p=>`<div class="flex gap-1 justify-end">
        ${p.selfie?`<button class="${btnS} !px-2.5 !py-1.5 !text-xs" data-img="${p.id}">Selfie</button>`:''}
        ${canEdit?`<button class="${btnS} !px-2.5 !py-1.5 !text-xs" data-corr="${p.id}">Request fix</button>
        <button class="${btnS} !px-2.5 !py-1.5 !text-xs !text-red-600" data-del="${p.id}">✕</button>`:''}</div>`},
    ], rows, {empty:'No punches match these filters.'});
    rowsEl.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
      if(!await confirmDlg('Delete punch?','This cannot be undone.','Delete')) return;
      await API.call('deletePunch',b.dataset.del); toast('Punch deleted','success'); load();
    });
    rowsEl.querySelectorAll('[data-corr]').forEach(b=>b.onclick=()=>{
      const m=modal('Request correction',`${field('What should be corrected?','note',{type:'textarea',ph:'e.g. Wrong check-out time — actual was 17:05',req:true})}
        <div class="flex justify-end gap-2 mt-5"><button class="${btnS}" id="cCancel">Cancel</button><button class="${btnP}" id="cSend">Send request</button></div>`);
      m.el.querySelector('#cCancel').onclick=()=>m.close();
      m.el.querySelector('#cSend').onclick=async()=>{
        const note=formVal(m.el,'note'); if(!note){toast('Describe the correction','warn');return;}
        await API.call('requestCorrection',b.dataset.corr,note); m.close(); toast('Correction requested','success');
      };
    });
    rowsEl.querySelectorAll('[data-img]').forEach(b=>b.onclick=async()=>{
      const all=await API.call('listAttendance',{from:formVal(body,'from'),to:formVal(body,'to')});
      const p=all.find(x=>x.id===b.dataset.img);
      if(p&&p.selfie) modal('Selfie — '+p.employeeName,`<img src="${p.selfie}" class="rounded-2xl w-full" alt="selfie"><p class="text-xs text-slate-400 mt-3">${fmtDate(p.date)} · ${esc(p.time)} · ${esc(p.siteName||'')}</p>`);
      else toast('No selfie stored for this punch','warn');
    });
  }
  document.getElementById(cid+'-go').onclick=load;
  document.getElementById(cid+'-csv').onclick=async()=>{
    const r=await API.call('exportCSV','attendance',{from:formVal(body,'from'),to:formVal(body,'to')});
    downloadCSV(r.filename,r.csv); toast('CSV downloaded','success');
  };
  await load();

  if(bulkB) bulkB.onclick=async()=>{
    const m=modal('Bulk mark attendance',`
      <div class="grid grid-cols-2 gap-4 mb-4">
        ${field('Date','date',{type:'date',value:todayISO(),req:true})}
        ${field('Type','type',{type:'select',options:[{value:'in',label:'Check-in'},{value:'out',label:'Check-out'}]})}
      </div>
      ${field('Note','note',{ph:'Optional note recorded on each punch'})}
      <div class="max-h-64 overflow-y-auto border border-slate-200/70 rounded-2xl mt-4 mb-4 divide-y divide-slate-50">
        ${emps.filter(e=>e.active).map(e=>`<label class="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer">
          <input type="checkbox" name="bemp" value="${e.id}" class="w-4 h-4 rounded accent-teal-600">
          <span class="text-sm font-medium text-slate-700">${esc(e.name)}</span><span class="text-xs text-slate-400 ml-auto">${esc(e.code)}</span></label>`).join('')}
      </div>
      <div class="flex justify-end gap-2"><button class="${btnS}" id="bCancel">Cancel</button><button class="${btnP}" id="bGo">Mark selected</button></div>`);
    m.el.querySelector('#bCancel').onclick=()=>m.close();
    m.el.querySelector('#bGo').onclick=async()=>{
      const ids=[...m.el.querySelectorAll('[name="bemp"]:checked')].map(x=>x.value);
      if(!ids.length){ toast('Select at least one employee','warn'); return; }
      const r=await API.call('bulkMark',formVal(m.el,'date'),ids,formVal(m.el,'type'),formVal(m.el,'note'));
      m.close(); toast(r.count+' punch(es) marked','success'); load();
    };
  };
};
})();
