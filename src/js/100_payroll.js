/* 100_payroll.js — payroll runs, payslips (view/print), advances, final
   settlement calculator, contractors + bills, pay components. */
(function(){
'use strict';

App.nav.push({group:'MONEY', path:'#/payroll', label:I18N.t('c4.nav.payroll'), labelKey:'c4.nav.payroll', icon:'payroll', perm:'payroll'});

App.routes['#/payroll'] = async (el, params)=>{
  const cid=uid('pay');
  const tab=(params&&params.tab)||'runs';
  const canEdit=perm('payroll','edit');
  el.innerHTML=pageHead('Payroll','Runs, payslips, advances and contractors',
    `${canEdit?`<button class="${btnS}" id="${cid}-adv">Grant Advance</button><button class="${btnP}" id="${cid}-run">Run Payroll</button>`:''}`)+`
  <div class="flex gap-2 mb-5 flex-wrap">
    ${[['runs','Payroll Runs'],['salaries',I18N.t('t2.salaries')],['advances','Advances'],['settlement','Final Settlement'],['contractors','Contractors'],['components','Pay Components']].map(([k,l])=>
      `<a href="#/payroll${k==='runs'?'':'?tab='+k}" class="px-4 py-2 rounded-xl text-sm font-semibold ${tab===k?'bg-teal-600 text-white shadow':'bg-white text-slate-500 border border-slate-200'}">${l}</a>`).join('')}
  </div>
  <div id="${cid}-body"></div>`;
  const body=document.getElementById(cid+'-body');
  const emps=await API.call('listEmployees').catch(()=>[]);

  if(tab==='advances'){
    const rows=await API.call('listAdvances');
    body.innerHTML=tableHTML([
      {label:'Employee', get:a=>`<span class="font-medium text-slate-700">${esc(a.employeeName)}</span>`},
      {label:'Date', get:a=>fmtDate(a.date)},
      {label:'Amount', num:1, get:a=>`<span class="tabular-nums">${fmt(a.amount)}</span>`},
      {label:'Recovered', num:1, get:a=>`<span class="tabular-nums text-emerald-600">${fmt(a.recovered)}</span>`},
      {label:'Balance', num:1, get:a=>`<span class="tabular-nums font-semibold">${fmt(a.balance)}</span>`},
      {label:'Status', get:a=>a.status==='open'?badge('Open','amber'):badge('Closed','slate')},
    ], rows, {empty:'No advances granted.'});
  }
  else if(tab==='settlement'){
    body.innerHTML=`<div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6 max-w-2xl">
      <h3 class="font-display font-bold text-slate-800 mb-1">Final settlement calculator</h3>
      <p class="text-sm text-slate-400 mb-5">Pro-rata salary for the current month + approved overtime − open advance balances.</p>
      ${field('Employee','employeeId',{type:'select',options:emps.filter(e=>e.active).map(e=>({value:e.id,label:e.name+' ('+e.code+')'}))})}
      <button class="${btnP} mt-4" id="${cid}-calc">Calculate</button>
      <div id="${cid}-result" class="mt-5"></div></div>`;
    document.getElementById(cid+'-calc').onclick=async()=>{
      const eid=formVal(body,'employeeId');
      const r=await API.call('finalSettlement',eid);
      document.getElementById(cid+'-result').innerHTML=`
        <div class="rounded-2xl border border-slate-200/70 overflow-hidden">
          <div class="bg-slate-50 px-5 py-3 border-b border-slate-200/60 font-semibold text-slate-700 text-sm">${esc(r.employee.name)} <span class="text-slate-400 font-normal">· ${esc(r.employee.code)}</span></div>
          <div class="divide-y divide-slate-50 text-sm">
            <div class="flex justify-between px-5 py-3"><span class="text-slate-500">Pro-rata salary (this month)</span><span class="tabular-nums font-medium">+ ${fmt(r.proRataSalary)}</span></div>
            <div class="flex justify-between px-5 py-3"><span class="text-slate-500">Approved overtime pending</span><span class="tabular-nums font-medium">+ ${fmt(r.pendingOvertime)}</span></div>
            <div class="flex justify-between px-5 py-3"><span class="text-slate-500">Open advance balance (${r.advances.length} advance${r.advances.length===1?'':'s'})</span><span class="tabular-nums font-medium text-red-600">− ${fmt(r.advanceDue)}</span></div>
            <div class="flex justify-between px-5 py-3.5 bg-teal-50/60"><span class="font-bold text-slate-800">Net payable</span><span class="tabular-nums font-bold text-teal-700 text-base">${fmt(r.netPayable)}</span></div>
          </div></div>`;
    };
  }
  else if(tab==='contractors'){
    const cts=await API.call('listContractors');
    const bills=await API.call('listContractorBills');
    body.innerHTML=`<div class="flex justify-end mb-3">${canEdit?`<button class="${btnS}" id="${cid}-addCt">+ Contractor</button>`:''}</div>`+
    tableHTML([
      {label:'Contractor', get:c=>`<div><div class="font-semibold text-slate-700">${esc(c.name)}</div><div class="text-xs text-slate-400">${esc(c.phone||'')}</div></div>`},
      {label:'Rate', num:1, get:c=>`<span class="tabular-nums">${fmt(c.rate)}/day</span>`},
      {label:'Billed total', num:1, get:c=>`<span class="tabular-nums font-semibold">${fmt(c.billed)}</span>`},
      {label:'Status', get:c=>c.active?badge('Active','emerald'):badge('Inactive','slate')},
      {label:'', get:c=>canEdit?`<div class="flex gap-1 justify-end"><button class="${btnS} !px-3 !py-1.5 !text-xs" data-bill="${c.id}">+ Bill</button><button class="${btnS} !px-3 !py-1.5 !text-xs" data-cedit="${c.id}">Edit</button></div>`:''},
    ], cts, {empty:'No contractors yet.'})+
    `<h3 class="font-display font-bold text-slate-800 mt-8 mb-3">Contractor bills</h3>`+
    tableHTML([
      {label:'Month', get:b=>`<span class="tabular-nums">${esc(b.month)}</span>`},
      {label:'Contractor', get:b=>`<span class="font-medium text-slate-700">${esc(b.contractorName)}</span>`},
      {label:'Note', get:b=>`<span class="text-xs text-slate-500">${esc(b.note||'—')}</span>`},
      {label:'Amount', num:1, get:b=>`<span class="tabular-nums font-semibold">${fmt(b.amount)}</span>`},
      {label:'Status', get:b=>b.status==='pending'?badge('Pending','amber'):b.status==='approved'?badge('Approved','emerald'):badge('Paid','teal')},
      {label:'', get:b=>canEdit&&b.status==='pending'?`<div class="flex gap-1 justify-end"><button class="${btnS} !px-3 !py-1.5 !text-xs !text-emerald-700" data-bok="${b.id}">Approve</button><button class="${btnS} !px-3 !py-1.5 !text-xs" data-bpaid="${b.id}">Mark paid</button></div>`:''},
    ], bills, {empty:'No bills yet.'});
    const addCt=document.getElementById(cid+'-addCt');
    if(addCt) addCt.onclick=()=>contractorEditor(null);
    body.querySelectorAll('[data-cedit]').forEach(b=>b.onclick=()=>contractorEditor(cts.find(c=>c.id===b.dataset.cedit)));
    body.querySelectorAll('[data-bill]').forEach(b=>b.onclick=()=>{
      const c=cts.find(x=>x.id===b.dataset.bill);
      const m=modal('New bill — '+c.name,`
        ${field('Month','month',{type:'month',value:monthISO(),req:true})}
        <div class="grid grid-cols-2 gap-4 mt-4">${field('Amount (Rs)','amount',{type:'number',min:0,req:true})}</div>
        <div class="mt-4">${field('Note','note',{type:'textarea',ph:'Work description'})}</div>
        <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="bCancel">Cancel</button><button class="${btnP}" id="bSave">Save bill</button></div>`);
      m.el.querySelector('#bCancel').onclick=()=>m.close();
      m.el.querySelector('#bSave').onclick=async()=>{
        await API.call('saveContractorBill',{contractorId:c.id,month:formVal(m.el,'month'),amount:formNum(m.el,'amount'),note:formVal(m.el,'note')});
        m.close(); toast('Bill saved','success'); App.route();
      };
    });
    body.querySelectorAll('[data-bok]').forEach(b=>b.onclick=async()=>{ await API.call('decideContractorBill',b.dataset.bok,'approved'); toast('Bill approved','success'); App.route(); });
    body.querySelectorAll('[data-bpaid]').forEach(b=>b.onclick=async()=>{ await API.call('decideContractorBill',b.dataset.bpaid,'paid'); toast('Bill marked paid','success'); App.route(); });
  }
  else if(tab==='components'){
    const rows=await API.call('listPayComponents');
    body.innerHTML=(canEdit?`<div class="flex justify-end mb-3"><button class="${btnS}" id="${cid}-addPc">+ Component</button></div>`:'')+tableHTML([
      {label:'Component', get:c=>`<span class="font-medium text-slate-700">${esc(c.name)}</span>`},
      {label:'Kind', get:c=>c.kind==='allowance'?badge('Allowance','emerald'):badge('Deduction','red')},
      {label:'Amount', num:1, get:c=>`<span class="tabular-nums">${fmt(c.amount)}</span>`},
      {label:'Approved', get:c=>c.approved?badge('Yes','teal'):badge('No','slate')},
      {label:'', get:c=>canEdit?`<div class="flex gap-1 justify-end"><button class="${btnS} !px-3 !py-1.5 !text-xs" data-pcedit="${c.id}">Edit</button><button class="${btnS} !px-3 !py-1.5 !text-xs !text-red-600" data-pcdel="${c.id}">Delete</button></div>`:''},
    ], rows, {empty:'No pay components.'});
    const addPc=document.getElementById(cid+'-addPc');
    if(addPc) addPc.onclick=()=>componentEditor(null);
    body.querySelectorAll('[data-pcedit]').forEach(b=>b.onclick=()=>componentEditor(rows.find(c=>c.id===b.dataset.pcedit)));
    body.querySelectorAll('[data-pcdel]').forEach(b=>b.onclick=async()=>{
      if(!await confirmDlg('Delete component?','It will no longer apply to future payroll runs.','Delete')) return;
      await API.call('deletePayComponent',b.dataset.pcdel); toast('Deleted','success'); App.route();
    });
  }
  else if(tab==='salaries'){
    /* Track 2: auto salary from attendance (src/js/155_salary.js) */
    await SalaryUI.renderSalariesTab(body, { emps, canEdit });
  }
  else{
    /* runs */
    const runs=await API.call('listPayrollRuns');
    body.innerHTML=tableHTML([
      {label:'Month', get:r=>`<span class="font-semibold tabular-nums">${esc(r.month)}</span>`},
      {label:'Created', get:r=>`<span class="text-xs text-slate-500">${esc(r.createdAt)} · ${esc(r.createdBy)}</span>`},
      {label:'Payslips', num:1, get:r=>fmtNum(r.slipCount)},
      {label:'Total net', num:1, get:r=>`<span class="tabular-nums font-semibold">${fmt(r.totalNet)}</span>`},
      {label:'Status', get:r=>badge(r.status==='finalized'?'Finalized':'Draft', r.status==='finalized'?'teal':'slate')},
      {label:'', get:r=>`<div class="flex gap-1 justify-end"><button class="${btnS} !px-3 !py-1.5 !text-xs" data-view="${r.id}">View payslips</button></div>`},
    ], runs, {empty:'No payroll runs yet — run your first payroll.'});
    body.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>viewRun(b.dataset.view));
  }

  async function viewRun(runId){
    const runs=await API.call('listPayrollRuns');
    const run=runs.find(r=>r.id===runId);
    const m=modal('Payroll — '+run.month,`<div id="psBody"></div>`,{wide:true});
    const pb=m.el.querySelector('#psBody');
    /* listPayslips returns flat enriched slips for the run (id, employeeName/Code, salary, allowances, deductions, advanceRecovery, net, paid) */
    const slips=await API.call('listPayslips',runId);
    pb.innerHTML=tableHTML([
      {label:'Employee', get:s=>`<div><div class="font-medium text-slate-700">${esc(s.employeeName)}</div><div class="text-xs text-slate-400">${esc(s.employeeCode)}</div></div>`},
      {label:'Salary', num:1, get:s=>`<span class="tabular-nums">${fmt(s.salary)}</span>`},
      {label:'Allow.', num:1, get:s=>`<span class="tabular-nums text-emerald-600">+${fmtNum(s.allowances)}</span>`},
      {label:'Deduct.', num:1, get:s=>`<span class="tabular-nums text-red-500">−${fmtNum(s.deductions)}</span>`},
      {label:'Advance', num:1, get:s=>`<span class="tabular-nums text-amber-600">−${fmtNum(s.advanceRecovery)}</span>`},
      {label:'Net', num:1, get:s=>`<span class="tabular-nums font-bold">${fmt(s.net)}</span>`},
      {label:'', get:s=>`<div class="flex gap-1 justify-end">
        <button class="${btnS} !px-3 !py-1.5 !text-xs" data-ps="${s.id}">Payslip</button>
        ${!s.paid&&canEdit?`<button class="${btnS} !px-3 !py-1.5 !text-xs !text-emerald-700" data-paid="${s.id}">Mark paid</button>`:s.paid?badge('Paid','teal'):''}</div>`},
    ], slips, {empty:'No payslips in this run.'});
    pb.querySelectorAll('[data-ps]').forEach(b=>b.onclick=async()=>{
      const r=await API.call('getPayslip',b.dataset.ps);
      payslipModal({employeeName:r.employee.name, employeeCode:r.employee.code, month:r.run.month,
        designation:r.employee.designation, department:r.employee.departmentName||r.employee.department,
        salary:r.payslip.salary, allowances:r.payslip.allowances, deductions:r.payslip.deductions,
        advanceRecovery:r.payslip.advanceRecovery, net:r.payslip.net, paid:r.payslip.paid});
    });
    pb.querySelectorAll('[data-paid]').forEach(b=>b.onclick=async()=>{
      await API.call('markPayslipPaid',b.dataset.paid); toast('Marked paid','success'); m.close(); App.route();
    });
  }

  function payslipModal(s){
    const m=modal('Payslip — '+s.employeeName,`
      <div id="psPrint">
        <div class="text-center mb-5">
          <div class="font-display font-bold text-lg text-slate-800">Attendance Management System</div>
          <div class="text-xs text-slate-400">Payslip for ${esc(s.month)} · ${esc(s.employeeName)} (${esc(s.employeeCode)})</div>
          <div class="text-xs text-slate-400">${esc(s.designation||'')} · ${esc(s.department||'')}</div>
        </div>
        <table class="w-full text-sm"><tbody class="divide-y divide-slate-100">
          <tr><td class="py-2 text-slate-500">Basic salary</td><td class="py-2 text-right tabular-nums">${fmt(s.salary)}</td></tr>
          <tr><td class="py-2 text-slate-500">Allowances</td><td class="py-2 text-right tabular-nums text-emerald-600">+ ${fmt(s.allowances)}</td></tr>
          <tr><td class="py-2 text-slate-500">Deductions</td><td class="py-2 text-right tabular-nums text-red-500">− ${fmt(s.deductions)}</td></tr>
          <tr><td class="py-2 text-slate-500">Advance recovery</td><td class="py-2 text-right tabular-nums text-amber-600">− ${fmt(s.advanceRecovery)}</td></tr>
          <tr><td class="py-2.5 font-bold text-slate-800">Net pay</td><td class="py-2.5 text-right tabular-nums font-bold text-teal-700 text-base">${fmt(s.net)}</td></tr>
        </tbody></table>
        <div class="mt-3 text-center">${s.paid?badge('Paid','teal'):badge('Unpaid','amber')}</div>
      </div>
      <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="pClose">Close</button><button class="${btnP}" id="pPrint">Print</button></div>`);
    m.el.querySelector('#pClose').onclick=()=>m.close();
    m.el.querySelector('#pPrint').onclick=()=>printHTML(m.el.querySelector('#psPrint').innerHTML,'Payslip '+s.employeeName+' '+s.month);
  }

  function contractorEditor(c){
    const isNew=!c; c=c||{name:'',company:'',phone:'',rate:0,active:true};
    const m=modal(isNew?'Add Contractor':'Edit Contractor',`
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2">${field('Contractor / firm name','name',{value:c.name,req:true})}</div>
        ${field('Company','company',{value:c.company||''})}
        ${field('Phone','phone',{value:c.phone||''})}
        ${field('Daily rate (Rs)','rate',{value:c.rate,type:'number',min:0})}
        <div class="flex items-end pb-2.5">${field('Active','active',{type:'checkbox',value:c.active})}</div>
      </div>
      <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="cCancel">Cancel</button><button class="${btnP}" id="cSave">Save</button></div>`);
    m.el.querySelector('#cCancel').onclick=()=>m.close();
    m.el.querySelector('#cSave').onclick=async()=>{
      const d=collectForm(m.el); if(!d.name){toast('Name required','warn');return;}
      await API.call('saveContractor',{...(isNew?{}:{id:c.id}),...d}); m.close(); toast('Contractor saved','success'); App.route();
    };
  }

  function componentEditor(c){
    const isNew=!c; c=c||{name:'',kind:'allowance',amount:0,appliesTo:'all',approved:true};
    const m=modal(isNew?'Add Pay Component':'Edit Pay Component',`
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2">${field('Component name','name',{value:c.name,req:true})}</div>
        ${field('Kind','kind',{type:'select',value:c.kind,options:[{value:'allowance',label:'Allowance'},{value:'deduction',label:'Deduction'}]})}
        ${field('Amount (Rs)','amount',{value:c.amount,type:'number',min:0})}
        <div class="col-span-2 flex items-end pb-2.5">${field('Approved (applies to payroll runs)','approved',{type:'checkbox',value:c.approved})}</div>
      </div>
      <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="cCancel">Cancel</button><button class="${btnP}" id="cSave">Save</button></div>`);
    m.el.querySelector('#cCancel').onclick=()=>m.close();
    m.el.querySelector('#cSave').onclick=async()=>{
      const d=collectForm(m.el); if(!d.name){toast('Name required','warn');return;}
      await API.call('savePayComponent',{...(isNew?{}:{id:c.id}),...d}); m.close(); toast('Component saved','success'); App.route();
    };
  }

  /* header actions */
  const runB=document.getElementById(cid+'-run');
  if(runB) runB.onclick=()=>{
    const m=modal('Run Payroll',`
      ${field('Payroll month','month',{type:'month',value:monthISO(),req:true})}
      <div class="max-h-64 overflow-y-auto border border-slate-200/70 rounded-2xl mt-4 mb-4 divide-y divide-slate-50">
        <label class="flex items-center gap-3 px-4 py-2.5 bg-slate-50 font-semibold text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" id="allEmp" checked class="w-4 h-4 rounded accent-teal-600"> Select all</label>
        ${emps.filter(e=>e.active).map(e=>`<label class="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer">
          <input type="checkbox" name="pemp" value="${e.id}" checked class="w-4 h-4 rounded accent-teal-600">
          <span class="text-sm font-medium text-slate-700">${esc(e.name)}</span><span class="text-xs text-slate-400 ml-auto tabular-nums">${fmt(e.salary)}</span></label>`).join('')}
      </div>
      <div class="flex justify-end gap-2"><button class="${btnS}" id="pCancel">Cancel</button><button class="${btnP}" id="pGo">Run payroll</button></div>`);
    m.el.querySelector('#pCancel').onclick=()=>m.close();
    m.el.querySelector('#allEmp').onchange=e=>m.el.querySelectorAll('[name="pemp"]').forEach(x=>x.checked=e.target.checked);
    m.el.querySelector('#pGo').onclick=async()=>{
      const ids=[...m.el.querySelectorAll('[name="pemp"]:checked')].map(x=>x.value);
      if(!ids.length){ toast('Select at least one employee','warn'); return; }
      const r=await API.call('runPayroll',formVal(m.el,'month'),ids);
      m.close(); toast('Payroll run created for '+r.month,'success'); App.route();
    };
  };
  const advB=document.getElementById(cid+'-adv');
  if(advB) advB.onclick=()=>{
    const m=modal('Grant Advance',`
      <div class="grid grid-cols-1 gap-4">
        ${field('Employee','employeeId',{type:'select',options:emps.filter(e=>e.active).map(e=>({value:e.id,label:e.name}))})}
        ${field('Amount (Rs)','amount',{type:'number',min:1,req:true})}
        ${field('Installments','installments',{type:'number',value:3,min:1})}
      </div>
      <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="aCancel">Cancel</button><button class="${btnP}" id="aGo">Grant</button></div>`);
    m.el.querySelector('#aCancel').onclick=()=>m.close();
    m.el.querySelector('#aGo').onclick=async()=>{
      const d=collectForm(m.el);
      if(!d.amount){toast('Amount required','warn');return;}
      await API.call('grantAdvance',d.employeeId,d.amount,d.installments);
      m.close(); toast('Advance granted','success'); location.hash='#/payroll?tab=advances'; App.route();
    };
  };
};
})();
