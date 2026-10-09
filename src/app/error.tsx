"use client";

import { ErrorCard } from "@/components/ErrorCard";
import { FOOTER_LINE } from "@/components/footer-line";
import { Logo } from "@/components/Logo";

/** Errors outside the menu's own boundary: the menu's sign-in lookup failing, or a login page. */
export default function RootError({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <Logo />
      <ErrorCard retry={retry} />
      <footer className="text-center text-xs leading-relaxed text-muted">{FOOTER_LINE}</footer>
    </main>
  );
}
