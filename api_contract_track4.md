# Track 4 — I18N Contract (EN/UR) — for coordinator merge

No backend/API additions. This document describes the frontend internationalization
contract owned by Track 4 (Phase 2). Do NOT edit `Code.gs`, `02_mock.js`, or
`API_CONTRACT.md`; merge the notes below into the main contract where marked.

## 1. Framework (`src/js/005_i18n.js`, loads before every UI module)

Exact shape — other tracks depend on it, do not alter:

```js
window.I18N = { lang: localStorage.getItem('ams_lang')||'en', dict:{en:{},ur:{}},
  t: function(k){ var d=I18N.dict[I18N.lang]||{}; return (d[k]!==undefined?d[k]:((I18N.dict.en[k]!==undefined)?I18N.dict.en[k]:k)); },
  setLang: function(l){ I18N.lang=l; try{localStorage.setItem('ams_lang',l);}catch(e){} document.documentElement.dir=(l==='ur'?'rtl':'ltr'); document.documentElement.lang=l; if(window.rerenderAll) window.rerenderAll(); } };
```

- `I18N.t(key)` fallback chain: current lang → `en` → the key itself (never throws,
  never returns undefined). Safe to call at module load time.
- `I18N.setLang('en'|'ur')` persists to `localStorage['ams_lang']`, flips
  `document.documentElement` `dir` (`rtl` for Urdu, `ltr` otherwise) and `lang`,
  then calls `window.rerenderAll()`.
- On script load, the saved language is applied immediately (dir/lang attributes),
  so a returning Urdu user lands directly in RTL.
- `window.rerenderAll()` (defined in 005_i18n.js): repaints the header toggle,
  refreshes one-shot header chrome (Punch button, footer, impersonation banner),
  then calls the central `App.route()` to re-render the current view. If
  `App.route` is ever absent it falls back to re-triggering the current hash route.
- Dictionaries for ALL converted modules live in `005_i18n.js` (single place):
  `Object.assign(I18N.dict.en,{...})` and `Object.assign(I18N.dict.ur,{...})`.
  Other tracks register their own keys the same way (their `t3.*` keys already do).

## 2. Key naming

`c4.<module>.<slug>` — e.g. `c4.emp.addEmployee`, `c4.att.bulkMark`, `c4.common.save`.
Modules: `common` (shared words: Save/Cancel/Delete/Edit/…, statuses, Check-in/out),
`utils`, `api`, `auth`, `nav` (nav labels + nav-group labels), `layout` (shell chrome),
`dash`, `punch`, `emp`, `sites`, `shifts`, `att`, `leave`, `ot`, `docs`, `rep`, `ten`.

- Placeholder convention: `{n}`, `{s}`, `{name}`, `{msg}`, `{type}`, `{date}`,
  `{company}`, `{code}`, `{kind}` — substituted with `.replace('{x}', value)`.
- Dynamic content (employee/site names, numbers, dates, codes, credentials) is
  NEVER translated — only chrome strings are wrapped.

## 3. Nav labels (re-render safe)

Nav items carry both a load-time `label` and a `labelKey`:
`App.nav.push({..., label:I18N.t('c4.nav.dashboard'), labelKey:'c4.nav.dashboard', ...})`.
`renderNav()` and the breadcrumb resolve via `I18N.t(n.labelKey)` (falling back to
`n.label` when no key — the payroll/settings pushes owned by tracks 2/3 have no
key yet). Nav-group labels use the same pattern (`g.labelKey`). Provided for
tracks 2/3: `c4.nav.payroll`, `c4.nav.settings`.

## 4. Language toggle

- EN | اردو segmented toggle injected at RUNTIME into the app `<header>`
  (before the avatar block) from 005_i18n.js — `11_layout.js` was not modified
  for this. A `MutationObserver` re-mounts it after login/logout shell rebuilds.
- Active language is highlighted; `aria-pressed` is set per button.
- Not shown on the login page (no header there), but the login page renders in
  the saved language.

## 5. RTL (`html[dir='rtl']` stylesheet injected from 005_i18n.js)

Surgical overrides only, no redesign:
- Sidebar (`#side`) docks right; mobile hidden state becomes `translateX(100%)`
  (scoped below the `lg` breakpoint so desktop `lg:translate-x-0` still wins);
  main column margin flips (`lg:ml-[248px]` → `margin-right:248px` at ≥1024px);
  sidebar border flips to the left.
- Text alignment: `body` right; `.text-left`→right, `.text-right`→left (covers
  table headers and numeric cells); inputs/selects/textareas right-aligned
  (checkbox/radio/range/date/time keep natural alignment).
- `#toasts` move to top-left, `#avatarDrop` opens left-aligned,
  `.ml-auto`/`.mr-auto` mirrored. Flex rows auto-mirror via `direction`.
- Login split-screen, cards, modals, tables need no extra rules.

## 6. Converted files (strings wrapped, logic/DOM ids/API shapes untouched)

`00_utils.js` (confirm dialog, table empty state, export toast, map fallback),
`01_api.js` ('Server call failed'), `10_auth.js` (login), `11_layout.js` (shell,
nav groups, avatar menu, route error states), `20_dashboard.js`, `30_punch.js`,
`40_employees.js`, `50_sites.js`, `60_shifts.js`, `70_attendance.js`, `80_leave.js`,
`90_overtime.js`, `110_documents.js`, `120_reports.js`, `140_tenants.js`.

NOT touched (other tracks): `src/js/100_payroll.js`, `src/js/130_settings.js`,
`Code.gs`, `02_mock.js`. Print/payslip views left for track 2.

## 7. QA

`qa_i18n.js` (project root, `node qa_i18n.js`): asserts every `I18N.t` key used in
the converted files exists in `dict.en` AND `dict.ur`, no empty translations,
`setLang` flips `dir`/`lang` and persists `ams_lang`, `rerenderAll` routes through
`App.route()`, and the GAS `://` guard holds on all touched files. 22/22 green.

## 8. Merge notes for the main API_CONTRACT.md

- Add an "I18N" section: product name "Attendance Management System" stays
  English in both languages (branding rule); `ams_lang` localStorage contract;
  `c4.*` key convention; dynamic data never translated.
- Note: `005_i18n.js` must remain the first script in build order (filename sort
  already guarantees this); the concurrent `150_*`–`170_*` tracks register
  `t3.*` keys into the same `I18N.dict` and shim-guard on `window.I18N`.
