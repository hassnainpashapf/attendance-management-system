#!/usr/bin/env node
/* qa_i18n.js — Track 4 (EN/UR i18n) acceptance checks.
   1. Every I18N.t key used in converted files exists in dict.en AND dict.ur.
   2. No empty translations in either dict.
   3. setLang('ur'|'en') flips documentElement dir/lang and persists the choice.
   4. rerenderAll uses the central App.route() when present.
   5. GAS guard: no '://' inside served script lines of touched files.
   Usage: node qa_i18n.js  (exit 0 = all green) */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src', 'js');
const CONVERTED = ['00_utils.js','01_api.js','10_auth.js','11_layout.js','20_dashboard.js',
  '30_punch.js','40_employees.js','50_sites.js','60_shifts.js','70_attendance.js',
  '80_leave.js','90_overtime.js','110_documents.js','120_reports.js','140_tenants.js'];

let failures = 0;
function check(name, ok, detail){
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? ' — ' + detail : ''));
  if(!ok) failures++;
}

/* ---------- 1+2: key coverage + non-empty ---------- */
const i18nSrc = fs.readFileSync(path.join(SRC, '005_i18n.js'), 'utf8');
function dictBlock(src, lang){
  const start = src.indexOf(`Object.assign(I18N.dict.${lang},{`);
  if(start < 0) return null;
  return src.slice(start).split('});')[0];
}
function parseDict(block){
  const out = {};
  const re = /'((?:c4|t3)\.[^']+)'\s*:\s*'((?:[^'\\]|\\.)*)'/g;
  let m;
  while((m = re.exec(block))) out[m[1]] = m[2].replace(/\\'/g, "'");
  return out;
}
const enDict = parseDict(dictBlock(i18nSrc, 'en'));
const urDict = parseDict(dictBlock(i18nSrc, 'ur'));
check('en dict parsed', Object.keys(enDict).length > 0, Object.keys(enDict).length + ' keys');
check('ur dict parsed', Object.keys(urDict).length > 0, Object.keys(urDict).length + ' keys');

const used = new Set();
for(const f of CONVERTED){
  const src = fs.readFileSync(path.join(SRC, f), 'utf8');
  const re = /I18N\.t\(\s*['"]((?:c4|t3)\.[^'"]+)['"]\s*\)/g;
  let m;
  while((m = re.exec(src))) used.add(m[1]);
}
console.log('      keys used in converted files: ' + used.size);
const missingEn = [...used].filter(k => !(k in enDict));
const missingUr = [...used].filter(k => !(k in urDict));
check('every used key exists in dict.en', missingEn.length === 0, missingEn.slice(0,8).join(', '));
check('every used key exists in dict.ur', missingUr.length === 0, missingUr.slice(0,8).join(', '));
const emptyEn = Object.keys(enDict).filter(k => enDict[k] === '');
const emptyUr = Object.keys(urDict).filter(k => urDict[k] === '');
check('no empty EN translations', emptyEn.length === 0, emptyEn.slice(0,5).join(', '));
check('no empty UR translations', emptyUr.length === 0, emptyUr.slice(0,5).join(', '));
const c4count = Object.keys(enDict).filter(k => k.startsWith('c4.')).length;
console.log('      c4.* keys: EN=' + c4count + ' UR=' + Object.keys(urDict).filter(k => k.startsWith('c4.')).length);

/* ---------- 5: GAS '://' guard on touched files ---------- */
let slashHits = [];
for(const f of ['005_i18n.js', ...CONVERTED]){
  const src = fs.readFileSync(path.join(SRC, f), 'utf8');
  src.split('\n').forEach((line, i) => { if(line.includes('://')) slashHits.push(f + ':' + (i+1)); });
}
check("no '://' in served lines of touched files", slashHits.length === 0, slashHits.slice(0,5).join(', '));

/* ---------- 3+4: toggle behavior in a DOM stub ---------- */
function makeSandbox(){
  const store = {};
  const documentElement = { dir: '', lang: '' };
  const document = {
    documentElement,
    readyState: 'complete',
    head: { appendChild(){} },
    createElement(){ return { setAttribute(){}, appendChild(){}, style:{}, classList:{ add(){}, remove(){}, toggle(){} } }; },
    addEventListener(){},
    querySelector(){ return null; },
    getElementById(){ return null; },
  };
  const localStorage = {
    getItem(k){ return k in store ? store[k] : null; },
    setItem(k, v){ store[k] = String(v); },
    removeItem(k){ delete store[k]; },
  };
  const sandbox = {
    document,
    localStorage,
    location: { hash: '#/dashboard' },
    console,
  };
  vm.createContext(sandbox);
  sandbox.window = sandbox; /* like a real browser: window === global */
  return { sandbox, store, documentElement };
}

const { sandbox, store, documentElement } = makeSandbox();
vm.runInContext(i18nSrc, sandbox, { filename: '005_i18n.js' });
const I18N = sandbox.window.I18N;

check('I18N framework defined', !!I18N && typeof I18N.t === 'function' && typeof I18N.setLang === 'function');
check('default lang is en', I18N.lang === 'en', 'lang=' + I18N.lang);
check('initial dir/lang applied', documentElement.dir === 'ltr' && documentElement.lang === 'en',
  'dir=' + documentElement.dir + ' lang=' + documentElement.lang);
check('t() resolves EN', I18N.t('c4.common.save') === 'Save', I18N.t('c4.common.save'));
check('t() falls back to key when missing', I18N.t('c4.nope.missing') === 'c4.nope.missing');

let routed = 0;
sandbox.window.App = { route(){ routed++; } };
I18N.setLang('ur');
check("setLang('ur') flips dir to rtl", documentElement.dir === 'rtl', 'dir=' + documentElement.dir);
check("setLang('ur') sets lang attr", documentElement.lang === 'ur', 'lang=' + documentElement.lang);
check("setLang('ur') persists choice", store['ams_lang'] === 'ur', 'ams_lang=' + store['ams_lang']);
check('t() resolves UR after switch', I18N.t('c4.common.save') === 'محفوظ کریں', I18N.t('c4.common.save'));
check('rerenderAll calls central App.route()', routed === 1, 'route calls=' + routed);
I18N.setLang('en');
check("setLang('en') flips dir back to ltr", documentElement.dir === 'ltr', 'dir=' + documentElement.dir);
check('t() resolves EN after switch back', I18N.t('c4.common.save') === 'Save');

/* fallback when App.route is absent: hash re-trigger path must not throw */
delete sandbox.window.App;
try {
  I18N.setLang('ur');
  check('hash-fallback path does not throw', true);
} catch(e){
  check('hash-fallback path does not throw', false, e.message);
}

/* placeholder-bearing values keep their tokens */
check('placeholder tokens intact (ur)',
  (urDict['c4.punch.mAway'] || '').includes('{n}') && (urDict['c4.ten.tenantCreated'] || '').includes('{company}'));

console.log(failures === 0 ? '\nALL I18N CHECKS PASSED' : '\n' + failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
