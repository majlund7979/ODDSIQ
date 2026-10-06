// Database login for the prediction engine's daily job (GitHub Actions, "PE predict").
//
// The job reads the site's fixtures and odds and writes to schema pe. Instead of someone
// creating a Neon role by hand, the site keeps a role `pe_writer` that can do only that and
// gives the job a fresh random password on each run (the previous one stops working).
// The role cannot change the site's tables, and the database refuses edits and deletes of
// predictions for every role (append-only triggers in schema pe).

export const PE_ROLE = "pe_writer";

/** The site tables the engine reads (public schema, Prisma names). */
export const SITE_TABLES = ["Event", "Team", "Market", "Selection", "OddsSnapshot", "StatsFixture"] as const;

/** Statements run as the site's database owner. `password` must be hex only. */
export function grantStatements(password: string): string[] {
  if (!/^[0-9a-f]{32,}$/.test(password)) throw new Error("password must be at least 32 hex characters");
  return [
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${PE_ROLE}') THEN CREATE ROLE ${PE_ROLE} LOGIN; END IF; END $$`,
    `ALTER ROLE ${PE_ROLE} WITH LOGIN PASSWORD '${password}'`,
    `GRANT USAGE ON SCHEMA public TO ${PE_ROLE}`,
    `GRANT SELECT ON ${SITE_TABLES.map((t) => `"${t}"`).join(", ")} TO ${PE_ROLE}`,
    `GRANT USAGE ON SCHEMA pe TO ${PE_ROLE}`,
    `GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA pe TO ${PE_ROLE}`,
    `GRANT USAGE ON ALL SEQUENCES IN SCHEMA pe TO ${PE_ROLE}`,
    `GRANT UPDATE (kickoff) ON pe.match TO ${PE_ROLE}`,
  ];
}

/** The site's connection string with the engine's role and password instead of the owner's. */
export function engineConnectionString(siteUrl: string, password: string): string {
  const u = new URL(siteUrl);
  u.username = PE_ROLE;
  u.password = password;
  return u.toString();
}
