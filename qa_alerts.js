/* qa_alerts.js — Track 3 QA: backend alert logic with mocked GAS services.
 * Covers: pending-config when no credentials, WhatsApp/SMS payload shapes,
 * failed-send logging (never throws), late/absent/leave/out-of-zone triggers,
 * dedupe, resend, test button, ISO timestamps, and the no-'//' source scan.
 * Run: node qa_alerts.js
 */
const fs = require('fs');
const vm = require('vm');
const ROOT = '/home/hatch/workspace/attendance-saas';

/* ---------- in-memory sheet store (mirrors rowsOf_/appendOf_ semantics) ---------- */
const SHEETS = {
  settings:     ['key','value'],
  employees:    ['id','name','code','departmentId','phone','email','salary','joinDate','deviceId','active'],
  messageLog:   ['id','ts','tenantId','channel','to','event','body','status','error'],
  attendance:   ['id','employeeId','date','type','time','lat','lng','selfie','siteId','distanceM','outOfZone','source','deviceId','syncedAt','note'],
  rosters:      ['id','date','employeeId','shiftId','siteId'],
  shifts:       ['id','name','startTime','endTime','graceMin'],
  holidays:     ['id','date','name'],
  leaveRequests:['id','employeeId','typeId','from','to','days','reason','status','decidedBy'],
  leaveTypes:   ['id','name','quota','paid'],
  sites:        ['id','name','address','lat','lng','radiusM','active']
};
const TENANT_TABS = [];
const store = {};
Object.keys(SHEETS).forEach(k => { store[k] = []; });

const pad2 = n => ('0' + n).slice(-2);
function todayStr_(){ const d=new Date(); return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
function timeStr_(){ const d=new Date(); return pad2(d.getHours())+':'+pad2(d.getMinutes())+':'+pad2(d.getSeconds()); }
function num_(v){ const n=Number(v); return isNaN(n)?0:n; }
function bool_(v){ return v===true||v==='TRUE'||v==='true'||v===1; }
function clean_(o){ const c={}; for(const k in o) if(k!=='_row') c[k]=o[k]; return c; }
function minsBetween_(t1,t2){
  const m=t=>{ const p=String(t||'00:00:00').split(':'); return num_(p[0])*60+num_(p[1])+num_(p[2]||0)/60; };
  return m(t2)-m(t1);
}
function sheetOf_(ss,name){ return {name}; }
function rowsOf_(ss,name){ return store[name].map((r,i)=>Object.assign({_row:i+2},r)); }
function appendOf_(ss,name,obj){
  const row={}; SHEETS[name].forEach(k=>{ row[k]=(obj[k]===null||obj[k]===undefined)?'':obj[k]; });
  store[name].push(row);
}
function updateOf_(ss,name,id,obj){
  for(let i=0;i<store[name].length;i++){
    if(String(store[name][i].id)===String(id)){
      const row={}; SHEETS[name].forEach(k=>{ row[k]=(obj[k]===null||obj[k]===undefined)?'':obj[k]; });
      store[name][i]=row; return true;
    }
  }
  return false;
}
function nextIdOf_(ss,prefix,name){
  let max=0; const re=new RegExp('^'+prefix+'-(\\d+)$');
  store[name].forEach(r=>{ const m=String(r.id||'').match(re); if(m) max=Math.max(max,parseInt(m[1],10)); });
  let n=String(max+1); while(n.length<4) n='0'+n; return prefix+'-'+n;
}
function requireUser_(u){ if(!u||!u.id) throw new Error('Not logged in'); return u; }
function need_(user,perm){
  if(['superadmin','admin','hr'].includes(user.role)) return true;
  throw new Error('Permission denied: '+perm);
}
function selfOnly_(user,employeeId){
  if((user.role==='employee'||user.role==='user')&&String(user.employeeId||'')!==String(employeeId))
    throw new Error('You can only access your own records');
}
function empById_(ss,id){ return store.employees.filter(e=>String(e.id)===String(id))[0]||null; }
function TSS_(user){ return {mock:true}; }

const Utilities = {
  formatDate(d,tz,fmt){
    return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())+'T'+
      pad2(d.getHours())+':'+pad2(d.getMinutes())+':'+pad2(d.getSeconds());
  }
};
const Session = { getScriptTimeZone(){ return 'Asia/Karachi'; } };

