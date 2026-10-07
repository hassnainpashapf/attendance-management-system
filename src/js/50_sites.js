/* 50_sites.js — site table + Leaflet map picker modal (lat/lng + radius slider)
   + employee assignment checkboxes. */
(function(){
'use strict';

App.nav.push({group:'WORKFORCE', path:'#/sites', label:'Sites', icon:'sites', perm:'sites'});

App.routes['#/sites'] = async (el)=>{
  const cid=uid('sites');
  el.innerHTML=pageHead('Sites','Geofenced work locations',
    `${perm('sites','edit')?`<button class="${btnP}" id="${cid}-add">+ Add Site</button>`:''}`)+
    `<div id="${cid}-body"></div>`;
  const body=document.getElementById(cid+'-body');
  let sites=[], emps=[];
  async function load(){
    sites=await API.call('listSites');
    emps=await API.call('listEmployees');
    body.innerHTML=tableHTML([
      {label:'Site', get:s=>`<div><div class="font-semibold text-slate-700">${esc(s.name)}</div><div class="text-xs text-slate-400">${esc(s.address||'—')}</div></div>`},
      {label:'Coordinates', get:s=>`<span class="font-mono text-xs">${Number(s.lat).toFixed(4)}, ${Number(s.lng).toFixed(4)}</span>`},
      {label:'Geofence', num:1, get:s=>`<span class="tabular-nums">${fmtNum(s.radiusM)} m</span>`},
      {label:'Staff', num:1, get:s=>fmtNum(s.employeeCount||0)},
      {label:'Status', get:s=>s.active?badge('Active','emerald'):badge('Inactive','slate')},
      {label:'', get:s=>perm('sites','edit')?`<div class="flex gap-1 justify-end">
        <button class="${btnS} !px-3 !py-1.5 !text-xs" data-assign="${s.id}">Assign staff</button>
        <button class="${btnS} !px-3 !py-1.5 !text-xs" data-edit="${s.id}">Edit</button>
        <button class="${btnS} !px-3 !py-1.5 !text-xs !text-red-600" data-del="${s.id}">Delete</button></div>`:''},
    ], sites, {empty:'No sites yet — add your first geofenced site.'});
    body.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEditor(sites.find(s=>s.id===b.dataset.edit)));
    body.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
      if(!await confirmDlg('Delete site?','Staff assignments for this site will be removed.','Delete')) return;
      await API.call('deleteSite',b.dataset.del); toast('Site deleted','success'); load();
    });
    body.querySelectorAll('[data-assign]').forEach(b=>b.onclick=()=>openAssign(b.dataset.assign));
  }

  function openEditor(s){
    const isNew=!s; s=s||{name:'',address:'',lat:31.5204,lng:74.3587,radiusM:150,active:true};
    const m=modal(isNew?'Add Site':'Edit Site',`
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div class="col-span-2">${field('Site name','name',{value:s.name,req:true})}</div>
        <div class="col-span-2">${field('Address','address',{value:s.address||''})}</div>
        ${field('Latitude','lat',{value:s.lat,type:'number',step:'0.000001',req:true})}
        ${field('Longitude','lng',{value:s.lng,type:'number',step:'0.000001',req:true})}
        <div class="col-span-2"><label class="block"><span class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">GEOFENCE RADIUS · <span id="radVal" class="text-teal-600">${fmtNum(s.radiusM)} m</span></span>
          <input type="range" name="radiusM" min="50" max="1000" step="10" value="${s.radiusM}" class="w-full accent-teal-600"></label></div>
        <div class="col-span-2">${field('Active','active',{type:'checkbox',value:s.active})}</div>
      </div>
      <div id="mapPick" class="h-64 border border-slate-200/70 mb-2"></div>
      <p class="text-xs text-slate-400 mb-4">Click anywhere on the map to move the site pin. Drag the slider to resize the geofence.</p>
      <div class="flex justify-end gap-2"><button class="${btnS}" id="sCancel">Cancel</button><button class="${btnP}" id="sSave">Save site</button></div>`,{wide:true});
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
      if(!data.name){ toast('Site name required','warn'); return; }
      data.radiusM=Number(data.radiusM)||150;
      await API.call('saveSite',{...(isNew?{}:{id:s.id}),...data});
      m.close(); toast('Site saved','success'); load();
    };
  }

  function openAssign(siteId){
    const s=sites.find(x=>x.id===siteId);
    const assigned=s.employeeIds||(window.MockDB?MockDB.siteEmployees:[]).filter(x=>x.siteId===siteId).map(x=>x.employeeId);
    const m=modal('Assign staff — '+s.name,`
      <div class="max-h-80 overflow-y-auto space-y-1 mb-5">
        ${emps.filter(e=>e.active).map(e=>`<label class="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 cursor-pointer">
          <input type="checkbox" name="emp" value="${e.id}" ${assigned.includes(e.id)?'checked':''} class="w-4 h-4 rounded accent-teal-600">
          <span class="text-sm font-medium text-slate-700">${esc(e.name)}</span><span class="text-xs text-slate-400 ml-auto">${esc(e.code)}</span></label>`).join('')}
      </div>
      <div class="flex justify-end gap-2"><button class="${btnS}" id="aCancel">Cancel</button><button class="${btnP}" id="aSave">Save assignments</button></div>`);
    m.el.querySelector('#aCancel').onclick=()=>m.close();
    m.el.querySelector('#aSave').onclick=async()=>{
      const ids=[...m.el.querySelectorAll('[name="emp"]:checked')].map(x=>x.value);
      await API.call('assignSiteEmployees',siteId,ids);
      m.close(); toast(ids.length+' employee(s) assigned','success'); load();
    };
  }

  const addB=document.getElementById(cid+'-add'); if(addB) addB.onclick=()=>openEditor(null);
  await load();
};
})();
