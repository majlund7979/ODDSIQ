import Link from "next/link";
import { Logo } from "@/components/Logo";
import { BottomNav, TopNav } from "@/components/MainNav";
import { ACCOUNT_NAV, ADMIN_NAV, FRIENDS_NAV, SIMPLE_NAV } from "@/components/nav";
import { Badge } from "@/components/ui";
import { inviteOnly, isOwner, signedInFriend } from "@/lib/auth/friends";
import { ACCOUNTS_ENABLED } from "@/lib/auth/session";
import { DEMO_MODE } from "@/lib/data";

export default async function TerminalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Each page sends strangers to /login with its own path; the menu only renders for signed-in friends.
  const user = await signedInFriend();
  if (ACCOUNTS_ENABLED && !user) return <>{children}</>;
  const owner = Boolean(user && isOwner(user.email));
  const items = [...SIMPLE_NAV, ...(owner && inviteOnly() ? [FRIENDS_NAV] : []), ...(owner ? [ADMIN_NAV] : []), ...(user ? [ACCOUNT_NAV] : [])];
  const initial = user?.email.charAt(0).toUpperCase();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-page">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <Logo />
          {DEMO_MODE && <Badge tone="warning">Demo data</Badge>}
          <div className="ml-auto flex items-center gap-3">
            <TopNav items={items.filter((i) => i !== ACCOUNT_NAV)} />
            {user && (
              <Link
                href="/account"
                title={user.email}
                className="hidden h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-bold text-lime hover:bg-forest-2 md:flex"
              >
                {initial}
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 md:pt-8 md:pb-16">{children}</main>
      <footer className="mx-auto hidden w-full max-w-6xl border-t border-line px-4 py-8 text-sm text-muted md:block">
        Kun analyse, vi formidler ikke spil. 18+. Spil indebærer risiko for tab. Brug for hjælp? Kontakt StopSpillet.dk.
      </footer>
      <BottomNav items={items} />
    </div>
  );
}
