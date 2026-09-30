import { defineConfig } from "prisma/config";

// DATABASE_URL is read from the environment (see .env.example). Only needed
// for migrations and the demo seed; the app itself runs without a database
// while DEMO_MODE=true.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations need a direct connection; hosted Postgres (e.g. Neon on Vercel) also provides a pooled one.
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "postgresql://localhost:5432/oddsiq",
  },
});
