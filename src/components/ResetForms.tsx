"use client";

import { useActionState } from "react";
import { requestReset, resetPassword } from "@/app/reset-actions";
import { fieldClass, FormError, SubmitButton } from "@/components/forms";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/rules";

/** Step 1: the e-mail to send the link to. The page passes RESET_MINUTES in, because reset.ts is server-only. */
export function RequestResetForm({ minutes }: { minutes: number }) {
  const [state, action, pending] = useActionState(requestReset, {});
  if (state.sent)
    return (
      <p className="rounded-lg border border-line bg-surface-2 px-3 py-3 text-sm leading-relaxed text-ink">
        Hvis der findes en konto med <b>{state.email}</b>, har vi sendt en mail med et link. Linket virker i {minutes} minutter. Kig også i spam.
      </p>
    );
  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm font-medium text-ink-2">
        Email
        <input name="email" type="email" autoComplete="email" required defaultValue={state.email} placeholder="dig@eksempel.dk" className={fieldClass} />
      </label>
      <FormError error={state.error} />
      <SubmitButton pending={pending}>Send link</SubmitButton>
    </form>
  );
}

/** Step 2: the new password, from the link in the e-mail. */
export function NewPasswordForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(resetPassword, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <label className="block text-sm font-medium text-ink-2">
        Ny adgangskode
        <input name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} className={fieldClass} />
        <span className="mt-1.5 block text-xs font-normal text-muted">{`Mindst ${MIN_PASSWORD_LENGTH} tegn.`}</span>
      </label>
      <label className="block text-sm font-medium text-ink-2">
        Gentag adgangskoden
        <input name="repeat" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} className={fieldClass} />
      </label>
      <FormError error={state.error} />
      <SubmitButton pending={pending}>Gem og log ind</SubmitButton>
    </form>
  );
}