/* ---------- mocked UrlFetchApp ---------- */
let fetchMode = 'ok';           // 'ok' | 'throw' | 'http500'
const fetchCalls = [];
const UrlFetchApp = {
  fetch(url, params){
    fetchCalls.push({url, params});
    if(fetchMode==='throw') throw new Error('network down');
    if(fetchMode==='http500')
      return { getResponseCode(){ return 500; }, getContentText(){ return 'internal error'; } };
    return { getResponseCode(){ return 200; }, getContentText(){ return '{"messages":[{"id":"wamid.1"}]}'; } };
  }
};

/* tenant-scoped aliases used by track3.gs */
const tsh_=sheetOf_, trows_=rowsOf_, tappend_=appendOf_, tupdate_=updateOf_, tnextId_=nextIdOf_;
function tsetting_(ss,k,fb){
  const r=store.settings.filter(x=>x.key===k)[0];
  return r?r.value:fb;
}

const API = {};
const sandbox = {
  SHEETS, TENANT_TABS, API,
  sheetOf_, rowsOf_, appendOf_, updateOf_, removeOf_:()=>{}, nextIdOf_,
  tsh_, trows_, tappend_, tupdate_, tnextId_, tsetting_,
  requireUser_, need_, selfOnly_, empById_, TSS_,
  num_, bool_, clean_, todayStr_, timeStr_, minsBetween_,
  Utilities, Session, UrlFetchApp, console
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(ROOT+'/codesections/track3.gs','utf8'), sandbox, {filename:'track3.gs'});

/* ---------- test fixtures ---------- */
const user = {id:'U-1', name:'Admin', role:'admin', tenantId:'T-1', spreadsheetId:'SS-1'};
function setSetting(k,v){
  const r=store.settings.filter(x=>x.key===k)[0];
  if(r) r.value=v; else store.settings.push({key:k, value:v});
}
sandbox.seedTrack3Tabs_({});
store.employees.push(
  {id:'E-1', name:'Ahmed Khan', code:'EMP-001', departmentId:'', phone:'0300-1111111', email:'', salary:60000, joinDate:'2026-07-01', deviceId:'', active:true},
  {id:'E-2', name:'Bilal Hussain', code:'EMP-002', departmentId:'', phone:'0300-2222222', email:'', salary:55000, joinDate:'2026-07-01', deviceId:'', active:true},
  {id:'E-3', name:'Usman Tariq', code:'EMP-003', departmentId:'', phone:'0300-3333333', email:'', salary:50000, joinDate:'2026-07-01', deviceId:'', active:true},
  {id:'E-4', name:'No Phone', code:'EMP-004', departmentId:'', phone:'', email:'', salary:48000, joinDate:'2026-07-01', deviceId:'', active:true}
);
store.shifts.push({id:'SH-1', name:'Morning', startTime:'09:00', endTime:'17:00', graceMin:15});
store.sites.push({id:'S-1', name:'Main Site', address:'', lat:31.5, lng:74.35, radiusM:200, active:true});
store.leaveTypes.push({id:'LT-1', name:'Annual Leave', quota:14, paid:true});

const TODAY = todayStr_();
function pastWeekday(n){ // nth most-recent Mon..Sat date string
  const d=new Date(); let found=0;
  while(true){ d.setDate(d.getDate()-1); const wd=d.getDay();
    if(wd>=1&&wd<=6){ found++; if(found===n)
      return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); } }
}
const YDAY = pastWeekday(1);

/* ---------- assertions ---------- */
let pass=0, fail=0;
function ok(cond, name, extra){
  if(cond){ pass++; console.log('  PASS '+name); }
  else { fail++; console.log('  FAIL '+name+(extra?' :: '+extra:'')); }
}
function logCount(){ return store.messageLog.length; }
console.log('Track 3 QA — '+TODAY);

/* 1. pending-config when no credentials */
console.log('1. pending-config (no credentials)');
{
  const r = API.sendAlert(user, {event:'late', toEmployeeId:'E-1',
    vars:{name:'Ahmed Khan', time:'09:45', shiftStart:'09:00', lateBy:30}});
  ok(r.ok===true && r.sent===false && r.status==='pending-config', 'returns ok, pending-config, no throw');
  ok(fetchCalls.length===0, 'no HTTP call made');
  const row = store.messageLog[store.messageLog.length-1];
  ok(row.status==='pending-config' && row.tenantId==='T-1' && row.to==='03001111111', 'log row written, keyed by tenantId');
  ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(row.ts), 'ts is ISO string', row.ts);
}

