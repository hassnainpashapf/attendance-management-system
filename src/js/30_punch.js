/* 30_punch.js — Check-In / Check-Out with selfie capture, GPS, site geofence
   matching, offline queue with auto-sync, client-side duplicate guard. */
(function(){
'use strict';

App.nav.push({group:'MAIN', path:'#/punch', label:'My Punch', icon:'punch', perm:'punch'});

const QKEY='ams_queue', LKEY='ams_lastpunch';

function getQueue(){ try{return JSON.parse(localStorage.getItem(QKEY)||'[]');}catch(e){return [];} }
function setQueue(q){ localStorage.setItem(QKEY,JSON.stringify(q)); }
function getLastPunch(){ try{return JSON.parse(localStorage.getItem(LKEY)||'null');}catch(e){return null;} }
function setLastPunch(o){ localStorage.setItem(LKEY,JSON.stringify(o)); }

async function syncQueue(statusEl){
  const q=getQueue();
  if(!q.length){ if(statusEl) statusEl.innerHTML=''; return; }
  if(!navigator.onLine){ if(statusEl) statusEl.innerHTML=badge('Offline — '+q.length+' queued','amber'); return; }
  let ok=0, fail=0;
  for(const item of q){
    try{
      await API.call('punch', item.employeeId, item.type, item.lat, item.lng, item.selfie, item.deviceId, 'gps');
      ok++;
    }catch(e){ fail++; }
  }
  setQueue(fail? q.slice(ok) : []);
  if(statusEl) statusEl.innerHTML = fail
    ? badge(fail+' still queued','amber')
    : `<span class="text-emerald-600 text-sm font-medium">✓ ${ok} queued punch${ok===1?'':'es'} synced</span>`;
  toast(ok+' queued punch(es) synced', ok?'success':'warn');
}

function myEmployeeId(){
  const u=Session.user||{};
  if(u.employeeId) return u.employeeId;
  return null;
}

App.routes['#/punch'] = async (el)=>{
  const cid=uid('punch');
  const employees=await API.call('listEmployees').catch(()=>[]);
  const activeEmps=(employees||[]).filter(e=>e.active);
  const me=myEmployeeId();
  const empOpts=activeEmps.map(e=>({value:e.id, label:e.name+' ('+e.code+')'}));

  el.innerHTML=pageHead('My Punch','GPS check-in with selfie verification',
    `<span id="${cid}-qstatus"></span>`)+`
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-5xl">
    <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6 anim-fadeUp">
      <h3 class="font-display font-bold text-slate-800 mb-4">1 · Employee & location</h3>
      ${field('Employee','empId',{type:'select',options:empOpts,value:me||'',cls:'mb-4'})}
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div class="rounded-xl bg-slate-50 border border-slate-200/60 p-3">
          <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Latitude</div>
          <div id="${cid}-lat" class="font-mono text-sm text-slate-700">—</div>
        </div>
        <div class="rounded-xl bg-slate-50 border border-slate-200/60 p-3">
          <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Longitude</div>
          <div id="${cid}-lng" class="font-mono text-sm text-slate-700">—</div>
        </div>
      </div>
      <div id="${cid}-siteinfo" class="mb-4"></div>
      <div id="${cid}-map" class="h-52 border border-slate-200/70"></div>
    </div>
    <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6 anim-fadeUp">
      <h3 class="font-display font-bold text-slate-800 mb-4">2 · Selfie & punch</h3>
      <div class="rounded-2xl overflow-hidden bg-slate-900 aspect-[4/3] relative mb-4">
        <video id="${cid}-vid" class="w-full h-full object-cover" autoplay playsinline muted></video>
        <canvas id="${cid}-cap" class="hidden"></canvas>
        <div id="${cid}-novideo" class="absolute inset-0 hidden items-center justify-center text-slate-400 text-sm text-center p-6">Camera unavailable.<br>Punch will be recorded without a selfie.</div>
      </div>
      <div class="flex gap-2 mb-5">
        <button id="${cid}-camon" class="${btnS} flex-1">Enable camera</button>
        <button id="${cid}-snap" class="${btnS} flex-1" disabled>Capture selfie</button>
      </div>
      <div id="${cid}-shot" class="hidden mb-5 flex items-center gap-3">
        <img id="${cid}-shotimg" class="w-16 h-16 rounded-xl object-cover border border-slate-200" alt="selfie">
        <div class="text-sm"><div class="font-semibold text-emerald-600">Selfie captured ✓</div><div class="text-slate-400 text-xs">Compressed to 320px JPEG</div></div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <button id="${cid}-in" class="py-4 rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold text-lg shadow-[0_4px_14px_rgba(16,185,129,.4)] active:scale-[.98] transition disabled:opacity-50">Check In</button>
        <button id="${cid}-out" class="py-4 rounded-2xl bg-gradient-to-b from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white font-bold text-lg shadow-[0_4px_14px_rgba(71,85,105,.35)] active:scale-[.98] transition disabled:opacity-50">Check Out</button>
      </div>
      <div id="${cid}-msg" class="mt-4"></div>
    </div>
  </div>`;

  const $=id=>document.getElementById(cid+'-'+id);
  const state={lat:null,lng:null,selfie:null,stream:null,sites:[],empId:me||''};

  /* load sites + map */
  try{
    state.sites=await API.call('listSites');
    const map=buildMap($('map'),[31.5,74.35],11);
    state.sites.filter(s=>s.active).forEach(s=>{
      L.circle([Number(s.lat),Number(s.lng)],{radius:Number(s.radiusM)||150,color:'#0ea5e9',weight:1.5,fillOpacity:.07}).addTo(map)
        .bindPopup(`<b>${esc(s.name)}</b><br>Geofence ${fmtNum(s.radiusM)} m`);
    });
    state.map=map; state.marker=null;
    setTimeout(()=>map.invalidateSize(),150);
  }catch(e){}

  function updateSiteInfo(){
    if(state.lat==null){ $('siteinfo').innerHTML=''; return; }
    let best=null,bestD=Infinity;
    (state.sites||[]).filter(s=>s.active).forEach(s=>{
      const d=haversineM(state.lat,state.lng,Number(s.lat),Number(s.lng));
      if(d!=null&&d<bestD){bestD=d;best=s;}
    });
    if(!best){ $('siteinfo').innerHTML=''; return; }
    const ooz=bestD>Number(best.radiusM||150);
    $('siteinfo').innerHTML=`
      <div class="rounded-xl border p-3.5 flex items-center gap-3 ${ooz?'border-red-200 bg-red-50/60':'border-emerald-200 bg-emerald-50/60'}">
        <div class="w-9 h-9 rounded-xl ${ooz?'bg-red-100 text-red-500':'bg-emerald-100 text-emerald-600'} flex items-center justify-center shrink-0">${App.ICONS.sites}</div>
        <div class="min-w-0"><div class="text-sm font-semibold ${ooz?'text-red-700':'text-emerald-800'}">${esc(best.name)}</div>
        <div class="text-xs ${ooz?'text-red-500':'text-emerald-600'}">${fmtNum(Math.round(bestD))} m away · ${ooz?'<b>OUT OF ZONE</b> — this punch will be flagged': 'inside geofence'}</div></div>
      </div>`;
  }

  /* geolocation */
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(pos=>{
      state.lat=pos.coords.latitude; state.lng=pos.coords.longitude;
      $('lat').textContent=state.lat.toFixed(6); $('lng').textContent=state.lng.toFixed(6);
      updateSiteInfo();
      if(state.map){
        state.map.setView([state.lat,state.lng],15);
        state.marker=L.circleMarker([state.lat,state.lng],{radius:8,color:'#0d9488',fillColor:'#0d9488',fillOpacity:.9}).addTo(state.map).bindPopup('Your location').openPopup();
      }
    },err=>{ $('msg').innerHTML=`<div class="text-sm text-amber-600 bg-amber-50 border border-amber-200/70 rounded-xl px-4 py-3">Location unavailable (${esc(err.message)}). You can still punch — it will be recorded without GPS.</div>`; },
    {enableHighAccuracy:true, timeout:12000});
  }

  /* camera */
  const vid=$('vid');
  $('camon').onclick=async()=>{
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user', width:{ideal:640}, height:{ideal:480}}, audio:false});
      state.stream=stream; vid.srcObject=stream;
      $('snap').disabled=false; $('camon').disabled=true;
      $('camon').textContent='Camera on';
    }catch(e){
      $('novideo').style.display='flex';
      toast('Camera not available: '+e.message,'warn');
    }
  };
  $('snap').onclick=()=>{
    if(!state.stream) return;
    const cap=$('cap');
    const vw=vid.videoWidth||640, vh=vid.videoHeight||480;
    const scale=Math.min(1, 320/Math.max(vw,vh));
    cap.width=Math.round(vw*scale); cap.height=Math.round(vh*scale);
    cap.getContext('2d').drawImage(vid,0,0,cap.width,cap.height);
    state.selfie=cap.toDataURL('image/jpeg',0.6);
    $('shotimg').src=state.selfie; $('shot').classList.remove('hidden'); $('shot').classList.add('flex');
  };

  async function doPunch(type){
    const msg=$('msg');
    const empSel=document.querySelector(`[name="empId"]`);
    const empId=empSel?empSel.value:state.empId;
    if(!empId){ msg.innerHTML=`<div class="text-sm text-red-600 bg-red-50 border border-red-200/70 rounded-xl px-4 py-3">Select an employee first.</div>`; return; }
    /* client-side duplicate guard: same employee+type within 5 minutes */
    const last=getLastPunch();
    if(last&&last.employeeId===empId&&last.type===type&&(Date.now()-last.at)<5*60*1000){
      msg.innerHTML=`<div class="text-sm text-amber-700 bg-amber-50 border border-amber-200/70 rounded-xl px-4 py-3">Duplicate blocked — a "${type}" was already recorded for this employee in the last 5 minutes.</div>`;
      return;
    }
    const btn=type==='in'?$('in'):$('out');
    btn.disabled=true; btn.innerHTML='<span class="spinner"></span>';
    const payload={employeeId:empId, type, lat:state.lat, lng:state.lng, selfie:state.selfie, deviceId:'', source:'gps'};
    const queueIt=()=>{
      const q=getQueue(); q.push({...payload, queuedAt:Date.now()});
      setQueue(q);
      msg.innerHTML=`<div class="text-sm text-amber-700 bg-amber-50 border border-amber-200/70 rounded-xl px-4 py-3">
        You are offline — punch <b>queued</b> (${q.length} pending). It will sync automatically when you are back online.</div>`;
      syncQueue($('qstatus'));
      btn.disabled=false; btn.textContent=type==='in'?'Check In':'Check Out';
    };
    if(!navigator.onLine){ queueIt(); return; }
    try{
      const r=await API.call('punch', payload.employeeId, payload.type, payload.lat, payload.lng, payload.selfie, payload.deviceId, payload.source);
      setLastPunch({employeeId:empId, type, at:Date.now()});
      msg.innerHTML=`<div class="text-sm ${r.outOfZone?'text-amber-700 bg-amber-50 border-amber-200/70':'text-emerald-700 bg-emerald-50 border-emerald-200/70'} border rounded-xl px-4 py-3">
        <b>${type==='in'?'Checked in':'Checked out'} ✓</b> at ${esc(r.punch.time)} · ${esc((r.site||{}).name||'No site matched')} · ${fmtNum(r.distanceM??0)} m
        ${r.outOfZone?'<br><b>Flagged as out-of-zone.</b>':''}</div>`;
      toast((type==='in'?'Checked in':'Checked out')+' recorded','success');
    }catch(e){
      /* offline or server error → queue */
      const q=getQueue(); q.push({...payload, queuedAt:Date.now()});
      setQueue(q);
      msg.innerHTML=`<div class="text-sm text-amber-700 bg-amber-50 border border-amber-200/70 rounded-xl px-4 py-3">
        ${navigator.onLine?'Server busy':'You are offline'} — punch <b>queued</b> (${q.length} pending). It will sync automatically.</div>`;
      syncQueue($('qstatus'));
    }
    btn.disabled=false; btn.textContent=type==='in'?'Check In':'Check Out';
  }
  $('in').onclick=()=>doPunch('in');
  $('out').onclick=()=>doPunch('out');

  /* offline queue status + auto-sync */
  const qs=$('qstatus');
  const q0=getQueue();
  if(q0.length) qs.innerHTML=badge(q0.length+' queued','amber');
  syncQueue(qs);
  window.addEventListener('online',()=>syncQueue(qs));
};
})();
