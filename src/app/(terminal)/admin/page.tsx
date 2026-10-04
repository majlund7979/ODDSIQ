import { inviteOnly, isOwner, requireOwner } from "@/lib/auth/friends";
import { ACCOUNTS_ENABLED } from "@/lib/auth/session";
import { wallClock } from "@/lib/data";
import { db } from "@/lib/db";
import { displayName } from "@/lib/friends";
import { weekOf } from "@/lib/tips";

export const metadata = { title: "Admin · Oddsanalyse" };

const TZ = "Europe/Copenhagen";
const DAY = 86_400_000;
const when = (d: Date | null | undefined) =>
  d ? d.toLocaleString("da-DK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ, hour12: false }) : "—";

function Tile({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-[20px] border border-line bg-surface p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="num mt-1 text-3xl font-semibold">{value.toLocaleString("da-DK")}</div>
      <div className="mt-1 text-xs text-muted">{hint}</div>
    </div>
  );
}

/** Owner only: who has signed up, with their e-mail and how active they are. */
export default async function AdminPage() {
  const now = await wallClock();
  const owner = await requireOwner("/admin");
  if (!ACCOUNTS_ENABLED) return <p className="text-sm text-ink-2">Login er ikke slået til.</p>;
  const week = weekOf(now);
  const [users, tipsThisWeek] = await Promise.all([
    db().user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        displayName: true,
        createdAt: true,
        morningEmail: true,
        sessions: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { tips: true, friendBets: true } },
      },
    }),
    db().tipPick.count({ where: { week: week.id } }),
  ]);
  const since = new Date(now - 7 * DAY);
  const fresh = users.filter((u) => u.createdAt >= since).length;
  const active = users.filter((u) => u.sessions[0] && u.sessions[0].createdAt >= since).length;
  const emails = users.map((u) => u.email).join(", ");

  return (
    <div className="space-y-5">
      <header>
        <h1 className="display text-[40px] text-ink sm:text-5xl">Admin</h1>
        <p className="mt-2 text-[15px] text-ink-2">Kun du kan se denne side. Her er alle, der har oprettet en konto på Oddsanalyse.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Tilmeldte" value={users.length} hint="i alt" />
        <Tile label="Nye" value={fresh} hint="de sidste 7 dage" />
        <Tile label="Logget ind" value={active} hint="de sidste 7 dage" />
        <Tile label="Tips" value={tipsThisWeek} hint={`i uge ${week.number}`} />
      </div>

      <section className="overflow-hidden rounded-[20px] border border-line bg-surface">
        <div className="flex items-baseline justify-between border-b border-line px-5 py-3">
          <span className="text-sm font-semibold">Tilmeldte</span>
          <span className="text-xs text-muted">nyeste først</span>
        </div>
        {users.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-2">Ingen har oprettet en konto endnu.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs whitespace-nowrap text-muted">
                  <th className="px-5 py-2 font-normal">Navn og e-mail</th>
                  <th className="px-3 py-2 font-normal">Oprettet</th>
                  <th className="px-3 py-2 font-normal">Sidst logget ind</th>
                  <th className="px-3 py-2 text-right font-normal">Tips</th>
                  <th className="px-3 py-2 text-right font-normal">Bets</th>
                  <th className="px-5 py-2 font-normal">Morgenmail</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-line">
                    <td className="px-5 py-2.5">
                      <div className="font-medium">
                        {displayName(u.displayName, u.email)}
                        {isOwner(u.email) && <span className="ml-1.5 text-xs font-normal text-muted">(ejer)</span>}
                        {u.id === owner.id && <span className="ml-1.5 text-xs font-normal text-muted">(dig)</span>}
                      </div>
                      <a href={`mailto:${u.email}`} className="text-xs text-accent hover:underline">
                        {u.email}
                      </a>
                    </td>
                    <td className="num px-3 py-2.5 whitespace-nowrap text-ink-2">{when(u.createdAt)}</td>
                    <td className="num px-3 py-2.5 whitespace-nowrap text-ink-2">{when(u.sessions[0]?.createdAt)}</td>
                    <td className="num px-3 py-2.5 text-right">{u._count.tips}</td>
                    <td className="num px-3 py-2.5 text-right">{u._count.friendBets}</td>
                    <td className="px-5 py-2.5 text-ink-2">{u.morningEmail ? "Ja" : "Nej"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {users.length > 0 && (
        <section className="space-y-2 rounded-[20px] border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">Alle e-mails</h2>
          <p className="text-xs text-muted">Marker og kopier, hvis du vil skrive til alle på én gang.</p>
          <textarea readOnly value={emails} rows={3} className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-ink" />
        </section>
      )}

      <p className="text-xs text-muted">
        &quot;Sidst logget ind&quot; er seneste login, ikke seneste besøg. {inviteOnly() ? "Siden er kun for inviterede venner (INVITE_ONLY)." : "Alle kan oprette en konto."}
      </p>
    </div>
  );
}
