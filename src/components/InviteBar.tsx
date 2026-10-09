"use client";

// Top right of the header: how many have signed up (left out below 360 px, where the
// header has no room for it), and a button that e-mails a friend an invite.

import { useActionState, useEffect, useRef, useState } from "react";
import { inviteFriend, type InviteState } from "@/app/invite-actions";

const people = (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.7 3.1 2.4 3.5 5.2" />
  </svg>
);

export function InviteBar({ count }: { count: number | null }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteFriend, {});
  const box = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const input = "w-full rounded-xl border border-line-strong bg-surface-2 px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent";
  return (
    <div ref={box} className="relative">
      <div className="flex h-10 items-center gap-1 rounded-full border border-line bg-surface-2 p-1 pl-3">
        {count !== null && (
          <span className="hidden items-center gap-1.5 pr-1 text-sm text-ink-2 min-[360px]:flex" title={`Live tal: ${count} konti oprettet i alt, fra vores database.`}>
            {people}
            <span className="num font-semibold text-ink">{count}</span>
            <span className="sr-only"> tilmeldt</span>
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="rounded-full bg-lime px-3 py-1.5 text-sm font-semibold text-accent hover:brightness-125"
        >
          Invitér
        </button>
      </div>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-line-strong bg-surface p-4 shadow-2xl shadow-black/40">
          <div className="font-bold">Invitér en ven</div>
          <p className="mt-1 text-xs leading-snug text-muted">Vi sender en mail med et link til at oprette en gratis konto. Din vens adresse bruges kun til den ene mail.</p>
          <form ref={form} action={action} className="mt-3 space-y-2">
            <input name="name" placeholder="Navn (valgfrit)" aria-label="Navn" maxLength={60} className={input} />
            <input name="email" type="email" required placeholder="vens@email.dk" aria-label="Email" className={input} autoFocus />
            <button type="submit" disabled={pending} className="w-full rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60">
              {pending ? "Sender…" : "Send invitation"}
            </button>
          </form>
          {state.ok && <p className="mt-2 text-sm text-good">{state.ok}</p>}
          {state.error && <p className="mt-2 text-sm text-serious">{state.error}</p>}
          {state.link && (
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-2 px-2 py-1.5 text-xs">{state.link}</code>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(state.link!).then(() => setCopied(true))}
                className="shrink-0 rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:border-accent"
              >
                {copied ? "Kopieret" : "Kopiér"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
