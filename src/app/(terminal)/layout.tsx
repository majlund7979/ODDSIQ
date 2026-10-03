import Link from "next/link";
import { Logo } from "@/components/Logo";
import { BottomNav, TopNav } from "@/components/MainNav";
import { ACCOUNT_NAV, FRIENDS_NAV, SIMPLE_NAV } from "@/components/nav";
import { Badge } from "@/components/ui";
import { isOwner, requireFriend } from "@/lib/auth/friends";
import { DEMO_MODE } from "@/lib/data";

export default async function TerminalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Every page checks again itself; this keeps the menu from rendering for strangers.
  const user = await requireFriend();
  const items = [...SIMPLE_NAV, ...(user && isOwner(user.email) ? [FRIENDS_NAV] : []), ...(user ? [ACCOUNT_NAV] : [])];
  const initial = user?.email.charAt(0).toUpperCase();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-page/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-6 px-4">
          <Logo />
          {DEMO_MODE && <Badge tone="warning">Demo data</Badge>}
          <div className="ml-auto flex items-center gap-3">
            <TopNav items={items.filter((i) => i !== ACCOUNT_NAV)} />
            {user && (
              <Link
                href="/account"
                title={user.email}
                className="hidden h-9 w-9 items-center justify-center rounded-full border border-line-strong bg-surface-2 text-sm font-semibold text-ink hover:border-accent md:flex"
              >
                {initial}
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 md:pb-12">{children}</main>
      <footer className="mx-auto hidden w-full max-w-5xl px-4 pb-8 text-xs text-muted md:block">
        Kun analyse, vi formidler ikke spil. 18+. Spil indebærer risiko for tab. Brug for hjælp? Kontakt StopSpillet.dk.
      </footer>
      <BottomNav items={items} />
    </div>
  );
}
