// The morning e-mail: today's top 5 from Dagens bedste bets, with risk level,
// stake share and odds, as plain HTML that works in every mail client.

import { clock, dayKey, dec, TZ } from "@/lib/format";
import { emailShell, escapeHtml } from "@/lib/mail";
import type { Pick } from "@/lib/picks";
import { oddsMove, riskOf, stakeAdvice, type RiskLevel } from "@/lib/picks-advice";
import { SHARP_MAX_ODDS, SHARP_MIN_EV, SHARP_MIN_ODDS } from "@/lib/sharp";

export const MORNING_COUNT = 5;
const RISK_COLOR: Record<RiskLevel, string> = { green: "#0ca30c", yellow: "#c98a00", red: "#d03b3b" };

const pctOf = (x: number) => `${String(Math.round(x * 1000) / 10).replace(".", ",")} %`;

/** "kl. 20.45" for today, "i morgen kl. 13.30" for tomorrow. */
const kickoff = (t: number, now: number) => `${morningDay(t) === morningDay(now) ? "" : "i morgen "}kl. ${clock(t)}`;

export const morningDay = dayKey;

export function morningSubject(picks: Pick[], now: number): string {
  const day = new Date(now).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
  return picks.length ? `Dagens top ${picks.length}, ${day}` : `Ingen bets i dag, ${day}`;
}

const MIN_EV = `${Math.round(SHARP_MIN_EV * 100)} %`;
/** Why there is nothing to send: no matches at all, or no price that clears the rule (or no prices from one run). */
const none = (matches: number) =>
  matches
    ? `Ingen bets i dag: i kampene de næste 24 timer betaler hverken bet365 eller bwin mindst ${MIN_EV} over Pinnacles (ellers Betfair Exchanges) fair pris ved odds ${dec(SHARP_MIN_ODDS)}–${dec(SHARP_MAX_ODDS)}, eller vi mangler deres odds fra samme opdatering.`
    : "Ingen bets i dag: der er ingen kampe de næste 24 timer.";
const INTRO = `Forsøg: bets, hvor bet365 eller bwin betaler mindst ${MIN_EV} mere end Pinnacles odds uden margin. Vi henter odds hver 5.–6. time, så tjek prisen, før du spiller. Den historiske test viste ingen sikker fordel.`;
/** " (hentet kl. 06.15) · spil kun til mindst 2,15" on a Dagens bedste bets pick. */
const priceNote = (p: Pick) => `${p.pricedAt !== undefined ? ` (hentet kl. ${clock(p.pricedAt)})` : ""}${p.minOdds !== undefined ? ` · spil kun til mindst ${dec(p.minOdds)}` : ""}`;

/** `matches`: football matches in the next 24 hours, to tell "no matches" from "no bets". */
export function morningText(picks: Pick[], now: number, siteUrl: string, dataLabel: string, matches = 1): string {
  if (!picks.length) return `${none(matches)}\n\n${siteUrl}/picks`;
  const lines = picks.map((p, i) => {
    const s = stakeAdvice(p.probability, p.row.bestOdds);
    const m = oddsMove(p.row.movement, p.row.openingOdds, p.row.currentOdds);
    return [
      `${i + 1}. ${p.outcome} (${Math.round(p.probability * 100)} %, ${riskOf(p.probability).label.toLowerCase()})`,
      `   ${p.row.match.replace(" vs ", " – ")} · ${p.row.league} · ${kickoff(p.row.kickoff, now)}`,
      `   Odds ${dec(p.row.bestOdds)} hos ${p.row.bestBook}${priceNote(p)} · forslag: ${pctOf(s.share)} af puljen${s.note.includes("ingen værdi") ? " (ingen værdi)" : ""}${m ? ` · odds ${m.direction === "down" ? "faldet" : "steget"} ${Math.round(m.size * 100)} %` : ""}`,
    ].join("\n");
  });
  return `${INTRO}\n\n${lines.join("\n\n")}\n\nSe hele analysen: ${siteUrl}/picks\n\nProcenterne er skøn, ikke garantier. Spil kun for penge, du har råd til at tabe. 18+.\nKilde: ${dataLabel}.\nSlå mailen fra under Vennerligaen: ${siteUrl}/picks/liga`;
}

export function morningHtml(picks: Pick[], now: number, siteUrl: string, dataLabel: string, matches = 1): string {
  const rows = picks
    .map((p, i) => {
      const r = riskOf(p.probability);
      const s = stakeAdvice(p.probability, p.row.bestOdds);
      const m = oddsMove(p.row.movement, p.row.openingOdds, p.row.currentOdds);
      return `<tr><td style="padding:14px 0;border-top:1px solid #e5e5e0">
<div style="font-size:12px;color:#77756f">${i + 1} · ${escapeHtml(p.row.league)} · ${kickoff(p.row.kickoff, now)}</div>
<div style="font-size:16px;font-weight:600;margin:4px 0">${escapeHtml(p.row.match.replace(" vs ", " – "))}</div>
<div style="font-size:15px;color:#1f6fd1;font-weight:600">${escapeHtml(p.outcome)}</div>
<div style="font-size:13px;color:#3d3c38;margin-top:6px">
<b>${Math.round(p.probability * 100)} %</b> chance ·
<span style="color:${RISK_COLOR[r.level]};font-weight:600">● ${r.label}</span> ·
odds ${dec(p.row.bestOdds)} (${escapeHtml(p.row.bestBook)})${priceNote(p)} ·
forslag ${pctOf(s.share)} af puljen${s.note.includes("ingen værdi") ? " (ingen værdi)" : ""}${m ? ` · odds ${m.direction === "down" ? "↓ faldet" : "↑ steget"} ${Math.round(m.size * 100)} %` : ""}
</div></td></tr>`;
    })
    .join("");
  const body = picks.length ? `<table style="width:100%;border-collapse:collapse">${rows}</table>` : `<p>${none(matches)}</p>`;
  return emailShell(
    `<h1 style="font-size:22px;margin:8px 0 4px">Dagens top ${picks.length || ""}</h1>
<p style="margin:0 0 12px;color:#3d3c38;font-size:14px">${INTRO}</p>
${body}
<p style="margin:20px 0"><a href="${escapeHtml(siteUrl)}/picks" style="background:#1f6fd1;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">Se hele analysen</a></p>
<p style="font-size:12px;color:#77756f;line-height:1.5">Procenterne er skøn, ikke garantier. Spil kun for penge, du har råd til at tabe. 18+. Kilde: ${escapeHtml(dataLabel)}.<br>
<a href="${escapeHtml(siteUrl)}/picks/liga" style="color:#77756f">Slå morgenmailen fra</a></p>`,
    { maxWidth: 560 },
  );
}

/** Recipients: friends who have the morning e-mail on, plus any addresses in MORNING_EMAIL_TO; lower-cased and without duplicates. */
export function recipients(users: string[], extra: string | undefined): string[] {
  const list = [...users, ...(extra ?? "").split(/[,;\s]+/)].map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  return [...new Set(list)];
}
