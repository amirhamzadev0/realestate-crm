# BuildFlow CRM: Project Status Report

Report date: 23 Oct 2026. Covers everything built so far, how complete each module is, what is not built, and what to do next.

> How to read the percentages: they are my own estimate of how much of the intended scope of a module is working, not a measured number.
> "Verified" means checked by automated tests or by calling the running app (API and page output). Clicking through the screens in a
> real browser has **not** been done for most screens, so look at the "Verification" section before relying on any screen.

---

## 1. Summary

BuildFlow CRM is a management system for a real estate builder. One owner (the Super Admin) runs several projects. Each project has
a manager. A sales department sells the units. Material is ordered for projects. Staff and labour are tracked and paid.

| Item | Count |
| --- | --- |
| Screens (pages) | 26, in 5 portals plus a sign-in page |
| Server operations (API) | about 49, each with its own allowed roles |
| Database tables | 24 (including 2 bookkeeping tables), built with 20 migrations |
| Source code | about 10,300 lines of TypeScript / TSX, 970 lines of CSS, 390 lines of SQL |
| Reusable UI components | 55 |
| Automated tests | 86, all passing (4 test files) |
| Type check | clean |
| Database | MySQL 8.4 running locally; the app runs on it now |

Overall: the **core business flows are built and working end to end** on a real MySQL database (projects, sales, material orders,
payroll, agents, reports). The biggest open items are: sign-in is built but switched off for testing, deployment has never been run,
and there is no instalment/payment schedule for buyers.

---

## 2. Technology and structure

- **App:** Next.js 16 (App Router), React 19, TypeScript (strict), one CSS file, `zod` for validation.
- **Database:** MySQL (`mysql2`), plain parameterised SQL, no ORM. Money is stored as whole PKR numbers.
- **Layers (kept strictly):** screen -> viewmodel -> service -> repository -> MySQL. Business rules live only in the services; SQL lives only
  in the repositories. A switch (`DATA_STORAGE=mock|mysql`) chooses in-memory demo data or MySQL without touching any screen.
- **Security built in:** every API call checks the origin, size, session, role and project; scrypt password hashes; session tokens stored
  only as hashes; login rate limit; no-store headers; CSV downloads protected against formula injection.
- **Automatic job:** when the server starts, and every hour, the monthly sales reports of finished months are saved.
- **Tools:** `npm run db:start | db:setup | db:migrate | db:check | data:seed | users:setup`, a route/permission check script, a CI file and
  deploy files (see section 9).

---

## 3. Portals and modules, with status

Legend: Done = built and verified. Partial = works but a known piece is missing. Not built = not started.

### 3.1 Super Admin (owner)  -  about 90%

| Module | What it does | Status |
| --- | --- | --- |
| Dashboard | Totals, pending approvals, vendor payments due, orders on the way, orders received in the last 14 days, project cards (units left, units by plot type), salaries to pay, sales summary | Done |
| Projects | Create and edit projects; choose type; set a price per plot type and number of units; build a high-rise floor by floor with every unit's size; review and confirm before the project goes live; assign or replace the manager | Done |
| Managers | Create and edit project managers; one manager runs one project; rename updates everywhere; cannot deactivate a manager who runs a project | Done |
| Approvals | Approve (which places an order) or reject material requests; approve or reject people changes (add, edit, remove workers) | Done |
| Direct sales | Choose a project, sell a unit with buyer details and a discount; see every unit marked sold or available | Done |
| Material orders | Order material for a project directly; cancel an order; pay the vendor balance | Done |
| Salaries | Pay pending salaries and task payments; they then count in "Payroll paid this month" | Done |
| Sales team | Create sales managers; see agents with their results; open any agent's portal | Done |
| Agent reports | Overall report, saved monthly reports, per-agent history, CSV and PDF | Done |
| User accounts / logins | Creating logins for managers and agents from the screen | **Not built** |

### 3.2 Project manager  -  about 85%

Opens only their own project (when sign-in is on).

