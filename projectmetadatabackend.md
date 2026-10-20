# Project Metadata (Backend): Database, Sign-in, Roles, Deployment

Companion to `projectmetadata.md` (frontend). This file describes **Phase 2** of BuildFlow CRM:
the MySQL database, repositories, sign-in with roles, API protection and deployment.

Based on the PFL / HAS Real Estate backend blueprint, trimmed to what a CRM needs. A CRM has no
public website, so the blueprint's CMS collections, media uploads, site settings and email
notifications are **not** part of this phase (see §12). Layers and rules are the same.

> The frontend was built so that pages and components read data only through
> viewmodels → services → repository contracts. Phase 2 therefore added MySQL adapters and a login
> without changing the data-reading pages or components. The only page-level changes are the
> role guards in layouts.

---

## 1. Backend stack

| Area | Choice | Purpose |
| --- | --- | --- |
| Database | MySQL 8, InnoDB, `utf8mb4` / `utf8mb4_unicode_ci` | Business data, users, sessions |
| Driver | `mysql2` (promise API) | One shared pool, parameterized SQL only. **No ORM** |
| Validation | `zod` 4 | Every API input (unchanged from Phase 1) |
| Server guard | `server-only` | First import in every server module |
| Crypto | Node `crypto` | `scrypt` passwords, random session tokens, SHA-256 token hashes |
| Env loading in scripts | `@next/env` | Scripts read `.env.local` the same way Next.js does |
| CI/CD | GitLab CI | Build with a throwaway MySQL, manual production deploy |
| Hosting | Linux VPS: Node 22 + systemd + Nginx + Certbot | Next.js `output: "standalone"` behind a reverse proxy |

---

## 2. Environment variables

`.env.example` (committed, no secrets):

```text
APP_ORIGIN=http://127.0.0.1:3130     exact browser origin; POST origin check + secure-cookie flag
SITE_URL=http://127.0.0.1:3130
DATA_STORAGE=mock                    mock | mysql
AUTH_ENABLED=false                   true = sign-in required; false = testing mode (everyone is Super Admin, home page lists the 4 portals)
# DATABASE_URL=mysql://user:password@127.0.0.1:3306/buildflow_crm
# LOGIN_EMAIL_DOMAIN=buildflow.local
```

- `DATA_STORAGE=mock` keeps Phase 1 behaviour (in-memory demo data). Sign-in then uses `.private/users.json`.
- `DATA_STORAGE=mysql` uses the database for business data **and** users/sessions.
- Real values live in `.env.local` (local) and `/var/www/buildflow/shared/app.env` (server). Both are git-ignored.
- `.private/` (git-ignored) holds `users.json` (password hashes) and `access.txt` (plaintext passwords, shown once).

---

## 3. Folder structure (backend additions)

```text
database/migrations/        001_auth.sql  002_core.sql  003_deployment_imports.sql
deploy/                     buildflow.service (systemd), nginx-production.conf
scripts/
├── setup-users.mjs         creates sign-in accounts + .private/access.txt
├── setup-database.mjs      --apply: create DB, migrate, seed demo data, upsert users (no flag = dry run)
├── seed-data.mjs           import src/data/mock/*.json (missing rows only)
├── verify-routes.mjs       signs in as each role and checks pages + API permissions
├── lib/                    env.mjs, db.mjs, password.mjs, seed.mjs
└── ci/                     wait-db, migrate (checksums + GET_LOCK), check-schema, backup, package, deploy.sh
.gitlab-ci.yml
src/
├── app/login/page.tsx      sign-in page;  app/page.tsx redirects to login or the role's home
├── app/api/health/route.ts SELECT 1 when DATA_STORAGE=mysql → 503 if unreachable
├── components/forms/LoginForm.tsx, components/layout/LogoutButton.tsx
├── config/access.ts        which roles may open which portal + sidebar filtering
├── models/auth.ts          AuthUser, UserCredential, SessionRecord
├── repositories/
│   ├── contracts.ts        (unchanged, plus InventoryRepository.saveMaterial)
│   ├── mock/               Phase 1 adapters (kept for tests and DATA_STORAGE=mock)
│   ├── mysql/              db.ts (select/selectOne/run/where) + project, account, inventory, hr, sales, change-request
│   └── auth/               contracts.ts, memory.repository.ts, mysql.repository.ts (users + sessions)
├── server/
│   ├── container.ts        the only place that picks Mock* or Mysql* (DATA_STORAGE)
│   ├── database/mysql.ts   getMysqlPool(): single pool cached on globalThis
│   ├── auth/session.ts     getCurrentUser(), requireRole([...]);  bootstrap-users.ts reads .private/users.json
│   └── http/operations.ts  every operation declares its allowed roles
├── services/
│   ├── auth.service.ts     login / current / logout / homeFor;  SESSION_COOKIE, SESSION_MAX_AGE
│   └── auth/password.ts, rate-limit.ts
└── viewmodels/useLoginViewModel.ts
tests/auth.test.ts
```

