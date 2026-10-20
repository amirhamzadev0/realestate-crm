# BuildFlow Real Estate CRM

Management CRM for a real estate builder: Super Admin, per-project Accounts / Inventory / HR,
central Warehouse, and a Sales department with agents, leads and commission.

Phase 1 is frontend only and runs on in-memory mock data. See [projectmetadata.md](projectmetadata.md)
for the structure, rules and Phase 2 plan.

```bash
npm install
cp .env.example .env.local   # APP_ORIGIN must match the dev URL
npm run dev                  # http://127.0.0.1:3130
npm run typecheck
npm test
npm run build
```