| Module | What it does | Status |
| --- | --- | --- |
| Overview | Accounts totals, staff counts, payroll paid, pending salaries, low stock, open requests | Done |
| Accounts | Ledger with credit, debit, expense, sale, purchase; add entries; net balance. Sales and vendor payments post here automatically | Partial (no edit, delete, filter or export) |
| Inventory | Stock on site, record usage, request material, see orders placed (vendor, amount, date), mark received, see rejected requests with the reason | Done |
| HR | Staff and labour; request add, edit, remove (needs Super Admin approval); assign work with a payment and date; In progress, Done, Cancel; work completed by day; daily report; pending salaries (view only); salaries paid | Done |
| Attendance | Marking present, absent, half-day | **Partial**: the API exists but there is no screen |

### 3.3 Orders desk (the old "Warehouse")  -  about 90%

There is **no central warehouse stock any more**; material is ordered per project and goes straight into that project's inventory.

- Place an order (project, material, quantity, vendor, amount, order date, pay on delivery or advance); mark delivered; add a material to the list; see requests waiting, orders on the way, vendor balances, history. **Done.**

### 3.4 Sales manager  -  about 90%

| Module | What it does | Status |
| --- | --- | --- |
| Overview | Revenue, units sold, commission, conversion, agent performance, latest leads | Done |
| Leads | Add a lead (name, phone, email, project, source, note); forward to one agent; divide all unassigned leads equally among agents; see calls, WhatsApp, last note and next follow-up | Done |
| Agents | Create, edit, remove agents directly; open an agent's portal | Done |
| Direct sale | Same screen as the Super Admin's, recorded under the manager's name | Done |
| Sales and commission | Record a sale by an agent or by the manager himself; full sales report with commission | Done |
| Agent reports | Same reports as the Super Admin | Done |
| Campaigns | Removed from the manager's screens on request (data kept in the database) | Removed |

### 3.5 Agent  -  about 90%

| Module | What it does | Status |
| --- | --- | --- |
| My portal | Own leads, own sales, own commission, conversion | Done |
| Call and WhatsApp | Click a phone number: WhatsApp message or phone call; each is counted; a note and an optional follow-up date and time can be added | Done |
| Follow-ups | List with the nearest first, due ones on top; Done button; bell icon with a red count of due follow-ups; banner; clicking the bell opens the leads with the due client highlighted | Done |
| Sell a unit | Same screen as the admin's direct sale (project, plot type, floor, unit, buyer details, discount); can pick which lead is buying; lead becomes won; commission is worked out | Done |

### 3.6 Sign-in and roles  -  about 70%

- Built: five roles (Super Admin, Project Admin, Orders desk, Sales Manager, Agent), login page, sessions, role guards on every portal, per-operation permissions, project and agent scoping, tests.
- **Currently switched off** (`AUTH_ENABLED=false`) so everything can be tested without passwords; everyone acts as Super Admin.
- Missing: a screen to create logins; linking manager and agent records to login accounts; password change or reset.

---

## 4. Business flows that work end to end

1. **Project setup:** type, plot types with price and units, floors and units with sizes, review, confirm, manager assigned.
2. **Sale (admin, manager or agent):** pick plot type, then floor, then unit; size comes from the unit; price = size x rate; optional discount (amount, lower rate or percent);
   buyer name, phone, CNIC, email required; the unit is marked sold and cannot be sold again; the buyer's payment is credited to the project; commission goes to the agent.
3. **Material:** manager requests -> Super Admin approves with vendor, amount, date, payment terms -> advance debited from the project -> manager marks received -> stock added -> balance shown to the Super Admin -> Pay balance debits the project.
4. **Payroll:** monthly salary falls due one month after joining; finished work becomes a pending payment; the Super Admin pays; only paid money counts as payroll.
5. **People changes:** workers added, edited, removed only through a request the Super Admin approves.
6. **Leads:** add -> forward or divide equally -> agent calls or messages (counted, noted) -> follow-up reminders -> sale or loss.
7. **Reports:** every finished month is saved automatically and kept; any month and any agent's full history can be opened, downloaded as CSV or printed to PDF.

