import Link from "next/link";
import { Logo } from "@/components/Logo";
import { BottomNav, TopNav } from "@/components/MainNav";
import { ACCOUNT_NAV, ADMIN_NAV, FRIENDS_NAV, SIMPLE_NAV } from "@/components/nav";
import { InviteBar } from "@/components/InviteBar";
import { Badge } from "@/components/ui";
import { inviteOnly, isOwner, signedInFriend } from "@/lib/auth/friends";
import { ACCOUNTS_ENABLED } from "@/lib/auth/session";
import { DEMO_MODE } from "@/lib/data";
import { db } from "@/lib/db";

/** Accounts created so far, or null when the count cannot be read. Live, from our database. */
async function memberCount(): Promise<number | null> {
  try {
    return await db().user.count();
  } catch {
    return null;
  }
}

export default async function TerminalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Each page sends strangers to /login with its own path; the menu only renders for signed-in friends.
  const user = await signedInFriend();
  if (ACCOUNTS_ENABLED && !user) return <>{children}</>;
  const owner = Boolean(user && isOwner(user.email));
  const items = [...SIMPLE_NAV, ...(owner && inviteOnly() ? [FRIENDS_NAV] : []), ...(owner ? [ADMIN_NAV] : []), ...(user ? [ACCOUNT_NAV] : [])];
  const initial = user?.email.charAt(0).toUpperCase();
  const count = user ? await memberCount() : null;
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-page">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Logo badge={DEMO_MODE ? <Badge tone="warning" className="whitespace-nowrap">DEMO DATA</Badge> : null} />
          <div className="ml-auto flex min-w-0 items-center gap-2 xl:gap-3">
            <TopNav items={items.filter((i) => i !== ACCOUNT_NAV)} />
            {user && <InviteBar count={count} />}
            {user && (
              <Link
                href="/account"
                title={user.email}
                aria-label={`Min konto (${user.email})`}
                className="hidden h-10 w-10 items-center justify-center rounded-full border border-line-strong bg-surface-2 text-sm font-bold text-ink hover:border-accent xl:flex"
              >
                {initial}
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-8 md:pt-8 xl:pb-16">{children}</main>
      <footer className="mx-auto w-full max-w-6xl border-t border-line px-4 pt-6 pb-28 text-xs text-muted xl:py-8 xl:text-sm">
        Kun analyse, vi formidler ikke spil. 18+. Spil indebærer risiko for tab. Brug for hjælp? Kontakt StopSpillet.dk.
      </footer>
      <BottomNav items={items} />
    </div>
  );
}
