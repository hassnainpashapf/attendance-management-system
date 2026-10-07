#!/usr/bin/env python3
"""Build deploy/index.html: inline all JS modules into src/index.html for GAS."""
import pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / 'src' / 'js'
OUT = ROOT / 'deploy' / 'index.html'

files = sorted(SRC.glob('*.js'), key=lambda p: p.name)
js_parts = []
if '--diag' in sys.argv:
    js_parts.append('''/* ===== DIAG error trap (must run first, must not throw) ===== */
window.__errs=[];
window.onerror=function(m,s,l,c){try{window.__errs.push(String(m)+' @'+l+':'+c);
var d=document.getElementById('errbox');if(!d){d=document.createElement('div');d.id='errbox';
d.style.cssText='position:fixed;top:0;left:0;right:0;background:#fee2e2;color:#991b1b;z-index:99999;padding:10px;font:12px monospace;white-space:pre-wrap;max-height:40vh;overflow:auto';
(document.body||document.documentElement).appendChild(d);}d.textContent=window.__errs.join('\\n');}catch(e){}return false;};
window.addEventListener('unhandledrejection',function(e){window.onerror('PROMISE: '+((e.reason&&e.reason.message)||e.reason));});''')
for f in files:
    js_parts.append(f"\n/* ===== {f.name} ===== */\n" + f.read_text())

combined = "\n".join(js_parts)

# 0. product-name guard: the old working name must not appear anywhere (any case)
_BADNAME = 'h' + 'azri'
badname = [l for l in combined.split('\n') if re.search(_BADNAME, l, re.I)]
if badname:
    print('BRANDING VIOLATION: old working name found in served script:')
    for l in badname[:5]:
        print('   ', l.strip()[:100])
    sys.exit(1)
print('Branding check OK (no old working name in served script)')

# 1. syntax check with node if available (via temp file; node --check can't read stdin here)
import tempfile
try:
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as tf:
        tf.write(combined); tmp = tf.name
    r = subprocess.run(['node', '--check', tmp], capture_output=True, timeout=30)
    pathlib.Path(tmp).unlink(missing_ok=True)
    if r.returncode != 0:
        print('JS SYNTAX ERROR:\n' + r.stderr.decode()[:3000])
        sys.exit(1)
    print('JS syntax OK (%d files, %d bytes)' % (len(files), len(combined)))
except FileNotFoundError:
    print('node not found — skipping syntax check')

tpl = (ROOT / 'src' / 'index.html').read_text()
scripts = '<script>\n' + combined + '\n</script>'
html = tpl.replace('<!-- APP_JS -->', scripts)
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(html)
print('Wrote', OUT, '(%d bytes)' % len(html))

# 2. sanity: every API.call fn must exist in MockAPI
fns = set(re.findall(r"API\.call\('([a-zA-Z]+)'", combined))
block = combined.split('const MockAPI')[1] if 'const MockAPI' in combined else ''
missing = [f for f in fns if not re.search(r'(^|\n)\s*%s\(' % f, block)]
if missing:
    print('WARNING: API functions used but not in MockAPI:', missing)
    sys.exit(1)
else:
    print('All %d API functions used exist in MockAPI' % len(fns))

# 3. contract coverage: every contract fn must be mocked
contract = (ROOT / 'API_CONTRACT.md').read_text()
cfns = set(re.findall(r'`([a-zA-Z]+)\(', contract)) | set(re.findall(r'^\s*-\s*`([a-zA-Z]+)`', contract, re.M))
# keep only names that also appear as API.call targets OR are contract-listed API object fns
api_obj = re.search(r'Auth: ([^\n]+)\nSuperadmin: ([^\n]+)\nEmployees: ([^\n]+)\nSites: ([^\n]+)\nShifts: ([^\n]+)\nAttendance: ([^\n]+)\nLeave: ([^\n]+)\nOvertime: ([^\n]+)\nPayroll: ([^\n]+)\nDocuments: ([^\n]+)\nReports: ([^\n]+)\nSettings: ([^\n]+)', contract)
contract_fns = set()
if api_obj:
    for grp in api_obj.groups():
        contract_fns |= {x.strip() for x in grp.split(',') if x.strip()}
not_mocked = [f for f in sorted(contract_fns) if not re.search(r'(^|\n)\s*%s\(' % f, block)]
if not_mocked:
    print('WARNING: contract functions missing from MockAPI:', not_mocked)
    sys.exit(1)
print('Contract coverage OK: all %d contract functions mocked' % len(contract_fns))

# 4. GAS HtmlService strips "//" to end-of-line inside served <script> blocks,
# so a literal "://" inside any JS string breaks the served app. Guard it.
script_part = html.split('<script>', 1)[1].rsplit('</script>', 1)[0]
bad = [l for l in script_part.split('\n') if '://' in l]
if bad:
    print("GAS-SANITIZER HAZARD: '://' inside served script:")
    for l in bad[:5]:
        print('   ', l.strip()[:100])
    sys.exit(1)
print('GAS sanitizer check OK (no "://" inside served script)')

# 5. every frontend route must be registered
routes = sorted(set(re.findall(r"App\.routes\['(#[^']+)'\]", combined)))
print('Registered routes (%d): %s' % (len(routes), ', '.join(routes)))
expected = ['#/dashboard','#/punch','#/employees','#/sites','#/shifts','#/attendance','#/leave','#/overtime','#/payroll','#/documents','#/reports','#/settings','#/tenants']
missing_routes = [r for r in expected if r not in routes]
if missing_routes:
    print('WARNING: missing routes:', missing_routes)
    sys.exit(1)
print('All 13 routes registered OK')
