import { describe, expect, it } from "vitest";
import { validateCredentials } from "./password";
import { MIN_PASSWORD_LENGTH, passwordProblem, validEmail } from "./rules";

const SHORT = `Adgangskoden skal være mindst ${MIN_PASSWORD_LENGTH} tegn.`;
const LONG = "Adgangskoden er for lang.";
const BAD_EMAIL = "Skriv en gyldig email.";
const ok = "a".repeat(MIN_PASSWORD_LENGTH);

/** Email, password and the answer sign-up has always given. */
const cases: [string, string, string | null][] = [
  ["mads@example.com", ok, null],
  ["mads@example.com", "a".repeat(MIN_PASSWORD_LENGTH - 1), SHORT],
  ["mads@example.com", "", SHORT],
  ["mads@example.com", "a".repeat(200), null],
  ["mads@example.com", "a".repeat(201), LONG],
  ["mads@example.com", "a".repeat(500), LONG],
  ["nope", ok, BAD_EMAIL],
  ["a@b", ok, BAD_EMAIL],
  ["a b@c.dk", ok, BAD_EMAIL],
  ["a@@b.dk", ok, BAD_EMAIL],
  ["nope", "kort", BAD_EMAIL],
  [`${"a".repeat(243)}@example.dk`, ok, null],
  [`${"a".repeat(244)}@example.dk`, ok, BAD_EMAIL],
];

describe("account rules", () => {
  it("gives the same answers as sign-up", () => {
    expect(`${"a".repeat(243)}@example.dk`).toHaveLength(254);
    for (const [email, password, want] of cases) {
      expect(validEmail(email) ? passwordProblem(password) : BAD_EMAIL).toBe(want);
      expect(validateCredentials(email, password)).toBe(want);
    }
  });
});
