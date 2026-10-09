"use client";

// A tint over a menu link while the page it opens is on its way, so a tap on a
// slow connection does not look ignored. Always rendered, so nothing moves.

import { useLinkStatus } from "next/link";

/** Put inside a `relative` Link. */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={`pointer-events-none absolute inset-0 rounded-[inherit] bg-current transition-opacity delay-100 ${pending ? "opacity-15" : "opacity-0"}`} />;
}