---

## 4. Layering rules (backend)

```text
View ─► client viewmodel ─► apiRequest("op") ─► /api/[operation]
   ─► origin → size → JSON → session → role → project scope ─► handler ─► service ─► repository contract ─► MySQL adapter
Server page ─► viewmodel ─► service (server/container.ts) ─► repository contract ─► MySQL adapter
```

1. **SQL lives only in `repositories/mysql/*` and `repositories/auth/mysql.repository.ts`.**
2. **Always parameterized** (`execute(sql, [params])`). Dynamic identifiers come from fixed constants only.
3. **Services depend on interfaces**, never on `Mysql*` classes.
4. **Only `server/container.ts` constructs adapters.**
5. **Repositories return domain models.** SQL aliases map `snake_case` → `camelCase`; booleans and optional columns are decoded explicitly (NULL decision fields are omitted, like the mock data).
6. **Services validate with Zod** and throw `AppError(status)`; the dispatcher maps `ZodError` → 400, `AppError` → its status, an unreachable database → 503.
7. **No silent fallbacks on write.** If MySQL fails the request fails; nothing is "saved" in memory.
8. **The pool is a singleton** on `globalThis` (`connectionLimit 10`, `queueLimit 100`, `enableKeepAlive`, `dateStrings`, `decimalNumbers`).
9. **Layout guards are not API guards.** Every operation re-checks the session and role in the dispatcher.

---

## 5. Database schema

`CREATE TABLE IF NOT EXISTS`, InnoDB, `utf8mb4_unicode_ci` on every table. Migrations are additive: never edit one that
has been applied (`migrate.mjs` refuses and compares SHA-256 checksums); add `004_*.sql` instead.

| Migration | Tables |
| --- | --- |
| `001_auth.sql` | `users` (email unique, `role` enum, `project_id`, `enabled`, scrypt hash), `sessions` (SHA-256 token hash, `expires_at` epoch ms) |
| `002_core.sql` | `projects`, `account_entries`, `materials`, `stock_items`, `material_requests`, `workers`, `attendance`, `assignments`, `agents`, `campaigns`, `leads`, `sales`, `change_requests` |
| `003_deployment_imports.sql` | `deployment_imports` (marker for the one-time demo-data import) |
| `004`-`005` | `assignments.payment`, `completed_at`, `assigned_at` (task payment and dates) |
| `006_payroll.sql` | `workers.joined_at`, `payroll_payments` (salary / task payments the Super Admin has handed over) |

Modelling notes:
- **Money** is `BIGINT` whole PKR. **Quantities** are `DECIMAL(14,2)`; `commission_rate` is `DECIMAL(5,2)`.
- **Stock location** is unique on `(scope, project_key, material_id)`, where `project_key` is a generated column `IFNULL(project_id,'')` so the warehouse (NULL project) is also unique. `CHECK (quantity >= 0)` stops negative stock even if a service rule is missed.
- **Foreign keys:** business rows `ON DELETE RESTRICT` (a project with data cannot be deleted); worker → attendance/assignments `CASCADE` (matches "removing a worker also deletes tasks and attendance"); leads/sales references `SET NULL`; agents referenced by sales are `RESTRICT` (agents are deactivated, never deleted).
- `inserted_at TIMESTAMP(3)` on tables whose list order is "newest first" breaks ties between rows created on the same day.
- Attendance has no unique `(worker_id, att_date)`: `markAttendance` creates a new row each call, as in Phase 1.

