import Link from "next/link";
import { Logo } from "./Logo";

/** The login and signup box: logo, the two tabs, and the form. */
export function AuthCard({ mode, next, notice, inviteOnly, children }: { mode: "login" | "signup"; next: string; notice?: string; inviteOnly: boolean; children: React.ReactNode }) {
  const q = next !== "/picks" ? `?next=${encodeURIComponent(next)}` : "";
  const tab = (active: boolean) => `flex-1 rounded-lg py-2 text-center text-sm font-medium ${active ? "bg-surface-3 text-ink" : "text-ink-2 hover:text-ink"}`;
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo />
        <p className="text-sm text-ink-2">Dagens bedste fodbold-bets. {inviteOnly ? "Kun for inviterede venner." : "Log ind eller opret en gratis konto."}</p>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-2xl shadow-black/30">
        <div className="mb-5 flex gap-1 rounded-xl bg-surface-2 p-1">
          <Link href={`/login${q}`} aria-current={mode === "login" ? "page" : undefined} className={tab(mode === "login")}>
            Log ind
          </Link>
          <Link href={`/signup${q}`} aria-current={mode === "signup" ? "page" : undefined} className={tab(mode === "signup")}>
            Opret konto
          </Link>
        </div>
        {notice && <p className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-ink">{notice}</p>}
        {children}
      </div>
    </div>
  );
}
