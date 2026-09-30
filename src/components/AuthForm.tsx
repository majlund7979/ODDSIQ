"use client";

import { useActionState } from "react";
import type { AuthState } from "@/app/auth-actions";

export function AuthForm({ action, submitLabel, next, passwordHint }: { action: (s: AuthState, f: FormData) => Promise<AuthState>; submitLabel: string; next: string; passwordHint?: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  const input = "w-full rounded border border-line-strong bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent";
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <label className="block text-xs text-ink-2">
        Email
        <input name="email" type="email" autoComplete="email" required defaultValue={state.email} className={`${input} mt-1`} />
      </label>
      <label className="block text-xs text-ink-2">
        Password
        <input name="password" type="password" autoComplete={submitLabel === "Create account" ? "new-password" : "current-password"} required className={`${input} mt-1`} />
        {passwordHint && <span className="mt-1 block text-[11px] text-muted">{passwordHint}</span>}
      </label>
      {state.error && (
        <p role="alert" className="text-xs text-serious">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="w-full rounded bg-accent px-3 py-2 text-sm font-medium text-page disabled:opacity-60">
        {pending ? "One moment…" : submitLabel}
      </button>
    </form>
  );
}
