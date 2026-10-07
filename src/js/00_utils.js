/* 00_utils.js — global utilities. Loaded first. */
(function(){
'use strict';
const G = window;
/* GAS HtmlService strips double-slash to end-of-line inside served scripts,
   so a URL must never contain a literal double-slash inside a JS string.
   Build HTTPS by concatenation only. */
G.HTTPS = 'https:' + '/' + '/';

/* ---------- element builder ---------- */
function h(tag, attrs, ...children){
  const el = document.createElement(tag);
  if(attrs) for(const k in attrs){
    const v = attrs[k];
    if(v==null) continue;
    if(k==='class') el.className=v;
    else if(k==='html') el.innerHTML=v;
    else if(k.startsWith('on')&&typeof v==='function') el.addEventListener(k.slice(2),v);
    else if(k==='value') el.value=v;
    else el.setAttribute(k,v);
  }
  for(const c of children.flat(9)){
    if(c==null||c===false) continue;
    el.append(c.nodeType?c:document.createTextNode(String(c)));
  }
  return el;
}
function esc(s){ return String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ---------- formatting ---------- */
function fmt(n){ n=Number(n)||0; return 'Rs '+n.toLocaleString('en-PK',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtNum(n){ return (Number(n)||0).toLocaleString('en-PK'); }
function fmtDate(iso){ if(!iso) return '—'; const d=new Date(iso); return isNaN(d)?String(iso):d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }
function fmtTime(t){ if(!t) return '—'; const s=String(t).slice(0,5); return s; }
function fmtDateTime(iso){ if(!iso) return '—'; const d=new Date(iso); return isNaN(d)?String(iso):d.toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
function todayISO(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function monthISO(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function addDays(iso,n){ const d=new Date(iso+'T12:00:00'); d.setDate(d.getDate()+n); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function daysUntil(iso){ if(!iso) return 99999; return Math.ceil((new Date(iso+'T00:00:00')-Date.now())/86400000); }

/* ---------- geo ---------- */
function haversineM(lat1,lon1,lat2,lon2){
  if(lat1==null||lon1==null||lat2==null||lon2==null) return null;
  const R=6371000, toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

/* ---------- toast ---------- */
function toast(msg,type='info'){
  let wrap=document.getElementById('toasts');
  if(!wrap){ wrap=h('div',{id:'toasts',class:'fixed top-4 right-4 z-[9999] space-y-2'}); document.body.append(wrap); }
  const dot={info:'bg-slate-400',success:'bg-emerald-500',error:'bg-red-500',warn:'bg-amber-500'};
  const t=h('div',{class:'bg-white text-slate-800 pl-3 pr-4 py-3 rounded-xl shadow-xl border border-slate-200/80 text-sm max-w-sm flex items-center gap-2.5 anim-slideIn'},
    h('span',{class:`w-2 h-2 rounded-full shrink-0 ${dot[type]||dot.info}`}), h('span',{html:msg}));
  t.style.animation='slideIn .25s ease';
  wrap.append(t); setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .3s';setTimeout(()=>t.remove(),320);},3200);
}

/* ---------- modal ---------- */
function modal(title, bodyHTML, opts={}){
  const ov=h('div',{class:'fixed inset-0 z-[9000] bg-slate-900/50 backdrop-blur-[2px] flex items-center justify-center p-4 anim-fadeIn'});
  const box=h('div',{class:`bg-white rounded-2xl shadow-2xl w-full ${opts.wide?'max-w-4xl':'max-w-lg'} max-h-[92vh] flex flex-col anim-scaleIn`});
  const head=h('div',{class:'flex items-center justify-between px-6 py-4 border-b border-slate-100'},
    h('h3',{class:'font-display font-bold text-lg text-slate-800'},title),
    h('button',{class:'w-8 h-8 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center text-xl leading-none',onclick:()=>close()},'×'));
  const body=h('div',{class:'p-6 overflow-y-auto',html:bodyHTML});
  box.append(head,body); ov.append(box); document.body.append(ov);
  function close(){ ov.remove(); document.removeEventListener('keydown',onKey); }
  function onKey(e){ if(e.key==='Escape') close(); }
  document.addEventListener('keydown',onKey);
  ov.addEventListener('mousedown',e=>{ if(e.target===ov) close(); });
  return {el:body, box, close};
}
function confirmDlg(title,msg,okLabel){
  okLabel=okLabel||I18N.t('c4.common.confirm');
  return new Promise(res=>{
    const m=modal(title,`<p class="text-slate-600 text-sm leading-relaxed">${msg}</p>
      <div class="flex justify-end gap-2 mt-6">
        <button id="cNo" class="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">${I18N.t('c4.common.cancel')}</button>
        <button id="cYes" class="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 shadow-sm">${esc(okLabel)}</button>
      </div>`);
    m.el.querySelector('#cNo').onclick=()=>{m.close();res(false);};
    m.el.querySelector('#cYes').onclick=()=>{m.close();res(true);};
  });
}

/* ---------- form helpers ---------- */
function formVal(root, name){ const el=root.querySelector(`[name="${name}"]`); return el?el.value.trim():''; }
function formNum(root, name){ return Number(formVal(root,name))||0; }
function collectForm(root){
  const o={}; root.querySelectorAll('[name]').forEach(el=>{
    if(el.type==='checkbox') o[el.name]=el.checked;
    else if(el.type==='number') o[el.name]=Number(el.value)||0;
    else o[el.name]=el.value.trim();
  }); return o;
}
function field(label,name,opts={}){
  const {type='text',value='',ph='',req=false,cls='',step,options,rows=3,min,max}=opts;
  let input;
  if(type==='select'){
    input=`<select name="${name}" class="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 w-full text-sm text-slate-700 focus:ring-2 focus:ring-slate-900/10 focus:border-slate-500 focus:outline-none transition ${cls}">${(options||[]).map(o=>`<option value="${esc(o.value)}" ${String(o.value)===String(value)?'selected':''}>${esc(o.label)}</option>`).join('')}</select>`;
  }else if(type==='textarea'){
    input=`<textarea name="${name}" rows="${rows}" placeholder="${esc(ph)}" class="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 w-full text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900/10 focus:border-slate-500 focus:outline-none transition ${cls}">${esc(value)}</textarea>`;
  }else if(type==='checkbox'){
    input=`<input type="checkbox" name="${name}" ${value?'checked':''} class="w-4 h-4 rounded accent-slate-900">`;
    return `<label class="flex items-center gap-2.5 text-sm cursor-pointer ${cls}">${input}<span class="font-medium text-slate-600">${label}</span></label>`;
  }else{
    input=`<input type="${type}" name="${name}" value="${esc(value)}" ${ph?`placeholder="${esc(ph)}"`:''} ${req?'required':''} ${step?`step="${step}"`:''} ${min!=null?`min="${min}"`:''} ${max!=null?`max="${max}"`:''} class="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 w-full text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900/10 focus:border-slate-500 focus:outline-none transition ${cls}">`;
  }
  return `<label class="block ${cls}"><span class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">${label}${req?' <span class="text-red-500">*</span>':''}</span>${input}</label>`;
}

/* ---------- tables & cards ---------- */
/* Verola-exact table: uppercase headers with sort icons, checkbox support,
   pixel-perfect row styling. opts.checkbox=true adds selection column. */
function tableHTML(cols, rows, opts={}){
  const tcls=opts.compact?'text-xs':'text-sm';
  const sortIc='<span class="text-slate-300 text-[9px] ml-1.5 select-none">↕</span>';
  const cbHead=opts.checkbox?`<th class="pl-5 pr-2 py-3 w-12"><input type="checkbox" data-vcb-all class="w-4 h-4 rounded border-slate-300 text-slate-900 accent-slate-900 cursor-pointer align-middle"></th>`:'';
  return `<div class="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_3px_rgba(15,23,42,.04)]">
    <table class="w-full ${tcls}">
      <thead>
        <tr class="border-b border-slate-200/70 bg-[#fafbfc]">${cbHead}${cols.map(c=>`<th class="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap ${c.num?'text-right':''}">${esc(c.label)}${c.nosort?'':sortIc}</th>`).join('')}</tr>
      </thead>
      <tbody class="divide-y divide-slate-100">${rows.length?rows.map((r,i)=>{
        const cbCell=opts.checkbox?`<td class="pl-5 pr-2 py-4"><input type="checkbox" data-vcb="${esc(r.id||i)}" class="w-4 h-4 rounded border-slate-300 text-slate-900 accent-slate-900 cursor-pointer align-middle"></td>`:'';
        return `<tr class="hover:bg-slate-50/70 transition-colors">${cbCell}${cols.map(c=>{
          const v=typeof c.get==='function'?c.get(r,i):r[c.key];
          return `<td class="px-5 py-4 ${c.num?'text-right tabular-nums':''} ${c.cls||''}">${v??'<span class="text-slate-300">—</span>'}</td>`;
        }).join('')}</tr>`;}).join(''):`<tr><td colspan="${cols.length+(opts.checkbox?1:0)}" class="px-4 py-12 text-center"><div class="text-slate-300 text-3xl mb-2">◌</div><div class="text-sm text-slate-400">${opts.empty||I18N.t('c4.common.noRecords')}</div></td></tr>`}</tbody>
    </table>
    ${opts.pagination||''}</div>`;
}
/* Verola pagination: < 1 2 3 4 > + "Showing X to Y of Z" + per-page select.
   Returns HTML; wire with vPaginateBind(root, onPage). */
function vPaginationHTML(total, page, perPage){
  const pages=Math.max(1, Math.ceil(total/perPage));
  const from=total?((page-1)*perPage+1):0, to=Math.min(total, page*perPage);
  let nums='';
  for(let p=1;p<=pages;p++){
    if(pages>7 && p>2 && p<pages-1 && Math.abs(p-page)>1){ if(!nums.endsWith('…')) nums+='<span class="px-1 text-slate-300">…</span>'; continue; }
    nums+=`<button data-pg="${p}" class="min-w-[2rem] h-8 px-2 rounded-lg text-[13px] font-semibold transition ${p===page?'bg-slate-900 text-white shadow':'text-slate-500 hover:bg-slate-100'}">${p}</button>`;
  }
  return `<div class="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-slate-100">
    <div class="flex items-center gap-1.5">
      <button data-pgprev class="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center transition ${page<=1?'opacity-40 pointer-events-none':''}">‹</button>
      ${nums}
      <button data-pgnext class="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center transition ${page>=pages?'opacity-40 pointer-events-none':''}">›</button>
    </div>
    <div class="flex items-center gap-3">
      <span class="text-[13px] text-slate-400">Showing ${from} to ${to} of ${fmtNum(total)} entries</span>
      <select data-pgper class="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[13px] text-slate-600 font-medium focus:outline-none cursor-pointer">
        ${[8,16,50,100].map(n=>`<option value="${n}" ${n===perPage?'selected':''}>${n} - ${n===8?'50':n===16?'100':n}</option>`).join('')}
      </select>
    </div></div>`;
}
/* Bind pagination events. onChange(page, perPage) re-renders. */
function vPaginateBind(root, onChange){
  if(!root) return;
  root.querySelectorAll('[data-pg]').forEach(b=>{ b.onclick=()=>onChange(parseInt(b.dataset.pg,10)); });
  const pv=root.querySelector('[data-pgprev]'); if(pv) pv.onclick=()=>onChange('prev');
  const nx=root.querySelector('[data-pgnext]'); if(nx) nx.onclick=()=>onChange('next');
  const pp=root.querySelector('[data-pgper]'); if(pp) pp.onchange=()=>onChange('per', parseInt(pp.value,10));
}
/* Verola filter row: search + pill buttons. */
function vFilterRow(searchPh, pills, extra=''){
  return `<div class="flex flex-wrap items-center gap-2.5 mb-4">
    <div class="relative">
      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="w-4 h-4"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></span>
      <input data-vf-search placeholder="${esc(searchPh||'Search…')}" class="bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none transition w-56">
    </div>
    ${pills.map(p=>`<button data-vf-pill="${esc(p.key)}" class="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition flex items-center gap-2">${p.icon||''}${esc(p.label)}</button>`).join('')}
    <div class="flex-1"></div>${extra}</div>`;
}
function statCard(label,value,sub='',accent='slate',icon='',raw=null,prefix=''){
  const chip={slate:'bg-slate-100 text-slate-500',teal:'bg-teal-50 text-teal-600',emerald:'bg-emerald-50 text-emerald-600',red:'bg-red-50 text-red-500',amber:'bg-amber-50 text-amber-500',blue:'bg-blue-50 text-blue-500',violet:'bg-violet-50 text-violet-500',cyan:'bg-cyan-50 text-cyan-600'}[accent]||'bg-slate-100 text-slate-500';
  const cnt=raw!=null?` data-countup="${raw}" data-prefix="${esc(prefix)}"`:'';
  return `<div class="bg-white rounded-2xl border border-slate-200/70 p-5 shadow-[0_1px_3px_rgba(15,23,42,.04)]">
    <div class="flex items-center gap-2.5 mb-4">
      ${icon?`<span class="w-9 h-9 rounded-xl ${chip} flex items-center justify-center shrink-0">${icon}</span>`:''}
      <span class="text-[13px] text-slate-500 font-medium">${label}</span>
    </div>
    <div class="text-[26px] font-bold text-slate-900 tabular-nums tracking-tight"${cnt}>${value}</div>
    ${sub?`<div class="text-xs text-slate-400 mt-1.5">${sub}</div>`:''}</div>`;
}
/* Initials avatar circle (Verola table style). */
function avatar(name, cls='w-8 h-8 text-[11px]'){
  const init=(String(name||'?').trim().split(/\s+/).map(w=>w[0]).join('')||'?').slice(0,2).toUpperCase();
  return `<span class="${cls} rounded-full bg-slate-200 text-slate-500 font-bold inline-flex items-center justify-center shrink-0">${esc(init)}</span>`;
}
function animateCounters(root){
  (root||document).querySelectorAll('[data-countup]').forEach(el=>{
    const target=parseFloat(el.dataset.countup), prefix=el.dataset.prefix||'';
    if(!isFinite(target)) return;
    const t0=performance.now(), dur=900;
    (function tick(t){ const p=Math.min(1,(t-t0)/dur), e=1-Math.pow(1-p,3);
      el.textContent=prefix+fmtNum(Math.round(target*e));
      if(p<1) requestAnimationFrame(tick); })(t0);
  });
}
function emptyState(title, sub='', action=''){
  return `<div class="text-center py-14 px-6 anim-fadeIn">
    <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" class="w-8 h-8"><path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/></svg></div>
    <div class="font-display font-bold text-slate-700">${title}</div>
    ${sub?`<div class="text-sm text-slate-400 mt-1.5 max-w-xs mx-auto">${sub}</div>`:''}
    ${action?`<div class="mt-4">${action}</div>`:''}</div>`;
}
function pageHead(title, sub, actions=''){
  return `<div class="flex flex-wrap items-center justify-between gap-3 mb-6 anim-fadeUp">
    <div><h1 class="font-display text-[26px] font-bold text-slate-900 tracking-tight">${title}</h1>${sub?`<p class="text-sm text-slate-400 mt-1">${sub}</p>`:''}</div>
    <div class="flex gap-2 flex-wrap">${actions}</div></div>`;
}
const btnP='px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold shadow active:scale-[.98] transition';
const btnS='px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-sm font-semibold text-slate-600 active:scale-[.98] transition shadow-sm';
const btnD='px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold shadow active:scale-[.98] transition';
function badge(text,color='slate'){
  const m={slate:'bg-slate-100 text-slate-600 ring-slate-200',emerald:'bg-emerald-50 text-emerald-700 ring-emerald-200',teal:'bg-teal-50 text-teal-700 ring-teal-200',red:'bg-red-50 text-red-600 ring-red-200',amber:'bg-amber-50 text-amber-700 ring-amber-200',blue:'bg-blue-50 text-blue-700 ring-blue-200',sky:'bg-sky-50 text-sky-700 ring-sky-200',violet:'bg-violet-50 text-violet-700 ring-violet-200',cyan:'bg-cyan-50 text-cyan-700 ring-cyan-200'};
  /* Verola: status pills use ✓ for success / ◷ for pending, dot otherwise */
  const ic=color==='emerald'?'✓':(color==='amber'?'◷':null);
  const dot=ic?`<span class="text-[11px] leading-none">${ic}</span>`:`<span class="w-1 h-1 rounded-full bg-current"></span>`;
  return `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ring-1 ${m[color]||m.slate} whitespace-nowrap">${dot}${esc(text)}</span>`;
}
/* Verola "..." actions button */
function vActionsMenu(){
  return `<button class="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50 flex items-center justify-center transition text-base leading-none tracking-widest" data-vact>•••</button>`;
}

/* ---------- misc ---------- */
function debounce(fn,ms=300){ let t; return (...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);}; }
function uid(p='x'){ return p+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function downloadCSV(filename, csv){
  if(!csv){ toast(I18N.t('c4.utils.nothingToExport'),'warn'); return; }
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download=filename; a.click();
}
function toCSV(rows){
  if(!rows.length) return '';
  const keys=Object.keys(rows[0]);
  return [keys.join(',')].concat(rows.map(r=>keys.map(k=>`"${String(r[k]??'').replace(/"/g,'""')}"`).join(','))).join('\n');
}
function dlCSV(filename, rows){ downloadCSV(filename, toCSV(rows)); }
function printHTML(html, title='Print'){
  const w=window.open('','_blank','width=900,height=700');
  w.document.write(`<html><head><title>${esc(title)}</title><style>
    body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:0;padding:16px}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:4px 6px;text-align:left}
    th{background:#eee}.r{text-align:right}.c{text-align:center}
    @media print{body{padding:0}}</style></head><body>${html}
    <scr`+`ipt>window.onload=()=>{window.print();}</scr`+`ipt></body></html>`);
  w.document.close();
}
/* Leaflet map helper: builds a map with the OSM tile layer (URL concatenated
   to avoid a literal double-slash in the served script). */
function buildMap(el, center, zoom){
  if(typeof L==='undefined'){
    el.innerHTML='<div class="h-full min-h-[200px] flex items-center justify-center text-sm text-slate-400 text-center p-6">'+I18N.t('c4.utils.mapUnavailable')+'</div>';
    return null;
  }
  const map=L.map(el,{scrollWheelZoom:true}).setView(center,zoom||14);
  L.tileLayer('https:'+'//tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'Map data © OpenStreetMap contributors', maxZoom:19
  }).addTo(map);
  return map;
}

G.h=h; G.esc=esc; G.fmt=fmt; G.fmtNum=fmtNum; G.fmtDate=fmtDate; G.fmtTime=fmtTime; G.fmtDateTime=fmtDateTime;
G.todayISO=todayISO; G.monthISO=monthISO; G.addDays=addDays; G.daysUntil=daysUntil;
G.haversineM=haversineM;
G.toast=toast; G.modal=modal; G.confirmDlg=confirmDlg;
G.formVal=formVal; G.formNum=formNum; G.collectForm=collectForm; G.field=field;
G.tableHTML=tableHTML; G.statCard=statCard; G.pageHead=pageHead; G.avatar=avatar;
G.vPaginationHTML=vPaginationHTML; G.vPaginateBind=vPaginateBind; G.vFilterRow=vFilterRow; G.vActionsMenu=vActionsMenu;
G.animateCounters=animateCounters; G.emptyState=emptyState;
G.btnP=btnP; G.btnS=btnS; G.btnD=btnD; G.badge=badge;
G.debounce=debounce; G.uid=uid; G.toCSV=toCSV; G.dlCSV=dlCSV; G.downloadCSV=downloadCSV;
G.printHTML=printHTML; G.buildMap=buildMap;
G.App=G.App||{routes:{},nav:[]};
})();
