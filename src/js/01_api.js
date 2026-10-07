/* 01_api.js — API.call(fnName, ...args) → Promise.
   Uses google.script.run.__api when deployed in Apps Script, else the local MockAPI. */
(function(){
'use strict';

const isGAS = !!(window.google && google.script && google.script.run);

const API = {
  isGAS,
  call(fn, ...args){
    if(isGAS){
      // All server calls go through the __api dispatcher, which validates the
      // login token (CacheService) and routes to the matching API function.
      const userJson = JSON.stringify(Session.user||null);
      const argsJson = JSON.stringify(args);
      return new Promise((resolve,reject)=>{
        google.script.run
          .withSuccessHandler(r=>resolve(r))
          .withFailureHandler(e=>reject(new Error((e&&e.message)||'Server call failed')))
          .__api(fn, userJson, argsJson);
      });
    }
    // local mock path
    return new Promise((resolve,reject)=>{
      setTimeout(()=>{
        try{
          const f = MockAPI[fn];
          if(typeof f!=='function') throw new Error('Unknown API function: '+fn);
          resolve(f(...args));
        }catch(e){ reject(e instanceof Error?e:new Error(String(e))); }
      }, 30);
    });
  }
};

/* session persisted in localStorage 'ams_session' */
const SKEY='ams_session', BKEY='ams_bootstrap';
const Session = {
  get user(){ try{return JSON.parse(localStorage.getItem(SKEY)||'null');}catch(e){return null;} },
  set user(u){ u?localStorage.setItem(SKEY,JSON.stringify(u)):localStorage.removeItem(SKEY); },
  get bootstrap(){ try{return JSON.parse(localStorage.getItem(BKEY)||'null');}catch(e){return null;} },
  set bootstrap(b){ b?localStorage.setItem(BKEY,JSON.stringify(b)):localStorage.removeItem(BKEY); },
  get savedUser(){ try{return JSON.parse(localStorage.getItem('ams_saved_user')||'null');}catch(e){return null;} },
  set savedUser(u){ u?localStorage.setItem('ams_saved_user',JSON.stringify(u)):localStorage.removeItem('ams_saved_user'); },
  get impersonating(){ return !!this.savedUser; },
  clear(){ localStorage.removeItem(SKEY); localStorage.removeItem(BKEY); localStorage.removeItem('ams_saved_user'); }
};

function perm(module, action='view'){
  const b=Session.bootstrap;
  if(!b||!b.permissions) return false;
  if(b.permissions.all) return true; /* superadmin: real backend returns {all:true} */
  const p=b.permissions[module];
  if(!p) return false;
  return !!p[action];
}

window.API=API; window.Session=Session; window.perm=perm;
})();
