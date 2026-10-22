# Project Metadata — BuildFlow Real Estate CRM

Management CRM for a real estate builder. Same folder structure, layering and rules as the
PFL / HAS Real Estate blueprint. **Phase 1 is frontend only**: every screen renders from typed
mock JSON through Model → Repository → Service → ViewModel → View, so a MySQL backend and
real sign-in can be plugged in later without touching pages or components.

Keep this file updated; it is the source of truth for structure and rules.

---

## 1. Business model

```text
Super Admin (builder / owner)
├── Projects (many)
│   └── Project Admin / Manager (one per project)
│       ├── Accounts   debit, credit, expense, sales, purchase, net balance
│       ├── Inventory  stock on site, material used, request more material
│       └── HR         employees (monthly salary), labour (daily wage), attendance, task assignment
├── Warehouse          central stock; issues approved material to projects
└── Sales Department   agents, leads (Facebook / Instagram campaigns), sales, commission, reports
```

### Material workflow (the core cross-department flow)

There is **no central warehouse stock**. Material is ordered for a project and goes straight into its inventory.

```text
Project Admin   submitMaterialRequest      -> status: pending
Super Admin     decideMaterialRequest      -> approved = the order is placed (status: ordered) | rejected (with note)
Super Admin     orderMaterial              -> orders for a project on their own (status: ordered, recorded as an order)
Orders desk /   receiveMaterial            -> material arrived: project stock + qty, status: fulfilled
Super Admin /
Project Admin (own project only)
Super Admin     rejectMaterialRequest      -> also cancels an order that has not arrived
Project Admin   recordMaterialUsage        -> site stock - qty, "used" + qty
```

Rules: only `pending` requests can be decided; only `ordered` can be received; only `pending` or `ordered` can be rejected or cancelled.
`/warehouse` is now the **Orders** desk (place orders, mark deliveries, add a material to the list).

### People workflow (workers, labour, agents)

Nobody is added, edited or removed directly. Every change is a request the Super Admin decides:

```text
Project Admin / Sales   requestPersonChange {kind: worker|agent, action: add|edit|remove, ...}  → pending
Super Admin             decideChangeRequest                → approved (change applied) | rejected (nothing changes)
```

One pending change per person at a time. Removing an agent only deactivates them, so past sales and
commission stay in the reports. Removing a worker also deletes their tasks and attendance.

### Sales workflow

Lead (campaign / walk-in / referral) → assigned to agent → stages `new → contacted → site-visit →
negotiation → won | lost`. `recordSale` stores the sale and marks the lead `won`.
Commission = `price × agent.commissionRate / 100`.

### Pay rules (HR)

Employee earns the fixed `monthlySalary`. Labour earns `dailyWage × days` where `present = 1`,
`half-day = 0.5`, `absent = 0`, for the current month.

---

### Payroll rules (HR, current)

- An employee's monthly salary falls due one month after `joinedAt`, then every month. A finished task's payment falls due when the task is marked done (daily-wage labour is paid this way).
- Due amounts are **pending salaries** until the Super Admin pays them (`payPayroll`). Only paid amounts count in "Payroll paid this month".
- Completed work is stored per day (`completedAt`); the HR page shows one day at a time (`?date=YYYY-MM-DD`) and a daily report table.
- Attendance-based "Earned" in the staff table is informational and is not part of the payroll total.

## 2. Technology stack (Phase 1)

| Area | Choice |
| --- | --- |
| Framework | Next.js 16.x App Router, React 19, TSX only |
| Language | TypeScript 5, `strict`, alias `@/*` → `./src/*` |
| Styling | One native CSS file `src/styles/globals.css` (tokens in first `:root`); no Tailwind |
| Icons | `lucide-react` (explicit icon map in `components/ui/Icon.tsx`) |
| Validation | `zod` 4 in the service layer and API dispatcher |
| Server guard | `server-only` at the top of every server-only module |
| Tests | Node test runner via `tsx` (`tests/*.test.ts`) |
| Runtime | Node >= 20.19 (Next 16 minimum is 20.9) |
| Dev URL | http://127.0.0.1:3130 — keep `APP_ORIGIN` identical |

