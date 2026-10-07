#!/usr/bin/env python3
"""Build the deploy HTML files.

The Apps Script web editor's Save hangs indefinitely on files > ~300KB, so
the frontend JS (~318KB) is split at file boundaries into 3 parts, each
<=110KB, shipped as 3 HTML files and reassembled in doGet() with pure string
replacement (NO templates/scriptlets).

CRITICAL: app2.html / app3.html MUST be complete, valid HTML documents (not
bare <script> fragments) — HtmlService.createHtmlOutputFromFile().getContent()
returns EMPTY for fragment files, which shipped a blank page (the boot code
lives in part 2). doGet() extracts each part's single <script> block with
indexOf/lastIndexOf and injects both blocks immediately before the shell's
</body> (HTML-comment placeholders are unreliable: getContent() may strip
comments, silently dropping parts 2/3).

The shell (src/index.html) carries a small client-side error reporter as the
FIRST inline script in <body> so any JS failure shows a red banner instead of
a silent blank page.

Outputs (all in deploy/):
  index.html      - shell: markup, error-reporter script, then <script>PART1</script>.
                    Deploy this file as `index`.
  app2.html       - valid HTML document wrapping <script>PART2</script>.
                    Deploy this file as `app2`.
  app3.html       - valid HTML document wrapping <script>PART3</script>.
                    Deploy this file as `app3`.
  assembled.html  - shell + EXTRACTED script blocks injected before </body>;
                    QA-ONLY, NOT deployed. Byte-identical to what doGet() serves.
"""
import pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / 'src' / 'js'
DEPLOY = ROOT / 'deploy'
PART_LIMIT = 130 * 1024    # max JS bytes per part (whole files only, never split mid-file)
DEPLOY_LIMIT = 150 * 1024  # max bytes per file pasted into the Apps Script editor

files = sorted(SRC.glob('*.js'), key=lambda p: p.name)

# --- 0. ordered chunks: whole files only, with file-boundary markers ---
chunks = []  # [(name, text)]
if '--diag' in sys.argv:
    chunks.append(('DIAG', '''/* ===== DIAG error trap (must run first, must not throw) ===== */
window.__errs=[];
window.onerror=function(m,s,l,c){try{window.__errs.push(String(m)+' @'+l+':'+c);
var d=document.getElementById('errbox');if(!d){d=document.createElement('div');d.id='errbox';
d.style.cssText='position:fixed;top:0;left:0;right:0;background:#fee2e2;color:#991b1b;z-index:99999;padding:10px;font:12px monospace;white-space:pre-wrap;max-height:40vh;overflow:auto';
(document.body||document.documentElement).appendChild(d);}d.textContent=window.__errs.join('\\n');}catch(e){}return false;};
window.addEventListener('unhandledrejection',function(e){window.onerror('PROMISE: '+((e.reason&&e.reason.message)||e.reason));});'''))
for f in files:
    chunks.append((f.name, f"\n/* ===== {f.name} ===== */\n" + f.read_text()))

# --- 1. greedy split into 4 parts, each <= PART_LIMIT *bytes*
# (byte-based: the Urdu locale file has many 2-byte chars, so char counts lie)
parts = [[], [], [], []]
cur = 0
def _b(s):
    return len(s.encode('utf-8'))
for name, text in chunks:
    if parts[cur] and cur < 3 and sum(_b(t) for _, t in parts[cur]) + _b(text) > PART_LIMIT:
        cur += 1
    parts[cur].append((name, text))
part_js = ['\n'.join(t for _, t in p) for p in parts]
for i, js in enumerate(part_js):
    if _b(js) > PART_LIMIT:
        print('SPLIT FAILED: part %d is %d bytes (> %d); manual re-split needed' % (i + 1, _b(js), PART_LIMIT))
        sys.exit(1)
print('Split: ' + ' | '.join('part%d: %d files, %d bytes' % (i + 1, len(p), _b(js))
                             for i, (p, js) in enumerate(zip(parts, part_js))))

combined = '\n'.join(part_js)  # == the old single-script combined source, in the same order