Known limitation: multi-step material moves (`fulfill`, `recordUsage`) are read-then-write through separate repository
calls, not one transaction. Two simultaneous issues of the same stock could both pass the check; the `CHECK (quantity >= 0)`
makes the second one fail instead of going negative. A repository-level `transfer()` in a transaction is the next hardening step.

---

## 6. Authentication and roles

| Item | Implementation |
| --- | --- |
| Roles | `superadmin`, `project-admin`, `warehouse`, `sales` (`Role` in `models/site.ts`) |
| Password hash | `scrypt:<16-byte hex salt>:<64-byte hex key>`, verified with `timingSafeEqual` |
| Unknown user | Verified against `DUMMY_HASH` anyway so timing does not reveal accounts |
| Session token | `randomBytes(32).toString("base64url")` in a cookie; only `sha256(token)` is stored |
| Cookie | `buildflow_session`, `httpOnly`, `sameSite: "lax"`, `secure` when `APP_ORIGIN` is https, `path: "/"`, 8 h |
| Throttling | 5 failed attempts per email per 15 min → 429, even with the right password (in memory, resets on restart) |
| Project admin | Needs a real `project_id`; without one sign-in is refused. Lands on `/projects/<slug>` and can only open that project |
| Disabled user | Existing sessions stop working on the next request |
| Responses | `Cache-Control: no-store, private` on every API response |
| Client | No tokens in localStorage |

### Who may open what

| Portal | superadmin | project-admin | warehouse | sales |
| --- | :-: | :-: | :-: | :-: |
| `/superadmin/**` | yes | | | |
| `/projects/**` | all projects | own project only | | |
| `/warehouse/**` | yes | | yes | |
| `/sales/**` | yes | | | yes |

A wrong-role request is redirected to that role's own home; signed out goes to `/login`. Sidebar links a role cannot open are hidden.

### API access (declared per operation in `server/http/operations.ts`)

- Each operation has `access: "public" | Role[]`. Public: `login`, `logout`, `getSession`. Everything else needs a session and a listed role (401 / 403).
- `projectScoped` operations: a project admin's `projectId` is filled in automatically and a different one is refused (403).
- Id-only operations (`markAttendance`, `setTaskStatus`, `assignTask`, `requestPersonChange` edit/remove) check that the worker/task belongs to the project admin's project.
- `requestedBy` on material requests is the signed-in person's name, never the browser's value.
- Project admins can only request **worker** changes; Sales can only request **agent** changes.
- Approvals (`decideMaterialRequest`, `decideChangeRequest`) are Super Admin only; issuing stock is Super Admin + Warehouse.

### Setting up accounts

`npm run users:setup` creates six accounts (owner, warehouse, sales, one project admin per project), random passwords,
writes hashes to `.private/users.json` and plaintext to `.private/access.txt` (mode 0600). It refuses to overwrite without `--force`.
Mock mode reads `.private/users.json` when the server starts (restart after creating it). `npm run db:setup` copies the same accounts into the `users` table.
With no file, nobody can sign in: a fresh checkout is closed by default.

---

## 7. API operations

One dispatcher `src/app/api/[operation]/route.ts`. `{ data }` on success; `{ error }` otherwise:
`400` invalid, `401` not signed in, `403` wrong origin / role / project, `404` unknown or missing, `409` rule conflict,
`413` body over 64 KB, `429` too many sign-in attempts, `503` database unavailable.

```text
Session  POST login  POST logout  GET getSession
GET      getProjectList  getAccountList  getAccountSummary  getProjectStock  getWarehouseStock  getRequestList
         getChangeRequestList  getWorkerList  getLeadList  getSalesReport
POST     addAccountEntry  submitMaterialRequest  decideMaterialRequest  fulfillMaterialRequest  recordMaterialUsage
         addWarehouseItem  receiveWarehouseStock  requestPersonChange  decideChangeRequest  assignTask  setTaskStatus
         markAttendance  addLead  setLeadStatus  recordSale
GET      /api/health
```

