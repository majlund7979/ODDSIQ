import Link from "next/link";
import { requireOwner } from "@/lib/auth/friends";
import { wallClock } from "@/lib/data";
import { DATABASE_CONFIGURED } from "@/lib/db";
import { Badge, Panel, Tip } from "@/components/ui";
import type { Metric } from "@/lib/metrics/metric";
import {
  BACKTEST,
  loadPanel,
  SELECTION_LABEL,
  statusOf,
  type PanelData,
  type PanelMatch,
  type PanelSelection,
} from "@/lib/prediction-engine/panel";

export const metadata = { title: "Modelpanel · Oddsanalyse" };
export const dynamic = "force-dynamic";

const TZ = "Europe/Copenhagen";
const when = (d: Date | null | undefined) =>
  d ? d.toLocaleString("da-DK", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ, hour12: false }) : "—";
const pct = (p: number | null | undefined, digits = 0) => (p == null ? "—" : `${(p * 100).toFixed(digits).replace(".", ",")} %`);
const signedPct = (p: number | null | undefined) => (p == null ? "—" : `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p * 100).toFixed(1).replace(".", ",")} %`);
const dec = (x: number | null | undefined, digits = 2) => (x == null ? "—" : x.toFixed(digits).replace(".", ","));
const BASIS: Record<Metric["basis"], string> = { historical: "Historisk", simulated: "Simuleret", live: "Live", estimated: "Skøn" };
const MONTH = (t: number | null) => (t == null ? "—" : new Date(t).toLocaleDateString("da-DK", { month: "short", year: "numeric", timeZone: TZ }));
const STAGE: Record<string, string> = { early: "tidlig", pre_lineup: "før opstilling", post_lineup: "efter opstilling", live: "live" };
const FAMILY: Record<string, string> = {
  elo: "Elo", logreg: "Logistisk regression", rf: "Random forest", lgbm: "LightGBM", dixon_coles: "Dixon-Coles", feature_poisson: "Feature-Poisson",
};

function Context({ m }: { m: Metric<unknown> }) {
  return (
    <p className="mt-1 text-[11px] leading-relaxed text-muted">
      <span className="text-ink-2">{BASIS[m.basis]}</span> · n = {m.n.toLocaleString("da-DK")} · {MONTH(m.periodFrom)} – {MONTH(m.periodTo)} ·{" "}
      {m.modelVersion} · {m.source}
    </p>
  );
}

function Tile({ label, value, hint }: { label: string; value: React.ReactNode; hint: React.ReactNode }) {
  return (
    <div className="rounded-[20px] bg-surface-2 px-5 py-4">
      <div className="text-[13px] font-semibold text-muted">{label}</div>
      <div className="num mt-1.5 text-2xl font-extrabold tracking-[-0.02em] text-ink">{value}</div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">{hint}</p>
    </div>
  );
}

