/* 02_mock.js — MockAPI implementing EVERY API contract function with realistic
   demo data ("Demo Construction Co"). Lets all pages render standalone. */
(function(){
'use strict';

/* ---------------- seed data ---------------- */
const DB = {
  tenants:[
    {id:'t_demo', companyName:'Demo Construction Co', loginCode:'DEMO', plan:'Growth', status:'active', createdAt:'2026-01-10', users:11, employees:10, punches:1840},
    {id:'t_acme', companyName:'Acme Logistics Ltd', loginCode:'ACME', plan:'Starter', status:'active', createdAt:'2026-03-02', users:4, employees:22, punches:3120},
    {id:'t_nova', companyName:'Nova Retail Group', loginCode:'NOVA', plan:'Growth', status:'trial', createdAt:'2026-09-18', users:2, employees:6, punches:210},
  ],
  users:[
    {id:'u_admin', name:'Admin User', username:'admin', password:'admin123', role:'admin', employeeId:'e3', tenantId:'t_demo'},
    {id:'u_hr', name:'HR Manager', username:'hr', password:'hr123', role:'hr', employeeId:'e9', tenantId:'t_demo'},
    {id:'u_emp', name:'Usman Tariq', username:'employee', password:'emp123', role:'employee', employeeId:'e3', tenantId:'t_demo'},
  ],
  departments:[
    {id:'d1', name:'Site Operations'},
    {id:'d2', name:'Engineering'},
    {id:'d3', name:'Administration'},
    {id:'d4', name:'Security'},
  ],
  sites:[
    {id:'s1', name:'Head Office', address:'Main Boulevard, Gulberg, Lahore', lat:31.5204, lng:74.3587, radiusM:150, active:true},
    {id:'s2', name:'Site A — DHA Phase 5', address:'DHA Phase 5, Lahore', lat:31.4697, lng:74.3944, radiusM:300, active:true},
    {id:'s3', name:'Site B — Bahria Town', address:'Bahria Town Sector C, Lahore', lat:31.3653, lng:74.1800, radiusM:300, active:true},
  ],
  siteEmployees:[
    {siteId:'s1', employeeId:'e6'},{siteId:'s1', employeeId:'e9'},{siteId:'s1', employeeId:'e3'},
    {siteId:'s2', employeeId:'e1'},{siteId:'s2', employeeId:'e2'},{siteId:'s2', employeeId:'e4'},
    {siteId:'s2', employeeId:'e7'},{siteId:'s2', employeeId:'e8'},
    {siteId:'s3', employeeId:'e5'},{siteId:'s3', employeeId:'e10'},{siteId:'s3', employeeId:'e7'},
  ],
  employees:[
    {id:'e1', name:'Ahmed Raza', code:'EMP-001', departmentId:'d1', designation:'Mason', phone:'0300-1234567', email:'ahmed.raza@example.com', salary:45000, joinDate:'2023-01-15', deviceId:'ZK-1001', active:true},
    {id:'e2', name:'Bilal Hussain', code:'EMP-002', departmentId:'d1', designation:'Electrician', phone:'0301-2345678', email:'bilal.h@example.com', salary:48000, joinDate:'2023-02-20', deviceId:'ZK-1002', active:true},
    {id:'e3', name:'Usman Tariq', code:'EMP-003', departmentId:'d2', designation:'Site Engineer', phone:'0302-3456789', email:'usman.t@example.com', salary:95000, joinDate:'2022-06-01', deviceId:'', active:true},
    {id:'e4', name:'Faisal Mehmood', code:'EMP-004', departmentId:'d1', designation:'Plumber', phone:'0303-4567890', email:'faisal.m@example.com', salary:43000, joinDate:'2023-04-11', deviceId:'', active:true},
    {id:'e5', name:'Imran Khan', code:'EMP-005', departmentId:'d4', designation:'Security Guard', phone:'0304-5678901', email:'imran.k@example.com', salary:38000, joinDate:'2022-11-05', deviceId:'ZK-1005', active:true},
    {id:'e6', name:'Sanaullah', code:'EMP-006', departmentId:'d3', designation:'Accountant', phone:'0305-6789012', email:'sanaullah@example.com', salary:70000, joinDate:'2022-03-14', deviceId:'', active:true},
    {id:'e7', name:'Kamran Ali', code:'EMP-007', departmentId:'d2', designation:'Supervisor', phone:'0306-7890123', email:'kamran.a@example.com', salary:80000, joinDate:'2021-09-01', deviceId:'', active:true},
    {id:'e8', name:'Naveed Akhtar', code:'EMP-008', departmentId:'d1', designation:'Helper', phone:'0307-8901234', email:'naveed.a@example.com', salary:35000, joinDate:'2024-01-08', deviceId:'', active:true},
    {id:'e9', name:'Ayesha Siddiqui', code:'EMP-009', departmentId:'d3', designation:'HR Officer', phone:'0308-9012345', email:'ayesha.s@example.com', salary:75000, joinDate:'2022-08-22', deviceId:'', active:true},
    {id:'e10', name:'Danish Nawaz', code:'EMP-010', departmentId:'d4', designation:'Security Guard', phone:'0309-0123456', email:'danish.n@example.com', salary:38000, joinDate:'2024-05-19', deviceId:'', active:true},
  ],
  shifts:[
    {id:'sh1', name:'Morning Shift', startTime:'08:00', endTime:'17:00', graceMin:15},
    {id:'sh2', name:'Evening Shift', startTime:'14:00', endTime:'22:00', graceMin:15},
    {id:'sh3', name:'Night Shift', startTime:'22:00', endTime:'06:00', graceMin:20},
  ],
  rosters:[],
  attendance:[],
  corrections:[
    {id:'c1', punchId:'p_seed_1', employeeId:'e4', note:'Missed check-out — left site at 17:05, forgot to punch', status:'pending', decidedBy:'', decidedAt:''},
  ],
  leaveTypes:[
    {id:'lt1', name:'Annual Leave', quota:14, paid:true},
    {id:'lt2', name:'Sick Leave', quota:10, paid:true},
    {id:'lt3', name:'Casual Leave', quota:7, paid:true},
    {id:'lt4', name:'Unpaid Leave', quota:0, paid:false},
  ],
  leaveBalances:[
    {employeeId:'e1', year:2026, typeId:'lt1', used:4},{employeeId:'e1', year:2026, typeId:'lt2', used:2},
    {employeeId:'e3', year:2026, typeId:'lt1', used:8},{employeeId:'e5', year:2026, typeId:'lt3', used:3},
  ],
  leaveRequests:[
    {id:'lr1', employeeId:'e1', typeId:'lt1', from:'2026-10-12', to:'2026-10-14', days:3, reason:'Family wedding in Multan', status:'pending', decidedBy:''},
    {id:'lr2', employeeId:'e5', typeId:'lt2', from:'2026-10-05', to:'2026-10-06', days:2, reason:'Fever — doctor advised rest', status:'approved', decidedBy:'HR Manager'},
    {id:'lr3', employeeId:'e8', typeId:'lt3', from:'2026-10-09', to:'2026-10-09', days:1, reason:'Personal work', status:'pending', decidedBy:''},
  ],
  holidays:[
    {id:'h1', date:'2026-11-09', name:'Iqbal Day'},
    {id:'h2', date:'2026-12-25', name:'Quaid Day / Christmas'},
    {id:'h3', date:'2027-02-05', name:'Kashmir Day'},
  ],
  overtime:[
    {id:'ot1', employeeId:'e1', date:'2026-10-03', hours:3, rate:250, reason:'Concrete pouring extended past shift', status:'pending', approvedBy:''},
    {id:'ot2', employeeId:'e2', date:'2026-10-02', hours:2, rate:270, reason:'Emergency wiring repair', status:'approved', approvedBy:'Admin User'},
    {id:'ot3', employeeId:'e4', date:'2026-10-01', hours:4, rate:240, reason:'Pipeline leak at Site A', status:'rejected', approvedBy:'Admin User'},
  ],
  payComponents:[
    {id:'pc1', name:'Housing Allowance', kind:'allowance', amount:10000, appliesTo:'all', approved:true},
    {id:'pc2', name:'Transport Allowance', kind:'allowance', amount:5000, appliesTo:'all', approved:true},
    {id:'pc3', name:'Income Tax', kind:'deduction', amount:3000, appliesTo:'all', approved:true},
  ],
  payrollRuns:[
    {id:'pr1', month:'2026-09', createdAt:'2026-10-01 10:22', createdBy:'Admin User', status:'finalized'},
  ],
  payslips:[],
  advances:[
    {id:'a1', employeeId:'e1', date:'2026-07-15', amount:30000, installments:6, recovered:15000, status:'open'},
    {id:'a2', employeeId:'e8', date:'2026-09-01', amount:12000, installments:4, recovered:12000, status:'closed'},
  ],
  contractors:[
    {id:'ct1', name:'Rashid Steel Works', company:'Rashid Steel Works', phone:'0321-5551234', rate:900, active:true},
    {id:'ct2', name:'City Painters Co.', company:'City Painters Co.', phone:'0333-5559876', rate:750, active:true},
  ],
  contractorBills:[
    {id:'cb1', contractorId:'ct1', month:'2026-09', amount:184500, status:'pending', note:'Steel fixing — Site A'},
    {id:'cb2', contractorId:'ct2', month:'2026-09', amount:96200, status:'approved', note:'Paint work — Site B'},
  ],
  documents:[
    {id:'d1', employeeId:'e1', title:'CNIC — Ahmed Raza', expiryDate:'2027-03-12'},
    {id:'d2', employeeId:'e3', title:'PEC Registration — Usman Tariq', expiryDate:'2026-10-20'},
    {id:'d3', employeeId:'e5', title:'Driving License — Imran Khan', expiryDate:'2026-09-28'},
    {id:'d4', employeeId:'e2', title:'Trade Certificate — Bilal Hussain', expiryDate:'2027-08-01'},
  ],
  settings:{
    companyName:'Demo Construction Co', address:'Main Boulevard, Gulberg, Lahore', phone:'042-35771234',
    email:'info@democonstruction.example.com', smtpHost:'smtp.gmail.com', smtpPort:'587', smtpUser:'', smtpPass:'',
    googleLoginNote:'Sign in with Google is enabled for admin accounts in production.'
  },
  rolePermissions:{
    admin:{dashboard:{view:1},punch:{view:1},attendance:{view:1,edit:1},employees:{view:1,edit:1},sites:{view:1,edit:1},shifts:{view:1,edit:1},leave:{view:1,edit:1},overtime:{view:1,edit:1},payroll:{view:1,edit:1},documents:{view:1,edit:1},reports:{view:1},settings:{view:1,edit:1}},
    hr:{dashboard:{view:1},punch:{view:1},attendance:{view:1,edit:1},employees:{view:1,edit:1},sites:{view:1},shifts:{view:1,edit:1},leave:{view:1,edit:1},overtime:{view:1,edit:1},payroll:{view:1},documents:{view:1,edit:1},reports:{view:1},settings:{view:1}},
    employee:{dashboard:{view:0},punch:{view:1},attendance:{view:1},employees:{view:0},sites:{view:0},shifts:{view:1},leave:{view:1},overtime:{view:1},payroll:{view:1},documents:{view:0},reports:{view:0},settings:{view:0}},
  },
};

/* deterministic pseudo-random for stable demo data */
let _s=42; function rnd(){ _s=(_s*1103515245+12345)%2147483648; return _s/2147483648; }

/* seed attendance for the last 14 days + today */
(function seedAttendance(){
  const emps=DB.employees.filter(e=>e.active);
  const jitter=(base,amt)=>(base+(rnd()-0.5)*amt).toFixed(6);
  for(let d=14; d>=0; d--){
    const date=addDays(todayISO(),-d);
    const dt=new Date(date+'T12:00:00');
    if(dt.getDay()===5) continue; /* Friday off for demo */
    emps.forEach((e,i)=>{
      if(rnd()<0.08) return; /* absent */
      const siteId=(DB.siteEmployees.find(s=>s.employeeId===e.id)||{}).siteId;
      const site=DB.sites.find(s=>s.id===siteId)||DB.sites[0];
      const ooz=rnd()<0.05;
      const lat=ooz?String(Number(site.lat)+0.02):jitter(site.lat,0.0012);
      const lng=ooz?String(Number(site.lng)+0.02):jitter(site.lng,0.0012);
      const dist=ooz?Math.round(1800+rnd()*900):Math.round(10+rnd()*120);
      const inMin=8*60+Math.round((rnd()-0.35)*40);
      const outMin=17*60+Math.round((rnd()-0.5)*50);
      const hhmm=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
      DB.attendance.push({id:uid('p'), employeeId:e.id, date, type:'in', time:hhmm(inMin), lat, lng, selfie:null, siteId:site.id, distanceM:dist, outOfZone:ooz, source:rnd()<0.7?'gps':'zkteco', deviceId:e.deviceId||'', syncedAt:date+' '+hhmm(inMin), note:''});
      DB.attendance.push({id:uid('p'), employeeId:e.id, date, type:'out', time:hhmm(outMin), lat, lng, selfie:null, siteId:site.id, distanceM:dist, outOfZone:ooz, source:rnd()<0.7?'gps':'zkteco', deviceId:e.deviceId||'', syncedAt:date+' '+hhmm(outMin), note:''});
    });
  }
  DB.rosters=DB.employees.slice(0,8).map(e=>({id:uid('r'), date:todayISO(), employeeId:e.id, shiftId:'sh1', siteId:(DB.siteEmployees.find(s=>s.employeeId===e.id)||{}).siteId||'s1'}));
})();

/* ---------------- helpers ---------------- */
function empById(id){ return DB.employees.find(e=>e.id===id)||{}; }
function siteById(id){ return DB.sites.find(s=>s.id===id)||{}; }
function nearestSite(lat,lng,empId){
  const assigned=DB.siteEmployees.filter(s=>s.employeeId===empId).map(s=>s.siteId);
  const pool=(assigned.length?DB.sites.filter(s=>assigned.includes(s.id)&&s.active):DB.sites.filter(s=>s.active));
  let best=null,bestD=Infinity;
  pool.forEach(s=>{ const d=haversineM(lat,lng,Number(s.lat),Number(s.lng)); if(d!=null&&d<bestD){bestD=d;best=s;} });
  return {site:best, distanceM:best?Math.round(bestD):null};
}
function dupGuard(employeeId,type){
  const now=Date.now();
  return DB.attendance.find(p=>{
    if(p.employeeId!==employeeId||p.type!==type) return false;
    const t=new Date(p.date+'T'+(p.time||'00:00')+':00').getTime();
    const diff=now-t;
    return diff>=0&&diff<5*60*1000;
  });
}

/* ---------------- MockAPI ---------------- */
const MockAPI = {
  /* Auth */
  login(companyCode, username, password){
    const cc=String(companyCode||'').trim().toUpperCase();
    if(cc==='ADMIN'){
      if(username==='superadmin'&&password==='admin123')
        return {user:{id:'sa1', name:'Super Admin', username:'superadmin', role:'superadmin', tenantId:''}, token:'tok_superadmin'};
      throw new Error('Invalid superadmin credentials');
    }
    const t=DB.tenants.find(x=>x.loginCode===cc&&x.status!=='suspended');
    if(!t) throw new Error('Unknown company code');
    const u=DB.users.find(x=>x.username===username&&x.password===password&&x.tenantId===t.id);
    if(!u) throw new Error('Invalid username or password');
    return {user:{id:u.id,name:u.name,username:u.username,role:u.role,tenantId:t.id,employeeId:u.employeeId}, token:'tok_'+u.id};
  },
  getBootstrap(){
    const u=Session.user||{};
    const t=DB.tenants.find(x=>x.id===u.tenantId);
    const role=u.role||'employee';
    /* mirror Code.gs getBootstrap: superadmin gets {all:true}, not a tenant matrix */
    const matrix=role==='superadmin'?{all:true}:(DB.rolePermissions[role]||DB.rolePermissions.employee);
    return {
      user:u,
      company:{name:(u.role==='superadmin')?'SaaS Platform':(t?t.companyName:'Demo Construction Co'), code:(u.role==='superadmin')?'ADMIN':(t?t.loginCode:'DEMO'), tenantId:u.tenantId||''},
      permissions:matrix,
      rolePermissions:DB.rolePermissions,
    };
  },
  impersonate(tenantId){
    const t=DB.tenants.find(x=>x.id===tenantId); if(!t) throw new Error('Tenant not found');
    return {user:{id:'imp_'+t.id, name:'Admin ('+t.companyName+')', username:'admin', role:'admin', tenantId:t.id}, token:'tok_imp_'+t.id};
  },
  stopImpersonation(){ return {ok:true}; },

  /* Superadmin */
  listTenants(){ return DB.tenants.map(t=>({...t})); },
  createTenant(companyName, plan, adminName, adminUser, adminPass){
    const id='t_'+Date.now().toString(36);
    const code=String(companyName||'').replace(/[^A-Za-z]/g,'').slice(0,4).toUpperCase()||'NEWC';
    const t={id, companyName, loginCode:code, plan:plan||'Starter', status:'trial', createdAt:todayISO(), users:1, employees:0, punches:0};
    DB.tenants.push(t);
    DB.users.push({id:uid('u'), name:adminName, username:adminUser, password:adminPass, role:'admin', employeeId:'', tenantId:id});
    return t;
  },
  updateTenant(id, patch){ const t=DB.tenants.find(x=>x.id===id); if(!t) throw new Error('Tenant not found'); Object.assign(t,patch||{}); return t; },
  deleteTenant(id){ const i=DB.tenants.findIndex(x=>x.id===id); if(i<0) throw new Error('Tenant not found'); DB.tenants.splice(i,1); return {ok:true}; },
  getTenantStats(){ return {tenants:DB.tenants.length, active:DB.tenants.filter(t=>t.status==='active').length, trial:DB.tenants.filter(t=>t.status==='trial').length, totalEmployees:DB.tenants.reduce((a,t)=>a+(t.employees||0),0), totalPunches:DB.tenants.reduce((a,t)=>a+(t.punches||0),0)}; },

  /* Employees */
  listEmployees(){ return DB.employees.map(e=>({...e, department:(DB.departments.find(d=>d.id===e.departmentId)||{}).name||'—'})); },
  saveEmployee(emp){
    if(emp.id){ const i=DB.employees.findIndex(e=>e.id===emp.id); if(i<0) throw new Error('Employee not found'); DB.employees[i]={...DB.employees[i],...emp}; return DB.employees[i]; }
    const e={id:uid('e'), active:true, deviceId:'', ...emp}; DB.employees.push(e); return e;
  },
  deleteEmployee(id){ const i=DB.employees.findIndex(e=>e.id===id); if(i<0) throw new Error('Employee not found'); DB.employees.splice(i,1); return {ok:true}; },
  importEmployeesCSV(rows){
    let n=0;
    (rows||[]).forEach(r=>{
      if(!r.name) return;
      DB.employees.push({id:uid('e'), name:r.name, code:r.code||('EMP-'+String(DB.employees.length+1).padStart(3,'0')), departmentId:r.departmentId||'d1', designation:r.designation||'', phone:r.phone||'', email:r.email||'', salary:Number(r.salary)||0, joinDate:r.joinDate||todayISO(), deviceId:'', active:true});
      n++;
    });
    return {imported:n};
  },
  listDepartments(){ return DB.departments.map(d=>({...d, headcount:DB.employees.filter(e=>e.departmentId===d.id).length})); },
  saveDepartment(dep){
    if(dep.id){ const d=DB.departments.find(x=>x.id===dep.id); Object.assign(d,{name:dep.name}); return d; }
    const d={id:uid('d'), name:dep.name}; DB.departments.push(d); return d;
  },
  deleteDepartment(id){
    if(DB.employees.some(e=>e.departmentId===id)) throw new Error('Department has employees — reassign them first');
    DB.departments=DB.departments.filter(d=>d.id!==id); return {ok:true};
  },
  bindDevice(employeeId, deviceId){ const e=empById(employeeId); if(!e.id) throw new Error('Employee not found'); e.deviceId=deviceId; return e; },
  unbindDevice(employeeId){ const e=empById(employeeId); if(!e.id) throw new Error('Employee not found'); e.deviceId=''; return e; },

  /* Sites */
  listSites(){ return DB.sites.map(s=>({...s, employeeCount:DB.siteEmployees.filter(x=>x.siteId===s.id).length, employeeIds:DB.siteEmployees.filter(x=>x.siteId===s.id).map(x=>x.employeeId)})); },
  saveSite(site){
    if(site.id){ const s=DB.sites.find(x=>x.id===site.id); if(!s) throw new Error('Site not found'); Object.assign(s,site); return s; }
    const s={id:uid('s'), active:true, ...site}; DB.sites.push(s); return s;
  },
  deleteSite(id){ DB.sites=DB.sites.filter(s=>s.id!==id); DB.siteEmployees=DB.siteEmployees.filter(x=>x.siteId!==id); return {ok:true}; },
  assignSiteEmployees(siteId, employeeIds){
    DB.siteEmployees=DB.siteEmployees.filter(x=>x.siteId!==siteId);
    (employeeIds||[]).forEach(eid=>DB.siteEmployees.push({siteId, employeeId:eid}));
    return {ok:true, count:(employeeIds||[]).length};
  },

  /* Shifts */
  listShifts(){ return DB.shifts.map(s=>({...s})); },
  saveShift(sh){
    if(sh.id){ const s=DB.shifts.find(x=>x.id===sh.id); Object.assign(s,sh); return s; }
    const s={id:uid('sh'), ...sh}; DB.shifts.push(s); return s;
  },
  deleteShift(id){ DB.shifts=DB.shifts.filter(s=>s.id!==id); return {ok:true}; },
  listRosters(date){ const d=date||todayISO(); return DB.rosters.filter(r=>r.date===d).map(r=>({...r, employeeName:empById(r.employeeId).name, shiftName:(DB.shifts.find(s=>s.id===r.shiftId)||{}).name, siteName:siteById(r.siteId).name})); },
  saveRoster(r){
    if(r.id){ const x=DB.rosters.find(y=>y.id===r.id); Object.assign(x,r); return x; }
    const x={id:uid('r'), ...r}; DB.rosters.push(x); return x;
  },
  deleteRoster(id){ DB.rosters=DB.rosters.filter(r=>r.id!==id); return {ok:true}; },

  /* Attendance */
  punch(employeeId, type, lat, lng, selfie, deviceId, source){
    const e=empById(employeeId); if(!e.id) throw new Error('Employee not found');
    if(e.deviceId && deviceId && e.deviceId!==deviceId) throw new Error('This device is not bound to '+e.name+' (bound: '+e.deviceId+')');
    if(dupGuard(employeeId,type)) throw new Error('Duplicate punch blocked: a "'+type+'" was already recorded in the last 5 minutes');
    const {site, distanceM}=nearestSite(Number(lat),Number(lng),employeeId);
    const outOfZone=site?(distanceM>Number(site.radiusM||150)):false;
    const now=new Date();
    const p={id:uid('p'), employeeId, date:todayISO(), type, time:String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0'),
      lat:String(lat??''), lng:String(lng??''), selfie:selfie||null, siteId:site?site.id:'', distanceM, outOfZone,
      source:source||'gps', deviceId:deviceId||'', syncedAt:now.toISOString(), note:''};
    DB.attendance.push(p);
    return {punch:p, site:site?{id:site.id,name:site.name}:null, outOfZone, distanceM};
  },
  devicePunch(deviceId, employeeId, type, ts){
    const e=empById(employeeId); if(!e.id) throw new Error('Employee not found');
    const p={id:uid('p'), employeeId, date:(ts||'').slice(0,10)||todayISO(), type, time:(ts||'').slice(11,16)||'--:--',
      lat:null, lng:null, selfie:null, siteId:'', distanceM:null, outOfZone:false, source:'zkteco', deviceId:deviceId||'', syncedAt:new Date().toISOString(), note:''};
    DB.attendance.push(p); return {punch:p};
  },
  listAttendance(filters){
    let rows=DB.attendance.slice().sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
    const f=filters||{};
    if(f.from) rows=rows.filter(p=>p.date>=f.from);
    if(f.to) rows=rows.filter(p=>p.date<=f.to);
    if(f.employeeId) rows=rows.filter(p=>p.employeeId===f.employeeId);
    if(f.siteId) rows=rows.filter(p=>p.siteId===f.siteId);
    if(f.outOfZone) rows=rows.filter(p=>p.outOfZone);
    if(f.type) rows=rows.filter(p=>p.type===f.type);
    return rows.slice(0,800).map(p=>({...p, employeeName:empById(p.employeeId).name, employeeCode:empById(p.employeeId).code, siteName:siteById(p.siteId).name||'—'}));
  },
  bulkMark(date, employeeIds, type, note){
    const now=new Date();
    (employeeIds||[]).forEach(eid=>{
      DB.attendance.push({id:uid('p'), employeeId:eid, date, type, time:String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0'),
        lat:null, lng:null, selfie:null, siteId:'', distanceM:null, outOfZone:false, source:'manual', deviceId:'', syncedAt:now.toISOString(), note:note||''});
    });
    return {ok:true, count:(employeeIds||[]).length};
  },
  deletePunch(id){ DB.attendance=DB.attendance.filter(p=>p.id!==id); return {ok:true}; },
  getLiveMap(){
    const t=todayISO();
    return DB.attendance.filter(p=>p.date===t&&p.lat&&p.lng).map(p=>({id:p.id, employeeId:p.employeeId, employeeName:empById(p.employeeId).name, type:p.type, time:p.time, lat:Number(p.lat), lng:Number(p.lng), siteName:siteById(p.siteId).name||'—', outOfZone:p.outOfZone, selfie:!!p.selfie}));
  },
  requestCorrection(punchId, note){
    const p=DB.attendance.find(x=>x.id===punchId); if(!p) throw new Error('Punch not found');
    const c={id:uid('c'), punchId, employeeId:p.employeeId, note:note||'', status:'pending', decidedBy:'', decidedAt:''};
    DB.corrections.push(c); return c;
  },
  listCorrections(status){
    let rows=DB.corrections.slice();
    if(status) rows=rows.filter(c=>c.status===status);
    return rows.map(c=>{ const p=DB.attendance.find(x=>x.id===c.punchId)||{}; return {...c, employeeName:empById(c.employeeId).name, punchDate:p.date||'', punchType:p.type||'', punchTime:p.time||''}; });
  },
  decideCorrection(id, decision){
    const c=DB.corrections.find(x=>x.id===id); if(!c) throw new Error('Request not found');
    c.status=decision; c.decidedBy=(Session.user||{}).name||'Admin'; c.decidedAt=todayISO(); return c;
  },

  /* Leave */
  listLeaveTypes(){ return DB.leaveTypes.map(t=>({...t})); },
  saveLeaveType(t){
    if(t.id){ const x=DB.leaveTypes.find(y=>y.id===t.id); Object.assign(x,{name:t.name,quota:Number(t.quota)||0,paid:!!t.paid}); return x; }
    const x={id:uid('lt'), name:t.name, quota:Number(t.quota)||0, paid:!!t.paid}; DB.leaveTypes.push(x); return x;
  },
  deleteLeaveType(id){ DB.leaveTypes=DB.leaveTypes.filter(t=>t.id!==id); return {ok:true}; },
  getLeaveBalances(year){
    return DB.employees.filter(e=>e.active).map(e=>{
      const bal={employeeId:e.id, employeeName:e.name, employeeCode:e.code, types:DB.leaveTypes.map(t=>{
        const b=DB.leaveBalances.find(x=>x.employeeId===e.id&&x.typeId===t.id);
        return {typeId:t.id, typeName:t.name, quota:t.quota, used:b?b.used:0, left:t.quota-(b?b.used:0)};
      })};
      return bal;
    });
  },
  requestLeave(employeeId, typeId, from, to, reason){
    const days=Math.max(1, Math.round((new Date(to)-new Date(from))/86400000)+1);
    const r={id:uid('lr'), employeeId, typeId, from, to, days, reason:reason||'', status:'pending', decidedBy:''};
    DB.leaveRequests.push(r); return r;
  },
  listLeaveRequests(status){
    let rows=DB.leaveRequests.slice().sort((a,b)=>b.from.localeCompare(a.from));
    if(status) rows=rows.filter(r=>r.status===status);
    return rows.map(r=>({...r, employeeName:empById(r.employeeId).name, typeName:(DB.leaveTypes.find(t=>t.id===r.typeId)||{}).name||'—'}));
  },
  decideLeave(id, decision){
    const r=DB.leaveRequests.find(x=>x.id===id); if(!r) throw new Error('Request not found');
    r.status=decision; r.decidedBy=(Session.user||{}).name||'Admin';
    if(decision==='approved'){
      let b=DB.leaveBalances.find(x=>x.employeeId===r.employeeId&&x.typeId===r.typeId);
      if(!b){ b={employeeId:r.employeeId, year:new Date().getFullYear(), typeId:r.typeId, used:0}; DB.leaveBalances.push(b); }
      b.used+=r.days;
    }
    return r;
  },
  listHolidays(){ return DB.holidays.slice().sort((a,b)=>a.date.localeCompare(b.date)); },
  saveHoliday(hd){
    if(hd.id){ const x=DB.holidays.find(y=>y.id===hd.id); Object.assign(x,{date:hd.date,name:hd.name}); return x; }
    const x={id:uid('h'), date:hd.date, name:hd.name}; DB.holidays.push(x); return x;
  },
  deleteHoliday(id){ DB.holidays=DB.holidays.filter(h=>h.id!==id); return {ok:true}; },

  /* Overtime */
  listOvertime(status){
    let rows=DB.overtime.slice().sort((a,b)=>b.date.localeCompare(a.date));
    if(status) rows=rows.filter(o=>o.status===status);
    return rows.map(o=>({...o, employeeName:empById(o.employeeId).name, amount:o.hours*o.rate}));
  },
  requestOvertime(employeeId, date, hours, rate, reason){
    const o={id:uid('ot'), employeeId, date, hours:Number(hours), rate:Number(rate), reason:reason||'', status:'pending', approvedBy:''};
    DB.overtime.push(o); return o;
  },
  decideOvertime(id, decision){
    const o=DB.overtime.find(x=>x.id===id); if(!o) throw new Error('Request not found');
    o.status=decision; o.approvedBy=(Session.user||{}).name||'Admin'; return o;
  },

  /* Payroll */
  listPayComponents(){ return DB.payComponents.map(c=>({...c})); },
  savePayComponent(c){
    if(c.id){ const x=DB.payComponents.find(y=>y.id===c.id); Object.assign(x,{name:c.name,kind:c.kind,amount:Number(c.amount)||0,appliesTo:c.appliesTo||'all',approved:!!c.approved}); return x; }
    const x={id:uid('pc'), name:c.name, kind:c.kind, amount:Number(c.amount)||0, appliesTo:c.appliesTo||'all', approved:!!c.approved}; DB.payComponents.push(x); return x;
  },
  deletePayComponent(id){ DB.payComponents=DB.payComponents.filter(c=>c.id!==id); return {ok:true}; },
  runPayroll(month, employeeIds){
    const allows=DB.payComponents.filter(c=>c.kind==='allowance'&&c.approved);
    const deducts=DB.payComponents.filter(c=>c.kind==='deduction'&&c.approved);
    const run={id:uid('pr'), month, createdAt:fmtDateTime(new Date().toISOString()), createdBy:(Session.user||{}).name||'Admin', status:'finalized'};
    DB.payrollRuns.push(run);
    (employeeIds||[]).forEach(eid=>{
      const e=empById(eid); if(!e.id) return;
      const allowances=allows.reduce((a,c)=>a+c.amount,0);
      const deductions=deducts.reduce((a,c)=>a+c.amount,0);
      const adv=DB.advances.find(a=>a.employeeId===eid&&a.status==='open');
      const installment=adv?Math.round(adv.amount/adv.installments):0;
      if(adv){ adv.recovered+=installment; if(adv.recovered>=adv.amount){adv.status='closed';} }
      DB.payslips.push({id:uid('ps'), runId:run.id, employeeId:eid, salary:e.salary, allowances, deductions, advanceRecovery:installment, net:e.salary+allowances-deductions-installment, paid:false});
    });
    return run;
  },
  listPayrollRuns(){ return DB.payrollRuns.slice().sort((a,b)=>b.month.localeCompare(a.month)).map(r=>({...r, slipCount:DB.payslips.filter(p=>p.runId===r.id).length, totalNet:DB.payslips.filter(p=>p.runId===r.id).reduce((a,p)=>a+p.net,0)})); },
  getPayslip(runId, employeeId){
    const p=DB.payslips.find(x=>x.runId===runId&&x.employeeId===employeeId);
    if(!p) throw new Error('Payslip not found');
    const run=DB.payrollRuns.find(r=>r.id===runId)||{};
    const e=empById(employeeId);
    return {...p, month:run.month, employeeName:e.name, employeeCode:e.code, designation:e.designation, department:(DB.departments.find(d=>d.id===e.departmentId)||{}).name};
  },
  markPayslipPaid(runId, employeeId){ const p=DB.payslips.find(x=>x.runId===runId&&x.employeeId===employeeId); if(p) p.paid=true; return {ok:true}; },
  listAdvances(){ return DB.advances.map(a=>({...a, employeeName:empById(a.employeeId).name, balance:a.amount-a.recovered})); },
  grantAdvance(employeeId, amount, installments){
    const a={id:uid('a'), employeeId, date:todayISO(), amount:Number(amount), installments:Number(installments)||1, recovered:0, status:'open'};
    DB.advances.push(a); return a;
  },
  finalSettlement(employeeId){
    const e=empById(employeeId); if(!e.id) throw new Error('Employee not found');
    const advOpen=DB.advances.filter(a=>a.employeeId===employeeId&&a.status==='open');
    const advDue=advOpen.reduce((a,x)=>a+(x.amount-x.recovered),0);
    const pendingOT=DB.overtime.filter(o=>o.employeeId===employeeId&&o.status==='approved').reduce((a,o)=>a+o.hours*o.rate,0);
    const daysWorked=new Date().getDate();
    const proRata=Math.round(e.salary/30*daysWorked);
    return {employee:e, proRataSalary:proRata, pendingOvertime:pendingOT, advanceDue:advDue, netPayable:proRata+pendingOT-advDue, advances:advOpen};
  },
  listContractors(){ return DB.contractors.map(c=>({...c, billed:DB.contractorBills.filter(b=>b.contractorId===c.id).reduce((a,b)=>a+b.amount,0)})); },
  saveContractor(c){
    if(c.id){ const x=DB.contractors.find(y=>y.id===c.id); Object.assign(x,{name:c.name,company:c.company,phone:c.phone,rate:Number(c.rate)||0,active:c.active!==false}); return x; }
    const x={id:uid('ct'), name:c.name, company:c.company||c.name, phone:c.phone||'', rate:Number(c.rate)||0, active:true}; DB.contractors.push(x); return x;
  },
  deleteContractor(id){ DB.contractors=DB.contractors.filter(c=>c.id!==id); return {ok:true}; },
  listContractorBills(){ return DB.contractorBills.map(b=>({...b, contractorName:(DB.contractors.find(c=>c.id===b.contractorId)||{}).name||'—'})).sort((a,b)=>b.month.localeCompare(a.month)); },
  saveContractorBill(b){
    if(b.id){ const x=DB.contractorBills.find(y=>y.id===b.id); Object.assign(x,{contractorId:b.contractorId,month:b.month,amount:Number(b.amount)||0,note:b.note||''}); return x; }
    const x={id:uid('cb'), contractorId:b.contractorId, month:b.month, amount:Number(b.amount)||0, status:'pending', note:b.note||''}; DB.contractorBills.push(x); return x;
  },
  decideContractorBill(id, decision){ const b=DB.contractorBills.find(x=>x.id===id); if(b) b.status=decision; return b||{ok:false}; },
  deleteContractorBill(id){ DB.contractorBills=DB.contractorBills.filter(b=>b.id!==id); return {ok:true}; },

  /* Documents */
  listDocuments(){ return DB.documents.map(d=>({...d, employeeName:empById(d.employeeId).name, daysLeft:daysUntil(d.expiryDate)})); },
  saveDocument(d){
    if(d.id){ const x=DB.documents.find(y=>y.id===d.id); Object.assign(x,{employeeId:d.employeeId,title:d.title,expiryDate:d.expiryDate}); return x; }
    const x={id:uid('d'), employeeId:d.employeeId, title:d.title, expiryDate:d.expiryDate}; DB.documents.push(x); return x;
  },
  deleteDocument(id){ DB.documents=DB.documents.filter(d=>d.id!==id); return {ok:true}; },
  getExpiringDocuments(){ return MockAPI.listDocuments().filter(d=>d.daysLeft<=30).sort((a,b)=>a.daysLeft-b.daysLeft); },

  /* Reports */
  attendanceSummary(from, to){
    return DB.employees.filter(e=>e.active).map(e=>{
      const rows=DB.attendance.filter(p=>p.employeeId===e.id&&p.date>=from&&p.date<=to);
      const days=new Set(rows.map(p=>p.date)).size;
      const late=rows.filter(p=>p.type==='in'&&p.time>'08:15').length;
      const ooz=rows.filter(p=>p.outOfZone).length;
      const totalDays=Math.max(1, Math.round((new Date(to)-new Date(from))/86400000)+1);
      return {employeeId:e.id, employeeName:e.name, employeeCode:e.code, present:days, absent:Math.max(0,totalDays-days), late, outOfZone:ooz, pct:Math.round(days/totalDays*100)};
    });
  },
  exportCSV(kind, filters){
    let rows=[], name=kind+'_'+todayISO()+'.csv';
    if(kind==='attendance') rows=MockAPI.listAttendance(filters||{}).map(p=>({date:p.date, employee:p.employeeName, code:p.employeeCode, type:p.type, time:p.time, site:p.siteName, distance_m:p.distanceM, out_of_zone:p.outOfZone?'yes':'no', source:p.source}));
    else if(kind==='employees') rows=MockAPI.listEmployees().map(e=>({code:e.code, name:e.name, department:e.department, designation:e.designation, phone:e.phone, salary:e.salary, join_date:e.joinDate, active:e.active?'yes':'no'}));
    else if(kind==='payroll'){ const f=filters||{}; rows=DB.payslips.filter(p=>!f.runId||p.runId===f.runId).map(p=>{const e=empById(p.employeeId); return {employee:e.name, code:e.code, salary:p.salary, allowances:p.allowances, deductions:p.deductions, advance_recovery:p.advanceRecovery, net:p.net, paid:p.paid?'yes':'no'};}); }
    else if(kind==='leaves') rows=MockAPI.listLeaveRequests().map(r=>({employee:r.employeeName, type:r.typeName, from:r.from, to:r.to, days:r.days, reason:r.reason, status:r.status}));
    return {filename:name, csv:toCSV(rows)};
  },
  getDashboard(){
    const t=todayISO();
    const today=DB.attendance.filter(p=>p.date===t);
    const inToday=today.filter(p=>p.type==='in');
    const total=DB.employees.filter(e=>e.active).length;
    const present=new Set(inToday.map(p=>p.employeeId)).size;
    const late=inToday.filter(p=>p.time>'08:15').length;
    const ooz=today.filter(p=>p.outOfZone).length;
    const trend=[];
    for(let d=13;d>=0;d--){ const date=addDays(t,-d); trend.push({d:date, present:new Set(DB.attendance.filter(p=>p.date===date&&p.type==='in').map(p=>p.employeeId)).size}); }
    return {
      kpis:{presentToday:present, absentToday:Math.max(0,total-present), lateToday:late, outOfZoneToday:ooz, totalEmployees:total, activeSites:DB.sites.filter(s=>s.active).length, pendingLeaves:DB.leaveRequests.filter(r=>r.status==='pending').length, pendingCorrections:DB.corrections.filter(c=>c.status==='pending').length},
      punchesTrend:trend,
      alerts:{
        expiringDocs:MockAPI.getExpiringDocuments().slice(0,5),
        pendingLeaves:MockAPI.listLeaveRequests('pending').slice(0,5),
        pendingCorrections:MockAPI.listCorrections('pending').slice(0,5),
        outOfZoneToday:today.filter(p=>p.outOfZone).slice(0,5).map(p=>({...p, employeeName:empById(p.employeeId).name})),
      },
      recentPunches:DB.attendance.slice().sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time)).slice(0,8).map(p=>({...p, employeeName:empById(p.employeeId).name, siteName:siteById(p.siteId).name||'—'})),
    };
  },

  /* Settings */
  getSettings(){ return {...DB.settings}; },
  saveSettings(patch){ Object.assign(DB.settings, patch||{}); return {...DB.settings}; },
  backupNow(){ return {url:HTTPS+'drive.google.com/mock-backup-'+Date.now(), name:'Demo Construction Co — backup '+todayISO()+'.xlsx'}; },
  listRolePermissions(){ return JSON.parse(JSON.stringify(DB.rolePermissions)); },
  saveRolePermissions(matrix){ Object.assign(DB.rolePermissions, matrix||{}); return {ok:true}; },
};

window.MockAPI=MockAPI; window.MockDB=DB;
})();
