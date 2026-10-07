# Attendance Management System — API CONTRACT (single source of truth)

Product name (use everywhere, zero exceptions): **Attendance Management System**.
Branding rule: the old working name (any case) must NOT appear in any user-facing text or deliverable.

## Transport
Frontend calls `API.call('fnName', ...args)` → in production this goes through
`google.script.run.__api('fnName', userJson, argsJson)`.
`__api(fn, userJson, argsJson)`: ScriptLock (15s), token validated via
CacheService `tok_<token>` (except `login`), dispatches to `API[fn](user, ...args)`.
Session object cached: `{id,name,username,role,tenantId,spreadsheetId,token}`.
All Dates converted to `yyyy-MM-dd` ISO strings in `rows_()` (google.script.run can't transport Dates).

## Login
Login form fields: **Company code** + username + password.
- `login(companyCode, username, password)` → `{user, token}`. Superadmin: company code `ADMIN`
  (checked against registry `saasUsers`); everyone else: tenant looked up by code
  (case-insensitive) in registry `tenants`, then `users` tab of that tenant's spreadsheet.
- Demo: superadmin=`ADMIN`/superadmin/admin123 · tenant `DEMO`: admin/admin123, hr/hr123, employee/emp123.

## API functions (Code.gs `API` object, frontend `API.call('name', ...)`, frontend `MockAPI.name(...)`)
Auth: login, getBootstrap, impersonate, stopImpersonation
Superadmin: listTenants, createTenant, updateTenant, deleteTenant, getTenantStats
Employees: listEmployees, saveEmployee, deleteEmployee, importEmployeesCSV, listDepartments, saveDepartment, deleteDepartment, bindDevice, unbindDevice
Sites: listSites, saveSite, deleteSite, assignSiteEmployees
Shifts: listShifts, saveShift, deleteShift, listRosters, saveRoster, deleteRoster
Attendance: punch, devicePunch, listAttendance, bulkMark, deletePunch, getLiveMap, requestCorrection, listCorrections, decideCorrection
Leave: listLeaveTypes, saveLeaveType, deleteLeaveType, getLeaveBalances, requestLeave, listLeaveRequests, decideLeave, listHolidays, saveHoliday, deleteHoliday
Overtime: listOvertime, requestOvertime, decideOvertime
Payroll: listPayComponents, savePayComponent, deletePayComponent, runPayroll, listPayrollRuns, getPayslip, markPayslipPaid, listAdvances, grantAdvance, finalSettlement, listContractors, saveContractor, deleteContractor, listContractorBills, saveContractorBill, decideContractorBill, deleteContractorBill
Documents: listDocuments, saveDocument, deleteDocument, getExpiringDocuments
Reports: attendanceSummary, exportCSV, getDashboard
Settings: getSettings, saveSettings, backupNow, listRolePermissions, saveRolePermissions

## Key behaviors (backend must implement)
- `punch(employeeId, type, lat, lng, selfie, deviceId, source)`: haversine distance to each of the
  employee's assigned sites (or any active site if none assigned); nearest site wins; `distanceM`,
  `outOfZone = distanceM > site.radiusM`; duplicate guard: same employee+type within 5 min → error;
  device binding: if employee.deviceId set and differs → error; returns punch + site + outOfZone.
- `devicePunch(deviceId, employeeId, type, ts)`: same as punch without GPS (lat/lng null, source='zkteco').
- `runPayroll(month, employeeIds)`: gross = salary + sum(approved allowances); deductions = sum(approved
  deductions) + advance installment (advance.amount/installments, mark recovered, status closed when done);
  net = gross - deductions; writes payrollRuns + payslips rows.
- `exportCSV(kind, filters)` returns `{filename, csv}`; kinds: attendance, employees, payroll, leaves.
- `backupNow()` → DriveApp copy of tenant spreadsheet, returns `{url, name}`.
- `createTenant(companyName, plan, adminName, adminUser, adminPass)`: SpreadsheetApp.create →
  seed all tenant tabs → create admin user → register in registry tenants (loginCode derived).
- Every mutating fn writes an auditLog row.

## Tenant tabs (SHEETS map)
tenants(registry): tenantId,companyName,loginCode,spreadsheetId,plan,status,createdAt
saasUsers(registry): id,name,username,passwordHash,role,active
users: id,name,username,passwordHash,role,employeeId,active
rolePermissions: role,matrix
employees: id,name,code,departmentId,phone,email,salary,joinDate,deviceId,active
departments: id,name
sites: id,name,address,lat,lng,radiusM,active
siteEmployees: siteId,employeeId
shifts: id,name,startTime,endTime,graceMin
rosters: id,date,employeeId,shiftId,siteId
attendance: id,employeeId,date,type,time,lat,lng,selfie,siteId,distanceM,outOfZone,source,deviceId,syncedAt,note
corrections: id,punchId,employeeId,note,status,decidedBy,decidedAt
leaveTypes: id,name,quota,paid
leaveBalances: employeeId,year,typeId,used
leaveRequests: id,employeeId,typeId,from,to,days,reason,status,decidedBy
holidays: id,date,name
overtime: id,employeeId,date,hours,rate,reason,status,approvedBy
payComponents: id,name,kind,amount,appliesTo,approved
payrollRuns: id,month,createdAt,createdBy,status
payslips: id,runId,employeeId,salary,allowances,deductions,advanceRecovery,net,paid
advances: id,employeeId,date,amount,installments,recovered,status
contractors: id,name,company,phone,rate,active
contractorBills: id,contractorId,month,amount,status,note
documents: id,employeeId,title,expiryDate
settings: key,value
auditLog: id,at,userId,action,detail

## Frontend routes (hash)
#/dashboard #/punch #/employees #/sites #/shifts #/attendance #/leave #/overtime #/payroll #/documents #/reports #/settings #/tenants (superadmin only)

## GAS gotchas (blocking)
1. No literal '//' inside any JS string in served script (build.py rejects; use 'https:'+'//...' concat).
2. Dates → ISO strings in rows_().
3. doGet → HtmlService.createHtmlOutputFromFile('index'), never templates.
4. No '<base target=_top>' tag.
