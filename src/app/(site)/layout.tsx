import Link from "next/link";
import { ACCOUNTS_ENABLED, currentUser } from "@/lib/auth/session";

export default async function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="text-[15px] font-bold tracking-[0.18em]">
            ODDSIQ
          </Link>
          <nav aria-label="Site" className="flex gap-5 text-sm text-ink-2">
            <Link href="/#accountability" className="hover:text-ink">
              Accountability
            </Link>
            <Link href="/#pricing" className="hover:text-ink">
              Pricing
            </Link>
            <Link href="/model-lab/ledger" className="hidden hover:text-ink sm:inline">
              Prediction ledger
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {ACCOUNTS_ENABLED &&
              (user ? (
                <Link href="/account" className="text-ink-2 hover:text-ink">
                  {user.email}
                </Link>
              ) : (
                <Link href="/login" className="text-ink-2 hover:text-ink">
                  Sign in
                </Link>
              ))}
            <Link href="/picks" className="rounded border border-line-strong px-3 py-1.5 hover:bg-surface-2">
              Dagens bets
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs leading-relaxed text-muted">
          ODDSIQ is an analytics platform. No bets are placed or brokered, and nothing here is betting advice. Historical figures are labelled historical or simulated and never imply future results. 18+. Gambling involves risk of loss; if it stops being fun, get support from your national gambling helpline.
        </div>
      </footer>
    </div>
  );
}
