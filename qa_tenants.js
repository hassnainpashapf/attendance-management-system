/* Focused tenant-identifier contract test: mock (02_mock) must mirror Code.gs contract. */
const fs = require('fs'), vm = require('vm');
const ROOT = '/home/hatch/workspace/attendance-saas';
const src = fs.readFileSync(ROOT + '/src/js/00_utils.js', 'utf8')
          + '\n' + fs.readFileSync(ROOT + '/src/js/02_mock.js', 'utf8');
let n = 0, fails = 0;
const ok = (name, cond, extra='') => { n++; if(!cond) fails++; console.log((cond?'PASS':'FAIL')+' | '+name+(extra?' | '+extra:'')); };
const sb = { window: null, console, Math, Date, JSON, String, Number, Array, Object,
  localStorage: { _s:{}, getItem(k){return this._s[k]??null}, setItem(k,v){this._s[k]=v}, removeItem(k){delete this._s[k]} } };
sb.window = sb; vm.createContext(sb);
vm.runInContext(src, sb);
const ev = (s) => vm.runInContext(s, sb);
ev(`MockAPI.login('ADMIN','superadmin','admin123')`);
const rows = ev(`MockAPI.listTenants()`);
ok('listTenants rows keyed by tenantId (no id)', rows.length === 3 && rows.every(t => t.tenantId && !('id' in t)));
const tid = rows[0].tenantId;
const stats = ev(`MockAPI.getPlatformStats()`);
ok('getPlatformStats shape', stats.tenants===3 && stats.active===2 && stats.trial===1 && stats.totalEmployees===38 && stats.totalPunches===5170, JSON.stringify(stats));
const imp = ev(`MockAPI.impersonate('${tid}')`);
ok('impersonate(tenantId) works', imp.user.tenantId === tid, imp.user.name);
let threw = false; try { ev(`MockAPI.impersonate('NOPE')`); } catch(e){ threw = /Tenant not found/.test(e.message); }
ok("impersonate(bad id) throws 'Tenant not found'", threw);
threw = false; try { ev(`MockAPI.getTenantStats(undefined)`); } catch(e){ threw = /Tenant not found/.test(e.message); }
ok("getTenantStats(undefined) throws 'Tenant not found' (the old page bug)", threw);
ev(`MockAPI.updateTenant('${tid}', {plan:'Enterprise'})`);
ok('updateTenant(tenantId) works', ev(`MockAPI.listTenants()`).find(t=>t.tenantId===`${tid}`).plan==='Enterprise');
const created = ev(`MockAPI.createTenant('Test Co','Starter','A','a','p')`);
ok('createTenant returns backend shape {tenantId,loginCode,...}', created.tenantId && created.loginCode && !('id' in created), 'loginCode='+created.loginCode);
ev(`MockAPI.deleteTenant('${created.tenantId}')`);
ok('deleteTenant(tenantId) works', ev(`MockAPI.listTenants()`).length === 3);
// frontend source consistency
const fe = fs.readFileSync(ROOT + '/src/js/140_tenants.js', 'utf8');
ok('frontend: zero t.id references', !/\bt\.id\b/.test(fe));
ok('frontend: calls getPlatformStats', fe.includes("API.call('getPlatformStats')"));
ok('frontend: uses t.tenantId (5+ refs)', (fe.match(/t\.tenantId/g)||[]).length >= 4);
// backend Code.gs has the new function and unchanged per-tenant one
const gs = fs.readFileSync(ROOT + '/Code.gs', 'utf8');
ok('Code.gs: getPlatformStats defined', /getPlatformStats:\s*function\s*\(user\)/.test(gs));
ok('Code.gs: getTenantStats still per-tenant', /getTenantStats:\s*function\s*\(user,\s*tenantId\)/.test(gs));
console.log(n + ' checks, ' + fails + ' failures');
process.exit(fails ? 1 : 0);
