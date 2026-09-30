import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { openBillingPortal, signOut, startCheckout } from "@/app/auth-actions";
import { Badge, PageHeader, Panel } from "@/components/ui";
import { ACCOUNTS_ENABLED, currentUser } from "@/lib/auth/session";
import { BILLING_ENABLED, PLANS } from "@/lib/billing/plans";
import { decodePositions, decodeWatchlist } from "@/lib/demo/personal";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Account · ODDSIQ" };

const NOTICE: Record<string, string> = {
  success: "Thanks. Your subscription is being confirmed by Stripe; Pro switches on within a minute.",
  cancelled: "Checkout was cancelled. Nothing was charged.",
  unavailable: "Billing is not switched on yet.",
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  await connection();
  if (!ACCOUNTS_ENABLED) redirect("/dashboard");
  const user = await currentUser();
  if (!user) redirect("/login?next=/account");
  const { billing } = await searchParams;
  const plan = PLANS.find((p) => p.id === user.plan) ?? PLANS[0];
  const pro = PLANS.find((p) => p.id === "pro")!;
  const btn = "rounded border border-line-strong px-3 py-1.5 text-sm hover:bg-surface-2";

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="Account" subtitle={user.email} />
      {billing && NOTICE[billing] && <p className="rounded border border-line bg-surface px-4 py-2 text-sm text-ink-2">{NOTICE[billing]}</p>}

      <Panel title="Plan" right={<Badge tone={user.plan === "pro" ? "accent" : "neutral"}>{plan.name}</Badge>}>
        <div className="space-y-3 px-4 py-3 text-sm">
          <p className="text-ink-2">{plan.summary}</p>
          {user.plan === "pro" && (
            <p className="text-xs text-muted">
              Status {user.planStatus ?? "active"}
              {user.planRenewsAt ? ` · renews ${fmtDate(user.planRenewsAt.getTime())}` : ""}
            </p>
          )}
          {!BILLING_ENABLED ? (
            <p className="text-xs text-muted">Paid plans are not on sale yet. Everything in the terminal is available on the free plan for now.</p>
          ) : user.plan === "pro" ? (
            <form action={openBillingPortal}>
              <button type="submit" className={btn}>
                Manage billing
              </button>
            </form>
          ) : (
            <form action={startCheckout}>
              <button type="submit" className={btn}>
                Upgrade to Pro · {pro.priceLabel}
              </button>
            </form>
          )}
        </div>
      </Panel>

      <Panel title="Saved to your account">
        <ul className="divide-y divide-line text-sm">
          <li className="flex justify-between px-4 py-2">
            <Link href="/watchlist" className="hover:text-accent">
              Watchlist
            </Link>
            <span className="num text-ink-2">{decodeWatchlist(user.watchlist).length}</span>
          </li>
          <li className="flex justify-between px-4 py-2">
            <Link href="/my-bets" className="hover:text-accent">
              Tracked prices
            </Link>
            <span className="num text-ink-2">{decodePositions(user.positions).length}</span>
          </li>
          <li className="flex justify-between px-4 py-2">
            <span>Assistant threshold</span>
            <span className="num text-ink-2">{user.thresholdPp} pp</span>
          </li>
        </ul>
      </Panel>

      <form action={signOut}>
        <button type="submit" className={btn}>
          Sign out
        </button>
      </form>
    </div>
  );
}
