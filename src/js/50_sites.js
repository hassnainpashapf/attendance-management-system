/* 50_sites.js — site table + Leaflet map picker modal (lat/lng + radius slider)
   + employee assignment checkboxes. */
(function(){
'use strict';

App.nav.push({group:'WORKFORCE', path:'#/sites', label:I18N.t('c4.nav.sites'), labelKey:'c4.nav.sites', icon:'sites', perm:'sites'});

App.routes['#/sites'] = async (el)=>{
  const cid=uid('sites');
  el.innerHTML=pageHead(I18N.t('c4.nav.sites'),I18N.t('c4.sites.sub'),
    `${perm('sites','edit')?`<button class="${btnP}" id="${cid}-add">${I18N.t('c4.sites.addSite')}</button>`:''}`)+
    `<div id="${cid}-body"></div>`;
  const body=document.getElementById(cid+'-body');
  let sites=[], emps=[];
  async function load(){
    sites=await API.call('listSites');
    emps=await API.call('listEmployees');
    body.innerHTML=tableHTML([
      {label:I18N.t('c4.sites.colSite'), get:s=>`<div><div class="font-semibold text-slate-700">${esc(s.name)}</div><div class="text-xs text-slate-400">${esc(s.address||'—')}</div></div>`},
      {label:I18N.t('c4.sites.colCoords'), get:s=>`<span class="font-mono text-xs">${Number(s.lat).toFixed(4)}, ${Number(s.lng).toFixed(4)}</span>`},
      {label:I18N.t('c4.sites.colGeofence'), num:1, get:s=>`<span class="tabular-nums">${fmtNum(s.radiusM)} m</span>`},
      {label:I18N.t('c4.sites.colStaff'), num:1, get:s=>fmtNum(s.employeeCount||0)},
      {label:I18N.t('c4.common.status'), get:s=>s.active?badge(I18N.t('c4.common.active'),'emerald'):badge(I18N.t('c4.common.inactive'),'slate')},
      {label:'', get:s=>perm('sites','edit')?`<div class="flex gap-1 justify-end">
        <button class="${btnS} !px-3 !py-1.5 !text-xs" data-assign="${s.id}">${I18N.t('c4.sites.assignStaff')}</button>
        <button class="${btnS} !px-3 !py-1.5 !text-xs" data-edit="${s.id}">${I18N.t('c4.common.edit')}</button>
        <button class="${btnS} !px-3 !py-1.5 !text-xs !text-red-600" data-del="${s.id}">${I18N.t('c4.common.delete')}</button></div>`:''},
    ], sites, {empty:I18N.t('c4.sites.emptySites')});
    body.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEditor(sites.find(s=>s.id===b.dataset.edit)));
    body.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
      if(!await confirmDlg(I18N.t('c4.sites.delSiteTitle'),I18N.t('c4.sites.delSiteMsg'),I18N.t('c4.common.delete'))) return;
      await API.call('deleteSite',b.dataset.del); toast(I18N.t('c4.sites.siteDeleted'),'success'); load();
    });
    body.querySelectorAll('[data-assign]').forEach(b=>b.onclick=()=>openAssign(b.dataset.assign));
  }

  function openEditor(s){
    const isNew=!s; s=s||{name:'',address:'',lat:31.5204,lng:74.3587,radiusM:150,active:true};
    const m=modal(isNew?I18N.t('c4.sites.addSiteTitle'):I18N.t('c4.sites.editSiteTitle'),`
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div class="col-span-2">${field(I18N.t('c4.sites.fSiteName'),'name',{value:s.name,req:true})}</div>
        <div class="col-span-2">${field(I18N.t('c4.sites.fAddress'),'address',{value:s.address||''})}</div>
        ${field(I18N.t('c4.sites.fLat'),'lat',{value:s.lat,type:'number',step:'0.000001',req:true})}
        ${field(I18N.t('c4.sites.fLng'),'lng',{value:s.lng,type:'number',step:'0.000001',req:true})}
        <div class="col-span-2"><label class="block"><span class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">${I18N.t('c4.sites.fRadius')} · <span id="radVal" class="text-teal-600">${fmtNum(s.radiusM)} m</span></span>
          <input type="range" name="radiusM" min="50" max="1000" step="10" value="${s.radiusM}" class="w-full accent-teal-600"></label></div>
        <div class="col-span-2">${field(I18N.t('c4.emp.fActive'),'active',{type:'checkbox',value:s.active})}</div>
      </div>
      <div id="mapPick" class="h-64 border border-slate-200/70 mb-2"></div>
      <p class="text-xs text-slate-400 mb-4">${I18N.t('c4.sites.mapHint')}</p>
      <div class="flex justify-end gap-2"><button class="${btnS}" id="sCancel">${I18N.t('c4.common.cancel')}</button><button class="${btnP}" id="sSave">${I18N.t('c4.sites.saveSite')}</button></div>`,{wide:true});
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
          <input type="checkbox" name="emp" value="${e.id}" ${assigned.includes(e.id)?'checked':''} class="w-4 h-4 rounded accent-teal-600">
          <span class="text-sm font-medium text-slate-700">${esc(e.name)}</span><span class="text-xs text-slate-400 ml-auto">${esc(e.code)}</span></label>`).join('')}
      </div>
      <div class="flex justify-end gap-2"><button class="${btnS}" id="aCancel">${I18N.t('c4.common.cancel')}</button><button class="${btnP}" id="aSave">${I18N.t('c4.sites.saveAssignments')}</button></div>`);
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
