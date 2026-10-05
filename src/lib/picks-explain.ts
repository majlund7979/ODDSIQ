// The longer "why" text under each bet: plain Danish sentences built from the
// same facts the card shows (expected goals, form, head-to-head, team news,
// the bookmakers' view and the price history). Facts only: a price move is
// described, never explained.

import type { Pick } from "./picks";

const pct = (p: number) => `${Math.round(p * 100)} %`;
const dec = (x: number, d = 2) => x.toFixed(d).replace(".", ",");
const wins = (g: { result: string }[]) => g.filter((x) => x.result === "V").length;
const losses = (g: { result: string }[]) => g.filter((x) => x.result === "T").length;

/** A few short paragraphs explaining one pick. Pure. */
export function explainPick(p: Pick): string[] {
  const [home, away] = p.row.match.split(" vs ");
  const i = p.insights;
  const out: string[] = [];

  out.push(
    `Vi giver "${p.outcome}" ${pct(p.probability)} chance. ` +
      `Det svarer til fair odds på ${dec(p.fairOdds)}, og den bedste odds lige nu er ${dec(p.row.bestOdds)}${p.row.bestBook ? ` hos ${p.row.bestBook}` : ""}. ` +
      (p.value ? "Oddsen betaler altså mere, end vores procent siger den burde." : "Oddsen betaler ikke mere, end procenten er værd, så det er et bet på sandsynlighed, ikke på værdi."),
  );

  if (p.marketOnly) {
    out.push("Vi har endnu ingen kampresultater for denne liga, så procenten bygger kun på bookmakernes odds uden deres avance. Form, holdstyrke og indbyrdes opgør er derfor ikke med.");
  }

  const xg = i.expectedGoals;
  if (xg) {
    const total = xg.home + xg.away;
    const t = p.row.marketType;
    let read: string;
    if (t === "OU15") read = total >= 2.2 ? "Det peger mod mindst to mål." : total <= 1.8 ? "Det peger mod en kamp med få mål." : "Det ligger tæt på grænsen på 1,5 mål.";
    else if (t === "OU25") read = total >= 2.7 ? "Det peger mod en kamp med mange mål." : total <= 2.3 ? "Det peger mod en tæt kamp med få mål." : "Det ligger tæt på grænsen på 2,5 mål.";
    else if (t === "BTTS") read = Math.min(xg.home, xg.away) >= 1.1 ? "Begge hold ventes at komme til chancer." : `${xg.home < xg.away ? home : away} ventes at få svært ved at score.`;
    else read = Math.abs(xg.home - xg.away) < 0.25 ? "Holdene ligner hinanden på papiret." : `${xg.home > xg.away ? home : away} ventes at skabe mest.`;
    out.push(`Modellen venter ${dec(xg.home, 1)} mål til ${home} og ${dec(xg.away, 1)} til ${away}, i alt ${dec(total, 1)}. ${read}`);
  }

  const form = i.form;
  if (form && (form.home.length || form.away.length)) {
    const line = (team: string, g: typeof form.home) =>
      g.length ? `${team} har vundet ${wins(g)} og tabt ${losses(g)} af de seneste ${g.length}` : `${team} har ingen kampe i vores data`;
    out.push(`${line(home, form.home)}, mens ${line(away, form.away)}.`);
  }

  const h = i.h2h;
  if (h && h.games.length) {
    const goals = h.games.map((g) => g.score.split("-").map(Number)).filter((s) => s.length === 2 && s.every(Number.isFinite));
    const avg = goals.length ? goals.reduce((s, [a, b]) => s + a + b, 0) / goals.length : null;
    out.push(
      `I de seneste ${h.games.length} indbyrdes opgør vandt ${home} ${h.home}, ${away} ${h.away}, og ${h.draw} endte uafgjort` +
        (avg !== null ? `, med ${dec(avg, 1)} mål i snit.` : "."),
    );
  }

  const news = p.factors.filter((f) => f.label === "Skader og karantæner" || f.label === "xG-form");
  for (const f of news) {
    const moved = f.pp !== null && Math.abs(f.pp) >= 0.5 ? ` Det ${f.pp > 0 ? "hæver" : "sænker"} procenten med ${dec(Math.abs(f.pp), 1)} point.` : "";
    out.push(f.label === "xG-form" ? `xG-formen: ${f.detail}.${moved}` : `Afbud: ${f.detail.charAt(0).toUpperCase() + f.detail.slice(1)}.${moved}`);
  }

  const model = p.row.modelProbability;
  const market = p.row.marketProbability;
  if (model != null && !p.marketOnly) {
    const gap = (market - model) * 100;
    out.push(
      Math.abs(gap) < 3
        ? `Bookmakerne er stort set enige: de giver ${pct(market)}, når deres avance er trukket fra.`
        : `Bookmakerne er ${gap > 0 ? "mere" : "mindre"} optimistiske end resultatmodellen (${pct(market)} mod ${pct(model)}). Vi vægter dem halvt, fordi oddsen også rummer nyheder, vi ikke selv kan se.`,
    );
  }

  if (Math.abs(i.movement) >= 0.02) {
    out.push(`Oddsen er ${i.movement < 0 ? "faldet" : "steget"} ${Math.round(Math.abs(i.movement) * 100)} % siden markedet åbnede.`);
  }

  out.push(i.lineupsConfirmed ? "Startopstillingerne er bekræftet og regnet med." : "Startopstillingerne er ikke meldt endnu. Tjek dem tæt på kampstart, hvis du vil være helt opdateret.");

  const learned = p.factors.find((f) => f.label === "Læring fra resultater");
  if (learned) out.push(`Læring: ${learned.detail}.`);

  const every = Math.max(2, Math.round(1 / (1 - p.probability)));
  out.push(`Husk: med ${pct(p.probability)} taber et bet som dette stadig omtrent hver ${every}. gang.`);
  return out;
}
