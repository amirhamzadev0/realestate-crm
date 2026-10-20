// Loads .env.local the same way Next.js does, so scripts and the app see the same settings.
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

export function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Add it to .env.local, for example:");
    console.error("  DATABASE_URL=mysql://user:password@127.0.0.1:3306/buildflow_crm");
    process.exit(1);
  }
  return url;
}
