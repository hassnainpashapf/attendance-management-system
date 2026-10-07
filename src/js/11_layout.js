/* 11_layout.js — shell: white sidebar with teal active pills, topbar with user
   menu + impersonation banner, hash router. */
(function(){
'use strict';

const NAVGROUPS=[
  {key:'MAIN',label:I18N.t('c4.nav.gMain'),labelKey:'c4.nav.gMain'},
  {key:'WORKFORCE',label:I18N.t('c4.nav.gWorkforce'),labelKey:'c4.nav.gWorkforce'},
  {key:'PEOPLE',label:I18N.t('c4.nav.gPeople'),labelKey:'c4.nav.gPeople'},
  {key:'MONEY',label:I18N.t('c4.nav.gMoney'),labelKey:'c4.nav.gMoney'},
  {key:'SYSTEM',label:I18N.t('c4.nav.gSystem'),labelKey:'c4.nav.gSystem'},
];
const _svg=(inner)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 shrink-0">${inner}</svg>`;
const ICONS={
  dashboard:_svg('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  punch:_svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>'),
  attendance:_svg('<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M9 15l2 2 4-4"/>'),
  employees:_svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.2 3.4-5.5 6.5-5.5s5.7 2.3 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 010 6.8M17.8 14.9c2 .7 3.2 2.6 3.7 5.1"/>'),
  sites:_svg('<path d="M12 21s-7-5.6-7-11a7 7 0 0114 0c0 5.4-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/>'),
  shifts:_svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  leave:_svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9.5 13h5M9.5 16.5h3.5"/>'),
  overtime:_svg('<path d="M12 3v10.5"/><path d="M5 6.5l7-3 7 3"/><circle cx="12" cy="17" r="4.5"/>'),
  payroll:_svg('<rect x="3" y="8" width="18" height="12" rx="2.5"/><path d="M9 8V6.2A1.7 1.7 0 0110.7 4.5h2.6a1.7 1.7 0 011.7 1.7V8M3 13.5h18"/>'),
  documents:_svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 16.5h6"/>'),
  reports:_svg('<path d="M4 4v16h16"/><path d="M9 16v-4M13 16V8M17 16v-6"/>'),
  settings:_svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8"/>'),
  tenants:_svg('<path d="M4 21V9.5l5 3v-3l5 3V6l5-2.5V21z"/><path d="M2.5 21h19"/>'),
};

async function ensureBootstrap(){
  if(!Session.user) return false;
  if(!Session.bootstrap){
    try{ Session.bootstrap=await API.call('getBootstrap'); }
    catch(e){ Session.clear(); return false; }
  }
  return true;
}

function shellHTML(){
  const imp=Session.impersonating;
  const canPunch=perm('punch');
  const canSeeAlerts=perm('settings');
  document.body.className='bg-[#f8fafc] min-h-screen text-slate-700';
  document.body.innerHTML=`
  ${imp?`<div class="bg-amber-500 text-white text-sm px-4 py-2.5 flex items-center justify-center gap-3 sticky top-0 z-50">
    <span class="font-semibold">${I18N.t('c4.layout.impersonating').replace('{name}',esc(Session.user.name))}</span>
    <button id="stopImp" class="bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1 text-xs font-bold transition">${I18N.t('c4.layout.stopImpersonation')}</button>
  </div>`:''}
  <div class="flex min-h-screen">
    <aside id="side" class="w-[248px] shrink-0 bg-[#0f172a] flex flex-col fixed inset-y-0 z-40 transition-transform -translate-x-full lg:translate-x-0 ${imp?'top-[41px]':''}">
      <div class="px-5 pt-6 pb-5 flex items-center gap-3">${App.LOGOMARK}
        <div><div class="font-display font-bold text-[15px] text-white leading-tight">${I18N.t('c4.layout.brand1')}</div>
        <div class="text-[11px] text-slate-500">${I18N.t('c4.layout.brand2')}</div></div>
      </div>
      <nav id="nav" class="flex-1 overflow-y-auto px-3 pb-4 space-y-6"></nav>
      <div class="p-3 m-3 rounded-2xl bg-white/5 border border-white/10">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-white/10 text-white flex items-center justify-center font-bold text-sm" id="uAv">A</div>
          <div class="flex-1 min-w-0"><div class="text-sm font-semibold text-white truncate" id="uName">—</div>
          <div class="text-[11px] text-slate-500 capitalize" id="uRole">—</div></div>
          <button id="logout" title="${I18N.t('c4.layout.signOut')}" class="w-8 h-8 rounded-lg text-slate-500 hover:text-red-400 hover:bg-white/10 flex items-center justify-center transition" aria-label="${I18N.t('c4.layout.signOut')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" class="w-[18px] h-[18px]"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg></button>
        </div>
      </div>
    </aside>
    <div class="flex-1 lg:ml-[248px] min-w-0">
      <header class="sticky top-0 ${imp?'top-[41px]':''} z-30 bg-white/85 backdrop-blur-lg border-b border-slate-200/70 px-4 lg:px-8 py-3 flex items-center gap-2.5">
        <button id="menuBtn" class="lg:hidden w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-600">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" class="w-5 h-5"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
        <nav id="crumb" class="hidden sm:flex items-center gap-1.5 text-[13px] text-slate-400 whitespace-nowrap" aria-label="Breadcrumb"></nav>
        <div class="relative hidden md:block w-52 lg:w-64">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="w-4 h-4"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></span>
          <input id="topSearch" autocomplete="off" placeholder="${I18N.t('c4.common.search')}…" class="w-full bg-slate-100/70 border border-transparent rounded-xl pl-9 pr-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:bg-white focus:border-slate-300 focus:outline-none transition">
          <div id="topSearchDrop" class="hidden absolute left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-200/70 shadow-xl z-50 overflow-hidden p-1.5 max-h-80 overflow-y-auto"></div>
        </div>
        <div class="flex-1"></div>
        <button id="punchBtn" class="${btnP} ${canPunch?'hidden sm:flex':'hidden'} items-center gap-1.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="w-4 h-4"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></svg>${I18N.t('c4.layout.punchInOut')}</button>
        <button id="filterByBtn" class="hidden md:flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition shadow-sm" title="Filter">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M4 5h16l-6.5 8v5.5L10 21v-8z"/></svg><span>Filter by</span></button>
        <button id="helpBtn" class="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50 flex items-center justify-center transition shadow-sm text-base font-medium" title="Help">?</button>
        ${canSeeAlerts?`<div class="relative">
          <button id="bellBtn" class="relative w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50 flex items-center justify-center transition shadow-sm" title="Alerts">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>
            <span id="bellDot" class="hidden absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <div id="bellDrop" class="hidden absolute right-0 mt-2 w-[22rem] max-w-[90vw] bg-white rounded-2xl border border-slate-200/70 shadow-xl z-50 overflow-hidden"></div>
        </div>`:''}
        <div class="relative">
          <button id="avatarBtn" class="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-sm shadow-sm hover:bg-slate-800 transition"></button>
          <div id="avatarDrop" class="hidden absolute right-0 mt-2 w-56 bg-white rounded-2xl border border-slate-200/70 shadow-xl z-50 overflow-hidden anim-scaleIn"></div>
        </div>
      </header>
      <main id="view" class="p-4 lg:p-8 max-w-[1440px] mx-auto"></main>
      <footer class="px-8 pb-6 text-center text-[11px] text-slate-400">${I18N.t('c4.layout.footer')}</footer>
    </div>
  </div>
  <div id="sideOv" class="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] z-30 hidden lg:hidden"></div>`;
  const u=Session.user, b=Session.bootstrap||{};
  document.getElementById('uName').textContent=u.name;
  document.getElementById('uRole').textContent=u.role;
  document.getElementById('uAv').textContent=(u.name||'A')[0].toUpperCase();
  document.getElementById('logout').onclick=()=>{ Session.clear(); location.hash='#/login'; boot(); };
  const pb=document.getElementById('punchBtn');
  if(pb) pb.onclick=()=>location.hash='#/punch';
  const side=document.getElementById('side'), ov=document.getElementById('sideOv');
  const toggle=()=>{ side.classList.toggle('-translate-x-full'); ov.classList.toggle('hidden'); };
  document.getElementById('menuBtn').onclick=toggle; ov.onclick=toggle;
  const av=document.getElementById('avatarBtn'); if(av) av.textContent=(u.name||'A')[0].toUpperCase();
  document.getElementById('avatarBtn').onclick=e=>{e.stopPropagation();toggleAvatar();};
  const bl=document.getElementById('bellBtn');
  if(bl){ bl.onclick=e=>{e.stopPropagation();toggleBell();}; refreshBellDot(); }
  /* Filter by: focus the page's first filter/search input */
  const fb=document.getElementById('filterByBtn');
  if(fb) fb.onclick=()=>{
    const view=document.getElementById('view'); if(!view) return;
    const t=view.querySelector('[data-vf-search], input[type="search"], input[placeholder*="Search" i]');
    if(t){ t.focus(); t.scrollIntoView({behavior:'smooth', block:'center'}); }
    else toast('No filters on this page','info');
  };
  const hb=document.getElementById('helpBtn');
  if(hb) hb.onclick=()=>toast('Help: use the search or visit Settings for guides','info');
  wireTopSearch();
  document.addEventListener('click',()=>{
    ['avatarDrop','bellDrop','topSearchDrop'].forEach(id=>{ const d=document.getElementById(id); if(d) d.classList.add('hidden'); });
  });
  const si=document.getElementById('stopImp');
  if(si) si.onclick=async()=>{
    try{ await API.call('stopImpersonation'); }catch(e){}
    Session.user=Session.savedUser; Session.savedUser=null;
    Session.bootstrap=await API.call('getBootstrap');
    location.hash='#/tenants'; boot();
  };
  renderNav();
}

function toggleAvatar(){
  const d=document.getElementById('avatarDrop'); if(!d) return;
  const u=Session.user||{};
  const item=(hash,label)=>`<a href="${hash}" class="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-50 font-medium transition-colors">${label}</a>`;
  d.innerHTML=`<div class="px-4 py-3.5 border-b border-slate-100 bg-slate-50/60">
      <div class="font-semibold text-sm text-slate-800">${esc(u.name||u.username||'')}</div>
      <div class="text-xs text-slate-400 capitalize mt-0.5">${esc(u.role||'')} · ${esc((Session.bootstrap||{}).company?.name||'')}</div></div>
    <div class="p-2">
      ${perm('settings')?item('#/settings',I18N.t('c4.layout.companySettings')):''}
      <button id="avLogout" class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-red-600 hover:bg-red-50 font-medium text-left transition-colors">${I18N.t('c4.layout.signOut')}</button>
    </div>`;
  d.classList.toggle('hidden');
  const lo=d.querySelector('#avLogout');
  if(lo) lo.onclick=()=>{ Session.clear(); location.hash='#/login'; boot(); };
}

function renderNav(){
  const nav=document.getElementById('nav'); if(!nav) return;
  nav.innerHTML=NAVGROUPS.map(g=>{
    const items=App.nav.filter(n=>n.group===g.key&&perm(n.perm,'view')&&(!n.superadmin||Session.user.role==='superadmin'));
    if(!items.length) return '';
    return `<div><div class="px-3 mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">${I18N.t(g.labelKey)}</div>
      <div class="space-y-1">${items.map(n=>{
        const active=location.hash.startsWith(n.path);
        return `<a href="${n.path}" class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${active?'bg-white text-slate-900 font-semibold shadow':'text-slate-400 hover:bg-white/5 hover:text-white font-medium'}">
          <span class="${active?'text-slate-700':'text-slate-500'}">${ICONS[n.icon]||''}</span><span class="truncate">${I18N.t(n.labelKey)}</span></a>`;}).join('')}</div></div>`;
  }).join('');
}

/* Topbar search: filters permitted nav routes, click navigates. */
function wireTopSearch(){
  const inp=document.getElementById('topSearch'); if(!inp) return;
  const drop=document.getElementById('topSearchDrop'); if(!drop) return;
  const navItems=()=>App.nav.filter(n=>perm(n.perm,'view')&&(!n.superadmin||Session.user.role==='superadmin'));
  inp.addEventListener('input',()=>{
    const q=inp.value.trim().toLowerCase();
    if(!q){ drop.classList.add('hidden'); return; }
    const hits=navItems().filter(n=>{ const l=n.labelKey?I18N.t(n.labelKey):(n.label||''); return l.toLowerCase().includes(q); }).slice(0,8);
    drop.innerHTML=hits.length?hits.map(n=>`
      <a href="${n.path}" class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-600 hover:bg-slate-100 font-medium transition-colors">
        <span class="text-slate-400">${ICONS[n.icon]||''}</span><span class="truncate">${esc(n.labelKey?I18N.t(n.labelKey):(n.label||''))}</span></a>`).join('')
      :'<div class="px-4 py-6 text-center text-sm text-slate-400">No matches</div>';
    drop.classList.remove('hidden');
  });
  inp.addEventListener('keydown',e=>{ if(e.key==='Escape'){ drop.classList.add('hidden'); inp.blur(); } });
  drop.addEventListener('click',()=>drop.classList.add('hidden'));
}

/* Bell: recent alert-message log (real data). Dot lights on failures. */
async function refreshBellDot(){
  const dot=document.getElementById('bellDot'); if(!dot) return;
  try{ const rows=await API.call('listMessageLog',20);
    dot.classList.toggle('hidden',!rows.some(r=>r.status==='failed'));
  }catch(e){}
}
async function toggleBell(){
  const d=document.getElementById('bellDrop'); if(!d) return;
  if(!d.classList.contains('hidden')){ d.classList.add('hidden'); return; }
  d.innerHTML='<div class="p-8 text-center"><span class="spinner" style="border-color:#e2e8f0;border-top-color:#0f172a"></span></div>';
  d.classList.remove('hidden');
  let rows=[];
  try{ rows=await API.call('listMessageLog',8); }catch(e){ rows=[]; }
  const dot=document.getElementById('bellDot');
  if(dot) dot.classList.toggle('hidden',!rows.some(r=>r.status==='failed'));
  const stB=s=>s==='sent'?badge('Sent','emerald'):s==='failed'?badge('Failed','red'):badge(String(s||'—'),'slate');
  d.innerHTML=`<div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
      <span class="font-bold text-sm text-slate-800">Recent alerts</span>
      <a href="#/settings" class="text-xs font-semibold text-slate-500 hover:text-slate-900">View all</a></div>
    ${rows.length?'<div class="max-h-80 overflow-y-auto divide-y divide-slate-50">'+rows.map(r=>`
      <div class="px-4 py-3 flex items-center gap-3">
        <span class="w-8 h-8 rounded-xl ${r.channel==='whatsapp'?'bg-emerald-50 text-emerald-600':'bg-sky-50 text-sky-600'} flex items-center justify-center text-sm shrink-0">${r.channel==='whatsapp'?'✆':'✉'}</span>
        <div class="min-w-0 flex-1">
          <div class="text-[13px] font-semibold text-slate-700 truncate">${esc(r.event||'Alert')}</div>
          <div class="text-xs text-slate-400 truncate">${esc(r.to||'')} · ${fmtDateTime(r.ts)}</div>
        </div>${stB(r.status)}</div>`).join('')+'</div>'
    :'<div class="px-4 py-10 text-center text-sm text-slate-400">No alerts yet</div>'}`;
}

/* route() calls are serialized through a chain so a fast second navigation
   (e.g. boot setting location.hash, which fires hashchange) can never
   interleave with a render already in flight. */
let routeChain=Promise.resolve();
function route(){ routeChain=routeChain.then(_route,_route); return routeChain; }
async function _route(){
  const view=document.getElementById('view'); if(!view) return;
  renderNav();
  const hash=location.hash||'#/dashboard';
  const qIdx=hash.indexOf('?');
  const path=qIdx>0?hash.slice(0,qIdx):hash;
  const params={}; if(qIdx>0) new URLSearchParams(hash.slice(qIdx+1)).forEach((v,k)=>params[k]=v);
  const keys=Object.keys(App.routes).sort((a,b)=>b.length-a.length);
  const key=keys.find(k=>path===k||path.startsWith(k+'/'));
  const crumb=document.getElementById('crumb');
  if(crumb){
    const n=App.nav.find(n=>n.path===(key||path));
    const label=n?(n.labelKey?I18N.t(n.labelKey):n.label):'';
    const dash=I18N.t('c4.nav.dashboard');
    const isDash=(key||path)==='#/dashboard';
    crumb.innerHTML=`<a href="#/dashboard" class="hover:text-slate-600 font-medium transition-colors">${esc(dash)}</a>`+
      ((isDash||!label)?'':`<span class="text-slate-300">›</span><span class="text-slate-800 font-semibold">${esc(label)}</span>`);
  }
  view.innerHTML='<div class="space-y-4 anim-fadeIn"><div class="h-9 shimmer rounded-2xl w-1/3"></div><div class="h-72 shimmer rounded-2xl"></div></div>';
  try{
    if(key) await App.routes[key](view, params, path);
    else { view.innerHTML=pageHead(I18N.t('c4.layout.notFound'),'')+'<p class="text-slate-500">'+I18N.t('c4.layout.notFoundMsg')+'</p>'; }
  }catch(e){
    console.error(e);
    view.innerHTML=pageHead(I18N.t('c4.layout.error'),'')+`<div class="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">${esc(e.message||I18N.t('c4.layout.somethingWrong'))}</div>`;
  }
  window.scrollTo(0,0);
}

async function boot(){
  if(!await ensureBootstrap()){ if(location.hash!=='#/login') location.hash='#/login'; loginPage(); return; }
  if(!document.getElementById('view')) shellHTML();
  const hsh=location.hash;
  const role=Session.user.role;
  const landing=role==='superadmin'?'#/tenants':role==='employee'?'#/punch':'#/dashboard';
  if(hsh==='#/login'||!hsh){ location.hash=landing; return; } /* hashchange drives route() */
  route();
}

window.addEventListener('hashchange',()=>{ if(Session.user) route(); });
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
else boot();
App.ICONS=ICONS;
App.boot=boot; App.route=route;
})();
