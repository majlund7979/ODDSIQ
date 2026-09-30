// Build command on Vercel (npm run vercel-build). Applies database migrations
// first when a database is connected, so a deploy never runs new code against
// an old schema; without DATABASE_URL (DEMO_MODE) it only builds.

import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

if (process.env.DATABASE_URL) {
  console.log("DATABASE_URL is set: applying migrations.");
  run("npx prisma migrate deploy");
} else {
  console.log("No DATABASE_URL: skipping migrations.");
}
run("npx next build");