Phase 2 (built, see `projectmetadatabackend.md`): `mysql2`, role-based sign-in (scrypt + HTTP-only sessions). Not built: `nodemailer`, `@tanstack/react-query`.

### Scripts

```text
npm run dev         next dev on 127.0.0.1:3130
npm run build       production (standalone) build
npm run typecheck   tsc --noEmit
npm test            service tests
node scripts/verify-routes.mjs   smoke test against a running server
```

Next.js notes: `params` is a Promise (`await params`); every portal layout sets
`export const dynamic = "force-dynamic"` because pages read live in-memory data.

---

## 3. Folder structure

```text
crmrealestate/
├── src/
│   ├── app/                         Routes only (thin files)
│   │   ├── layout.tsx, page.tsx (portal chooser), not-found.tsx
│   │   ├── superadmin/              layout, page (dashboard), projects/, approvals/
│   │   ├── projects/                page (list), [slug]/ layout, page, accounts/, inventory/, hr/
│   │   ├── warehouse/               layout, page (stock + receive), issue/
│   │   ├── sales/                   layout, page, leads/, campaigns/, agents/, reports/
│   │   └── api/[operation]/route.ts, api/health/route.ts
│   ├── components/
│   │   ├── layout/                  AppShell, NavigationLinks (client)
│   │   ├── ui/                      Card (+StatCard), Badge, PageHeader (+EmptyState), Icon
│   │   ├── accounts/ inventory/ hr/ projects/ sales/     Tables and summary cards
│   │   └── forms/                   ActionForm, ActionButton, StatusSelect, ApprovalActions + one wrapper per form
│   ├── config/navigation.ts         Sidebar menus per portal
│   ├── data/mock/*.json             Phase 1 seed data (only repositories import it)
│   ├── hooks/                       Generic client hooks (empty for now)
│   ├── models/                      Types only: project, accounts, inventory, hr, sales, site, query
│   ├── repositories/
│   │   ├── contracts.ts             Interfaces the services depend on
│   │   └── mock/                    In-memory adapters + store.ts (Phase 2 adds repositories/mysql/)
│   ├── server/
│   │   ├── container.ts             Only place adapters are constructed
│   │   └── http/operations.ts, origin.ts
│   ├── services/                    Business rules + Zod: project, account, inventory, hr, sales
│   ├── styles/globals.css
│   ├── utils/                       http-client, format, id, errors
│   └── viewmodels/                  Server: superadmin, project, warehouse, sales, home
│                                    Client: useActionViewModel (POST + busy/error + router.refresh)
├── public/ assets/ branding/ fonts/
├── tests/services.test.ts
├── scripts/verify-routes.mjs
├── database/ deploy/                (Phase 2)
└── AGENTS.md, CLAUDE.md, projectmetadata.md, .env.example, next.config.ts, tsconfig.json
```

---

## 4. Architecture rules

Flow: **View → ViewModel → (API) → Service → Repository**

1. `app/**/page.tsx` stays thin: read params, call a viewmodel, `notFound()` if null, render components.
2. Server pages never call their own API; they use viewmodels → services directly.
3. Components are presentation only; client state lives in `use*ViewModel` hooks.
4. Services depend on `repositories/contracts.ts`, never on a concrete adapter.
5. Only `server/container.ts` constructs adapters (mock → MySQL swap happens there).
6. Only repositories import `src/data/**`, and they return `structuredClone`d data.
7. Zod validates all untrusted input in services and in the API dispatcher.
8. One dispatcher `/api/[operation]`: `{ data }` on success, `{ error }` with status on failure (400 validation, 403 origin, 404 unknown/not found, 409 rule conflict).
9. POST requests must send `Origin` equal to `APP_ORIGIN`.
10. `import "server-only"` in `server/**` and server viewmodels.
11. Models are types only.
12. All styling lives in `globals.css`; use tokens, support `prefers-reduced-motion`.
13. No `.jsx`, no unexplained `any`, named exports except where Next requires default.
14. Money is stored as whole PKR numbers; format only at the view (`utils/format.ts`).

