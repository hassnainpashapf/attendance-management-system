/* 50_sites.js — site table + Leaflet map picker modal (lat/lng + radius slider)
   + employee assignment checkboxes. Verola premium styling. */
(function(){
'use strict';

App.nav.push({group:'WORKFORCE', path:'#/sites', label:I18N.t('c4.nav.sites'), labelKey:'c4.nav.sites', icon:'sites', perm:'sites'});

/* Verola tokens (local) */
const vBtnB='px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold shadow active:scale-[.98] transition';
const vBtnSx='px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-600 active:scale-[.98] transition shadow-sm';
function vHead(title, sub, actions){
  return `<div class="flex items-center gap-2 text-[13px] text-slate-400 mb-4 anim-fadeUp"><span class="text-base">⌂</span><a href="#/dashboard" class="hover:text-slate-600">${I18N.t('c4.nav.dashboard')}</a><span>›</span><span class="text-slate-700 font-semibold">${title}</span></div>
  <div class="flex flex-wrap items-center justify-between gap-3 mb-5 anim-fadeUp"><div><h1 class="font-display text-[26px] font-bold text-slate-800 tracking-tight">${title}</h1><p class="text-sm text-slate-400 mt-1">${sub}</p></div><div class="flex gap-2 flex-wrap">${actions||''}</div></div>`;
}
function vBadge(ok, yesTxt, noTxt){
  return ok
    ?`<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 whitespace-nowrap"><span class="text-[10px]">✓</span>${yesTxt}</span>`
    :`<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 ring-1 ring-slate-200 whitespace-nowrap"><span class="text-[10px]">–</span>${noTxt}</span>`;
}

App.routes['#/sites'] = async (el)=>{
  const cid=uid('sites');
  el.innerHTML=vHead(I18N.t('c4.nav.sites'),I18N.t('c4.sites.sub'),
    `${perm('sites','edit')?`<button class="${vBtnB}" id="${cid}-add">${I18N.t('c4.sites.addSite')}</button>`:''}`)+
    `<div id="${cid}-body"></div>`;
  const body=document.getElementById(cid+'-body');
  let sites=[], emps=[];
  async function load(){
    sites=await API.call('listSites');
    emps=await API.call('listEmployees');
    body.innerHTML=tableHTML([
      {label:I18N.t('c4.sites.colSite'), get:s=>`<div class="flex items-center gap-3"><span class="w-8 h-8 rounded-full bg-slate-200 text-slate-500 text-[11px] font-bold inline-flex items-center justify-center shrink-0"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5"><path d="M12 21s-7-5.5-7-11a7 7 0 0114 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/></svg></span><div><div class="font-semibold text-slate-700">${esc(s.name)}</div><div class="text-xs text-slate-400">${esc(s.address||'—')}</div></div></div>`},
      {label:I18N.t('c4.sites.colCoords'), get:s=>`<span class="font-mono text-xs text-slate-500">${Number(s.lat).toFixed(4)}, ${Number(s.lng).toFixed(4)}</span>`},
      {label:I18N.t('c4.sites.colGeofence'), num:1, get:s=>`<span class="tabular-nums text-slate-600">${fmtNum(s.radiusM)} m</span>`},
      {label:I18N.t('c4.sites.colStaff'), num:1, get:s=>`<span class="tabular-nums font-medium text-slate-700">${fmtNum(s.employeeCount||0)}</span>`},
      {label:I18N.t('c4.common.status'), get:s=>vBadge(s.active, I18N.t('c4.common.active'), I18N.t('c4.common.inactive'))},
      {label:'', get:s=>`<div class="flex gap-1 justify-end">
        <button class="${vBtnSx}" data-map="${s.id}">${I18N.t('c4.sites.mapBtn')}</button>
        ${perm('sites','edit')?`<button class="${vBtnSx}" data-assign="${s.id}">${I18N.t('c4.sites.assignStaff')}</button>
        <button class="${vBtnSx}" data-edit="${s.id}">${I18N.t('c4.common.edit')}</button>
        <button class="${vBtnSx} !text-red-600" data-del="${s.id}">${I18N.t('c4.common.delete')}</button>`:''}</div>`},
    ], sites, {empty:I18N.t('c4.sites.emptySites')});
    body.querySelectorAll('[data-map]').forEach(b=>b.onclick=()=>openMapView(sites.find(s=>s.id===b.dataset.map)));
    body.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEditor(sites.find(s=>s.id===b.dataset.edit)));
    body.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
      if(!await confirmDlg(I18N.t('c4.sites.delSiteTitle'),I18N.t('c4.sites.delSiteMsg'),I18N.t('c4.common.delete'))) return;
      await API.call('deleteSite',b.dataset.del); toast(I18N.t('c4.sites.siteDeleted'),'success'); load();
    });
    body.querySelectorAll('[data-assign]').forEach(b=>b.onclick=()=>openAssign(b.dataset.assign));
  }

  function openMapView(s){
    if(!s) return;
    const m=modal(esc(s.name),`
      <div id="siteMapView" class="h-80 rounded-2xl border border-slate-200/70 overflow-hidden"></div>
      <div class="flex items-center gap-2 mt-4 text-sm text-slate-500">
        <span class="font-mono text-xs bg-slate-100 px-2.5 py-1.5 rounded-lg">${Number(s.lat).toFixed(6)}, ${Number(s.lng).toFixed(6)}</span>
        <span class="text-xs">· ${I18N.t('c4.common.geofenceN').replace('{n}',fmtNum(s.radiusM))}</span>
        <span class="text-xs">· ${esc(s.address||'')}</span>
      </div>`);
    const mapEl=m.el.querySelector('#siteMapView');
    const map=buildMap(mapEl,[Number(s.lat),Number(s.lng)],15);
    if(map){
      L.circle([Number(s.lat),Number(s.lng)],{radius:Number(s.radiusM)||150,color:'#0d9488',weight:2,fillOpacity:.08}).addTo(map)
        .bindPopup(`<b>${esc(s.name)}</b>`).openPopup();
      L.marker([Number(s.lat),Number(s.lng)]).addTo(map);
      setTimeout(()=>map.invalidateSize(),150);
    }
  }

  function openEditor(s){
    const isNew=!s; s=s||{name:'',address:'',lat:31.5204,lng:74.3587,radiusM:150,active:true};
    const m=modal(isNew?I18N.t('c4.sites.addSiteTitle'):I18N.t('c4.sites.editSiteTitle'),`
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div class="col-span-2">${field(I18N.t('c4.sites.fSiteName'),'name',{value:s.name,req:true})}</div>
        <div class="col-span-2">${field(I18N.t('c4.sites.fAddress'),'address',{value:s.address||''})}</div>
        ${field(I18N.t('c4.sites.fLat'),'lat',{value:s.lat,type:'number',step:'0.000001',req:true})}
        ${field(I18N.t('c4.sites.fLng'),'lng',{value:s.lng,type:'number',step:'0.000001',req:true})}
        <div class="col-span-2"><label class="block"><span class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">${I18N.t('c4.sites.fRadius')} · <span id="radVal" class="text-slate-900 font-bold">${fmtNum(s.radiusM)} m</span></span>
          <input type="range" name="radiusM" min="50" max="1000" step="10" value="${s.radiusM}" class="w-full accent-slate-900"></label></div>
        <div class="col-span-2">${field(I18N.t('c4.emp.fActive'),'active',{type:'checkbox',value:s.active})}</div>
      </div>
      <div id="mapPick" class="h-64 rounded-2xl border border-slate-200/70 overflow-hidden mb-2"></div>
      <p class="text-xs text-slate-400 mb-4">${I18N.t('c4.sites.mapHint')}</p>
      <div class="flex justify-end gap-2"><button class="${btnS}" id="sCancel">${I18N.t('c4.common.cancel')}</button><button class="${vBtnB}" id="sSave">${I18N.t('c4.sites.saveSite')}</button></div>`,{wide:true});
    const mapEl=m.el.querySelector('#mapPick');
    const map=buildMap(mapEl,[Number(s.lat),Number(s.lng)],14);
    let marker=null, circle=null;
    const radInput=m.el.querySelector('[name="radiusM"]');
    const radVal=m.el.querySelector('#radVal');
    radInput.addEventListener('input',()=>{ radVal.textContent=fmtNum(radInput.value)+' m'; if(circle) circle.setRadius(Number(radInput.value)); });
    if(map){
      marker=L.marker([Number(s.lat),Number(s.lng)],{draggable:true}).addTo(map);
      circle=L.circle([Number(s.lat),Number(s.lng)],{radius:Number(s.radiusM),color:'#0d9488',weight:2,fillOpacity:.08}).addTo(map);
      marker.on('dragend',sync);
      map.on('click',e=>{ marker.setLatLng(e.latlng); sync(); });
      setTimeout(()=>map.invalidateSize(),150);
    }
    function sync(){
      if(!marker) return;
      const lat=marker.getLatLng().lat, lng=marker.getLatLng().lng;
      m.el.querySelector('[name="lat"]').value=lat.toFixed(6);
      m.el.querySelector('[name="lng"]').value=lng.toFixed(6);
      if(circle) circle.setLatLng([lat,lng]);
    }
    m.el.querySelector('#sCancel').onclick=()=>m.close();
    m.el.querySelector('#sSave').onclick=async()=>{
      const data=collectForm(m.el);
      if(!data.name){ toast(I18N.t('c4.sites.siteNameRequired'),'warn'); return; }
      data.radiusM=Number(data.radiusM)||150;
      await API.call('saveSite',{...(isNew?{}:{id:s.id}),...data});
      m.close(); toast(I18N.t('c4.sites.siteSaved'),'success'); load();
    };
  }

  function openAssign(siteId){
    const s=sites.find(x=>x.id===siteId);
    const assigned=s.employeeIds||(window.MockDB?MockDB.siteEmployees:[]).filter(x=>x.siteId===siteId).map(x=>x.employeeId);
    const m=modal(I18N.t('c4.sites.assignTitle').replace('{name}',s.name),`
      <div class="max-h-80 overflow-y-auto space-y-1 mb-5">
        ${emps.filter(e=>e.active).map(e=>`<label class="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 cursor-pointer">
          <input type="checkbox" name="emp" value="${e.id}" ${assigned.includes(e.id)?'checked':''} class="w-4 h-4 rounded accent-slate-900">
          <span class="w-8 h-8 rounded-full bg-slate-200 text-slate-500 text-[11px] font-bold inline-flex items-center justify-center shrink-0">${esc((String(e.name||'?').trim().split(/\s+/).map(w=>w[0]).join('')||'?').slice(0,2).toUpperCase())}</span>
          <span class="text-sm font-medium text-slate-700">${esc(e.name)}</span><span class="text-xs text-slate-400 ml-auto">${esc(e.code)}</span></label>`).join('')}
      </div>
      <div class="flex justify-end gap-2"><button class="${btnS}" id="aCancel">${I18N.t('c4.common.cancel')}</button><button class="${vBtnB}" id="aSave">${I18N.t('c4.sites.saveAssignments')}</button></div>`);
    m.el.querySelector('#aCancel').onclick=()=>m.close();
    m.el.querySelector('#aSave').onclick=async()=>{
      const ids=[...m.el.querySelectorAll('[name="emp"]:checked')].map(x=>x.value);
      await API.call('assignSiteEmployees',siteId,ids);
      m.close(); toast(I18N.t('c4.sites.assignedN').replace('{n}',ids.length),'success'); load();
    };
  }

  const addB=document.getElementById(cid+'-add'); if(addB) addB.onclick=()=>openEditor(null);
  await load();
};
})();
