import { redirect } from "next/navigation";
import { connection } from "next/server";
import { openBillingPortal, signOut, startCheckout } from "@/app/auth-actions";
import { Badge, PageHeader, Panel } from "@/components/ui";
import { ACCOUNTS_ENABLED, currentUser } from "@/lib/auth/session";
import { BILLING_ENABLED, PLANS } from "@/lib/billing/plans";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Account · ODDSIQ" };

const NOTICE: Record<string, string> = {
  success: "Thanks. Your subscription is being confirmed by Stripe; Pro switches on within a minute.",
  cancelled: "Checkout was cancelled. Nothing was charged.",
  unavailable: "Billing is not switched on yet.",
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  await connection();
  if (!ACCOUNTS_ENABLED) redirect("/picks");
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

      <form action={signOut}>
        <button type="submit" className={btn}>
          Sign out
        </button>
      </form>
    </div>
  );
}
