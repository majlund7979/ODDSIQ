// Postgres access. The site runs without a database in DEMO_MODE; accounts,
// billing and live-feed ingestion need DATABASE_URL.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

export const DATABASE_CONFIGURED = Boolean(process.env.DATABASE_URL);

const globalForDb = globalThis as unknown as { oddsiqPrisma?: PrismaClient };

export function db(): PrismaClient {
  if (!DATABASE_CONFIGURED) throw new Error("DATABASE_URL is not set.");
  globalForDb.oddsiqPrisma ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  return globalForDb.oddsiqPrisma;
}
