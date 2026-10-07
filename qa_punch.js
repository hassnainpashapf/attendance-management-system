/* QA Check 6 — punch-flow logic tests (node).
 * (a) haversine sanity  (b) duplicate-punch guard  (c) offline queue drain.
 * Run: node qa_punch.js
 */
const fs = require('fs');
const vm = require('vm');
const { performance } = require('perf_hooks');

const ROOT = '/home/hatch/workspace/attendance-saas';
const failures = [];
const ok = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
  if (!cond) failures.push(name);
};

(async () => {
  /* ---------- (a) haversine from the real 00_utils.js ---------- */
  {
    const sb = { window: null, console };
    sb.window = sb; sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(fs.readFileSync(ROOT + '/src/js/00_utils.js', 'utf8'), sb, { filename: '00_utils.js' });
    const H = sb.haversineM;
    ok('haversine exposed', typeof H === 'function');
    const d0 = H(31.5204, 74.3587, 31.5204, 74.3587);
    ok('haversine same point = 0m', d0 === 0, 'got ' + d0);
    const d1 = H(31.5204, 74.3587, 31.5214, 74.3587); // 0.001 deg lat
    ok('haversine 0.001deg lat ~= 111.2m', Math.abs(d1 - 111.19) < 0.6, 'got ' + d1.toFixed(2) + 'm');
    const d2 = H(31.5204, 74.3587, 31.5204, 74.3597); // 0.001 deg lng at lat 31.5
    ok('haversine 0.001deg lng ~= 95.0m', Math.abs(d2 - 95.0) < 0.8, 'got ' + d2.toFixed(2) + 'm');
    ok('haversine null input -> null', H(null, 1, 2, 3) === null);
  }

  /* ---------- full-app harness for (b) and (c) ---------- */
  const html = fs.readFileSync(ROOT + '/deploy/index.html', 'utf8');
  const code = [...html.matchAll(/<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/g)][0][1];
  const errs = [];
  const DOCIDS = {};
  class FakeElement {
    constructor(tag){ this.tagName=String(tag||'div').toUpperCase(); this.nodeType=1; this.children=[]; this.parent=null;
      this.style={}; this.dataset={}; this._attrs={}; this._listeners={}; this._id=''; this.className=''; this.value='';
      this.textContent=''; this.checked=false; this.disabled=false; this.type=''; this.name=''; this.src=''; this.href='';
      this._innerHTML=''; this._ids={};
      this.classList={add(){},remove(){},toggle(){return false;},contains(){return false;}}; }
    get id(){ return this._id; }
    set id(v){ this._id=String(v); if(v) DOCIDS[String(v)]=this; }
    get innerHTML(){ return this._innerHTML; }
    set innerHTML(v){ this._innerHTML=String(v); this._ids={}; const re=/id="([^"]+)"/g; let m;
      while((m=re.exec(this._innerHTML))){ const el=new FakeElement('div'); el.id=m[1]; this._ids[m[1]]=el; } }
    setAttribute(k,v){ this._attrs[k]=String(v); if(k==='id') this.id=v; }
    getAttribute(k){ return k in this._attrs?this._attrs[k]:null; }
    appendChild(c){ if(c&&typeof c==='object'){ this.children.push(c); c.parent=this; } return c; }
    append(...cs){ cs.flat(9).forEach(c=>this.appendChild(c==null||c===false?null:(c.nodeType?c:{nodeType:3,textContent:String(c)}))); }
    remove(){}
    addEventListener(t,f){ (this._listeners[t]=this._listeners[t]||[]).push(f); }
    removeEventListener(){}
    querySelector(sel){ return (typeof sel==='string'&&sel[0]==='#')?(DOCIDS[sel.slice(1)]||null):null; }
    querySelectorAll(){ return []; }
    closest(){ return null; }
    getContext(){ return null; }
    toDataURL(){ return 'data:image/jpeg;base64,FAKE'; }
    click(){} focus(){}
  }
  const storeData = {};
  const sb = {};
  sb.window=sb; sb.self=sb; sb.globalThis=sb;
  sb.console={ log(){},info(){},warn(){}, error(...a){ errs.push(a.map(String).join(' ')); }, debug(){} };
  sb.document={ readyState:'complete', title:'', body:new FakeElement('body'), head:new FakeElement('head'),
    documentElement:new FakeElement('html'),
    createElement:t=>new FakeElement(t), createTextNode:t=>({nodeType:3,textContent:String(t)}),
    getElementById:id=>DOCIDS[id]||null,
    querySelector:sel=>(typeof sel==='string'&&sel[0]==='#')?(DOCIDS[sel.slice(1)]||null):null,
    querySelectorAll:()=>[], addEventListener(){}, removeEventListener(){} };
  sb.navigator={ onLine:true, userAgent:'node', geolocation:{ getCurrentPosition:okCb=>{ if(okCb) okCb({coords:{latitude:31.5204,longitude:74.3587,accuracy:10}}); }, watchPosition:()=>1, clearWatch(){} },
    mediaDevices:{ getUserMedia:async()=>{ throw new Error('no camera'); } } };
  sb.location={ hash:'#/dashboard', href:'about:blank' };
  sb.localStorage={ getItem:k=>(k in storeData?storeData[k]:null), setItem:(k,v)=>{storeData[k]=String(v);}, removeItem:k=>{delete storeData[k];}, clear:()=>{for(const k in storeData)delete storeData[k];} };
  sb.sessionStorage={ getItem:()=>null, setItem(){}, removeItem(){}, clear(){} };
  const chain=()=>({setView(){return this;},addTo(){return this;},bindPopup(){return this;},openPopup(){return this;},invalidateSize(){return this;},remove(){return this;}});
  sb.L={ map:chain, tileLayer:chain, marker:chain, circle:chain, circleMarker:chain, icon:()=>({}) };
  sb.Chart=function(){ return {destroy(){},update(){}}; };
  sb.setTimeout=setTimeout; sb.clearTimeout=clearTimeout; sb.setInterval=setInterval; sb.clearInterval=clearInterval;
  sb.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),0); sb.cancelAnimationFrame=id=>clearTimeout(id);
  sb.performance=performance; sb.URLSearchParams=URLSearchParams; sb.URL=URL; sb.Blob=Blob;
  sb.scrollTo=()=>{}; sb.print=()=>{}; sb.open=()=>null; sb.alert=()=>{}; sb.confirm=()=>true;
  sb.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  sb.getComputedStyle=()=>({getPropertyValue:()=>''});
  sb.addEventListener=()=>{}; sb.removeEventListener=()=>{};
  vm.createContext(sb);
  vm.runInContext(code, sb, { filename: 'app-combined.js' });

  const { API, Session, App, MockAPI, MockDB } = sb;
  const r = await API.call('login', 'DEMO', 'admin', 'admin123');
  Session.user = { ...r.user, token: r.token };
  Session.bootstrap = await API.call('getBootstrap');
  const empId = Session.user.employeeId; // 'e3'
  ok('login ok, employeeId=' + empId, empId === 'e3');
  sb.location.hash = '#/punch';
  await App.boot(); // renders shell (incl. #view); hash drives the route

  const punchEls = () => {
    const keys = Object.keys(DOCIDS);
    const find = suf => DOCIDS[keys.filter(k => k.endsWith(suf)).sort().pop()];
    return { btnIn: find('-in'), btnOut: find('-out'), msg: find('-msg') };
  };
  const renderPunch = async () => { sb.location.hash = '#/punch'; await App.route(); };

  /* ---------- (b) duplicate-punch guard ---------- */
  sb.localStorage.removeItem('ams_lastpunch'); sb.localStorage.removeItem('ams_queue');
  await renderPunch();
  let { btnIn, msg } = punchEls();
  ok('punch page buttons found', !!(btnIn && msg));
  await btnIn.onclick(); // first check-in
  const after1 = msg.innerHTML;
  ok('first check-in succeeds', /Checked in/.test(after1), after1.slice(0, 120));
  await btnIn.onclick(); // second check-in within 5 min
  const after2 = msg.innerHTML;
  ok('duplicate check-in blocked', /Duplicate blocked/.test(after2), after2.slice(0, 140));

  // server-side mirror: MockAPI.punch twice -> second throws
  sb.localStorage.removeItem('ams_lastpunch');
  let threw = false;
  try { MockAPI.punch('e4', 'in', 31.5204, 74.3587, null, '', 'gps'); MockAPI.punch('e4', 'in', 31.5204, 74.3587, null, '', 'gps'); }
  catch (e) { threw = /Duplicate/.test(e.message); }
  ok('MockAPI server dup guard throws', threw);

  /* ---------- (c) offline queue ---------- */
  sb.localStorage.removeItem('ams_lastpunch'); sb.localStorage.removeItem('ams_queue');
  const attBefore = MockDB.attendance.length;
  sb.navigator.onLine = false;
  await renderPunch();
  let els = punchEls();
  await els.btnOut.onclick(); // offline check-out -> queued
  const q1 = JSON.parse(sb.localStorage.getItem('ams_queue') || '[]');
  ok('offline punch lands in queue', q1.length === 1 && q1[0].type === 'out' && q1[0].employeeId === empId, 'queue=' + q1.length);
  ok('offline punch NOT sent to server yet', MockDB.attendance.length === attBefore);
  sb.navigator.onLine = true;
  await renderPunch(); // route render calls syncQueue -> drains
  await new Promise(res => setTimeout(res, 400)); // let the async drain finish
  const q2 = JSON.parse(sb.localStorage.getItem('ams_queue') || '[]');
  ok('queue drains when back online', q2.length === 0, 'queue=' + q2.length);
  ok('queued punch synced to server', MockDB.attendance.length === attBefore + 1 && MockDB.attendance[MockDB.attendance.length - 1].type === 'out');

  ok('no console.error during punch tests', errs.length === 0, errs.slice(0, 2).join(' | ').slice(0, 200));

  console.log(failures.length ? '\nPUNCH TESTS FAILURES: ' + failures.join('; ') : '\nPUNCH TESTS: ALL PASS');
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
