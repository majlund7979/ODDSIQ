import Link from "next/link";
import { Badge, LinkTabs, PageHeader } from "@/components/ui";
import { fmtOdds } from "@/lib/format";
import { dailyPicks, PICK_COUNTS } from "@/lib/picks";
import { terminal } from "@/lib/terminal";

export const metadata = { title: "Dagens bedste bets · ODDSIQ" };

const kickoffDk = (t: number) =>
  new Date(t).toLocaleString("da-DK", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen", hour12: false });

export default async function PicksPage({ searchParams }: { searchParams: Promise<{ antal?: string }> }) {
  const t = await terminal();
  const q = await searchParams;
  const count = PICK_COUNTS.find((n) => String(n) === q.antal) ?? 10;
  const picks = dailyPicks(t.marketRows(), t.now, count);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Dagens bedste bets"
        subtitle="De udfald, som modellen giver den største chance for at vinde i kampene de næste 24 timer. Én pr. kamp, højeste procent først."
        right={
          <LinkTabs
            label="Antal bets"
            active={String(count)}
            items={PICK_COUNTS.map((n) => ({ id: String(n), label: `Top ${n}`, href: `/picks?antal=${n}` }))}
          />
        }
      />

      {picks.length === 0 ? (
        <p className="rounded-md border border-line bg-surface px-4 py-6 text-sm text-ink-2">
          Der er ingen kampe med en vurdering fra modellen de næste 24 timer endnu. Modellen vurderer en kamp, når den er under et døgn fra
          kampstart, og odds hentes automatisk flere gange om dagen.
        </p>
      ) : (
        <ol className="space-y-2">
          {picks.map((p, i) => (
            <li key={p.row.selectionId}>
              <Link href={`/markets/${p.row.selectionId}`} className="flex items-center gap-4 rounded-md border border-line bg-surface px-4 py-3 hover:bg-surface-2">
                <span className="num w-6 shrink-0 text-center text-lg font-semibold text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold">{p.outcome}</span>
                    {p.value && <Badge tone="good">Værdi</Badge>}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {p.row.match} · {p.row.league} · {kickoffDk(p.row.kickoff)}
                  </span>
                  <span className="mt-1 block text-xs text-ink-2">{p.reason}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="num block text-2xl font-semibold text-accent">{Math.round(p.probability * 100)} %</span>
                  <span className="num block text-xs text-ink-2">
                    odds {fmtOdds(p.row.bestOdds)} <span className="text-muted">hos {p.row.bestBook}</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      <div className="space-y-1 text-xs text-muted">
        <p>
          <Badge tone="good">Værdi</Badge> betyder, at den bedste odds betaler mere end modellens fair odds (1 ÷ sandsynlighed). Høj procent
          betyder ofte lav odds.
        </p>
        <p>
          Procenterne er modellens skøn (model {picks[0]?.row.modelVersion ?? "ODDSIQ"}), ikke garantier. Selv et udfald på 80 % taber hver femte gang. Kilde: {t.dataLabel}. Spil
          kun for penge, du har råd til at tabe. 18+.
        </p>
      </div>
    </div>
  );
}

