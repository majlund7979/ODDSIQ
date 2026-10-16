import Link from "next/link";
import { buttonClass, cardClass, Notice, PageHeader } from "@/components/ui";
import { InstallApp } from "@/components/InstallApp";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { openBillingPortal, signOut, startCheckout } from "@/app/auth-actions";
import { inviteOnly, isOwner, requireFriend } from "@/lib/auth/friends";
import { BILLING_ENABLED, PLANS } from "@/lib/billing/plans";
import { dateDa } from "@/lib/format";
import { lookup, one, type SearchParams } from "@/lib/url";

export const metadata = { title: "Min konto · Oddsanalyse" };

const NOTICE: Record<string, string> = {
  success: "Tak. Stripe bekræfter dit abonnement, og Pro slår til inden for et minut.",
  cancelled: "Betalingen blev annulleret. Der er ikke trukket noget.",
  unavailable: "Betaling er ikke slået til.",
};

export default async function AccountPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const user = await requireFriend("/account");
  if (!user) redirect("/picks");
  const notice = lookup(NOTICE, one((await searchParams).billing));
  const plan = PLANS.find((p) => p.id === user.plan) ?? PLANS[0];
  const pro = PLANS.find((p) => p.id === "pro")!;
  const btn = buttonClass("secondary", "md");

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <PageHeader title="Min konto" className="mb-8" />
      {notice && <Notice role="status">{notice}</Notice>}

      <section className="flex items-center gap-4 rounded-card border border-line bg-surface p-5">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent text-xl font-bold text-on-accent">{user.email.charAt(0).toUpperCase()}</span>
        <div className="min-w-0">
          <div className="truncate font-medium">{user.email}</div>
          <div className="text-sm text-ink-2">{isOwner(user.email) ? "Ejer af siden" : inviteOnly() ? "Inviteret ven" : "Medlem"}</div>
        </div>
      </section>

      {isOwner(user.email) && (
        <Link href="/admin" className={`group flex items-center justify-between p-5 ${cardClass({ interactive: true })}`}>
          <span>
            <span className="block font-medium">Admin</span>
            <span className="text-sm text-ink-2">Se alle tilmeldte og deres e-mail.</span>
          </span>
          <span aria-hidden className="text-ink-2 transition-transform group-hover:translate-x-0.5 group-hover:text-accent">→</span>
        </Link>
      )}

      {inviteOnly() && isOwner(user.email) && (
        <Link href="/venner" className={`group flex items-center justify-between p-5 ${cardClass({ interactive: true })}`}>
          <span>
            <span className="block font-medium">Venner</span>
            <span className="text-sm text-ink-2">Inviter venner eller fjern deres adgang.</span>
          </span>
          <span aria-hidden className="text-ink-2 transition-transform group-hover:translate-x-0.5 group-hover:text-accent">→</span>
        </Link>
      )}

      {BILLING_ENABLED && (
        <section className="space-y-3 rounded-card border border-line bg-surface p-5 text-sm">
          <div className="font-medium">Abonnement: {plan.name}</div>
          {user.plan === "pro" && (
            <p className="text-xs text-muted">
              Status {user.planStatus ?? "aktiv"}
              {user.planRenewsAt ? ` · fornyes ${dateDa(user.planRenewsAt.getTime())}` : ""}
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

      <section className="space-y-3 rounded-card border border-line bg-surface p-5">
        <div>
          <div className="font-medium">App på telefonen</div>
          <p className="text-sm text-ink-2">Læg Oddsanalyse på hjemmeskærmen, så den åbner som en app.</p>
        </div>
        <InstallApp />
      </section>

      <form action={signOut} className="pt-2">
        <button type="submit" className={buttonClass("quiet", "md", "-ml-4")}>
          Log ud
        </button>
      </form>
    </div>
  );
}
