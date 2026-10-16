"use client";

import { useActionState, useEffect, useRef } from "react";
import { addFriend, type FriendState } from "@/app/auth-actions";
import { buttonClass, fieldBase } from "./ui";

export function FriendForm() {
  const [state, action, pending] = useActionState<FriendState, FormData>(addFriend, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  const input = fieldBase;
  return (
    <form ref={form} action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr]">
        <input name="name" placeholder="Navn (valgfrit)" aria-label="Navn" className={input} />
        <input name="email" type="email" required placeholder="vens@email.dk" aria-label="Email" className={input} />
      </div>
      <button type="submit" disabled={pending} aria-busy={pending || undefined} className={buttonClass("primary", "lg", "w-full")}>
        {pending ? "Et øjeblik…" : "Inviter ven"}
      </button>
      {state.error && <p role="alert" className="text-sm text-critical">{state.error}</p>}
      {state.ok && <p role="status" className="text-sm text-good">{state.ok}</p>}
    </form>
  );
}
