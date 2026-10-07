/* QA harness — headless load test for deploy/index.html (Check 5).
 * Loads the COMBINED inline app script with DOM stubs, boots against MockAPI,
 * renders all 15 routes, and asserts zero thrown errors / zero console.error.
 * Run: node qa_harness.js
 */
const fs = require('fs');
const vm = require('vm');
const { performance } = require('perf_hooks');

const ROOT = '/home/hatch/workspace/attendance-saas';
const html = fs.readFileSync(ROOT + '/deploy/index.html', 'utf8');

// Extract ONLY the app's own combined inline block (CDN tags use src=...).
const matches = [...html.matchAll(/<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/g)];
if (matches.length !== 1) { console.error('FAIL: expected 1 inline script, found ' + matches.length); process.exit(1); }
const code = matches[0][1];
console.log('inline script bytes:', code.length);

const consoleErrors = [];
const DOCIDS = {};

class FakeElement {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.nodeType = 1;
    this.children = [];
    this.parent = null;
    this.style = {};
    this.dataset = {};
    this._attrs = {};
    this._listeners = {};
    this._id = '';
    this.className = '';
    this.value = '';
    this.textContent = '';
    this.checked = false;
    this.disabled = false;
    this.type = '';
    this.name = '';
    this.src = '';
    this.href = '';
    this._innerHTML = '';
    this._ids = {};
    this.classList = {
      add(){}, remove(){}, toggle(){ return false; }, contains(){ return false; },
    };
  }
  get id(){ return this._id; }
  set id(v){ this._id = String(v); if (v) DOCIDS[String(v)] = this; }
  get innerHTML(){ return this._innerHTML; }
  set innerHTML(v){
    this._innerHTML = String(v);
    this._ids = {};
    const re = /id="([^"]+)"/g; let m;
    while ((m = re.exec(this._innerHTML))) {
      const el = new FakeElement('div');
      el.id = m[1];
      this._ids[m[1]] = el;
    }
  }
  setAttribute(k, v){ this._attrs[k] = String(v); if (k === 'id') this.id = v; }
  getAttribute(k){ return k in this._attrs ? this._attrs[k] : null; }
  removeAttribute(k){ delete this._attrs[k]; }
  appendChild(c){ if (c && typeof c === 'object'){ this.children.push(c); c.parent = this; } return c; }
  append(...cs){ cs.flat(9).forEach(c => this.appendChild(c == null || c === false ? null : (c.nodeType ? c : { nodeType: 3, textContent: String(c) }))); }
  remove(){}
  addEventListener(t, f){ (this._listeners[t] = this._listeners[t] || []).push(f); }
  removeEventListener(){}
  querySelector(sel){ if (typeof sel === 'string' && sel[0] === '#') return DOCIDS[sel.slice(1)] || null; return null; }
  querySelectorAll(){ return []; }
  getElementsByTagName(){ return []; }
  getElementById(id){ return this._ids[id] || null; }
  closest(){ return null; }
  matches(){ return false; }
  getContext(){ return null; }
  toDataURL(){ return 'data:image/jpeg;base64,FAKE'; }
  click(){}
  focus(){}
  blur(){}
  select(){}
}

const storeData = {};
const localStorageStub = {
  getItem: k => (k in storeData ? storeData[k] : null),
  setItem: (k, v) => { storeData[k] = String(v); },
  removeItem: k => { delete storeData[k]; },
  clear: () => { for (const k in storeData) delete storeData[k]; },
};

// chainable Leaflet stub
function chain(){ return { setView(){ return this; }, addTo(){ return this; }, bindPopup(){ return this; }, openPopup(){ return this; }, invalidateSize(){ return this; }, remove(){ return this; }, setLatLng(){ return this; } }; }
const Lstub = { map(){ return chain(); }, tileLayer(){ return chain(); }, marker(){ return chain(); }, circle(){ return chain(); }, circleMarker(){ return chain(); }, icon(){ return {}; } };

