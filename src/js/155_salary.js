/* 155_salary.js — Track 2: auto salary from attendance.
   Salaries tab on the Payroll page: salary structures manager, salary rules
   (settings), monthly generation from attendance, salary runs with per-row
   printable payslips (print CSS, browser print-to-PDF). */
(function(){
'use strict';

/* I18N bootstrap (pattern: Object.assign(I18N.dict.en/ur, {...})); safe if the
   framework file from the other track loads before or after this one. */
window.I18N = window.I18N || { dict: { en: {}, ur: {} }, lang: 'en' };
if(!I18N.t) I18N.t = function(k){
  var d = I18N.dict || {};
  return (d[I18N.lang] && d[I18N.lang][k]) || (d.en && d.en[k]) || k;
};
Object.assign(I18N.dict.en, {
  't2.salaries': 'Salaries',
  't2.salaryStructures': 'Salary structures',
  't2.structuresSub': 'Per-employee basic pay and allowances used by auto salary.',
  't2.structuresEmpty': 'No salary structures yet — add one per employee to enable auto salary.',
  't2.addStructure': 'Add structure',
  't2.editStructure': 'Edit salary structure',
  't2.employee': 'Employee',
  't2.basicPay': 'Basic pay (Rs)',
  't2.allowancesJson': 'Allowances (JSON)',
  't2.allowancesJsonPh': '{"hra": 12000, "transport": 5000}',
  't2.effectiveFrom': 'Effective from',
  't2.payFrequency': 'Pay frequency',
  't2.monthly': 'Monthly',
  't2.save': 'Save',
  't2.cancel': 'Cancel',
  't2.close': 'Close',
  't2.basic': 'Basic pay',
  't2.allowances': 'Allowances',
  't2.structureSaved': 'Salary structure saved',
  't2.salaryRules': 'Salary rules',
  't2.salaryRulesSub': 'Deduction and overtime rules used by auto salary (stored in Settings).',
  't2.absentDeductionPerDay': 'Absent divisor (per-day wage = monthly ÷ this)',
  't2.lateGraceMinutes': 'Late grace (minutes)',
  't2.latePenaltyMinutes': 'Late penalty (minutes of wage per late arrival)',
  't2.overtimeRateMultiplier': 'Overtime rate multiplier',
  't2.workHoursPerDay': 'Work hours per day',
  't2.saveRules': 'Save rules',
  't2.rulesSaved': 'Salary rules saved',
  't2.generateTitle': 'Generate monthly salaries',
  't2.generateSub': 'Computes salary from attendance, approved leaves and overtime for every active employee. Employees without a salary structure are skipped.',
  't2.payrollMonth': 'Payroll month',
  't2.generate': 'Generate salaries',
  't2.generating': 'Generating…',
  't2.results': 'Results',
  't2.generatedOk': 'salaries generated',
  't2.skipped': 'Skipped',
  't2.salaryRuns': 'Salary runs',
  't2.runsEmpty': 'No salary runs yet.',
  't2.viewPayslips': 'View payslips',
  't2.slipsEmpty': 'No payslips in this run.',
  't2.payslip': 'Payslip',
  't2.printPdf': 'Print / PDF',
  't2.earnings': 'Earnings',
  't2.deductions': 'Deductions',
  't2.gross': 'Gross pay',
  't2.absentDeduction': 'Absent deduction',
  't2.lateDeduction': 'Late deduction',
  't2.overtimePay': 'Overtime pay',
  't2.netPay': 'Net pay',
  't2.attendanceSummary': 'Attendance summary',
  't2.present': 'Present',
  't2.absent': 'Absent',
  't2.paidLeave': 'Paid leave',
  't2.unpaidLeave': 'Unpaid leave',
  't2.lateArrivals': 'Late arrivals',
  't2.overtimeHours': 'Overtime hours',
  't2.workDays': 'Working days',
  't2.days': 'days',
  't2.times': 'times',
  't2.proratedNote': 'Pro-rated for mid-month joining',
  't2.month': 'Month',
  't2.created': 'Created',
  't2.payslips': 'Payslips',
  't2.totalNet': 'Total net',
  't2.status': 'Status',
  't2.invalidMonth': 'Pick a month first',
  't2.fillRequired': 'Employee and basic pay are required',
  't2.edit': 'Edit',
  't2.net': 'Net'
});
Object.assign(I18N.dict.ur, {
  't2.salaries': 'تنخواہیں',
  't2.salaryStructures': 'تنخواہ کے اسٹرکچر',
  't2.structuresSub': 'خودکار تنخواہ کے لیے فی ملازم بنیادی تنخواہ اور الاؤنسز۔',
  't2.structuresEmpty': 'ابھی کوئی تنخواہ اسٹرکچر نہیں — خودکار تنخواہ کے لیے ہر ملازم کا اسٹرکچر شامل کریں۔',
  't2.addStructure': 'اسٹرکچر شامل کریں',
  't2.editStructure': 'تنخواہ اسٹرکچر میں ترمیم',
  't2.employee': 'ملازم',
  't2.basicPay': 'بنیادی تنخواہ (روپے)',
  't2.allowancesJson': 'الاؤنسز (JSON)',
  't2.allowancesJsonPh': '{"hra": 12000, "transport": 5000}',
  't2.effectiveFrom': 'نافذ از',
  't2.payFrequency': 'ادائیگی کی مدت',
  't2.monthly': 'ماہانہ',
  't2.save': 'محفوظ کریں',
  't2.cancel': 'منسوخ کریں',
  't2.close': 'بند کریں',
  't2.basic': 'بنیادی تنخواہ',
  't2.allowances': 'الاؤنسز',
  't2.structureSaved': 'تنخواہ اسٹرکچر محفوظ ہو گیا',
  't2.salaryRules': 'تنخواہ کے اصول',
  't2.salaryRulesSub': 'خودکار تنخواہ میں استعمال ہونے والے کٹوتی اور اوور ٹائم اصول (سیٹنگز میں محفوظ)۔',
  't2.absentDeductionPerDay': 'غیر حاضری تقسیم کنندہ (یومیہ اجرت = ماہانہ ÷ یہ)',
  't2.lateGraceMinutes': 'تاخیر کی رعایت (منٹ)',
  't2.latePenaltyMinutes': 'تاخیر کا جرمانہ (فی تاخیر اجرت کے منٹ)',
  't2.overtimeRateMultiplier': 'اوور ٹائم ریٹ ضرب',
  't2.workHoursPerDay': 'یومیہ کام کے گھنٹے',
  't2.saveRules': 'اصول محفوظ کریں',
  't2.rulesSaved': 'تنخواہ کے اصول محفوظ ہو گئے',
  't2.generateTitle': 'ماہانہ تنخواہیں بنائیں',
  't2.generateSub': 'ہر فعال ملازم کی حاضری، منظور شدہ چھٹیوں اور اوور ٹائم سے تنخواہ نکالی جاتی ہے۔ جن کا اسٹرکچر نہیں انہیں چھوڑ دیا جاتا ہے۔',
  't2.payrollMonth': 'تنخواہ کا مہینہ',
  't2.generate': 'تنخواہیں بنائیں',
  't2.generating': 'بنائی جا رہی ہیں…',
  't2.results': 'نتائج',
  't2.generatedOk': 'تنخواہیں بن گئیں',
  't2.skipped': 'چھوڑے گئے',
  't2.salaryRuns': 'تنخواہ کے رن',
  't2.runsEmpty': 'ابھی کوئی تنخواہ رن نہیں۔',
  't2.viewPayslips': 'پے سلپس دیکھیں',
  't2.slipsEmpty': 'اس رن میں کوئی پے سلپ نہیں۔',
  't2.payslip': 'پے سلپ',
  't2.printPdf': 'پرنٹ / PDF',
  't2.earnings': 'آمدنی',
  't2.deductions': 'کٹوتیاں',
  't2.gross': 'مجموعی تنخواہ',
  't2.absentDeduction': 'غیر حاضری کٹوتی',
  't2.lateDeduction': 'تاخیر کٹوتی',
  't2.overtimePay': 'اوور ٹائم معاوضہ',
  't2.netPay': 'خالص تنخواہ',
  't2.attendanceSummary': 'حاضری کا خلاصہ',
  't2.present': 'حاضر',
  't2.absent': 'غیر حاضر',
  't2.paidLeave': 'تنخواہ والی چھٹی',
  't2.unpaidLeave': 'بغیر تنخواہ چھٹی',
  't2.lateArrivals': 'تاخیر سے آمد',
  't2.overtimeHours': 'اوور ٹائم گھنٹے',
  't2.workDays': 'کام کے دن',
  't2.days': 'دن',
  't2.times': 'بار',
  't2.proratedNote': 'مہینے کے درمیان شمولیت پر متناسب',
  't2.month': 'مہینہ',
  't2.created': 'بنایا گیا',
  't2.payslips': 'پے سلپس',
  't2.totalNet': 'کل خالص',
  't2.status': 'حالت',
  't2.invalidMonth': 'پہلے مہینہ منتخب کریں',
  't2.fillRequired': 'ملازم اور بنیادی تنخواہ ضروری ہیں',
  't2.edit': 'ترمیم',
  't2.net': 'خالص'
});

const t2t = k => I18N.t('t2.' + k);

function t2AllowSum(s){
  let t = 0;
  const d = s.allowancesDetail || {};
  Object.keys(d).forEach(k => { t += Number(d[k]) || 0; });
  return t;
}

window.SalaryUI = {
  async renderSalariesTab(el, ctx){
    const { emps, canEdit } = ctx;
    const cid = uid('sal');
    el.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6 mb-5">
        <div class="flex items-center justify-between mb-4">
          <div><h3 class="font-display font-bold text-slate-800">${t2t('salaryStructures')}</h3>
          <p class="text-xs text-slate-400 mt-0.5">${t2t('structuresSub')}</p></div>
          ${canEdit ? `<button class="${btnS}" id="${cid}-add">+ ${t2t('addStructure')}</button>` : ''}
        </div>
        <div id="${cid}-structs"></div>
      </div>
      ${perm('settings','manage') ? `
      <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6 mb-5">
        <h3 class="font-display font-bold text-slate-800 mb-1">${t2t('salaryRules')}</h3>
        <p class="text-xs text-slate-400 mb-4">${t2t('salaryRulesSub')}</p>
        <div id="${cid}-rules" class="grid grid-cols-2 md:grid-cols-3 gap-4"></div>
        <div class="flex justify-end mt-4"><button class="${btnP}" id="${cid}-saveRules">${t2t('saveRules')}</button></div>
      </div>` : ''}
      <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6 mb-5">
        <h3 class="font-display font-bold text-slate-800 mb-1">${t2t('generateTitle')}</h3>
        <p class="text-xs text-slate-400 mb-4">${t2t('generateSub')}</p>
        <div class="flex flex-wrap items-end gap-3">
          ${field(t2t('payrollMonth'), 'genMonth', { type: 'month', value: monthISO() })}
          ${canEdit ? `<button class="${btnP}" id="${cid}-gen">${t2t('generate')}</button>` : ''}
        </div>
        <div id="${cid}-genResult" class="mt-5"></div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(15,23,42,.05)] p-6">
        <h3 class="font-display font-bold text-slate-800 mb-4">${t2t('salaryRuns')}</h3>
        <div id="${cid}-runs"></div>
      </div>`;

    const loadStructs = async () => {
      const box = document.getElementById(cid + '-structs');
      const rows = await API.call('listSalaryStructures').catch(() => []);
      box.innerHTML = tableHTML([
        { label: t2t('employee'), get: s => `<div><div class="font-medium text-slate-700">${esc(s.employeeName)}</div><div class="text-xs text-slate-400">${esc(s.employeeCode)}</div></div>` },
        { label: t2t('basic'), num: 1, get: s => `<span class="tabular-nums">${fmt(s.basic)}</span>` },
        { label: t2t('allowances'), num: 1, get: s => `<span class="tabular-nums text-emerald-600">+ ${fmt(t2AllowSum(s))}</span>` },
        { label: t2t('effectiveFrom'), get: s => `<span class="text-xs text-slate-500">${fmtDate(s.effectiveFrom)}</span>` },
        { label: '', get: s => canEdit ? `<div class="flex justify-end"><button class="${btnS} !px-3 !py-1.5 !text-xs" data-sedit="${s.id}">${t2t('edit')}</button></div>` : '' },
      ], rows, { empty: t2t('structuresEmpty') });
      box.querySelectorAll('[data-sedit]').forEach(b => b.onclick = () =>
        SalaryUI.structureEditor(rows.find(x => x.id === b.dataset.sedit), emps, loadStructs));
    };

    const loadRules = async () => {
      const box = document.getElementById(cid + '-rules');
      if(!box) return;
      const s = await API.call('getSettings').catch(() => ({}));
      const R = [
        ['absentDeductionPerDay', t2t('absentDeductionPerDay'), s.absentDeductionPerDay || '30'],
        ['lateGraceMinutes', t2t('lateGraceMinutes'), s.lateGraceMinutes || '15'],
        ['latePenaltyMinutes', t2t('latePenaltyMinutes'), s.latePenaltyMinutes || '60'],
        ['overtimeRateMultiplier', t2t('overtimeRateMultiplier'), s.overtimeRateMultiplier || '1.5'],
        ['salaryWorkHoursPerDay', t2t('workHoursPerDay'), s.salaryWorkHoursPerDay || '8'],
      ];
      box.innerHTML = R.map(([k, l, v]) => field(l, k, { type: 'number', value: v, min: 0, step: k === 'overtimeRateMultiplier' ? '0.1' : '1' })).join('');
      document.getElementById(cid + '-saveRules').onclick = async () => {
        const d = collectForm(box);
        await API.call('saveSettings', d);
        toast(t2t('rulesSaved'), 'success');
      };
    };

    const loadRuns = async () => {
      const box = document.getElementById(cid + '-runs');
      const runs = (await API.call('listPayrollRuns').catch(() => [])).filter(r => (r.runType || 'manual') === 'salary');
      box.innerHTML = tableHTML([
        { label: t2t('month'), get: r => `<span class="font-semibold tabular-nums">${esc(r.month)}</span>` },
        { label: t2t('created'), get: r => `<span class="text-xs text-slate-500">${esc(r.createdAt)}</span>` },
        { label: t2t('payslips'), num: 1, get: r => fmtNum(r.slipCount) },
        { label: t2t('totalNet'), num: 1, get: r => `<span class="tabular-nums font-semibold">${fmt(r.totalNet)}</span>` },
        { label: t2t('status'), get: r => badge(r.status === 'finalized' ? 'Finalized' : 'Draft', r.status === 'finalized' ? 'teal' : 'slate') },
        { label: '', get: r => `<div class="flex justify-end"><button class="${btnS} !px-3 !py-1.5 !text-xs" data-vrun="${r.id}">${t2t('viewPayslips')}</button></div>` },
      ], runs, { empty: t2t('runsEmpty') });
      box.querySelectorAll('[data-vrun]').forEach(b => b.onclick = () => SalaryUI.viewSalaryRun(b.dataset.vrun, canEdit));
    };

    const addB = document.getElementById(cid + '-add');
    if(addB) addB.onclick = () => SalaryUI.structureEditor(null, emps, loadStructs);

    const genB = document.getElementById(cid + '-gen');
    if(genB) genB.onclick = async () => {
      const m = formVal(el, 'genMonth');
      if(!m){ toast(t2t('invalidMonth'), 'warn'); return; }
      genB.disabled = true; genB.textContent = t2t('generating');
      try{
        const r = await API.call('generateMonthlySalaries', m);
        const box = document.getElementById(cid + '-genResult');
        box.innerHTML = `
          <h4 class="font-bold text-slate-700 text-sm mb-2">${t2t('results')} — <span class="tabular-nums">${esc(r.month)}</span>
            <span class="text-emerald-600 ml-2">${r.generated.length} ${t2t('generatedOk')}</span>
            ${r.skipped.length ? `<span class="text-amber-600 ml-2">${t2t('skipped')}: ${r.skipped.length}</span>` : ''}</h4>` +
          tableHTML([
            { label: t2t('employee'), get: g => `<div><div class="font-medium text-slate-700">${esc(g.employeeName)}</div><div class="text-xs text-slate-400">${esc(g.employeeCode)}</div></div>` },
            { label: t2t('present'), num: 1, get: g => fmtNum(g.daysPresent) },
            { label: t2t('absent'), num: 1, get: g => fmtNum(g.daysAbsent) },
            { label: t2t('lateArrivals'), num: 1, get: g => fmtNum(g.lateCount) },
            { label: t2t('overtimeHours'), num: 1, get: g => fmtNum(g.overtimeHours) },
            { label: t2t('net'), num: 1, get: g => `<span class="tabular-nums font-bold text-teal-700">${fmt(g.net)}</span>` },
          ], r.generated, { empty: t2t('slipsEmpty') }) +
          (r.skipped.length ? `<h4 class="font-bold text-amber-700 text-sm mt-4 mb-2">${t2t('skipped')}</h4>` +
            tableHTML([
              { label: t2t('employee'), get: g => `<span class="font-medium text-slate-700">${esc(g.employeeName)}</span>` },
              { label: 'Reason', get: g => `<span class="text-xs text-amber-700">${esc(g.reason)}</span>` },
            ], r.skipped, {}) : '');
        toast(r.generated.length + ' ' + t2t('generatedOk'), 'success');
        loadRuns();
      }catch(e){ toast(e.message, 'error'); }
      genB.disabled = false; genB.textContent = t2t('generate');
    };

    await loadStructs(); await loadRules(); await loadRuns();
  },

  structureEditor(s, emps, onDone){
    const isNew = !s; s = s || { employeeId: '', basic: '', allowancesJson: '', effectiveFrom: todayISO(), payFrequency: 'monthly' };
    const m = modal(isNew ? t2t('addStructure') : t2t('editStructure'), `
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2">${field(t2t('employee'), 'employeeId', { type: 'select', value: s.employeeId, req: true,
          options: emps.filter(e => e.active).map(e => ({ value: e.id, label: e.name + ' (' + e.code + ')' })) })}</div>
        ${field(t2t('basicPay'), 'basic', { type: 'number', value: s.basic, min: 1, req: true })}
        ${field(t2t('effectiveFrom'), 'effectiveFrom', { type: 'date', value: s.effectiveFrom || todayISO(), req: true })}
        <div class="col-span-2">${field(t2t('allowancesJson'), 'allowancesJson', { type: 'textarea', value: s.allowancesJson || '', ph: t2t('allowancesJsonPh') })}</div>
        ${field(t2t('payFrequency'), 'payFrequency', { type: 'select', value: s.payFrequency || 'monthly',
          options: [{ value: 'monthly', label: t2t('monthly') }] })}
      </div>
      <div class="flex justify-end gap-2 mt-6"><button class="${btnS}" id="sCancel">${t2t('cancel')}</button><button class="${btnP}" id="sSave">${t2t('save')}</button></div>`);
    m.el.querySelector('#sCancel').onclick = () => m.close();
    m.el.querySelector('#sSave').onclick = async () => {
      const d = collectForm(m.el);
      if(!d.employeeId || !Number(d.basic)){ toast(t2t('fillRequired'), 'warn'); return; }
      try{
        if((d.allowancesJson || '').trim()) JSON.parse(d.allowancesJson);
      }catch(e){ toast('Allowances JSON: ' + e.message, 'error'); return; }
      await API.call('saveSalaryStructure', { ...(isNew ? {} : { id: s.id }), ...d });
      m.close(); toast(t2t('structureSaved'), 'success'); onDone && onDone();
    };
  },

  async viewSalaryRun(runId, canEdit){
    const slips = await API.call('listPayslips', runId);
    const m = modal(t2t('salaryRuns') + ' — ' + (slips[0] ? slips[0].month : ''), `<div id="t2slips"></div>`, { wide: true });
    const box = m.el.querySelector('#t2slips');
    box.innerHTML = tableHTML([
      { label: t2t('employee'), get: p => `<div><div class="font-medium text-slate-700">${esc(p.employeeName)}</div><div class="text-xs text-slate-400">${esc(p.employeeCode)}</div></div>` },
      { label: t2t('basic'), num: 1, get: p => `<span class="tabular-nums">${fmt(p.salary)}</span>` },
      { label: t2t('allowances'), num: 1, get: p => `<span class="tabular-nums text-emerald-600">+${fmt(p.allowances)}</span>` },
      { label: t2t('deductions'), num: 1, get: p => `<span class="tabular-nums text-red-500">−${fmt(p.deductions)}</span>` },
      { label: t2t('netPay'), num: 1, get: p => `<span class="tabular-nums font-bold">${fmt(p.net)}</span>` },
      { label: '', get: p => `<div class="flex justify-end"><button class="${btnS} !px-3 !py-1.5 !text-xs" data-slip="${p.employeeId}">${t2t('payslip')}</button></div>` },
    ], slips, { empty: t2t('slipsEmpty') });
    box.querySelectorAll('[data-slip]').forEach(b => b.onclick = async () => {
      const d = await API.call('getSalaryPayslip', runId, b.dataset.slip);
      SalaryUI.payslipModal(d);
    });
  },

  payslipModal(d){
    const b = d.breakdown || {};
    const allowRows = Object.keys(b.allowancesDetail || {}).map(k =>
      `<tr><td class="py-1.5 text-slate-500 pl-4">· ${esc(k)}</td><td class="py-1.5 text-right tabular-nums">${fmt(b.allowancesDetail[k])}</td></tr>`).join('');
    const attRows = [
      [t2t('workDays'), b.workDays], [t2t('present'), b.daysPresent], [t2t('absent'), b.daysAbsent],
      [t2t('paidLeave'), b.paidLeaveDays], [t2t('unpaidLeave'), b.unpaidLeaveDays],
      [t2t('lateArrivals'), b.lateCount], [t2t('overtimeHours'), b.overtimeHours],
    ].map(([l, v]) => `<div class="flex justify-between py-1"><span class="text-slate-500">${l}</span><span class="tabular-nums font-medium">${v == null ? '—' : v}</span></div>`).join('');
    const html = `
    <style>
      .t2slip{font-family:Arial,Helvetica,sans-serif;color:#111;max-width:680px;margin:0 auto;font-size:13px}
      .t2slip table{width:100%;border-collapse:collapse}
      .t2slip .sec{font-weight:700;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#0f766e;margin:14px 0 6px}
      .t2slip td{padding:3px 0}
      @media print{
        body{padding:0 !important;margin:0 !important}
        .t2slip{max-width:100%}
        .t2actions{display:none !important}
      }
    </style>
    <div class="t2slip" id="t2slipPrint">
      <div style="text-align:center;border-bottom:3px solid #0f766e;padding-bottom:10px;margin-bottom:12px">
        <div style="font-size:20px;font-weight:800">${esc(d.company || 'Attendance Management System')}</div>
        <div style="font-size:13px;color:#444;margin-top:2px">${t2t('payslip')} — <span class="tabular-nums">${esc(d.run.month || '')}</span></div>
      </div>
      <table><tr>
        <td style="width:50%;vertical-align:top">
          <div style="font-weight:700;font-size:15px">${esc(d.employee.name || '')}</div>
          <div style="color:#555;font-size:12px">${esc(d.employee.code || '')}</div>
        </td>
        <td style="width:50%;vertical-align:top;text-align:right;font-size:12px;color:#555">
          <div>${t2t('status')}: ${(d.payslip.paid ? 'Paid' : 'Unpaid')}</div>
          ${b.prorated ? `<div style="color:#b45309">${t2t('proratedNote')}</div>` : ''}
        </td>
      </tr></table>
      <div class="sec">${t2t('earnings')}</div>
      <table>
        <tr><td class="py-1.5 text-slate-500">${t2t('basic')}</td><td class="py-1.5 text-right tabular-nums">${fmt(b.basic || 0)}</td></tr>
        ${allowRows}
        <tr><td class="py-1.5 font-semibold">${t2t('gross')}</td><td class="py-1.5 text-right tabular-nums font-semibold">${fmt(b.gross || 0)}</td></tr>
      </table>
      <div class="sec">${t2t('deductions')}</div>
      <table>
        <tr><td class="py-1.5 text-slate-500">${t2t('absentDeduction')} (${b.daysAbsent || 0} + ${b.unpaidLeaveDays || 0} ${t2t('days')})</td><td class="py-1.5 text-right tabular-nums">− ${fmt(b.absentDeduction || 0)}</td></tr>
        <tr><td class="py-1.5 text-slate-500">${t2t('lateDeduction')} (${b.lateCount || 0} ${t2t('times')})</td><td class="py-1.5 text-right tabular-nums">− ${fmt(b.lateDeduction || 0)}</td></tr>
        <tr><td class="py-1.5 text-slate-500">${t2t('overtimePay')} (${b.overtimeHours || 0} h)</td><td class="py-1.5 text-right tabular-nums">+ ${fmt(b.overtimePay || 0)}</td></tr>
      </table>
      <div style="border-top:2px solid #0f766e;margin-top:8px;padding-top:8px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:800;font-size:15px">${t2t('netPay')}</span>
        <span class="tabular-nums" style="font-weight:800;font-size:18px;color:#0f766e">${fmt(d.payslip.net)}</span>
      </div>
      <div class="sec">${t2t('attendanceSummary')}</div>
      <div style="columns:2;column-gap:24px">${attRows}</div>
      <div style="display:flex;justify-content:space-between;margin-top:36px;font-size:12px;color:#555">
        <div style="border-top:1px solid #999;padding-top:4px;width:40%;text-align:center">Employee signature</div>
        <div style="border-top:1px solid #999;padding-top:4px;width:40%;text-align:center">Authorized signature</div>
      </div>
    </div>
    <div class="t2actions flex justify-end gap-2 mt-6">
      <button class="${btnS}" id="t2pClose">${t2t('close')}</button>
      <button class="${btnP}" id="t2pPrint">${t2t('printPdf')}</button>
    </div>`;
    const m = modal(t2t('payslip') + ' — ' + (d.employee.name || ''), html, { wide: true });
    m.el.querySelector('#t2pClose').onclick = () => m.close();
    m.el.querySelector('#t2pPrint').onclick = () =>
      printHTML(m.el.querySelector('#t2slipPrint').outerHTML, t2t('payslip') + ' ' + (d.employee.name || '') + ' ' + (d.run.month || ''));
  }
};
})();