# --- 2. product-name guard on every part: old working name must not appear (any case) ---
_BADNAME = 'h' + 'azri'
for i, js in enumerate(part_js):
    badname = [l for l in js.split('\n') if re.search(_BADNAME, l, re.I)]
    if badname:
        print('BRANDING VIOLATION in part %d: old working name found:' % (i + 1))
        for l in badname[:5]:
            print('   ', l.strip()[:100])
        sys.exit(1)
print('Branding check OK (no old working name in any part)')

# --- 3. syntax check each part standalone with node (via temp files) ---
# --- 3b. part JS must not contain literal <script> / </script> tags: they would
# break doGet()'s indexOf/lastIndexOf extraction AND the browser's HTML parsing.
# (Use the '<scr'+'ipt>' trick like src/js/00_utils.js does.)
for i, js in enumerate(part_js):
    bad = [l for l in js.split('\n') if '<script' in l.lower() or '</script' in l.lower()]
    if bad:
        print('SCRIPT-TAG HAZARD in part %d: literal <script> or </script> inside part JS:' % (i + 1))
        for l in bad[:5]:
            print('   ', l.strip()[:120])
        sys.exit(1)
print('Script-tag check OK (no literal <script> / </script> inside any part JS)')
import tempfile
for i, js in enumerate(part_js):
    try:
        with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as tf:
            tf.write(js); tmp = tf.name
        r = subprocess.run(['node', '--check', tmp], capture_output=True, timeout=30)
        pathlib.Path(tmp).unlink(missing_ok=True)
        if r.returncode != 0:
            print('JS SYNTAX ERROR in part %d:\n' % (i + 1) + r.stderr.decode()[:3000])
            sys.exit(1)
    except FileNotFoundError:
        print('node not found — skipping syntax check')
        break
print('JS syntax OK (%d files, %d bytes total)' % (len(files), _b(combined)))

# --- 4. write the four outputs ---
def script_block(js):
    return '<script>\n' + js + '\n</script>'

def part_doc(js):
    # app2.html / app3.html MUST be valid HTML documents: getContent() on a bare
    # <script> fragment returns EMPTY from HtmlService (shipped a blank page).
    return ('<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>\n'
            + script_block(js) + '\n</body></html>')

def extract_script(doc):
    # mirrors Code.gs partScript() exactly: first <script> .. last </script>
    i = doc.index('<script>')
    j = doc.rindex('</script>')
    assert i >= 0 and j > i, 'no script block in part document'
    return doc[i:j + 9]

# --- 3c. part JS must not contain literal </body or </html OUTSIDE string
# literals: doGet() injects the extracted script blocks immediately before the
# shell's </body>, and a stray closing tag in raw JS would break HTML parsing
# of the served page. Occurrences inside strings (e.g. the print-document
# template literal in 00_utils.js) are inert script text and are allowed.
def _strip_strings(js):
    out, k, n = [], 0, len(js)
    while k < n:
        c = js[k]
        if c in ('"', "'", '`'):
            q = c; k += 1
            while k < n:
                if js[k] == '\\':
                    k += 2; continue
                if js[k] == q:
                    k += 1; break
                # template literal ${...} interpolation: keep code, it is real JS
                if q == '`' and js[k] == '$' and k + 1 < n and js[k + 1] == '{':
                    depth = 1; k += 2
                    while k < n and depth:
                        if js[k] == '\\':
                            k += 2; continue
                        if js[k] == '{':
                            depth += 1
                        elif js[k] == '}':
                            depth -= 1
                        k += 1
                    continue
                k += 1
        else:
            out.append(c); k += 1
    return ''.join(out)
for i, js in enumerate(part_js):
    code_only = _strip_strings(js)
    bad = [l for l in code_only.split('\n') if '</body' in l.lower() or '</html' in l.lower()]
    if bad:
        print('BODY-CLOSE HAZARD in part %d: literal </body or </html outside strings:' % (i + 1))
        for l in bad[:5]:
            print('   ', l.strip()[:120])
        sys.exit(1)
print('Body-close check OK (no literal </body / </html outside strings in any part)')

tpl = (ROOT / 'src' / 'index.html').read_text()
shell = tpl.replace('<!-- APP_JS -->', script_block(part_js[0]))
if 'APP_PART' in shell:
    print('PLACEHOLDER CHECK FAILED: stale APP_PART placeholder in shell')
    sys.exit(1)
