import { describe, expect, it } from "vitest";
import { engineConnectionString, grantStatements } from "./credentials";

const PW = "0123456789abcdef0123456789abcdef";

describe("prediction engine credentials", () => {
  it("swaps in the engine role and keeps host, database and options", () => {
    const s = engineConnectionString("postgresql://neondb_owner:secret@ep-x-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require", PW);
    expect(s).toBe(`postgresql://pe_writer:${PW}@ep-x-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`);
    expect(s).not.toContain("secret");
  });

  it("grants reading the site's tables and inserting into schema pe, nothing else", () => {
    const sql = grantStatements(PW).join(";\n");
    expect(sql).toContain(`GRANT SELECT ON "Event", "Team", "Market", "Selection", "OddsSnapshot", "StatsFixture" TO pe_writer`);
    expect(sql).toContain("GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA pe TO pe_writer");
    expect(sql).not.toMatch(/DELETE|TRUNCATE|SUPERUSER|CREATEROLE|ALL PRIVILEGES/);
  });

  it("refuses a password that could break out of the SQL string", () => {
    expect(() => grantStatements("abc'; DROP TABLE x; --")).toThrow();
  });
});