### Naming

| Thing | Pattern |
| --- | --- |
| Component | `PascalCase.tsx`, named export |
| Server viewmodel | `<domain>.viewmodel.ts`, functions wrapped in React `cache()` |
| Client viewmodel | `use<Name>ViewModel.ts` with `"use client"` |
| Service | `<domain>.service.ts`, class taking repository interfaces |
| Repository | `<domain>.repository.ts`, `Mock<Domain>Repository` / `Mysql<Domain>Repository` |
| API operation | `get<Entity>List`, `submit<Form>`, `add<Entity>`, `remove<Entity>`, `set<Entity>Status` |
| CSS class | kebab-case, block-prefixed (`.stat-card__value`) |

---

## 5. Routes

| Route | Screen |
| --- | --- |
| `/` | Portal chooser (Super Admin, Project Admin, Warehouse, Sales) |
| `/superadmin` | Totals, pending approvals, project cards, sales summary, low warehouse stock |
| `/superadmin/projects` | All projects |
| `/superadmin/approvals` | Approve / reject material requests and people changes (add / edit / remove), history |
| `/projects` | Project picker for managers |
| `/projects/[slug]` | Project overview (accounts, HR, low stock, open requests) |
| `/projects/[slug]/accounts` | Totals, add entry, ledger |
| `/projects/[slug]/inventory` | Stock, record usage, request material, request status |
| `/projects/[slug]/hr` | Staff and labour, add / remove, assign work, task status |
| `/warehouse` | Central stock, receive stock |
| `/warehouse/issue` | Issue approved requests to projects |
| `/sales` | Revenue, conversion, campaigns, agent performance, latest leads |
| `/sales/leads` | Add lead, change stage |
| `/sales/campaigns` | Facebook / Instagram campaign results, cost per lead |
| `/sales/agents` | Agent performance and commission, add agent |
| `/sales/reports` | Record sale, sales report with commission |

Project slugs (mock): `green-valley`, `skyline-heights`, `royal-gardens`.

## 6. API operations

```text
GET  getProjectList  getAccountList?projectId  getAccountSummary?projectId
     getProjectStock?projectId  getWarehouseStock  getRequestList?projectId&status
     getChangeRequestList?projectId&status&kind  getWorkerList?projectId  getLeadList?projectId&status  getSalesReport?projectId
POST addAccountEntry  submitMaterialRequest  decideMaterialRequest  fulfillMaterialRequest
     recordMaterialUsage  receiveWarehouseStock  requestPersonChange  decideChangeRequest
     assignTask  setTaskStatus  markAttendance  addLead  setLeadStatus  recordSale
GET  /api/health
```

---

## 7. Phase 2 (built)

MySQL repositories, migrations, role-based sign-in, per-operation API permissions, project scoping for
Project Admins, CI and deploy files. Full description: `projectmetadatabackend.md`. Highlights:

- `DATA_STORAGE=mock|mysql` in the env picks the adapters in `server/container.ts`; data-reading pages and components did not change (only layouts, AppShell and the API dispatcher gained sign-in checks).
- Every portal layout calls `requireRole([...])`; `/login` is the only public page.
- Every API operation lists the roles allowed to call it; project admins are pinned to their own project.
- Still open: Facebook lead webhook, email/report notifications, user management screen, transactional stock moves.
- The MySQL adapters and migrations were written without a MySQL server available; run `npm run db:setup` against a real
  database and `node scripts/verify-routes.mjs` with `DATA_STORAGE=mysql` before relying on them.
