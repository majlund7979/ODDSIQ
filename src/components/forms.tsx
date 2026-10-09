"use client";

// The pieces the forms share, so they look and behave alike: the login, sign-up
// and password fields, and the buttons that post to a server action.

import { useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

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

const noSubscription = () => () => {};

/**
 * A submit button for a form whose action is a server action. While it runs, a spinner covers the label, which keeps
 * its width so nothing moves, and screen readers hear "Et øjeblik…". With `confirm`, it asks first and does nothing
 * when the answer is no; until the page's script has loaded it stays disabled, so it never posts without asking.
 */
export function PendingButton({ children, className = "", confirm, "aria-label": label }: { children: ReactNode; className?: string; confirm?: string; "aria-label"?: string }) {
  const { pending } = useFormStatus();
  const hydrated = useSyncExternalStore(noSubscription, () => true, () => false);
  const ask = (e: MouseEvent) => {
    if (confirm && !window.confirm(confirm)) e.preventDefault();
  };
  return (
    <>
      <button
        type="submit"
        disabled={pending || (confirm !== undefined && !hydrated)}
        aria-label={pending ? undefined : label}
        aria-busy={pending || undefined}
        onClick={ask}
        className={`relative ${className}`}
      >
        {pending ? (
          <>
            <span className="invisible">{children}</span>
            <span className="absolute inset-0 flex items-center justify-center">
              <span aria-hidden className="h-[1em] w-[1em] animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />
              <span className="sr-only">Et øjeblik…</span>
            </span>
          </>
        ) : (
          children
        )}
      </button>
      <span role="status" className="sr-only">
        {pending ? "Et øjeblik…" : ""}
      </span>
    </>
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
