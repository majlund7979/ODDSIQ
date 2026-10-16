import Link from "next/link";
import { Logo } from "./Logo";
import { segmentClass, segmentedGroup } from "./ui";

/** The login and signup box: logo, the two tabs, and the form. */
export function AuthCard({ mode, next, notice, inviteOnly, children }: { mode: "login" | "signup"; next: string; notice?: string; inviteOnly: boolean; children: React.ReactNode }) {
  const q = next !== "/picks" ? `?next=${encodeURIComponent(next)}` : "";
  const tab = (active: boolean) => segmentClass(active);
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start gap-3">
        <Logo />
        <p className="text-sm text-ink-2">Dagens bedste fodbold-bets. {inviteOnly ? "Kun for inviterede venner." : "Log ind eller opret en gratis konto."}</p>
      </div>
      <div className="rounded-sheet border border-line bg-surface p-6 shadow-[var(--shadow-pop)] sm:p-7">
        <div className={`mb-6 ${segmentedGroup}`}>
          <Link href={`/login${q}`} aria-current={mode === "login" ? "page" : undefined} className={tab(mode === "login")}>
            Log ind
          </Link>
          <Link href={`/signup${q}`} aria-current={mode === "signup" ? "page" : undefined} className={tab(mode === "signup")}>
            Opret konto
          </Link>
        </div>
        {notice && <p role="status" className="mb-5 rounded-field border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-ink">{notice}</p>}
        {children}
      </div>
    </div>
  );
}
