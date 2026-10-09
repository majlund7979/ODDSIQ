// The pieces the login, sign-up and password forms share, so they look alike.

import type { ReactNode } from "react";

export const fieldClass =
  "mt-1.5 w-full rounded-[10px] border border-line-strong bg-surface px-3.5 py-3 text-[15px] outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-lime";

/** The form's one button; it says "Et øjeblik…" while the action runs. */
export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button type="submit" disabled={pending} className="w-full rounded-full bg-lime px-3 py-3 text-[16px] font-semibold text-accent transition-colors hover:brightness-125 disabled:opacity-60">
      {pending ? "Et øjeblik…" : children}
    </button>
  );
}

/** The action's error message, announced to screen readers; nothing when there is none. */
export function FormError({ error }: { error?: string }) {
  return error ? (
    <p role="alert" className="rounded-lg bg-critical/10 px-3 py-2 text-sm text-serious">
      {error}
    </p>
  ) : null;
}