/* 2. WhatsApp payload shape */
console.log('2. WhatsApp Cloud API payload');
{
  setSetting('wa_enabled','1'); setSetting('wa_token','TOK123'); setSetting('wa_phone_number_id','PNID9');
  fetchCalls.length=0; fetchMode='ok';
  const r = API.sendAlert(user, {event:'late', toEmployeeId:'E-1',
    vars:{name:'Ahmed Khan', time:'09:45', shiftStart:'09:00', lateBy:30}});
  ok(r.status==='sent' && r.sent===true, 'sent via WhatsApp');
  const c = fetchCalls[0];
  ok(c && c.url==='https://graph.facebook.com/v21.0/PNID9/messages', 'correct Graph API URL', c&&c.url);
  const p = JSON.parse(c.params.payload);
  ok(p.messaging_product==='whatsapp' && p.to==='03001111111' && p.type==='text', 'text message payload shape');
  ok(p.text.body.indexOf('Ahmed Khan')>=0 && p.text.body.indexOf('09:45')>=0, 'body carries template vars');
  ok(c.params.headers.Authorization==='Bearer TOK123', 'bearer auth header');
  ok(c.params.muteHttpExceptions===true, 'muteHttpExceptions set');
}

/* 3. SMS webhook payload shape */
console.log('3. SMS webhook payload');
{
  setSetting('wa_enabled','0'); setSetting('sms_enabled','1');
  setSetting('sms_webhook_url','https://sms.example/hook');
  fetchCalls.length=0;
  const r = API.sendAlert(user, {event:'absent', toEmployeeId:'E-2', vars:{name:'Bilal Hussain', date:TODAY}});
  ok(r.status==='sent', 'sent via SMS webhook');
  const c = fetchCalls[0];
  ok(c.url==='https://sms.example/hook', 'posts to configured webhook');
  const p = JSON.parse(c.params.payload);
  ok(p.to==='03002222222' && typeof p.message==='string' && p.message.indexOf('Bilal Hussain')>=0,
    'payload is {to, message}');
}

/* 4. failed send is logged, never throws */
console.log('4. transport failure -> failed, no throw');
{
  fetchMode='throw';
  let threw=false, r=null;
  try{ r = API.sendAlert(user, {event:'out_of_zone', toEmployeeId:'E-1',
    vars:{name:'Ahmed Khan', type:'in', time:'09:00', site:'Main Site', distance:500}}); }
  catch(e){ threw=true; }
  ok(!threw && r && r.status==='failed', 'no exception, status failed');
  ok(r.error.indexOf('network down')>=0, 'error text captured', r.error);
  const row = store.messageLog[store.messageLog.length-1];
  ok(row.status==='failed' && row.channel==='sms', 'log row failed with channel');
  fetchMode='ok';
}

/* 5. template mode */
console.log('5. WhatsApp template mode');
{
  setSetting('wa_enabled','1'); setSetting('wa_template_name','attn_alert');
  fetchCalls.length=0;
  API.sendAlert(user, {event:'test', toEmployeeId:'E-1', vars:{channel:'whatsapp'}});
  const p = JSON.parse(fetchCalls[0].params.payload);
  ok(p.type==='template' && p.template.name==='attn_alert', 'template payload when wa_template_name set');
  setSetting('wa_template_name','');
}

/* 6. runAlertChecks: late arrival + dedupe */
console.log('6. runAlertChecks late arrival');
{
  store.attendance.push({id:'P-1', employeeId:'E-1', date:TODAY, type:'in', time:'09:45:00',
    lat:'', lng:'', selfie:'', siteId:'S-1', distanceM:50, outOfZone:false, source:'app', deviceId:'', syncedAt:'', note:''});
  fetchCalls.length=0;
  const before=logCount();
  const r1 = API.runAlertChecks(user, 'E-1');
  ok(r1.alerts.length===1 && r1.alerts[0].status==='sent', 'late alert fired');
  ok(r1.alerts[0].channel==='whatsapp', 'WhatsApp preferred when configured');
  const r2 = API.runAlertChecks(user, 'E-1');
  ok(r2.alerts.length===0 && logCount()===before+1, 'second run dedupes (no duplicate alert)');
}

