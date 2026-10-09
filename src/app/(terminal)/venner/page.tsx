import { connection } from "next/server";
import { removeFriend } from "@/app/auth-actions";
import { FriendForm } from "@/components/FriendForm";
import { inviteOnly, parseEmails, requireOwner } from "@/lib/auth/friends";
import { db } from "@/lib/db";
import { siteOrigin } from "@/lib/site-url";

export const metadata = { title: "Venner · Oddsanalyse" };

export default async function FriendsPage() {
  await connection();
  await requireOwner();
  const [friends, users] = await Promise.all([db().friend.findMany({ orderBy: { addedAt: "desc" } }), db().user.findMany({ select: { email: true } })]);
  const hasAccount = new Set(users.map((u) => u.email));
  const fromEnv = parseEmails(process.env.ALLOWED_EMAILS).filter((e) => !friends.some((f) => f.email === e));
  const site = await siteOrigin();

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <header className="space-y-2">
        <h1 className="display text-[40px] text-ink sm:text-5xl">Venner</h1>
        <p className="text-[15px] text-ink-2">
          {inviteOnly()
            ? "Kun dem på listen kan oprette en konto og se bets. Skriv din vens email herunder, og send vedkommende linket."
            : "Lige nu kan alle oprette en konto, så listen bruges ikke. Sæt INVITE_ONLY=true på Vercel, hvis kun dem på listen skal kunne komme ind."}
        </p>
      </header>

      <section className="space-y-4 rounded-[20px] border border-line bg-surface p-5">
        <FriendForm />
        <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
          <div className="text-ink-2">Link til din ven:</div>
          <div className="num mt-0.5 break-all font-medium text-accent">{site}/signup</div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[20px] border border-line bg-surface">
        <h2 className="border-b border-line px-5 py-3 text-sm font-semibold">
          Inviterede <span className="font-normal text-muted">· {friends.length + fromEnv.length}</span>
        </h2>
        {friends.length + fromEnv.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-2">Ingen venner inviteret endnu.</p>
        ) : (
          <ul className="divide-y divide-line">
            {friends.map((f) => (
              <li key={f.email} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{f.name || f.email}</div>
                  <div className="truncate text-xs text-muted">
                    {f.name ? `${f.email} · ` : ""}
                    {hasAccount.has(f.email) ? "Har oprettet konto" : "Har ikke oprettet konto endnu"}
                  </div>
                </div>
                <form action={removeFriend}>
                  <input type="hidden" name="email" value={f.email} />
                  <button type="submit" className="rounded-lg border border-line-strong px-3 py-1.5 text-xs text-ink-2 hover:border-critical/60 hover:text-serious">
                    Fjern
                  </button>
                </form>
              </li>
            ))}
            {fromEnv.map((e) => (
              <li key={e} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{e}</div>
                  <div className="text-xs text-muted">Sat i ALLOWED_EMAILS på Vercel{hasAccount.has(e) ? " · har konto" : ""}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
