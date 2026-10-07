#!/usr/bin/env python3
"""Push the full ~/workspace/attendance-saas tree to GitHub (full-tree commit on top of remote main).

Usage: push.py [commit message]
Reads current remote main SHA via API, uploads all blobs, creates tree+commit, fast-forwards main.
"""
import base64, json, os, sys, urllib.request, urllib.error

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
import dynamic_credentials as dc

ALLOWED = ["api.github.com"]; CRED = "custom.github"
OWNER = "hassnainpashapf"; REPO = "attendance-management-system"
ROOT = os.path.expanduser("~/workspace/attendance-saas")
MSG = sys.argv[1] if len(sys.argv) > 1 else "update"

def api(method, url, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("User-Agent", "ams-push/1.0")
    req.add_header("Accept", "application/vnd.github+json")
    if data: req.add_header("Content-Type", "application/json")
    dc.add_surrogate_to_request(req, CRED, allowed_hosts=ALLOWED)
    try:
        resp = urllib.request.urlopen(req, timeout=120)
        return resp.status, dc.read_json_response(resp)
    except urllib.error.HTTPError as e:
        return e.code, {"error": e.read().decode(errors="replace")[:300]}

base = f"https://api.github.com/repos/{OWNER}/{REPO}"
st, out = api("GET", base + "/git/refs/heads/main")
assert st == 200, ("ref", st, out)
parent = out["object"]["sha"]
print("remote main:", parent[:7])

files = []
for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d != ".git"]
    for fn in filenames:
        full = os.path.join(dirpath, fn)
        with open(full, "rb") as f:
            files.append((os.path.relpath(full, ROOT), f.read()))
print(f"files: {len(files)}")

tree = []
for i, (rel, content) in enumerate(sorted(files)):
    st, out = api("POST", base + "/git/blobs",
                  {"content": base64.b64encode(content).decode(), "encoding": "base64"})
    assert st == 201, (rel, st, out)
    tree.append({"path": rel, "mode": "100644", "type": "blob", "sha": out["sha"]})
st, out = api("POST", base + "/git/trees", {"tree": tree}); assert st == 201, ("tree", st, out)
st, out = api("POST", base + "/git/commits", {
    "message": MSG, "tree": out["sha"], "parents": [parent],
    "author": {"name": "Hussnain", "email": "hasnain.techub@gmail.com"}})
assert st == 201, ("commit", st, out)
new_sha = out["sha"]
st, out = api("PATCH", base + "/git/refs/heads/main", {"sha": new_sha})
assert st == 200, ("ref", st, out)
print("PUSHED", new_sha)