/* 7. runAlertChecks: out-of-zone */
console.log('7. runAlertChecks out-of-zone');
{
  store.attendance.push({id:'P-2', employeeId:'E-1', date:TODAY, type:'out', time:'17:05:00',
    lat:'', lng:'', selfie:'', siteId:'S-1', distanceM:500, outOfZone:true, source:'app', deviceId:'', syncedAt:'', note:''});
  const before=logCount();
  const r1 = API.runAlertChecks(user, 'E-1');
  const row = store.messageLog[store.messageLog.length-1];
  ok(r1.alerts.length===1, 'one new alert from the out-of-zone punch');
  ok(row.event==='out_of_zone' && row.body.indexOf('Main Site')>=0 && row.body.indexOf('500')>=0,
    'out_of_zone alert with site + distance', row.body);
  const r2 = API.runAlertChecks(user, 'E-1');
  ok(r2.alerts.length===0 && logCount()===before+1, 'out-of-zone deduped on rerun');
}

/* 8. checkAbsences */
console.log('8. checkAbsences daily sweep ('+YDAY+')');
{
  store.attendance.push({id:'P-3', employeeId:'E-2', date:YDAY, type:'in', time:'09:05:00',
    lat:'', lng:'', selfie:'', siteId:'', distanceM:'', outOfZone:false, source:'app', deviceId:'', syncedAt:'', note:''});
  store.leaveRequests.push({id:'L-9', employeeId:'E-3', typeId:'LT-1', from:YDAY, to:YDAY,
    days:1, reason:'', status:'approved', decidedBy:'U-1'});
  const r = API.checkAbsences(user, YDAY);
  const ids = r.absent.map(a=>a.employeeId).sort();
  ok(r.skipped==='' && ids.join(',')==='E-1,E-4', 'E-1+E-4 absent (E-2 punched, E-3 on leave)');
  ok(r.alerted===1, 'absent alert sent (E-4 has no phone -> failed)');
  const e1sent = ()=>store.messageLog.filter(x=>x.event==='absent'&&x.status==='sent'&&x.to==='03001111111').length;
  ok(e1sent()===1, 'one sent absent row for E-1 (test 3 sent a manual absent to E-2 earlier)');
  const n1=logCount();
  const hol = API.checkAbsences(user, YDAY); // rerun next day: dedupe via body date, no new alert
  ok(hol.alerted===0, 'absent alert deduped on rerun');
  ok(e1sent()===1, 'still one sent absent row for E-1');
  ok(logCount()===n1+1, 'only the no-phone retry re-logged as failed');
  store.holidays.push({id:'H-1', date:YDAY, name:'Test Holiday'});
  ok(API.checkAbsences(user, YDAY).skipped==='holiday', 'holiday skips sweep');
  store.holidays.pop();
  const fut = '2099-01-01';
  ok(API.checkAbsences(user, fut).skipped==='future date', 'future date skips sweep');
}
/* 8b. absence grace not yet elapsed today -> not absent */
console.log('8b. absence grace (today, shift 23:00)');
{
  store.shifts[0].startTime='23:00';
  const r = API.checkAbsences(user, TODAY);
  ok(r.absent.length===0 && r.skipped==='', 'nobody flagged absent before grace elapses');
  store.shifts[0].startTime='09:00';
}

/* 9. alertLeaveDecision */
console.log('9. alertLeaveDecision');
{
  store.leaveRequests.push({id:'L-1', employeeId:'E-2', typeId:'LT-1', from:YDAY, to:YDAY,
    days:1, reason:'sick', status:'approved', decidedBy:'U-1'});
  const r1 = API.alertLeaveDecision(user, 'L-1');
  ok(r1.status==='sent', 'leave_approved sent');
  const row = store.messageLog[store.messageLog.length-1];
  ok(row.event==='leave_approved' && row.to==='03002222222' && row.body.indexOf('APPROVED')>=0,
    'correct recipient + body');
  const r2 = API.alertLeaveDecision(user, 'L-1');
  ok(r2.status==='skipped' && r2.reason==='already sent', 'decision not notified twice');
  setSetting('alert_leave_decision','0');
  store.leaveRequests.push({id:'L-2', employeeId:'E-3', typeId:'LT-1', from:YDAY, to:YDAY,
    days:1, reason:'', status:'rejected', decidedBy:'U-1'});
  const before=logCount();
  ok(API.alertLeaveDecision(user,'L-2').reason==='event disabled' && logCount()===before,
    'toggle off -> no alert at all');
  setSetting('alert_leave_decision','1');
}

