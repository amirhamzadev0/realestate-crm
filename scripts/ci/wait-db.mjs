// Waits until MySQL accepts connections (used by CI before migrating).
import { connect } from "../lib/db.mjs";

const attempts = 30;
for (let i = 1; i <= attempts; i++) {
  try {
    const conn = await connect();
    await conn.query("SELECT 1");
    await conn.end();
    console.log("database ready");
    process.exit(0);
  } catch (error) {
    if (i === attempts) {
      console.error(`database not reachable: ${error.message}`);
      process.exit(1);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