---

## 5. Data model (24 tables)

Business: `projects`, `project_rates`, `project_units`, `managers`, `account_entries`, `materials`, `stock_items`, `material_requests` (orders and payments),
`workers`, `attendance`, `assignments`, `payroll_payments`, `change_requests`, `sales`, `sales_managers`, `agents`, `leads`, `lead_contacts`, `sales_reports`, `campaigns`.
Access: `users`, `sessions`. Bookkeeping: `schema_migrations`, `deployment_imports`.

Rules enforced in the database as well as in code: one sale per unit in a project, one project per manager, stock cannot go negative, foreign keys, unique keys.

---

## 6. Testing and verification

| What | Result |
| --- | --- |
| Automated tests (services, auth, CSV, formats) | 86 passing, 0 failing |
| Type check | clean |
| Each feature against the real MySQL database | checked by calling the running app's API and reading the page output, with test data removed afterwards |
| Role and permission matrix | a script (`verify-routes.mjs`) exists for the sign-in-on case; it was last run against an earlier version and needs a re-run |
| **Clicking through screens in a real browser** | **Not done** for most screens (forms, dropdowns, bell, banner, print). These are the main risk for visual or interaction bugs |

---

## 7. What is not built (known gaps)

Business features:
- **Buyer payment plans:** a sale is credited in full at once; there are no instalments, due dates, receipts or buyer statements.
- **Sale cancellation, refund or edit**, and deleting a project.
- **Agent commission payments:** commission is calculated and reported, but there is no record of paying it.
- **Attendance screen** (API only) and wages from attendance (shown for information, not in payroll).
- **Accounts:** editing, deleting, filtering, exporting ledger entries; project profit reports.
- **Facebook / Instagram lead capture** and any email, SMS or WhatsApp sending from the system.
- **Push notifications:** the bell and banner work only while the page is open.
- **Photos and documents** (project images, CNIC copies, agreements).

Technical:
- No user management screen, audit log, or password reset.
- Sign-in is off; the production setup (own database user, HTTPS, real passwords) is not done. The local database uses `root` with no password and is only for testing.
- Stock moves and some payments are read-then-write, not one database transaction. The database blocks negative stock, but two simultaneous actions could still collide.
- Dates use UTC; a sale made late in the evening in Pakistan can fall on the next UTC day.
- CI, deploy script, systemd and Nginx files are written but **never run**.

---

## 8. Completion by area (estimates)

| Area | Estimate | Note |
| --- | --- | --- |
| Projects, units, prices | 95% | complete; delete project missing |
| Sales (units, discounts, buyers) | 90% | no instalments or cancellation |
| Sales team (manager, agents, leads, follow-ups) | 90% | no lead capture from ads |
| Agent reports | 95% | CSV and print; no email |
| Material orders and vendor payments | 90% | no supplier list screen |
| Project accounts | 70% | ledger and automatic postings only |
| HR and payroll | 85% | attendance screen missing |
| Sign-in and roles | 70% | built, off, no account screen |
| Database and migrations | 95% | |
| Testing | 75% | strong service tests, little browser testing |
| Deployment | 30% | files written, not run |

Rough overall: **about 80% of the core product scope is built and working; about 60% is ready for real use**, because sign-in,
deployment, browser testing and buyer payment plans still stand between this and daily use.

---

## 9. Suggested next steps (in order)

1. Click through every portal in a browser and fix what looks or behaves wrongly (largest risk, quickest to do).
2. Turn sign-in on: add a screen to create logins for managers and agents, then re-run the permission script.
3. Add buyer instalments and receipts to sales.
4. Add the attendance screen and commission payments.
5. Accounts: edit, filter, export, and a project profit summary.
6. Production readiness: own database user, backups, HTTPS, one trial deployment with the CI and deploy files.
7. Optional: lead capture from Facebook, email and WhatsApp reminders, push notifications.