/* 10. resendAlert */
console.log('10. resendAlert');
{
  const failed = store.messageLog.filter(r=>r.status==='failed')[0];
  ok(!!failed, 'failed row exists from test 4');
  const before=logCount();
  const r = API.resendAlert(user, failed.id);
  ok(r.status==='sent', 'resend succeeds with current credentials');
  ok(logCount()===before, 'row updated in place, no duplicate row');
  ok(store.messageLog.filter(x=>x.id===failed.id)[0].status==='sent', 'original row now sent');
}

/* 11. testAlert validation + pending-config */
console.log('11. testAlert');
{
  let threw=false;
  try{ API.testAlert(user,'whatsapp',''); }catch(e){ threw=/phone number/.test(e.message); }
  ok(threw, 'missing number throws');
  const r1 = API.testAlert(user,'whatsapp','0300-1111111');
  ok(r1.status==='sent', 'test via WhatsApp sent');
  setSetting('wa_token','');
  const r2 = API.testAlert(user,'whatsapp','03001111111');
  ok(r2.status==='pending-config', 'missing creds -> pending-config, no throw');
  setSetting('wa_token','TOK123');
}

/* 12. no phone on file -> failed, never throws */
console.log('12. missing employee phone');
{
  const r = API.sendAlert(user, {event:'late', toEmployeeId:'E-4', vars:{name:'No Phone', time:'09:45', shiftStart:'09:00', lateBy:30}});
  ok(r.status==='failed' && /phone number/.test(r.error), 'failed with clear error');
}

/* 13. all messageLog rows: tenantId set, ts ISO, known statuses */
console.log('13. log row invariants');
{
  const bad = store.messageLog.filter(r =>
    !r.tenantId || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(r.ts) ||
    ['sent','failed','pending-config'].indexOf(r.status)<0);
  ok(bad.length===0, 'every row keyed by tenantId, ISO ts, known status', JSON.stringify(bad.slice(0,2)));
}

/* 14. source scan: no literal '//' (GAS strips it) in shipped JS */
console.log('14. no-double-slash scan');
{
  ['codesections/track3.gs','src/js/160_alerts.js','src/js/130_settings.js'].forEach(f=>{
    const src = fs.readFileSync(ROOT+'/'+f,'utf8');
    ok(src.indexOf('://')<0, f+' has no :// in strings');
    ok(!/(^|[^:])\/\//m.test(src), f+' has no bare // anywhere');
  });
}

/* 15. i18n key coverage */
console.log('15. I18N key coverage');
{
  const fe = fs.readFileSync(ROOT+'/src/js/160_alerts.js','utf8');
  const st = fs.readFileSync(ROOT+'/src/js/130_settings.js','utf8');
  const dictM = fe.match(/Object\.assign\(I18N\.dict\.en,\s*\{([\s\S]*?)\n\}\)/);
  const enKeys = new Set([...dictM[1].matchAll(/'(t3\.[a-zA-Z]+)'/g)].map(m=>m[1]));
  const used = new Set([...(fe+st).matchAll(/I18N\.t\('(t3\.[a-zA-Z]+)'\)/g)].map(m=>m[1]));
  const missing = [...used].filter(k=>!enKeys.has(k));
  ok(missing.length===0, 'all used t3.* keys defined in en dict', JSON.stringify(missing));
  const dictUr = fe.match(/Object\.assign\(I18N\.dict\.ur,\s*\{([\s\S]*?)\n\}\)/);
  const urKeys = new Set([...dictUr[1].matchAll(/'(t3\.[a-zA-Z]+)'/g)].map(m=>m[1]));
  const missingUr = [...enKeys].filter(k=>!urKeys.has(k));
  ok(missingUr.length===0, 'ur dict covers all en keys', JSON.stringify(missingUr));
}

console.log('\nTrack 3 QA: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