---

## 8. Server container (swap point)

```ts
// src/server/container.ts
export const useMysql = process.env.DATA_STORAGE === "mysql";
const projectRepository = useMysql ? new MysqlProjectRepository() : new MockProjectRepository();
export const inventoryService = new InventoryService(
  useMysql ? new MysqlInventoryRepository() : new MockInventoryRepository(), projectRepository);
export const authService = new AuthService(
  useMysql ? new MysqlUserRepository() : new MemoryUserRepository(loadBootstrapUsers()),
  useMysql ? new MysqlSessionRepository() : memorySessions(), projectRepository);
```

Tests construct services with `repositories/mock/*` and `repositories/auth/memory.repository.ts`, so `npm test` needs no database.

---

## 9. npm scripts

```text
users:setup   create sign-in accounts                 db:prepare  dry run: list pending migrations
db:setup      create DB + migrate + seed + users      db:migrate  apply migrations only
db:check      assert expected tables/columns exist    data:seed   import demo JSON (missing rows only)
```

First run with MySQL:

```bash
cp .env.example .env.local          # set DATA_STORAGE=mysql and DATABASE_URL
npm run users:setup                 # passwords → .private/access.txt
npm run db:setup                    # create DB, migrate, import demo data, save users
npm run dev                         # http://127.0.0.1:3130/login
```

First run without MySQL: keep `DATA_STORAGE=mock`, run `npm run users:setup`, start the app.

---

## 10. CI/CD and deployment

`.gitlab-ci.yml`: **build** (every push; `mysql:8.0` service; wait-db → migrate twice to prove idempotency → check-schema → seed → test → typecheck → build → package → checksum)
and **deploy_production** (default branch, manual, `resource_group`). `scripts/ci/deploy.sh` verifies the checksum, uploads a release,
backs up (JSON, without password hashes or sessions), migrates with the new release, switches the `current` symlink, restarts systemd, health-checks `/api/health`
and switches back to `previous` if it fails.

Server layout: `/var/www/buildflow/{releases/<commit>-<job>, current, previous, shared/app.env, shared/.private, shared/backups}`.
`app.env` holds `DATABASE_URL`, `APP_ORIGIN` (https), `SITE_URL`, `DATA_STORAGE=mysql`. Create the production accounts once with
`npm run users:setup` on a trusted machine and `db:setup`, or insert them into `users` using `scripts/lib/password.mjs`.
Database rollback is not automatic; migrations are additive; restore from `shared/backups` deliberately.

---

## 11. Verification

| Check | What it proves |
| --- | --- |
| `npm test` (`tests/auth.test.ts`) | Wrong password / unknown email → same 401, lockout after 5 failures → 429, token stored only as hash, expiry, disabled account, project admin without project refused |
| `npm test` (`tests/services.test.ts`) | Business rules on mock repositories |
| `node scripts/verify-routes.mjs` | Signed-out redirects/401, per-role page access, per-role API access, project scoping, origin check, logout |
| `npm run db:check` | Every table/column the repositories query exists |
| `/api/health` | Database reachable (used by deploy) |

---

## 12. Not built (and why)

Blueprint parts left out because a CRM does not need them yet: CMS collections and admin editor, media uploads (`sharp`), site settings and
encrypted SMTP, public form submissions, `@tanstack/react-query`. Likely next steps: Facebook/Instagram lead webhook writing through
`SalesService.addLead`, report emails, user management screen for the Super Admin, audit log, transactional stock transfer.

## 13. Reusing this for another system

Keep `server/database`, `repositories/auth`, `services/auth*`, `server/auth`, `config/access.ts`, migration `001`/`003`, `scripts/ci/*`, `deploy/*`.
Change per project: roles in `models/site.ts` + `config/access.ts`, tables in `002_core.sql` + `scripts/lib/seed.mjs` + `check-schema.mjs`,
the `Mysql*Repository` adapters, operation role lists in `operations.ts`, names (cookie, pool key, migration lock, systemd unit, port, domain).
