/* 10_auth.js — split-screen login: Company code + username + password. */
(function(){
'use strict';

const LOGOMARK=`<span class="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-white shadow-[0_4px_12px_rgba(13,148,136,.4)] shrink-0">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="w-5 h-5"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></svg></span>`;

function loginPage(){
  document.body.className='min-h-screen bg-[#f6f8fa]';
  document.body.innerHTML=`
  <div class="min-h-screen flex">
    <div class="hidden lg:flex w-[46%] relative overflow-hidden bg-gradient-to-br from-teal-700 via-teal-800 to-emerald-900 text-white">
      <div class="absolute inset-0 login-pattern opacity-60"></div>
      <div class="blob absolute -bottom-24 -left-24 w-[28rem] h-[28rem] rounded-full bg-teal-400/25 blur-3xl"></div>
      <div class="blob absolute -top-24 -right-24 w-[28rem] h-[28rem] rounded-full bg-emerald-300/20 blur-3xl" style="animation-delay:-4s"></div>
      <div class="blob absolute top-1/3 left-1/4 w-72 h-72 rounded-full bg-cyan-300/15 blur-3xl" style="animation-delay:-7s"></div>
      <div class="relative z-10 flex flex-col justify-between p-12 w-full">
        <div class="flex items-center gap-3">${LOGOMARK}
          <div><div class="font-display font-bold text-xl">${I18N.t('c4.auth.brand')}</div>
          <div class="text-teal-200/70 text-xs">${I18N.t('c4.auth.tagline')}</div></div>
        </div>
        <div>
          <h2 class="font-display text-4xl font-bold leading-tight mb-4">${I18N.t('c4.auth.heroTitle')}</h2>
          <p class="text-teal-100/70 max-w-sm mb-8">${I18N.t('c4.auth.heroSub')}</p>
          <div class="space-y-3 text-sm">
            ${[I18N.t('c4.auth.feat1'),I18N.t('c4.auth.feat2'),I18N.t('c4.auth.feat3')].map(t=>`
            <div class="flex items-center gap-3"><span class="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center text-teal-100">✓</span><span class="text-teal-50/90">${t}</span></div>`).join('')}
          </div>
        </div>
        <div class="text-teal-200/50 text-xs">${I18N.t('c4.auth.secureNote')}</div>
      </div>
    </div>
    <div class="flex-1 flex items-center justify-center p-6 relative">
      <div class="absolute inset-0 bg-gradient-to-br from-teal-50/60 via-transparent to-emerald-50/40 pointer-events-none"></div>
      <div class="relative w-full max-w-sm anim-fadeUp bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_20px_60px_-15px_rgba(13,148,136,.25)] rounded-3xl p-8">
        <div class="lg:hidden flex items-center gap-3 mb-8 justify-center">${LOGOMARK}
          <div class="font-display font-bold text-xl text-slate-800">${I18N.t('c4.auth.brand')}</div>
        </div>
        <h1 class="font-display text-3xl font-bold text-slate-800 tracking-tight">${I18N.t('c4.auth.welcomeBack')}</h1>
        <p class="text-sm text-slate-400 mt-1.5 mb-8">${I18N.t('c4.auth.signInSub')}</p>
        <div id="lerr" class="hidden mb-4 text-sm text-red-600 bg-red-50 border border-red-200/70 rounded-xl px-4 py-3"></div>
        <label class="block mb-4"><span class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">${I18N.t('c4.auth.companyCode')}</span>
          <input id="lc" class="bg-white border border-slate-200 rounded-xl px-4 py-3 w-full text-sm uppercase focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 focus:outline-none transition" placeholder="DEMO"></label>
        <label class="block mb-4"><span class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">${I18N.t('c4.auth.username')}</span>
          <input id="lu" class="bg-white border border-slate-200 rounded-xl px-4 py-3 w-full text-sm focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 focus:outline-none transition" placeholder="admin"></label>
        <label class="block mb-6"><span class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">${I18N.t('c4.auth.password')}</span>
          <input id="lp" type="password" class="bg-white border border-slate-200 rounded-xl px-4 py-3 w-full text-sm focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 focus:outline-none transition" placeholder="••••••••"></label>
        <button id="lb" class="w-full py-3 rounded-xl bg-gradient-to-b from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white font-semibold shadow-[0_4px_14px_rgba(13,148,136,.4)] active:scale-[.99] transition">${I18N.t('c4.auth.signIn')}</button>
        <p class="text-xs text-slate-400 text-center mt-6">${I18N.t('c4.auth.demoAccess')}<span class="font-mono bg-slate-100 px-1.5 py-0.5 rounded">DEMO / admin / admin123</span></p>
        <p class="text-[11px] text-slate-400 text-center mt-2">${I18N.t('c4.auth.superadminNote')}<span class="font-mono bg-slate-100 px-1.5 py-0.5 rounded">ADMIN / superadmin / admin123</span></p>
      </div>
    </div>
  </div>`;
  const go=async()=>{
    const err=document.getElementById('lerr'); err.classList.add('hidden');
    const btn=document.getElementById('lb'); btn.disabled=true; btn.innerHTML='<span class="spinner"></span>';
    try{
      const r=await API.call('login',
        document.getElementById('lc').value.trim(),
        document.getElementById('lu').value.trim(),
        document.getElementById('lp').value);
      if(r&&r.user){ Session.user={...r.user, token:r.token}; }
      Session.bootstrap=await API.call('getBootstrap');
      const role=Session.user.role;
      location.hash = role==='superadmin' ? '#/tenants' : role==='employee' ? '#/punch' : '#/dashboard';
      App.boot();
    }catch(e){ err.textContent=e.message||I18N.t('c4.auth.loginFailed'); err.classList.remove('hidden'); btn.disabled=false; btn.textContent=I18N.t('c4.auth.signIn'); }
  };
  document.getElementById('lb').onclick=go;
  ['lc','lu','lp'].forEach(id=>document.getElementById(id).addEventListener('keydown',e=>{if(e.key==='Enter')go();}));
}

window.loginPage=loginPage; App.LOGOMARK=LOGOMARK;
})();
