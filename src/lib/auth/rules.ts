// What counts as a valid email and password for an account. No node imports,
// so the forms can show the same rules the server actions check.

export const MIN_PASSWORD_LENGTH = 10;

export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;

/** Why a new password is refused, or null when it is fine. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Adgangskoden skal være mindst ${MIN_PASSWORD_LENGTH} tegn.`;
  if (password.length > 200) return "Adgangskoden er for lang.";
  return null;
}
