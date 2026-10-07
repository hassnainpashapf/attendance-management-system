/* 110_documents.js — employee documents with expiry alerts and days-left badges.
   Verola premium style: breadcrumb header, KPI cards, premium table. */
(function(){
'use strict';

App.nav.push({group:'PEOPLE', path:'#/documents', label:I18N.t('c4.nav.documents'), labelKey:'c4.nav.documents', icon:'documents', perm:'documents'});

/* ---------- Verola tokens (local copies) ---------- */
function txDoc(k, fb){ const v=I18N.t(k); return (v===k||!v)?fb:v; }
function vDocAvatar(name){
  const init=(String(name||'?').trim().split(/\s+/).map(w=>w[0]).join('')||'?').slice(0,2).toUpperCase();
  return `<span class="w-8 h-8 rounded-full bg-slate-200 text-slate-500 text-[11px] font-bold inline-flex items-center justify-center shrink-0">${esc(init)}</span>`;
}
function vDocKpi(label, value, ico, sub){
  return `<div class="bg-white rounded-2xl border border-slate-200/70 p-5 shadow-[0_1px_3px_rgba(15,23,42,.04)]">
    <div class="flex items-center gap-2.5 mb-4">
      <span class="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">${ico}</span>
      <span class="text-[13px] text-slate-500 font-medium">${label}</span>
    </div>
    <div class="text-[26px] font-bold text-slate-900 tabular-nums tracking-tight">${value}</div>
    ${sub?`<div class="text-xs text-slate-400 mt-1.5">${sub}</div>`:''}
  </div>`;
}
const V_DOC_FILE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><path d="M6 2.5h8l4 4V21.5H6z"/><path d="M14 2.5v4h4"/></svg>';
const V_DOC_EMP='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c1-4 3.6-6 7-6s6 2 7 6"/></svg>';
const V_DOC_WARN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><path d="M12 3.5L22 20H2z"/><path d="M12 10v4.5M12 17.5v.01"/></svg>';
const V_DOC_CAL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>';

App.routes['#/documents'] = async (el)=>{
  const cid=uid('doc');
  const canEdit=perm('documents','edit');
  el.innerHTML=`
    <div class="flex items-center gap-2 text-[13px] text-slate-400 mb-4 anim-fadeUp">
      <span class="text-base">⌂</span><a href="#/dashboard" class="hover:text-slate-600">${I18N.t('c4.nav.dashboard')}</a><span>›</span><span class="text-slate-700 font-semibold">${I18N.t('c4.nav.documents')}</span>
      <div class="ml-auto">${canEdit?`<button class="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold shadow active:scale-[.98] transition" id="${cid}-add">+ ${I18N.t('c4.docs.addDoc')}</button>`:''}</div>
    </div>
    <div id="${cid}-alerts"></div>
    <div id="${cid}-kpis" class="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5"></div>
    <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.04)] overflow-hidden anim-fadeUp">
      <div class="flex flex-wrap items-center gap-2.5 p-4 border-b border-slate-100">
        <div class="relative flex-1 min-w-[180px] max-w-xs">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
          <input id="${cid}-q" placeholder="${I18N.t('c4.common.search')}..." class="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:outline-none">
        </div>
        <select id="${cid}-fExp" class="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 focus:outline-none">
          <option value="all">${I18N.t('c4.common.all')}</option>
          <option value="expiring">${txDoc('c4.docs.expiringSoon','Expiring soon')}</option>
          <option value="expired">${I18N.t('c4.common.expired')}</option>
          <option value="valid">${txDoc('c4.docs.valid','Valid')}</option>
        </select>
      </div>
      <div id="${cid}-body"></div>
    </div>`;
  const body=document.getElementById(cid+'-body');
  const alertsEl=document.getElementById(cid+'-alerts');
  const kpisEl=document.getElementById(cid+'-kpis');
  const emps=await API.call('listEmployees').catch(()=>[]);

  const st={q:'', f:'all', rows:[]};

  function daysBadge(d){
    if(d.daysLeft<0) return badge(I18N.t('c4.common.expired'),'red');
    if(d.daysLeft<=7) return badge(I18N.t('c4.common.daysLeftN').replace('{n}',d.daysLeft),'red');
    if(d.daysLeft<=30) return badge(I18N.t('c4.common.daysLeftN').replace('{n}',d.daysLeft),'amber');
    return badge(I18N.t('c4.common.daysLeftN').replace('{n}',d.daysLeft),'teal');
  }

  function render(){
    const q=st.q.trim().toLowerCase();
    const rows=st.rows.filter(d=>{
      if(q&&!(String(d.title+' '+d.employeeName).toLowerCase().includes(q))) return false;
      if(st.f==='expired'&&d.daysLeft>=0) return false;
      if(st.f==='expiring'&&!(d.daysLeft>=0&&d.daysLeft<=30)) return false;
      if(st.f==='valid'&&d.daysLeft<0) return false;
      return true;
    });
    body.innerHTML=`<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b border-slate-100">
      ${[I18N.t('c4.docs.colDocument'),I18N.t('c4.common.employee'),I18N.t('c4.docs.colExpiry'),I18N.t('c4.docs.colDaysLeft')].map(h=>
        `<th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">${h}</th>`).join('')}
      <th class="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">${txDoc('c4.common.actions','')}</th></tr></thead>
      <tbody class="divide-y divide-slate-50">${rows.length?rows.map(d=>`
        <tr class="hover:bg-slate-50/70 transition-colors">
          <td class="px-4 py-3"><div class="flex items-center gap-2.5">
            <span class="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">${V_DOC_FILE}</span>
            <span class="font-medium text-slate-700">${esc(d.title)}</span></div></td>
          <td class="px-4 py-3"><div class="flex items-center gap-2.5">${vDocAvatar(d.employeeName)}<span class="text-slate-600 whitespace-nowrap">${esc(d.employeeName||'—')}</span></div></td>
          <td class="px-4 py-3"><span class="tabular-nums text-slate-600">${fmtDate(d.expiryDate)}</span></td>
          <td class="px-4 py-3">${daysBadge(d)}</td>
          <td class="px-4 py-3 text-right">${canEdit?`<div class="flex gap-1.5 justify-end">
            <button class="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50" data-dedit="${d.id}">${I18N.t('c4.common.edit')}</button>
            <button class="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-red-600 hover:border-red-200 hover:bg-red-50" data-ddel="${d.id}">${I18N.t('c4.common.delete')}</button></div>`:''}</td>
        </tr>`).join(''):
        `<tr><td colspan="5" class="px-4 py-14 text-center"><div class="text-slate-300 text-3xl mb-2">◌</div><div class="text-sm text-slate-400">${I18N.t('c4.docs.emptyDocs')}</div></td></tr>`}
      </tbody></table></div>
      <div class="flex items-center px-4 py-3.5 border-t border-slate-100"><span class="text-xs text-slate-400">${txDoc('c4.common.showingN','Showing {n} documents').replace('{n}',rows.length)}</span></div>`;
    body.querySelectorAll('[data-ddel]').forEach(b=>b.onclick=async()=>{
      if(!await confirmDlg(I18N.t('c4.docs.delDocTitle'),I18N.t('c4.emp.cannotUndo'),I18N.t('c4.common.delete'))) return;
      await API.call('deleteDocument',b.dataset.ddel); toast(I18N.t('c4.emp.deleted'),'success'); load();
    });
    body.querySelectorAll('[data-dedit]').forEach(b=>b.onclick=()=>{
      const d=st.rows.find(x=>x.id===b.dataset.dedit);
      openEditor(d);
    });
  }

  async function load(){
    const [rows, exp]=await Promise.all([
      API.call('listDocuments'),
      API.call('getExpiringDocuments').catch(()=>[])
    ]);
    st.rows=rows;
    const expired=rows.filter(d=>d.daysLeft<0).length;
    const expSoon=rows.filter(d=>d.daysLeft>=0&&d.daysLeft<=30).length;
    kpisEl.innerHTML=
      vDocKpi(txDoc('c4.docs.kpiTotal','Total documents'), fmtNum(rows.length), V_DOC_FILE)+
      vDocKpi(txDoc('c4.docs.kpiEmployees','Employees with docs'), fmtNum(new Set(rows.map(d=>d.employeeId)).size), V_DOC_EMP)+
      vDocKpi(txDoc('c4.docs.kpiExpiring','Expiring (30 days)'), fmtNum(expSoon), V_DOC_WARN)+
      vDocKpi(txDoc('c4.docs.kpiExpired','Expired'), fmtNum(expired), V_DOC_CAL);
    animateCounters(kpisEl);
    alertsEl.innerHTML=exp.length?`
      <div class="bg-amber-50/70 border border-amber-200/70 rounded-2xl p-5 mb-5 anim-fadeUp shadow-[0_1px_3px_rgba(15,23,42,.04)]">
        <div class="flex items-center gap-2 font-bold text-amber-800 text-sm mb-3"><span class="w-7 h-7 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">${V_DOC_WARN}</span>${I18N.t('c4.docs.expiringN').replace('{n}',exp.length)}</div>
        <div class="flex flex-wrap gap-2">${exp.map(d=>`
          <span class="inline-flex items-center gap-2 bg-white border border-amber-200/70 rounded-xl px-3 py-1.5 text-xs">
            <span class="font-semibold text-slate-700">${esc(d.title)}</span>
            <span class="text-slate-400">${esc(d.employeeName)}</span>
            ${daysBadge(d)}
          </span>`).join('')}</div>
      </div>`:'';
    render();
  }

  function openEditor(d){
    const isNew=!d; d=d||{employeeId:emps[0]?emps[0].id:'',title:'',expiryDate:todayISO()};
    const m=modal(isNew?I18N.t('c4.docs.addDocTitle'):I18N.t('c4.docs.editDocTitle'),`
      <div class="grid grid-cols-1 gap-4">
        ${field(I18N.t('c4.common.employee'),'employeeId',{type:'select',value:d.employeeId,options:emps.filter(e=>e.active).map(e=>({value:e.id,label:e.name}))})}
        ${field(I18N.t('c4.docs.fDocTitle'),'title',{value:d.title,req:true,ph:I18N.t('c4.docs.phDocTitle')})}
        ${field(I18N.t('c4.docs.fExpiryDate'),'expiryDate',{value:d.expiryDate,type:'date',req:true})}
      </div>
      <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="dCancel">${I18N.t('c4.common.cancel')}</button><button class="${btnP}" id="dSave">${I18N.t('c4.common.save')}</button></div>`);
    m.el.querySelector('#dCancel').onclick=()=>m.close();
    m.el.querySelector('#dSave').onclick=async()=>{
      const data=collectForm(m.el);
      if(!data.title||!data.expiryDate){toast(I18N.t('c4.docs.titleExpiryRequired'),'warn');return;}
      await API.call('saveDocument',{...(isNew?{}:{id:d.id}),...data});
      m.close(); toast(I18N.t('c4.docs.docSaved'),'success'); load();
    };
  }
  const addB=document.getElementById(cid+'-add'); if(addB) addB.onclick=()=>openEditor(null);
  document.getElementById(cid+'-q').oninput=debounce(e=>{ st.q=e.target.value; render(); },300);
  document.getElementById(cid+'-fExp').onchange=e=>{ st.f=e.target.value; render(); };
  await load();
};
})();
