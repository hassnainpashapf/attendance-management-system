# Attendance Management System — Deploy Guide

Multi-tenant GPS attendance SaaS on **Google Apps Script + Google Sheets** (free Google backend).
Each customer company gets its **own spreadsheet**; one master **registry spreadsheet**
holds tenants + the SaaS superadmin login.

## Files

| File | Purpose |
|---|---|
| `Code.gs` | Entire backend: `__api` dispatcher, all API functions, seeders |
| `deploy/index.html` | Built single-file frontend (paste as `index` in Apps Script) |
| `src/` | Frontend sources (only needed if you change the UI, then re-run `build.py`) |
| `build.py` | Rebuilds `deploy/index.html` from `src/` + runs all safety guards |
| `API_CONTRACT.md` | API/tab/route contract shared by backend and frontend |

## Deploy (one time, ~10 minutes)

1. **Create the registry spreadsheet** in Google Drive (name it e.g. `AMS Registry`).
2. Open it → **Extensions → Apps Script**. Delete the default `Code.gs` content and
   **paste the entire `Code.gs`** from this project.
3. In the Apps Script editor click **＋ → HTML** → name the file **`index`** (exactly).
   Open `deploy/index.html` from this project, copy **all** of it, paste into `index.html`,
   save (Ctrl/Cmd+S).
4. In the function dropdown select **`setupRegistry`** → **Run**. Grant permissions
   (Sheets + Drive + external). This creates the `tenants`, `saasUsers` and `auditLog`
   tabs and the superadmin login.
5. (Optional demo data) Run **`seedDemo`**. This creates the tenant
   **"Demo Construction Co"** (company code `DEMO`) with 2 sites, 6 employees,
   shifts, today's punches, a leave request, an advance and an expiring document.
6. **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone** (required for employee phones; the app has its own login)
   - Deploy → copy the **Web app URL**. This is your SaaS URL.

## Logins

| Company code | Username | Password | Role |
|---|---|---|---|
| `ADMIN` | `superadmin` | `admin123` | SaaS owner (manages tenants) |
| `DEMO` | `admin` | `admin123` | Company admin |
| `DEMO` | `hr` | `admin123` → `hr123` | HR |
| `DEMO` | `employee` | `emp123` | Employee (self-service punch) |

> Change all demo passwords after first login (Users page). The company code is shown
> on the Tenants page and in the registry `tenants` tab (`loginCode` column).

## Adding a customer company

Log in as superadmin (`ADMIN`) → **Tenants** → **＋ New Tenant** → enter company name,
plan and the first admin's name/username/password. The system creates that company's
own spreadsheet, seeds all tabs, and registers it. Give the customer their company
code + admin login. (Equivalent function: `createTenant` in the API.)

## Employee phones

- The web app URL is `https://…` — camera and GPS only work on secure origins, so
  always share the deployed URL (never a `http` preview).
- On first punch the phone asks for **Camera** and **Location** permission — both are
  required for selfie check-in.
- **Offline:** if the site has no signal, punches queue on the phone and auto-sync
  when the connection returns (a small "queued" badge shows the count).
- **Device binding:** on the Employees page you can bind an employee to one phone;
  that phone then cannot punch for anyone else.

## Honest limitations

- **ZKTeco / biometric terminals:** ZKTeco's ADMS protocol needs a persistent TCP
  server, which Apps Script cannot run. The backend already accepts device punches
  (`devicePunch(deviceId, …)` with `source='zkteco'`), so a tiny relay service on any
  VPS can forward terminal punches into the SaaS later — no app changes needed.
  GPS selfie on phones works fully today and covers field staff.
- **Selfie storage:** selfies are stored compressed (320px JPEG) inside the
  spreadsheet. For very large workforces, move selfies to Drive later.
- **Scale:** Google quotas apply (Apps Script ~6 min/execution, Sheets 10M cells).
  Comfortable for small/medium companies; per-tenant spreadsheets keep them isolated.

## Troubleshooting

- **"Session expired — please sign in again"** → log in again (sessions last 6 hours).
- **"Server busy, try again"** → many users hit it at once; retry (writes are locked).
- **Map not loading** → check internet access to unpkg.com / OpenStreetMap tiles.
- **Punch flagged out-of-zone** → check the site's lat/lng + radius on the Sites page
  (use the map picker), and that the employee is assigned to the site.
- After editing `src/`, re-run `python3 build.py` and re-paste `deploy/index.html`.

## Updating the app later

Edit `src/js/*.js` or `src/index.html` → run `python3 build.py` (all guards must pass)
→ paste the new `deploy/index.html` into the Apps Script `index` file → **Deploy →
Manage deployments → Edit → New version**. Backend changes: paste the new `Code.gs`
over the old one (data in the spreadsheets is untouched).
