"use client";

import { useActionState } from "react";
import { requestReset, resetPassword, type ResetState } from "@/app/reset-actions";

const input =
  "mt-1.5 w-full rounded-[10px] border border-line-strong bg-surface px-3.5 py-3 text-[15px] outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-lime";
const button =
  "w-full rounded-full bg-lime px-3 py-3 text-[16px] font-semibold text-accent transition-colors hover:brightness-125 disabled:opacity-60";

function FormError({ state }: { state: ResetState }) {
  return state.error ? (
    <p role="alert" className="rounded-lg bg-critical/10 px-3 py-2 text-sm text-serious">
      {state.error}
    </p>
  ) : null;
}

/** Step 1: the e-mail to send the link to. */
export function RequestResetForm() {
  const [state, action, pending] = useActionState(requestReset, {});
  if (state.sent)
    return (
      <p className="rounded-lg border border-line bg-surface-2 px-3 py-3 text-sm leading-relaxed text-ink">
        Hvis der findes en konto med <b>{state.email}</b>, har vi sendt en mail med et link. Linket virker i 30 minutter. Kig også i spam.
      </p>
    );
  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm font-medium text-ink-2">
        Email
        <input name="email" type="email" autoComplete="email" required defaultValue={state.email} placeholder="dig@eksempel.dk" className={input} />
      </label>
      <FormError state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Et øjeblik…" : "Send link"}
      </button>
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
        <input name="password" type="password" autoComplete="new-password" required minLength={10} className={input} />
        <span className="mt-1.5 block text-xs font-normal text-muted">Mindst 10 tegn.</span>
      </label>
      <label className="block text-sm font-medium text-ink-2">
        Gentag adgangskoden
        <input name="repeat" type="password" autoComplete="new-password" required minLength={10} className={input} />
      </label>
      <FormError state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Et øjeblik…" : "Gem og log ind"}
      </button>
    </form>
  );
}
