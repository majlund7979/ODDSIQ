import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { openBillingPortal, signOut, startCheckout } from "@/app/auth-actions";
import { isOwner, requireFriend } from "@/lib/auth/friends";
import { BILLING_ENABLED, PLANS } from "@/lib/billing/plans";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Min konto · ODDSIQ" };

const NOTICE: Record<string, string> = {
  success: "Tak. Stripe bekræfter dit abonnement, og Pro slår til inden for et minut.",
  cancelled: "Betalingen blev annulleret. Der er ikke trukket noget.",
  unavailable: "Betaling er ikke slået til.",
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  await connection();
  const user = await requireFriend("/account");
  if (!user) redirect("/picks");
  const { billing } = await searchParams;
  const plan = PLANS.find((p) => p.id === user.plan) ?? PLANS[0];
  const pro = PLANS.find((p) => p.id === "pro")!;
  const btn = "rounded-xl border border-line-strong px-4 py-2.5 text-sm font-medium hover:bg-surface-2";

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-3xl font-semibold tracking-tight">Min konto</h1>
      {billing && NOTICE[billing] && <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-2">{NOTICE[billing]}</p>}

      <section className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent/15 text-lg font-semibold text-accent">{user.email.charAt(0).toUpperCase()}</span>
        <div className="min-w-0">
          <div className="truncate font-medium">{user.email}</div>
          <div className="text-sm text-muted">{isOwner(user.email) ? "Ejer af siden" : "Inviteret ven"}</div>
        </div>
      </section>

      {isOwner(user.email) && (
        <Link href="/venner" className="flex items-center justify-between rounded-2xl border border-line bg-surface p-5 hover:bg-surface-2">
          <span>
            <span className="block font-medium">Venner</span>
            <span className="text-sm text-ink-2">Inviter venner eller fjern deres adgang.</span>
          </span>
          <span aria-hidden className="text-ink-2">→</span>
        </Link>
      )}

      {BILLING_ENABLED && (
        <section className="space-y-3 rounded-2xl border border-line bg-surface p-5 text-sm">
          <div className="font-medium">Abonnement: {plan.name}</div>
          {user.plan === "pro" && (
            <p className="text-xs text-muted">
              Status {user.planStatus ?? "aktiv"}
              {user.planRenewsAt ? ` · fornyes ${fmtDate(user.planRenewsAt.getTime())}` : ""}
            </p>
          )}
          {user.plan === "pro" ? (
            <form action={openBillingPortal}>
              <button type="submit" className={btn}>
                Administrer betaling
              </button>
            </form>
          ) : (
            <form action={startCheckout}>
              <button type="submit" className={btn}>
                Opgrader til Pro · {pro.priceLabel}
              </button>
            </form>
          )}
        </section>
      )}

      <form action={signOut}>
        <button type="submit" className={btn}>
          Log ud
        </button>
      </form>
    </div>
  );
}
