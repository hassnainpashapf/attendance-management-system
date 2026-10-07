#!/usr/bin/env python3
"""
ZKTeco -> Attendance Management System bridge.

Reads attendance punches from a ZKTeco device on your local network
(by IP address) and pushes them to the Attendance Management System.

SETUP:
  1. pip install zk
  2. Edit the CONFIG section below (device IP, webhook URL, device ID, API key)
  3. Run: python3 zkt_bridge.py            (one-time sync)
     Or:  python3 zkt_bridge.py --loop 60   (sync every 60 seconds, keeps running)

The webhook URL, Device ID and API key are shown in the system under
Settings -> "ZKTeco biometric device".
"""
import sys, time, json, urllib.request, datetime

# ---------------- CONFIG — edit these ----------------
DEVICE_IP   = "192.168.1.100"   # <-- your ZKTeco device IP
DEVICE_PORT = 4370              # default ZKTeco port, usually no need to change
WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxTzZYbOojGQgQfVe_6UFD-9eiJEfJTUTq-4wWrFbXLWATeybGmAMb0Sr9QcPgKturyMg/exec"
DEVICE_ID   = "ZKT-Office-01"   # <-- must match Device ID in Settings
API_KEY     = "change-me"       # <-- must match API key in Settings
STATE_FILE  = "/tmp/zkt_bridge_state.json"  # remembers last synced record
# ------------------------------------------------------

try:
    from zk import ZK
except ImportError:
    print("Missing library. Run: pip install zk")
    sys.exit(1)


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


def fetch_punches():
    zk = ZK(DEVICE_IP, port=DEVICE_PORT, timeout=10)
    conn = None
    try:
        conn = zk.connect()
        print("Connected to", DEVICE_IP)
        records = conn.get_attendance() or []
        print("Device returned", len(records), "records")
        return records
    finally:
        if conn:
            try:
                conn.disconnect()
            except Exception:
                pass


def push_punches(punches):
    payload = {
        "zkt": 1,
        "deviceId": DEVICE_ID,
        "apiKey": API_KEY,
        "punches": punches,
    }
    req = urllib.request.Request(
        WEBHOOK_URL,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def sync_once():
    state = load_state()
    last_uid = state.get("last_uid", 0)
    records = fetch_punches()
    new_records = [r for r in records if getattr(r, "uid", 0) > last_uid]
    if not new_records:
        print("No new punches.")
        return
    # ZKTeco: status 0/4 = check-in, 1/5 = check-out (varies by model)
    punches = []
    for r in new_records:
        ts = r.timestamp
        if isinstance(ts, datetime.datetime):
            tstr = ts.strftime("%Y-%m-%d %H:%M:%S")
        else:
            tstr = str(ts)
        status = getattr(r, "status", 0)
        ptype = "out" if status in (1, 5) else "in"
        punches.append({
            "empCode": str(getattr(r, "user_id", "")),
            "time": tstr,
            "type": ptype,
        })
    print("Pushing", len(punches), "new punches...")
    result = push_punches(punches)
    print("Server response:", json.dumps(result)[:500])
    if result.get("ok"):
        state["last_uid"] = max(getattr(r, "uid", 0) for r in new_records)
        save_state(state)
        print("Done. Received:", result.get("received"))


def main():
    loop = 0
    if len(sys.argv) >= 3 and sys.argv[1] == "--loop":
        loop = int(sys.argv[2])
    if loop > 0:
        print("Running every", loop, "seconds. Press Ctrl+C to stop.")
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