if '</body>' not in shell:
    print('SHELL CHECK FAILED: shell has no </body> for doGet() injection')
    sys.exit(1)
app2_html = part_doc(part_js[1])
app3_html = part_doc(part_js[2])
app4_html = part_doc(part_js[3])
# mirror doGet() exactly: inject extracted script blocks before the LAST </body>
k = shell.rindex('</body>')
assembled = shell[:k] + extract_script(app2_html) + extract_script(app3_html) + extract_script(app4_html) + shell[k:]
if 'APP_PART' in assembled:
    print('ASSEMBLY CHECK FAILED: APP_PART marker survived assembly')
    sys.exit(1)

DEPLOY.mkdir(parents=True, exist_ok=True)
outputs = [('index.html', shell), ('app2.html', app2_html), ('app3.html', app3_html),
           ('app4.html', app4_html), ('assembled.html', assembled)]
for name, content in outputs:
    (DEPLOY / name).write_text(content)
    print('Wrote deploy/%s (%d bytes)' % (name, len(content.encode('utf-8'))))

# --- 5. deploy-size self-check: every file pasted into the editor must stay small ---
for name, content in outputs[:3]:  # assembled.html is QA-only, never pasted
    size = len(content.encode('utf-8'))
    if size > DEPLOY_LIMIT:
        print('DEPLOY SIZE CHECK FAILED: deploy/%s is %d bytes (> %d)' % (name, size, DEPLOY_LIMIT))
        sys.exit(1)
print('Deploy size check OK (index/app2/app3 all <= %d bytes)' % DEPLOY_LIMIT)

# --- 6. assembled.html must be behaviorally identical to what doGet() serves ---
def inline_scripts(html):
    return [m.group(1) for m in
            re.finditer(r'<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)</script>', html)]
blocks = inline_scripts(assembled)
# block 0 = client-side error reporter (shell), blocks 1-4 = the 4 app parts
if len(blocks) != 5 or 'boot-errors' not in blocks[0] \
        or '\n'.join(b[1:-1] for b in blocks[1:]) != combined:
    print('ASSEMBLED EQUIVALENCE CHECK FAILED')
    sys.exit(1)
print('Assembled equivalence OK (error reporter + 4 script blocks rejoin to the combined source)')

# --- 7. every API.call fn must exist in MockAPI (whole-app check on combined) ---
fns = set(re.findall(r"API\.call\('([a-zA-Z]+)'", combined))
block = combined.split('const MockAPI')[1] if 'const MockAPI' in combined else ''
missing = [f for f in fns if not re.search(r'(^|\n)\s*%s\(' % f, block)]
if missing:
    print('WARNING: API functions used but not in MockAPI:', missing)
    sys.exit(1)
else:
    print('All %d API functions used exist in MockAPI' % len(fns))

# --- 8. contract coverage: every contract fn must be mocked ---
contract = (ROOT / 'API_CONTRACT.md').read_text()
cfns = set(re.findall(r'`([a-zA-Z]+)\(', contract)) | set(re.findall(r'^\s*-\s*`([a-zA-Z]+)`', contract, re.M))
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

# --- 9. GAS HtmlService strips "//" to end-of-line inside served <script> blocks,
# so a literal "://" inside any JS string breaks the served app. Guard every output.
for fname, content in outputs:
    for bi, sb in enumerate(inline_scripts(content)):
        bad = [l for l in sb.split('\n') if '://' in l]
        if bad:
            print("GAS-SANITIZER HAZARD in deploy/%s block %d: '://' inside served script:" % (fname, bi + 1))
            for l in bad[:5]:
                print('   ', l.strip()[:100])
            sys.exit(1)
print('GAS sanitizer check OK (no "://" inside served script in any output)')

# --- 10. every frontend route must be registered ---
routes = sorted(set(re.findall(r"App\.routes\['(#[^']+)'\]", combined)))
print('Registered routes (%d): %s' % (len(routes), ', '.join(routes)))
expected = ['#/dashboard','#/punch','#/employees','#/sites','#/shifts','#/attendance','#/leave','#/overtime','#/payroll','#/documents','#/reports','#/settings','#/tenants']
missing_routes = [r for r in expected if r not in routes]
if missing_routes:
    print('WARNING: missing routes:', missing_routes)
    sys.exit(1)
print('All 13 routes registered OK')
