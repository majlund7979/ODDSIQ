"use client";

import { useActionState, useEffect, useRef } from "react";
import { addFriend, type FriendState } from "@/app/auth-actions";

export function FriendForm() {
  const [state, action, pending] = useActionState<FriendState, FormData>(addFriend, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  const input = "w-full rounded-xl border border-line-strong bg-surface-2 px-3.5 py-2.5 text-[15px] outline-none placeholder:text-muted focus:border-accent";
  return (
    <form ref={form} action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr]">
        <input name="name" placeholder="Navn (valgfrit)" aria-label="Navn" className={input} />
        <input name="email" type="email" required placeholder="vens@email.dk" aria-label="Email" className={input} />
      </div>
      <button type="submit" disabled={pending} className="w-full rounded-full bg-lime px-4 py-2.5 text-[15px] font-semibold text-accent hover:brightness-125 disabled:opacity-60">
        {pending ? "Et øjeblik…" : "Inviter ven"}
      </button>
      {state.error && <p className="text-sm text-serious">{state.error}</p>}
      {state.ok && <p className="text-sm text-good">{state.ok}</p>}
    </form>
  );
}
