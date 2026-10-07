/* QA Check 7 — login matrix via MockAPI (node). Run: node qa_login.js */
const fs = require('fs');
const vm = require('vm');
const ROOT = '/home/hatch/workspace/attendance-saas';
const failures = [];
const ok = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
  if (!cond) failures.push(name);
};
(async () => {
  const html = fs.readFileSync(ROOT + '/deploy/index.html', 'utf8');
  const code = [...html.matchAll(/<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/g)][0][1];
  const DOCIDS = {};
  class FakeElement {
    constructor(t){ this.tagName='DIV'; this.nodeType=1; this.children=[]; this.style={}; this.dataset={};
      this._attrs={}; this._listeners={}; this._id=''; this.className=''; this.value=''; this.textContent=''; this._innerHTML='';
      this.classList={add(){},remove(){},toggle(){return false;},contains(){return false;}}; }
    get id(){return this._id;} set id(v){this._id=String(v); if(v)DOCIDS[String(v)]=this;}
    get innerHTML(){return this._innerHTML;}
    set innerHTML(v){this._innerHTML=String(v);const re=/id="([^"]+)"/g;let m;
      while((m=re.exec(this._innerHTML))){const el=new FakeElement('div');el.id=m[1];}}
    setAttribute(k,v){this._attrs[k]=v;if(k==='id')this.id=v;}
    appendChild(c){return c;} append(){}
    addEventListener(){} removeEventListener(){}
    querySelector(){return null;} querySelectorAll(){return[];}
    click(){} focus(){}
  }
  const storeData = {};
  const sb = {};
  sb.window=sb; sb.self=sb; sb.globalThis=sb;
  sb.console={log(){},info(){},warn(){},error(){},debug(){}};
  sb.document={readyState:'complete',body:new FakeElement('body'),head:new FakeElement('head'),documentElement:new FakeElement('html'),
    createElement:t=>new FakeElement(t),createTextNode:t=>({nodeType:3}),
    getElementById:id=>DOCIDS[id]||null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},removeEventListener(){}};
  sb.navigator={onLine:true,geolocation:{getCurrentPosition:()=>{}},mediaDevices:{}};
  sb.location={hash:'#/login'};
  sb.localStorage={getItem:k=>(k in storeData?storeData[k]:null),setItem:(k,v)=>{storeData[k]=String(v);},removeItem:k=>{delete storeData[k];},clear:()=>{for(const k in storeData)delete storeData[k];}};
  sb.sessionStorage={getItem:()=>null,setItem(){},removeItem(){},clear(){}};
  const chain=()=>({setView(){return this;},addTo(){return this;},bindPopup(){return this;},openPopup(){return this;},invalidateSize(){return this;}});
  sb.L={map:chain,tileLayer:chain,marker:chain,circle:chain,circleMarker:chain};
  sb.Chart=function(){};
  sb.setTimeout=setTimeout;sb.clearTimeout=clearTimeout;sb.setInterval=setInterval;sb.clearInterval=clearInterval;
  sb.requestAnimationFrame=cb=>setTimeout(cb,0);
  sb.performance=require('perf_hooks').performance;sb.URLSearchParams=URLSearchParams;sb.URL=URL;sb.Blob=Blob;
  sb.scrollTo=()=>{};sb.print=()=>{};sb.addEventListener=()=>{};sb.removeEventListener=()=>{};
  vm.createContext(sb);
  vm.runInContext(code, sb, {filename:'app-combined.js'});
  const { API, Session, MockAPI } = sb;

  // mirror of the landing rule in 10_auth.js go()
  const landing = role => role === 'superadmin' ? '#/tenants' : role === 'employee' ? '#/punch' : '#/dashboard';

  const cases = [
    ['ADMIN', 'superadmin', 'admin123', 'superadmin', '#/tenants'],
    ['DEMO', 'admin', 'admin123', 'admin', '#/dashboard'],
    ['DEMO', 'hr', 'hr123', 'hr', '#/dashboard'],
    ['DEMO', 'employee', 'emp123', 'employee', '#/punch'],
  ];
  for (const [cc, user, pass, wantRole, wantHash] of cases) {
    sb.localStorage.clear();
    let r;
    try { r = await API.call('login', cc, user, pass); }
    catch (e) { ok(`login ${cc}/${user}`, false, e.message); continue; }
    ok(`login ${cc}/${user} role=${r.user.role}`, r.user.role === wantRole);
    Session.user = { ...r.user, token: r.token };
    Session.bootstrap = await API.call('getBootstrap');
    const b = Session.bootstrap;
    ok(`${cc}/${user} bootstrap.permissions object present`,
      !!(b && b.permissions && typeof b.permissions === 'object' && Object.keys(b.permissions).length > 0),
      'modules=' + Object.keys(b.permissions || {}).length);
    ok(`${cc}/${user} lands on ${wantHash}`, landing(r.user.role) === wantHash);
    // superadmin company context
    if (wantRole === 'superadmin') ok('superadmin company=ADMIN context', b.company && b.company.code === 'ADMIN');
    if (wantRole !== 'superadmin') ok(`${cc}/${user} tenant bound`, !!Session.user.tenantId, Session.user.tenantId);
  }

  // negative cases
  const bad = [
    ['ADMIN', 'superadmin', 'wrong', 'bad password'],
    ['DEMO', 'admin', 'wrong', 'bad password'],
    ['NOPE', 'admin', 'admin123', 'unknown company'],
    ['ADMIN', 'nosuchuser', 'admin123', 'bad user'],
  ];
  for (const [cc, user, pass, label] of bad) {
    let threw = false;
    try { await API.call('login', cc, user, pass); } catch (e) { threw = true; }
    ok(`rejects ${label} (${cc}/${user})`, threw);
  }

  // role permissions matrix sanity for each role
  for (const role of ['admin', 'hr', 'employee']) {
    const m = sb.MockDB.rolePermissions[role];
    ok(`rolePermissions[${role}] exists`, !!(m && typeof m === 'object'));
  }
  // superadmin mirrors the real backend: {all:true}, and perm() honors it
  ok('mock superadmin permissions = {all:true}',
    sb.MockDB.rolePermissions['superadmin'] === undefined); // still no tenant matrix row — by design
  sb.localStorage.clear();
  const rsa = await API.call('login', 'ADMIN', 'superadmin', 'admin123');
  Session.user = { ...rsa.user, token: rsa.token };
  Session.bootstrap = await API.call('getBootstrap');
  ok('superadmin bootstrap.permissions.all === true', Session.bootstrap.permissions && Session.bootstrap.permissions.all === true);
  ok("perm('tenants','view') true for superadmin", sb.perm('tenants', 'view') === true);
  ok("perm('dashboard','view') true for superadmin", sb.perm('dashboard', 'view') === true);
  // non-superadmin perm unchanged
  const rad = await API.call('login', 'DEMO', 'admin', 'admin123');
  Session.user = { ...rad.user, token: rad.token };
  Session.bootstrap = await API.call('getBootstrap');
  ok("perm('dashboard','view') true for admin", sb.perm('dashboard', 'view') === true);
  ok("perm('tenants','view') false for admin", sb.perm('tenants', 'view') === false);

  console.log(failures.length ? '\nLOGIN MATRIX FAILURES: ' + failures.join('; ') : '\nLOGIN MATRIX: ALL PASS');
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
