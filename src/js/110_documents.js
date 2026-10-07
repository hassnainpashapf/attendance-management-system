/* 110_documents.js — employee documents with expiry alerts and days-left badges. */
(function(){
'use strict';

App.nav.push({group:'PEOPLE', path:'#/documents', label:'Documents', icon:'documents', perm:'documents'});

App.routes['#/documents'] = async (el)=>{
  const cid=uid('doc');
  const canEdit=perm('documents','edit');
  el.innerHTML=pageHead('Documents','Licenses, certificates and IDs with expiry tracking',
    `${canEdit?`<button class="${btnP}" id="${cid}-add">+ Add Document</button>`:''}`)+
  `<div id="${cid}-alerts" class="mb-4"></div><div id="${cid}-body"></div>`;
  const body=document.getElementById(cid+'-body');
  const alertsEl=document.getElementById(cid+'-alerts');
  const emps=await API.call('listEmployees').catch(()=>[]);

  async function load(){
    const rows=await API.call('listDocuments');
    const exp=await API.call('getExpiringDocuments');
    alertsEl.innerHTML=exp.length?`
      <div class="bg-amber-50/70 border border-amber-200/70 rounded-2xl p-5 anim-fadeUp">
        <div class="font-display font-bold text-amber-800 text-sm mb-3">⚠ ${exp.length} document${exp.length===1?'':'s'} expiring within 30 days</div>
        <div class="flex flex-wrap gap-2">${exp.map(d=>`
          <span class="inline-flex items-center gap-2 bg-white border border-amber-200/70 rounded-xl px-3 py-1.5 text-xs">
            <span class="font-semibold text-slate-700">${esc(d.title)}</span>
            <span class="text-slate-400">${esc(d.employeeName)}</span>
            ${d.daysLeft<0?badge('Expired','red'):d.daysLeft<=7?badge(d.daysLeft+'d left','red'):badge(d.daysLeft+'d left','amber')}
          </span>`).join('')}</div>
      </div>`:'';
    body.innerHTML=tableHTML([
      {label:'Document', get:d=>`<span class="font-medium text-slate-700">${esc(d.title)}</span>`},
      {label:'Employee', get:d=>esc(d.employeeName||'—')},
      {label:'Expiry date', get:d=>`<span class="tabular-nums">${fmtDate(d.expiryDate)}</span>`},
      {label:'Days left', get:d=>d.daysLeft<0?badge('Expired','red'):d.daysLeft<=7?badge(d.daysLeft+'d left','red'):d.daysLeft<=30?badge(d.daysLeft+'d left','amber'):badge(d.daysLeft+'d left','teal')},
      {label:'', get:d=>canEdit?`<div class="flex gap-1 justify-end">
        <button class="${btnS} !px-3 !py-1.5 !text-xs" data-dedit="${d.id}">Edit</button>
        <button class="${btnS} !px-3 !py-1.5 !text-xs !text-red-600" data-ddel="${d.id}">Delete</button></div>`:''},
    ], rows, {empty:'No documents tracked yet.'});
    body.querySelectorAll('[data-ddel]').forEach(b=>b.onclick=async()=>{
      if(!await confirmDlg('Delete document?','This cannot be undone.','Delete')) return;
      await API.call('deleteDocument',b.dataset.ddel); toast('Deleted','success'); load();
    });
    body.querySelectorAll('[data-dedit]').forEach(b=>b.onclick=()=>{
      const d=rows.find(x=>x.id===b.dataset.dedit);
      openEditor(d);
    });
  }
  function openEditor(d){
    const isNew=!d; d=d||{employeeId:emps[0]?emps[0].id:'',title:'',expiryDate:todayISO()};
    const m=modal(isNew?'Add Document':'Edit Document',`
      <div class="grid grid-cols-1 gap-4">
        ${field('Employee','employeeId',{type:'select',value:d.employeeId,options:emps.filter(e=>e.active).map(e=>({value:e.id,label:e.name}))})}
        ${field('Document title','title',{value:d.title,req:true,ph:'e.g. CNIC, Driving License, PEC Registration'})}
        ${field('Expiry date','expiryDate',{value:d.expiryDate,type:'date',req:true})}
      </div>
      <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="dCancel">Cancel</button><button class="${btnP}" id="dSave">Save</button></div>`);
    m.el.querySelector('#dCancel').onclick=()=>m.close();
    m.el.querySelector('#dSave').onclick=async()=>{
      const data=collectForm(m.el);
      if(!data.title||!data.expiryDate){toast('Title and expiry required','warn');return;}
      await API.call('saveDocument',{...(isNew?{}:{id:d.id}),...data});
      m.close(); toast('Document saved','success'); load();
    };
  }
  const addB=document.getElementById(cid+'-add'); if(addB) addB.onclick=()=>openEditor(null);
  await load();
};
})();