function Status({ data }: { data: PanelData }) {
  const { model } = data;
  const s = statusOf(model);
  const last = data.runs[0];
  const tone = { good: "border-good/50", warning: "border-warning/50", critical: "border-critical/60", neutral: "border-line" }[s.tone];
  const dot = { good: "bg-good", warning: "bg-warning", critical: "bg-critical", neutral: "bg-muted" }[s.tone];
  const v = model?.validation;
  return (
    <section className={`rounded-[20px] border ${tone} bg-surface p-5`}>
      <div className="flex items-start gap-3">
        <span aria-hidden className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${dot}`} />
        <p className="text-[15px] font-semibold text-ink">{s.text}</p>
      </div>
      {model && (
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            label="Log loss 1X2, model mod marked"
            value={v ? `${dec(v.model, 4)} mod ${dec(v.market, 4)}` : "—"}
            hint={<>Historisk · n = {v?.matches.toLocaleString("da-DK") ?? "—"} kampe · sæson {model.validate}/{(model.validate ?? 0) + 1 - 2000} · bet365 uden margin · {model.version}</>}
          />
          <Tile
            label="Vægt på modellen"
            value={`${pct(model.blend1x2)} / ${pct(model.blendOu25)}`}
            hint={<>1X2 / Over-Under 2,5. Resten er markedets odds. Fittet på sæson {model.validate}/{(model.validate ?? 0) + 1 - 2000} · {model.version}</>}
          />
          <Tile
            label="Godkendte bets, seneste kørsel"
            value={last?.approved ?? "—"}
            hint={<>Live · {last?.predictions ?? 0} sandsynligheder på {last?.matches ?? 0} kampe · {when(last?.startedAt)}</>}
          />
          <Tile
            label="Kørsler"
            value={data.runs.length}
            hint={<>Live · seneste {data.runs.length} · fejlede: {data.runs.filter((r) => r.status === "failed").length} · GitHub Actions kl. 7.30 og 16.30</>}
          />
        </div>
      )}
    </section>
  );
}

function Probability({ s }: { s: PanelSelection }) {
  return (
    <div className="num leading-tight">
      <div className="font-semibold text-ink">{pct(s.p)}</div>
      <div className="text-[11px] text-muted">
        model {pct(s.pModel)} · marked {pct(s.pMarket)}
      </div>
    </div>
  );
}

function MatchRow({ m }: { m: PanelMatch }) {
  const sel = (k: string) => m.selections.find((s) => s.selection === k);
  return (
    <tr className="border-t border-line align-top">
      <td className="px-5 py-3 whitespace-nowrap">
        <div className="font-semibold text-ink">
          {m.home} – {m.away}
        </div>
        <div className="text-[11px] text-muted">
          {m.competition} · {when(m.kickoff)}
        </div>
      </td>
      {["home", "draw", "away", "over"].map((k) => {
        const s = sel(k);
        return <td key={k} className="px-3 py-3">{s ? <Probability s={s} /> : <span className="text-muted">—</span>}</td>;
      })}
      <td className="px-3 py-3 text-[11px] whitespace-nowrap text-muted">
        {STAGE[m.stage] ?? m.stage}
        <br />
        data {when(m.dataAsOf)}
      </td>
    </tr>
  );
}

function ValueTable({ matches }: { matches: PanelMatch[] }) {
  const rows = matches.flatMap((m) => m.selections.filter((s) => s.ev != null).map((s) => ({ m, s })));
  rows.sort((a, b) => (b.s.evLow ?? -9) - (a.s.evLow ?? -9));
  if (rows.length === 0) return <p className="px-5 py-8 text-center text-sm text-ink-2">Ingen vurderede udfald endnu.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs whitespace-nowrap text-muted">
            <th className="px-5 py-2 font-normal">Kamp og udfald</th>
            <th className="px-3 py-2 text-right font-normal">Odds</th>
            <th className="px-3 py-2 text-right font-normal">Sandsynlighed</th>
            <th className="px-3 py-2 text-right font-normal">
              <Tip text="Vores sandsynlighed minus markedets fair sandsynlighed (uden margin).">Edge</Tip>
            </th>
            <th className="px-3 py-2 text-right font-normal">
              <Tip text="Forventet afkast pr. krone: sandsynlighed × odds − 1.">EV</Tip>
            </th>
            <th className="px-3 py-2 text-right font-normal">
              <Tip text="EV ved den forsigtige nedre grænse for sandsynligheden (95 %). Skal være positiv, før et bet godkendes.">EV, forsigtig</Tip>
            </th>
            <th className="px-3 py-2 font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ m, s }) => (
            <tr key={`${m.matchId}-${s.market}-${s.selection}`} className="border-t border-line align-top">
              <td className="px-5 py-2.5">
                <div className="whitespace-nowrap text-ink">
                  {m.home} – {m.away}
                </div>
                <div className="text-[11px] text-muted">
                  {SELECTION_LABEL[s.selection] ?? s.selection} · {when(m.kickoff)}
                </div>
              </td>
              <td className="num px-3 py-2.5 text-right whitespace-nowrap">
                {dec(s.odds)}
                {s.book && <div className="text-[11px] text-muted">{s.book}</div>}
              </td>
              <td className="num px-3 py-2.5 text-right">{pct(s.p, 1)}</td>
              <td className="num px-3 py-2.5 text-right">{signedPct(s.edge)}</td>
              <td className="num px-3 py-2.5 text-right">{signedPct(s.ev)}</td>
              <td className="num px-3 py-2.5 text-right">{signedPct(s.evLow)}</td>
              <td className="px-3 py-2.5">
                {s.isBet ? (
                  <Badge tone="good">Godkendt · {pct(s.stake, 1)} af bank</Badge>
                ) : (
                  <span className="text-[12px] text-ink-2">Afvist: {s.rejected || "—"}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Runs({ data }: { data: PanelData }) {
  if (data.runs.length === 0) return <p className="px-5 py-8 text-center text-sm text-ink-2">Motoren har ikke kørt endnu.</p>;
  const tone = { ok: "good", skipped: "neutral", failed: "critical" } as const;
  const label = { ok: "OK", skipped: "Sprunget over", failed: "Fejlede" };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs whitespace-nowrap text-muted">
            <th className="px-5 py-2 font-normal">Startet</th>
            <th className="px-3 py-2 font-normal">Status</th>
            <th className="px-3 py-2 text-right font-normal">Kampe</th>
            <th className="px-3 py-2 text-right font-normal">Sandsynligheder</th>
            <th className="px-3 py-2 text-right font-normal">Godkendte bets</th>
            <th className="px-3 py-2 text-right font-normal">Varighed</th>
            <th className="px-3 py-2 font-normal">Bemærkning</th>
          </tr>
        </thead>
        <tbody>
          {data.runs.map((r) => (
            <tr key={r.id} className="border-t border-line align-top">
              <td className="px-5 py-2.5 whitespace-nowrap">{when(r.startedAt)}</td>
              <td className="px-3 py-2.5">
                <Badge tone={tone[r.status]}>{label[r.status]}</Badge>
              </td>
              <td className="num px-3 py-2.5 text-right">{r.matches ?? "—"}</td>
              <td className="num px-3 py-2.5 text-right">{r.predictions ?? "—"}</td>
              <td className="num px-3 py-2.5 text-right">{r.approved ?? "—"}</td>
              <td className="num px-3 py-2.5 text-right whitespace-nowrap">{r.seconds == null ? "—" : `${Math.round(r.seconds / 60)} min`}</td>
              <td className="px-3 py-2.5 text-[12px] text-ink-2">
                {r.note}
                {r.unmapped.length > 0 && <>Ukendte holdnavne: {r.unmapped.join(", ")}</>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Owner only: the prediction engine's shadow runs. Nothing here is shown on "Dagens bedste bets". */
export default async function ModelPanelPage() {
  const now = await wallClock();
  await requireOwner("/admin/modelpanel");
  let data: PanelData | null = null;
  let error: string | null = null;
  if (!DATABASE_CONFIGURED) error = "Databasen er ikke sat op.";
  else {
    try {
      data = await loadPanel(now);
    } catch (e) {
      error = e instanceof Error ? e.message.slice(0, 300) : String(e);
    }
  }
  const model = data?.model;

  return (
    <div className="space-y-5">
      <header>
        <Link href="/admin" className="text-sm text-muted hover:text-accent">
          ← Admin
        </Link>
        <h1 className="display mt-2 text-[40px] text-ink sm:text-5xl">Modelpanel</h1>
        <p className="mt-2 max-w-3xl text-[15px] text-ink-2">
          Kun du kan se denne side. Den viser, hvad den nye prediction engine regner ud hver dag. Motoren kører i skyggetilstand: intet herfra
          bruges på Dagens bedste bets, før du siger ja.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="warning">Skyggetilstand</Badge>
          {model && <Badge>{model.version}</Badge>}
          {model && model.train.length > 0 && (
            <Badge>
              Trænet på {model.train[0]}/{model.train[0] + 1 - 2000}–{model.train[model.train.length - 1]}/{model.train[model.train.length - 1] + 1 - 2000}
            </Badge>
          )}
          <Badge>Kilde: sitets odds + football-data.co.uk</Badge>
        </div>
      </header>

      {error && (
        <Panel title="Kunne ikke læse motorens data">
          <p className="px-5 py-4 text-sm text-ink-2">{error}</p>
        </Panel>
      )}

      {data && (
        <>
          <Status data={data} />

          <Panel title="Kommende kampe" right={`${data.matches.length} kampe · live`}>
            {data.matches.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-2">Ingen kommende kampe i motorens 16 ligaer lige nu.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs whitespace-nowrap text-muted">
                      <th className="px-5 py-2 font-normal">Kamp</th>
                      <th className="px-3 py-2 font-normal">1</th>
                      <th className="px-3 py-2 font-normal">X</th>
                      <th className="px-3 py-2 font-normal">2</th>
                      <th className="px-3 py-2 font-normal">Over 2,5</th>
                      <th className="px-3 py-2 font-normal">Stadie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.matches.map((m) => (
                      <MatchRow key={m.matchId} m={m} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="border-t border-line px-5 py-3 text-[11px] text-muted">
              Det store tal er motorens endelige sandsynlighed. Under står modellens egen og markedets (fair, uden margin). Med vægt 0 på modellen er
              det endelige tal lig markedets.
            </p>
          </Panel>

          <Panel title="Value bets" right="alle vurderede udfald, bedste først">
            <ValueTable matches={data.matches} />
          </Panel>

          <Panel title="Kørsler" right="nyeste først">
            <Runs data={data} />
          </Panel>

          {model && Object.keys(model.weights).length > 0 && (
            <Panel title="Ensemble-vægte" right={model.version}>
              <div className="flex flex-wrap gap-x-6 gap-y-2 px-5 py-4 text-sm">
                {Object.entries(model.weights)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, w]) => (
                    <span key={k}>
                      <span className="text-ink-2">{FAMILY[k] ?? k}</span> <span className="num font-semibold">{pct(w)}</span>
                    </span>
                  ))}
              </div>
            </Panel>
          )}
        </>
      )}

      <Panel title="Backtest" right="historisk, 10 testsæsoner">
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {BACKTEST.map((b) => (
            <div key={b.label} className="rounded-[20px] bg-surface-2 px-5 py-4">
              <div className="text-[13px] font-semibold text-muted">
                <Tip text={b.m.definition}>{b.label}</Tip>
              </div>
              <div className="num mt-1.5 text-2xl font-extrabold tracking-[-0.02em] text-ink">{b.m.value}</div>
              <Context m={b.m} />
            </div>
          ))}
        </div>
        <p className="border-t border-line px-5 py-3 text-[11px] text-muted">
          Ingen strategi tjente penge i backtesten. Den daglige evaluering af live-kørslerne kommer i næste trin.
        </p>
      </Panel>
    </div>
  );
}
