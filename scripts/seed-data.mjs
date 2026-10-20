// npm run data:seed : import the demo JSON into an already-migrated database (missing rows only).
import { connect } from "./lib/db.mjs";
import { seedData } from "./lib/seed.mjs";

const conn = await connect();
try {
  await seedData(conn);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
