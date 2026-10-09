// Gives the prediction engine's daily job ("PE predict" workflow) a database login:
// role pe_writer, which may read the site's fixtures and odds and insert into schema pe.
// Each call sets a new random password, so a login is only good until the next run.
// Call with POST and `Authorization: Bearer $CRON_SECRET`.

import { randomBytes } from "node:crypto";
import { cronAuthorized } from "@/lib/auth/cron";
import { db } from "@/lib/db";
import { engineConnectionString, grantStatements } from "@/lib/prediction-engine/credentials";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!cronAuthorized(req)) return new Response("Unauthorized.", { status: 401 });
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) return Response.json({ error: "no DATABASE_URL" }, { status: 500 });
  const password = randomBytes(24).toString("hex");
  try {
    const prisma = db();
    for (const sql of grantStatements(password)) await prisma.$executeRawUnsafe(sql);
  } catch (e) {
    // The error names the failing statement's problem, never the password.
    const msg = e instanceof Error ? e.message.replaceAll(password, "***") : "unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
  return Response.json({ url: engineConnectionString(url, password) }, { headers: { "cache-control": "no-store" } });
}
