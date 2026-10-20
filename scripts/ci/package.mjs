// Assembles the standalone runtime into dist/runtime (run after `next build`).
// It carries the app, static files, public assets, migrations and the DB scripts the deploy needs.
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "dist", "runtime");

await rm(path.join(root, "dist"), { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(path.join(root, ".next", "standalone"), out, { recursive: true });
await cp(path.join(root, ".next", "static"), path.join(out, ".next", "static"), { recursive: true });
await cp(path.join(root, "public"), path.join(out, "public"), { recursive: true });
await cp(path.join(root, "database"), path.join(out, "database"), { recursive: true });
await cp(path.join(root, "scripts", "ci"), path.join(out, "scripts", "ci"), { recursive: true });
await cp(path.join(root, "scripts", "lib"), path.join(out, "scripts", "lib"), { recursive: true });
await cp(path.join(root, "src", "data", "mock"), path.join(out, "src", "data", "mock"), { recursive: true });
console.log(`runtime assembled in ${path.relative(root, out)}`);
