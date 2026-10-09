"use client";

import { useActionState } from "react";
import type { AuthState } from "@/app/auth-actions";
import { fieldClass, FormError, SubmitButton } from "@/components/forms";

export function AuthForm({ action, submitLabel, next, passwordHint }: { action: (s: AuthState, f: FormData) => Promise<AuthState>; submitLabel: string; next: string; passwordHint?: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm font-medium text-ink-2">
        Email
        <input name="email" type="email" autoComplete="email" required defaultValue={state.email} placeholder="dig@eksempel.dk" className={fieldClass} />
      </label>
      <label className="block text-sm font-medium text-ink-2">
        Adgangskode
        <input name="password" type="password" autoComplete={passwordHint ? "new-password" : "current-password"} required className={fieldClass} />
        {passwordHint && <span className="mt-1.5 block text-xs font-normal text-muted">{passwordHint}</span>}
      </label>
      <FormError error={state.error} />
      <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
    </form>
  );
}
