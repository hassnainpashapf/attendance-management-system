/* 110_documents.js — employee documents with expiry alerts and days-left badges. */
(function(){
'use strict';

App.nav.push({group:'PEOPLE', path:'#/documents', label:I18N.t('c4.nav.documents'), labelKey:'c4.nav.documents', icon:'documents', perm:'documents'});

App.routes['#/documents'] = async (el)=>{
  const cid=uid('doc');
  const canEdit=perm('documents','edit');
  el.innerHTML=pageHead(I18N.t('c4.nav.documents'),I18N.t('c4.docs.sub'),
    `${canEdit?`<button class="${btnP}" id="${cid}-add">${I18N.t('c4.docs.addDoc')}</button>`:''}`)+
  `<div id="${cid}-alerts" class="mb-4"></div><div id="${cid}-body"></div>`;
  const body=document.getElementById(cid+'-body');
  const alertsEl=document.getElementById(cid+'-alerts');
  const emps=await API.call('listEmployees').catch(()=>[]);

  async function load(){
    const rows=await API.call('listDocuments');
    const exp=await API.call('getExpiringDocuments');
    alertsEl.innerHTML=exp.length?`
      <div class="bg-amber-50/70 border border-amber-200/70 rounded-2xl p-5 anim-fadeUp">
        <div class="font-display font-bold text-amber-800 text-sm mb-3">${I18N.t('c4.docs.expiringN').replace('{n}',exp.length)}</div>
        <div class="flex flex-wrap gap-2">${exp.map(d=>`
          <span class="inline-flex items-center gap-2 bg-white border border-amber-200/70 rounded-xl px-3 py-1.5 text-xs">
            <span class="font-semibold text-slate-700">${esc(d.title)}</span>
            <span class="text-slate-400">${esc(d.employeeName)}</span>
            ${d.daysLeft<0?badge(I18N.t('c4.common.expired'),'red'):d.daysLeft<=7?badge(I18N.t('c4.common.daysLeftN').replace('{n}',d.daysLeft),'red'):badge(I18N.t('c4.common.daysLeftN').replace('{n}',d.daysLeft),'amber')}
          </span>`).join('')}</div>
      </div>`:'';
    body.innerHTML=tableHTML([
      {label:I18N.t('c4.docs.colDocument'), get:d=>`<span class="font-medium text-slate-700">${esc(d.title)}</span>`},
      {label:I18N.t('c4.common.employee'), get:d=>esc(d.employeeName||'—')},
      {label:I18N.t('c4.docs.colExpiry'), get:d=>`<span class="tabular-nums">${fmtDate(d.expiryDate)}</span>`},
      {label:I18N.t('c4.docs.colDaysLeft'), get:d=>d.daysLeft<0?badge(I18N.t('c4.common.expired'),'red'):d.daysLeft<=7?badge(I18N.t('c4.common.daysLeftN').replace('{n}',d.daysLeft),'red'):d.daysLeft<=30?badge(I18N.t('c4.common.daysLeftN').replace('{n}',d.daysLeft),'amber'):badge(I18N.t('c4.common.daysLeftN').replace('{n}',d.daysLeft),'teal')},
      {label:'', get:d=>canEdit?`<div class="flex gap-1 justify-end">
        <button class="${btnS} !px-3 !py-1.5 !text-xs" data-dedit="${d.id}">${I18N.t('c4.common.edit')}</button>
        <button class="${btnS} !px-3 !py-1.5 !text-xs !text-red-600" data-ddel="${d.id}">${I18N.t('c4.common.delete')}</button></div>`:''},
    ], rows, {empty:I18N.t('c4.docs.emptyDocs')});
    body.querySelectorAll('[data-ddel]').forEach(b=>b.onclick=async()=>{
      if(!await confirmDlg(I18N.t('c4.docs.delDocTitle'),I18N.t('c4.emp.cannotUndo'),I18N.t('c4.common.delete'))) return;
      await API.call('deleteDocument',b.dataset.ddel); toast(I18N.t('c4.emp.deleted'),'success'); load();
    });
    body.querySelectorAll('[data-dedit]').forEach(b=>b.onclick=()=>{
      const d=rows.find(x=>x.id===b.dataset.dedit);
      openEditor(d);
    });
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
  await load();
};
})();
