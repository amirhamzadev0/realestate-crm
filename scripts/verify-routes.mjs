// Usage: start the app (npm run dev, or npm start after a build), then:  node scripts/verify-routes.mjs
// Signs in with the accounts from .private/access.txt (npm run users:setup) and checks who may open what.
import { readFile } from "node:fs/promises";

const base = process.env.APP_ORIGIN ?? "http://127.0.0.1:3130";

// Sign-in checks only make sense when the server runs with AUTH_ENABLED=true.
const session = await (await fetch(`${base}/api/getSession`)).json();
if (session.data?.user) {
  console.log("Sign-in is switched off on this server (AUTH_ENABLED is not true). Nothing to check.");
  process.exit(0);
}

// ---- accounts ----
const accounts = {};
for (const line of (await readFile(".private/access.txt", "utf8")).split("\n")) {
  const match = line.match(/^(\S+)\s+(\S+@\S+)\s+(\S+)$/);
  if (match) accounts[match[2].split("@")[0]] = { email: match[2], password: match[3] };
}

let failed = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label} -> ${actual}${ok ? "" : ` (expected ${expected})`}`);
};

async function signIn(name) {
  const { email, password } = accounts[name];
  const response = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ email, password }),
  });
  const cookie = response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { status: response.status, cookie, home: (await response.json()).data?.home };
}

const get = (path, cookie) => fetch(base + path, { redirect: "manual", headers: cookie ? { cookie } : {} });
const post = (path, body, cookie, origin = base) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

// ---- signed out ----
for (const path of ["/superadmin", "/warehouse", "/sales", "/projects", "/projects/green-valley", "/"]) {
  const r = await get(path);
  check(`signed out GET ${path}`, `${r.status} ${new URL(r.headers.get("location") ?? "x:", base).pathname}`, "307 /login");
}
check("GET /login", (await get("/login")).status, 200);
check("GET /api/health", (await get("/api/health")).status, 200);
check("signed out API read", (await get("/api/getProjectList")).status, 401);
check("signed out API write", (await post("/api/addLead", {})).status, 401);
check("unknown operation", (await get("/api/doesNotExist")).status, 404);
check("POST from wrong origin", (await post("/api/login", {}, undefined, "http://evil.test")).status, 403);
check("login with wrong password", (await fetch(`${base}/api/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ email: accounts.owner.email, password: "wrong" }) })).status, 401);
check("login with bad email", (await fetch(`${base}/api/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ email: "x", password: "y" }) })).status, 400);

// ---- page access per role ----
const matrix = {
  owner: { home: "/superadmin", open: ["/superadmin", "/superadmin/projects", "/superadmin/approvals", "/projects", "/projects/green-valley", "/projects/green-valley/accounts", "/projects/green-valley/inventory", "/projects/green-valley/hr", "/warehouse", "/sales", "/sales/leads", "/sales/campaigns", "/sales/agents", "/sales/reports"], bounced: [] },
  warehouse: { home: "/warehouse", open: ["/warehouse"], bounced: ["/superadmin", "/sales", "/projects/green-valley"] },
  sales: { home: "/sales", open: ["/sales", "/sales/leads", "/sales/campaigns", "/sales/agents", "/sales/reports"], bounced: ["/superadmin", "/warehouse", "/projects/green-valley"] },
  "green-valley": { home: "/projects/green-valley", open: ["/projects/green-valley", "/projects/green-valley/accounts", "/projects/green-valley/inventory", "/projects/green-valley/hr"], bounced: ["/superadmin", "/warehouse", "/sales", "/projects/skyline-heights", "/projects"] },
};
const sessions = {};
for (const [name, rules] of Object.entries(matrix)) {
  const session = await signIn(name);
  sessions[name] = session.cookie;
  check(`${name}: login`, `${session.status} ${session.home}`, `200 ${rules.home}`);
  for (const path of rules.open) check(`${name}: GET ${path}`, (await get(path, session.cookie)).status, 200);
  for (const path of rules.bounced) {
    const r = await get(path, session.cookie);
    check(`${name}: GET ${path} bounced home`, `${r.status} ${new URL(r.headers.get("location") ?? "x:", base).pathname}`, `307 ${rules.home}`);
  }
}
check("unknown project (owner)", (await get("/projects/nope", sessions.owner)).status, 404);

// ---- API access per role ----
const own = sessions["green-valley"];
check("project admin reads own accounts", (await get("/api/getAccountSummary?projectId=p1", own)).status, 200);
check("project admin cannot read another project", (await get("/api/getAccountSummary?projectId=p2", own)).status, 403);
check("project admin project list is only theirs", (await (await get("/api/getProjectList", own)).json()).data.length, 1);
check("project admin cannot approve requests", (await post("/api/decideMaterialRequest", { requestId: "x", decision: "approved" }, own)).status, 403);
check("project admin cannot place an order", (await post("/api/orderMaterial", { projectId: "p1", materialId: "m1", quantity: 1 }, own)).status, 403);
check("project admin cannot cancel an order", (await post("/api/rejectMaterialRequest", { requestId: "r3" }, own)).status, 403);
check("project admin cannot receive another project's order", (await post("/api/receiveMaterial", { requestId: "r4" }, own)).status, 404);
check("project admin cannot post another project's entry", (await post("/api/addAccountEntry", { projectId: "p2", date: "2026-10-01", type: "expense", amount: 1, description: "x", party: "x" }, own)).status, 403);
check("project admin cannot request agent changes", (await post("/api/requestPersonChange", { kind: "agent", action: "add", payload: {} }, own)).status, 403);
check("warehouse cannot read accounts", (await get("/api/getAccountSummary?projectId=p1", sessions.warehouse)).status, 403);
check("orders desk reads requests", (await get("/api/getRequestList", sessions.warehouse)).status, 200);
check("orders desk cannot decide requests", (await post("/api/decideMaterialRequest", { requestId: "r1", decision: "approved" }, sessions.warehouse)).status, 403);
check("sales cannot read requests", (await get("/api/getRequestList", sessions.sales)).status, 403);
check("sales reads report", (await get("/api/getSalesReport", sessions.sales)).status, 200);
check("owner invalid body", (await post("/api/addLead", { name: "" }, sessions.owner)).status, 400);
check("owner reads without projectId", (await get("/api/getAccountSummary", sessions.owner)).status, 400);

// ---- sign out ----
check("logout", (await post("/api/logout", {}, sessions.sales)).status, 200);
check("session dead after logout", (await get("/api/getSalesReport", sessions.sales)).status, 401);

process.exit(failed ? 1 : 0);
