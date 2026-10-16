"use client";

// The pieces the forms share, so they look and behave alike: the login, sign-up
// and password fields, and the buttons that post to a server action.

import { useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, fieldClass } from "./ui";

/** Re-exported for the client forms; server components import it from ./ui (a "use client" module only hands them references). */
export { fieldClass };

/** The form's one button; it says "Et øjeblik…" while the action runs. */
export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button type="submit" disabled={pending} aria-busy={pending || undefined} className={buttonClass("primary", "lg", "w-full")}>
      {pending ? (
        <>
          <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />
          Et øjeblik…
        </>
      ) : (
        children
      )}
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
    <p role="alert" className="rounded-field border border-critical/30 bg-critical/10 px-3 py-2.5 text-sm text-critical">
      {error}
    </p>
  ) : null;
}
