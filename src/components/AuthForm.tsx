"use client";

import { useActionState } from "react";
import type { AuthState } from "@/app/auth-actions";

export function AuthForm({ action, submitLabel, next, passwordHint }: { action: (s: AuthState, f: FormData) => Promise<AuthState>; submitLabel: string; next: string; passwordHint?: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  const input = "mt-1.5 w-full rounded-xl border border-line-strong bg-surface-2 px-3.5 py-3 text-[15px] outline-none transition-colors placeholder:text-muted focus:border-accent";
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm font-medium text-ink-2">
        Email
        <input name="email" type="email" autoComplete="email" required defaultValue={state.email} placeholder="dig@eksempel.dk" className={input} />
      </label>
      <label className="block text-sm font-medium text-ink-2">
        Adgangskode
        <input name="password" type="password" autoComplete={passwordHint ? "new-password" : "current-password"} required className={input} />
        {passwordHint && <span className="mt-1.5 block text-xs font-normal text-muted">{passwordHint}</span>}
      </label>
      {state.error && (
        <p role="alert" className="rounded-lg bg-critical/10 px-3 py-2 text-sm text-serious">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="w-full rounded-xl bg-accent px-3 py-3 text-[15px] font-semibold text-page transition-opacity hover:opacity-90 disabled:opacity-60">
        {pending ? "Et øjeblik…" : submitLabel}
      </button>
    </form>
  );
}
