#!/usr/bin/env python3
"""
ZKTeco -> Attendance Management System bridge (VPS version).

Runs on a server with internet access. Reads the device IP/port from the
Attendance Management System settings (Settings -> ZKTeco), connects to the
port-forwarded ZKTeco device, pulls new punches, and pushes them back.

SETUP:
  1. pip install zk
  2. Edit CONFIG below (webhook URL, device ID, API key — from Settings -> ZKTeco)
  3. Run: python3 zkt_vps_bridge.py --loop 60   (poll every 60 seconds)

The device IP/port are read live from the system, so updating them in
Settings takes effect on the next poll — no restart needed.
"""
import sys, time, json, urllib.request, datetime, os

# ---------------- CONFIG — edit these ----------------
WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxTzZYbOojGQgQfVe_6UFD-9eiJEfJTUTq-4wWrFbXLWATeybGmAMb0Sr9QcPgKturyMg/exec"
DEVICE_ID   = "ZKT-Office-01"   # <-- must match Device ID in Settings
API_KEY     = "change-me"       # <-- must match API key in Settings
STATE_FILE  = os.path.expanduser("~/.zkt_bridge_state.json")
# ------------------------------------------------------

try:
    from zk import ZK
except ImportError:
    print("Missing library. Run: pip install zk")
    sys.exit(1)


def api(fn, args=None):
    """Call the Apps Script JSON API without a user session (public fns only)."""
    payload = {"fn": fn, "user": None, "args": args or []}
    req = urllib.request.Request(
        WEBHOOK_URL, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=60) as resp:
        out = json.loads(resp.read().decode())
    if not out.get("ok"):
        raise RuntimeError(out.get("error", "API error"))
    return out.get("data")


def load_state():
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except Exception:
        return {"last_uid": 0}


def save_state(s):
    try:
        with open(STATE_FILE, "w") as f:
            json.dump(s, f)
    except Exception as e:
        print("Could not save state:", e)


def sync_once():
    # 1. Get device IP/port from the system
    info = api("zktDeviceInfo", [DEVICE_ID, API_KEY])
    if not info.get("ok"):
        print("Device info error:", info.get("error"))
        return
    ip, port = info["ip"], info.get("port", 4370)
    if not ip:
        print("No device IP configured in Settings -> ZKTeco. Skipping.")
        return
    print("Device at %s:%s" % (ip, port))

    # 2. Connect and pull punches
    zk = ZK(ip, port=port, timeout=15)
    conn = None
    try:
        conn = zk.connect()
        records = conn.get_attendance() or []
    finally:
        if conn:
            try:
                conn.disconnect()
            except Exception:
                pass

    state = load_state()
    last_uid = state.get("last_uid", 0)
    new_records = [r for r in records if getattr(r, "uid", 0) > last_uid]
    if not new_records:
        print("No new punches.")
        return

    # 3. Push to the system
    punches = []
    for r in new_records:
        ts = r.timestamp
        tstr = ts.strftime("%Y-%m-%d %H:%M:%S") if isinstance(ts, datetime.datetime) else str(ts)
        status = getattr(r, "status", 0)
        punches.append({
            "empCode": str(getattr(r, "user_id", "")),
            "time": tstr,
            "type": "out" if status in (1, 5) else "in",
        })
    payload = {"zkt": 1, "deviceId": DEVICE_ID, "apiKey": API_KEY, "punches": punches}
    req = urllib.request.Request(
        WEBHOOK_URL, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=60) as resp:
        result = json.loads(resp.read().decode())
    print("Server:", json.dumps(result)[:300])
    if result.get("ok"):
        state["last_uid"] = max(getattr(r, "uid", 0) for r in new_records)
        save_state(state)
        print("Synced", result.get("received"), "punches.")


def main():
    loop = 0
    if len(sys.argv) >= 3 and sys.argv[1] == "--loop":
        loop = int(sys.argv[2])
    if loop > 0:
        print("Polling every %ss. Ctrl+C to stop." % loop)
        while True:
            try:
                sync_once()
            except Exception as e:
                print("Sync error:", e)
            time.sleep(loop)
    else:
        sync_once()


if __name__ == "__main__":
    main()