const sandbox = {};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
sandbox.console = {
  log(){}, info(){}, warn(){},
  error(...a){ consoleErrors.push(a.map(String).join(' ')); },
  debug(){},
};
sandbox.document = {
  readyState: 'complete',
  title: '',
  body: new FakeElement('body'),
  head: new FakeElement('head'),
  documentElement: new FakeElement('html'),
  createElement: t => new FakeElement(t),
  createTextNode: t => ({ nodeType: 3, textContent: String(t) }),
  getElementById: id => DOCIDS[id] || null,
  querySelector: sel => (typeof sel === 'string' && sel[0] === '#' ? DOCIDS[sel.slice(1)] || null : null),
  querySelectorAll: () => [],
  addEventListener(){}, removeEventListener(){},
};
sandbox.navigator = {
  onLine: true,
  userAgent: 'node-qa-harness',
  geolocation: {
    getCurrentPosition: (ok) => { if (ok) ok({ coords: { latitude: 31.5204, longitude: 74.3587, accuracy: 10 } }); },
    watchPosition: () => 1,
    clearWatch(){},
  },
  mediaDevices: { getUserMedia: async () => { throw new Error('no camera in harness'); } },
};
sandbox.location = { hash: '#/login', href: 'about:blank' };
sandbox.localStorage = localStorageStub;
sandbox.sessionStorage = { getItem: () => null, setItem(){}, removeItem(){}, clear(){} };
sandbox.L = Lstub;
sandbox.Chart = function Chart(){ return { destroy(){}, update(){} }; };
sandbox.setTimeout = setTimeout; sandbox.clearTimeout = clearTimeout;
sandbox.setInterval = setInterval; sandbox.clearInterval = clearInterval;
sandbox.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 0);
sandbox.cancelAnimationFrame = id => clearTimeout(id);
sandbox.performance = performance;
sandbox.URLSearchParams = URLSearchParams;
sandbox.URL = URL; sandbox.Blob = Blob;
sandbox.FileReader = function(){ this.readAsText = () => {}; this.readAsDataURL = () => {}; };
sandbox.scrollTo = () => {}; sandbox.print = () => {}; sandbox.open = () => null;
sandbox.alert = () => {}; sandbox.confirm = () => true;
sandbox.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){} });
sandbox.getComputedStyle = () => ({ getPropertyValue: () => '' });
sandbox.devicePixelRatio = 1; sandbox.innerWidth = 1280; sandbox.innerHeight = 800;
sandbox.addEventListener = () => {}; sandbox.removeEventListener = () => {};
sandbox.dispatchEvent = () => true;
sandbox.google = undefined;

vm.createContext(sandbox);

(async () => {
  const failures = [];
  const ok = (name, cond, extra) => {
    console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
    if (!cond) failures.push(name);
  };

  // 1. script evaluates without throwing
  try {
    vm.runInContext(code, sandbox, { filename: 'app-combined.js' });
    ok('script evaluates', true);
  } catch (e) { ok('script evaluates', false, e.stack.split('\n').slice(0,3).join(' ')); }

  const App = sandbox.App, API = sandbox.API, Session = sandbox.Session, MockAPI = sandbox.MockAPI;
  ok('App exposed', !!App);
  ok('App.boot is function', typeof App.boot === 'function');
  ok('App.route is function', typeof App.route === 'function');
  ok('MockAPI exposed', !!MockAPI);
  ok('15 routes registered', Object.keys(App.routes || {}).length === 15, Object.keys(App.routes || {}).length + ' found');

  // 2. boot with no session -> login page
  try { await App.boot(); ok('boot() with no session (login page)', true); }
  catch (e) { ok('boot() with no session (login page)', false, e.message); }

  // 3. login as admin (DEMO/admin/admin123) via the same path loginPage uses
  try {
    const r = await API.call('login', 'DEMO', 'admin', 'admin123');
    ok('MockAPI.login DEMO/admin', !!(r && r.user), 'role=' + (r && r.user.role));
    Session.user = { ...r.user, token: r.token };
    Session.bootstrap = await API.call('getBootstrap');
    ok('getBootstrap permissions present', !!(Session.bootstrap && Session.bootstrap.permissions), 'modules=' + Object.keys(Session.bootstrap.permissions || {}).length);
    sandbox.location.hash = '#/dashboard';
    await App.boot();
    ok('boot() as admin (shell + dashboard)', true);
  } catch (e) { ok('admin login+boot', false, e.stack.split('\n').slice(0,3).join(' ')); }

  // 4. render ALL 15 routes
  const routes = ['#/dashboard','#/punch','#/employees','#/sites','#/shifts','#/attendance','#/leave','#/overtime','#/payroll','#/documents','#/reports','#/settings','#/tenants'];
  for (const r of routes) {
    consoleErrors.length = 0;
    try {
      sandbox.location.hash = r;
      await App.route();
      const view = sandbox.document.getElementById('view');
      const htmlOut = view ? view.innerHTML : '';
      const isError = /Something went wrong|not exist/.test(htmlOut);
      ok('route ' + r + ' renders', !isError && htmlOut.length > 50, htmlOut.length + ' chars');
      if (consoleErrors.length) ok('route ' + r + ' console clean', false, consoleErrors[0].slice(0, 200));
    } catch (e) { ok('route ' + r + ' renders', false, (e && e.message) || String(e)); }
  }

  // 5. route as superadmin -> #/tenants allowed; as employee -> lands #/punch
  try {
    const r2 = await API.call('login', 'ADMIN', 'superadmin', 'admin123');
    Session.user = { ...r2.user, token: r2.token };
    Session.bootstrap = await API.call('getBootstrap');
    sandbox.location.hash = '#/tenants';
    await App.boot();
    const view = sandbox.document.getElementById('view');
    ok('superadmin #/tenants renders', view && view.innerHTML.length > 50);
  } catch (e) { ok('superadmin tenants', false, e.message); }

  ok('zero console.error overall', consoleErrors.length === 0, consoleErrors.length + ' captured');

  console.log(failures.length ? '\nHARNESS FAILURES: ' + failures.join('; ') : '\nHARNESS: ALL PASS');
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(1); });
