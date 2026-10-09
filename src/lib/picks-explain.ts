// The longer "why" text under each bet: plain Danish sentences built from the
// same facts the card shows (expected goals, form, head-to-head, team news,
// the bookmakers' view and the price history). Facts only: a price move is
// described, never explained.

import { capitalize, dec, pct } from "@/lib/format";
import { isSharp, type Pick, type PickInsights } from "./picks";

const wins = (g: { result: string }[]) => g.filter((x) => x.result === "V").length;
const losses = (g: { result: string }[]) => g.filter((x) => x.result === "T").length;

/** The only head-to-head meeting, e.g. "vandt Brøndby 2-1" or "endte det uafgjort 1-1", the winner's goals first. */
function oneMeeting(home: string, away: string, h: NonNullable<PickInsights["h2h"]>): string {
  const [a, b] = h.games[0].score.split("-").map(Number);
  const score = Number.isFinite(a) && Number.isFinite(b) ? ` ${Math.max(a, b)}-${Math.min(a, b)}` : "";
  return h.draw ? `endte det uafgjort${score}` : `vandt ${h.home ? home : away}${score}`;
}

/** A few short paragraphs explaining one pick. Pure. */
export function explainPick(p: Pick): string[] {
  const [home, away] = p.row.match.split(" vs ");
  const i = p.insights;
  const out: string[] = [];

  if (isSharp(p)) {
    out.push(
      `${p.reference}s odds uden deres margin giver "${p.outcome}" ${pct(p.probability)} chance, altså fair odds på ${dec(p.fairOdds)}. ` +
        `${p.row.bestBook} giver ${dec(p.row.bestOdds)}, ${dec(p.ev * 100, 1)} % mere, og bettet holder kun, så længe oddsen er mindst ${dec(p.minOdds)}. ` +
        `${p.reference} regnes for en af de mest præcise priser på markedet, så den bruges som fair pris. ` +
        (/betfair/i.test(p.reference)
          ? "Med Betfair Exchange som fair pris gav den historiske test ingen fordel (156 bets, 2024/25–2025/26). "
          : "I den historiske test med Pinnacle gav bets valgt på den måde ingen sikker fordel, og fra januar 2025 slog de ikke lukkeprisen. ") +
        "Det er et forsøg, som vi følger live.",
    );
  } else {
    out.push(
      `Vi giver "${p.outcome}" ${pct(p.probability)} chance. ` +
        `Det svarer til fair odds på ${dec(p.fairOdds)}, og den bedste odds lige nu er ${dec(p.row.bestOdds)}${p.row.bestBook ? ` hos ${p.row.bestBook}` : ""}. ` +
        (p.value ? "Oddsen betaler altså mere, end vores procent siger den burde." : "Oddsen betaler ikke mere, end procenten er værd, så det er et bet på sandsynlighed, ikke på værdi."),
    );
  }

  const club = i.clubElo;
  const af = i.afPrediction;
  if (p.marketOnly) {
    out.push(
      af && p.row.marketType === "1X2"
        ? "Vi har endnu ingen kampresultater for denne liga, så procenten bygger mest på bookmakernes odds uden deres avance, justeret lidt med API-Footballs vurdering af holdene."
        : club && p.row.marketType === "1X2"
        ? "Vi har endnu ingen kampresultater for denne liga, så procenten bygger mest på bookmakernes odds uden deres avance, justeret lidt med holdstyrken fra ClubElo. Form og indbyrdes opgør er ikke med."
        : "Vi har endnu ingen kampresultater for denne liga, så procenten bygger kun på bookmakernes odds uden deres avance. Form, holdstyrke og indbyrdes opgør er derfor ikke med.",
    );
  }
  if (af) {
    const pc = (x: number) => `${Math.round(x * 100)} %`;
    const total = af.comparison.find((c) => c.key === "total");
    out.push(
      `API-Football, der sammenligner holdene på alle deres kampe, giver ${home} ${pc(af.percent.home)}, uafgjort ${pc(af.percent.draw)} og ${away} ${pc(af.percent.away)}` +
        (total ? `, og samlet står ${total.home >= total.away ? home : away} stærkest (${pc(Math.max(total.home, total.away))} mod ${pc(Math.min(total.home, total.away))}).` : "."),
    );
  }
  if (club) {
    const gap = Math.round(club.home.elo - club.away.elo);
    out.push(
      `På ClubElos rangliste, der sammenligner klubber på tværs af ligaer, har ${home} ${Math.round(club.home.elo)} og ${away} ${Math.round(club.away.elo)} point` +
        (Math.abs(gap) < 25 ? ", så de ligner hinanden." : `, så ${gap > 0 ? home : away} er ${Math.abs(gap)} point stærkere før hjemmebanefordelen.`),
    );
  }

  const sc = i.scorers;
  if (sc && (p.row.marketType === "OU15" || p.row.marketType === "OU25")) {
    const notes = [sc.home, sc.away].flatMap((t) => {
      if (!t) return [];
      if (t.status === "out") return [`${t.name}, der har scoret ${t.goals} mål, mangler`];
      if (t.status === "doubtful") return [`${t.name} (${t.goals} mål) er tvivlsom`];
      if (t.status === "bench") return [`${t.name} (${t.goals} mål) er ikke i startopstillingen`];
      if (t.recent && t.recent.ratio > 1.1) return [`${t.name} er i god form med ${t.recent.goals} mål i de seneste ${t.recent.matches} kampe`];
      if (t.recent && t.recent.ratio < 0.9) return [`${t.name} scorer mindre end normalt, ${t.recent.goals} mål i de seneste ${t.recent.matches} kampe`];
      return [];
    });
    if (notes.length) out.push(`Topscorerne tæller med i målene: ${notes.join(", og ")}.`);
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
    if (h.games.length === 1) out.push(`I det seneste indbyrdes opgør ${oneMeeting(home, away, h)}.`);
    else {
      const goals = h.games.map((g) => g.score.split("-").map(Number)).filter((s) => s.length === 2 && s.every(Number.isFinite));
      const avg = goals.length ? goals.reduce((s, [a, b]) => s + a + b, 0) / goals.length : null;
      out.push(
        `I de seneste ${h.games.length} indbyrdes opgør vandt ${home} ${h.home}, ${away} ${h.away}, og ${h.draw} endte uafgjort` + (avg !== null ? `, med ${dec(avg, 1)} mål i snit.` : "."),
      );
    }
  }

  const news = p.factors.filter((f) => f.label === "Skader og karantæner" || f.label === "xG-form");
  for (const f of news) {
    const moved = f.pp !== null && Math.abs(f.pp) >= 0.5 ? ` Det ${f.pp > 0 ? "hæver" : "sænker"} procenten med ${dec(Math.abs(f.pp), 1)} point.` : "";
    out.push(f.label === "xG-form" ? `xG-formen: ${f.detail}.${moved}` : `Afbud: ${capitalize(f.detail)}.${moved}`);
  }

  const model = p.row.modelProbability;
  const market = p.row.marketProbability;
  // A price-comparison pick's chance is the reference price alone; the model is not blended in.
  if (model != null && !p.marketOnly && !isSharp(p)) {
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
  out.push(
    p.probability >= 0.5
      ? `Husk: med ${pct(p.probability)} taber et bet som dette stadig omtrent hver ${every}. gang.`
      : `Husk: med ${pct(p.probability)} går et bet som dette kun hjem omtrent ${Math.max(1, Math.round(p.probability * 10))} af 10 gange.`,
  );
  return out;
}
