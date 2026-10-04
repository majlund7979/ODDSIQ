// The morning e-mail: today's top 5 from Dagens bedste bets, with risk level,
// stake share and odds, as plain HTML that works in every mail client.

import type { Pick } from "@/lib/picks";
import { oddsMove, riskOf, stakeAdvice, type RiskLevel } from "@/lib/picks-advice";

export const MORNING_COUNT = 5;
const TZ = "Europe/Copenhagen";
const RISK_COLOR: Record<RiskLevel, string> = { green: "#0ca30c", yellow: "#c98a00", red: "#d03b3b" };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const dec = (x: number) => x.toFixed(2).replace(".", ",");
const clock = (t: number) => new Date(t).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: TZ, hour12: false });
const pctOf = (x: number) => `${String(Math.round(x * 1000) / 10).replace(".", ",")} %`;

/** "kl. 20.45" for today, "i morgen kl. 13.30" for tomorrow. */
const kickoff = (t: number, now: number) => `${morningDay(t) === morningDay(now) ? "" : "i morgen "}kl. ${clock(t)}`;

export const morningDay = (now: number) => new Date(now).toLocaleDateString("en-CA", { timeZone: TZ });

export function morningSubject(picks: Pick[], now: number): string {
  const day = new Date(now).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
  return picks.length ? `Dagens top ${picks.length}, ${day}` : `Ingen bets i dag, ${day}`;
}

export function morningText(picks: Pick[], now: number, siteUrl: string, dataLabel: string): string {
  if (!picks.length) return `Der er ingen fodboldkampe med en analyse de næste 24 timer.\n\n${siteUrl}/picks`;
  const lines = picks.map((p, i) => {
    const s = stakeAdvice(p.probability, p.row.bestOdds);
    const m = oddsMove(p.row.movement, p.row.openingOdds, p.row.currentOdds);
    return [
      `${i + 1}. ${p.outcome} (${Math.round(p.probability * 100)} %, ${riskOf(p.probability).label.toLowerCase()})`,
      `   ${p.row.match.replace(" vs ", " – ")} · ${p.row.league} · ${kickoff(p.row.kickoff, now)}`,
      `   Bedste odds ${dec(p.row.bestOdds)} hos ${p.row.bestBook} · forslag: ${pctOf(s.share)} af puljen${s.note.includes("ingen værdi") ? " (ingen værdi)" : ""}${m ? ` · odds ${m.direction === "down" ? "faldet" : "steget"} ${Math.round(m.size * 100)} %` : ""}`,
    ].join("\n");
  });
  return `${lines.join("\n\n")}\n\nSe hele analysen: ${siteUrl}/picks\n\nProcenterne er skøn, ikke garantier. Spil kun for penge, du har råd til at tabe. 18+.\nKilde: ${dataLabel}.\nSlå mailen fra under Vennerligaen: ${siteUrl}/picks/liga`;
}

export function morningHtml(picks: Pick[], now: number, siteUrl: string, dataLabel: string): string {
  const rows = picks
    .map((p, i) => {
      const r = riskOf(p.probability);
      const s = stakeAdvice(p.probability, p.row.bestOdds);
      const m = oddsMove(p.row.movement, p.row.openingOdds, p.row.currentOdds);
      return `<tr><td style="padding:14px 0;border-top:1px solid #e5e5e0">
<div style="font-size:12px;color:#77756f">${i + 1} · ${esc(p.row.league)} · ${kickoff(p.row.kickoff, now)}</div>
<div style="font-size:16px;font-weight:600;margin:4px 0">${esc(p.row.match.replace(" vs ", " – "))}</div>
<div style="font-size:15px;color:#1f6fd1;font-weight:600">${esc(p.outcome)}</div>
<div style="font-size:13px;color:#3d3c38;margin-top:6px">
<b>${Math.round(p.probability * 100)} %</b> chance ·
<span style="color:${RISK_COLOR[r.level]};font-weight:600">● ${r.label}</span> ·
odds ${dec(p.row.bestOdds)} (${esc(p.row.bestBook)}) ·
forslag ${pctOf(s.share)} af puljen${s.note.includes("ingen værdi") ? " (ingen værdi)" : ""}${m ? ` · odds ${m.direction === "down" ? "↓ faldet" : "↑ steget"} ${Math.round(m.size * 100)} %` : ""}
</div></td></tr>`;
    })
    .join("");
  const body = picks.length ? `<table style="width:100%;border-collapse:collapse">${rows}</table>` : `<p>Der er ingen fodboldkampe med en analyse de næste 24 timer.</p>`;
  return `<!doctype html><html lang="da"><body style="margin:0;background:#f6f6f3;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a19">
<div style="max-width:560px;margin:0 auto;padding:24px 20px">
<div style="font-size:13px;font-weight:700;letter-spacing:1px">Oddsanalyse</div>
<h1 style="font-size:22px;margin:8px 0 4px">Dagens top ${picks.length || ""}</h1>
<p style="margin:0 0 12px;color:#3d3c38;font-size:14px">De udfald med størst chance for at gå hjem i kampene de næste 24 timer.</p>
${body}
<p style="margin:20px 0"><a href="${esc(siteUrl)}/picks" style="background:#1f6fd1;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">Se hele analysen</a></p>
<p style="font-size:12px;color:#77756f;line-height:1.5">Procenterne er skøn, ikke garantier. Spil kun for penge, du har råd til at tabe. 18+. Kilde: ${esc(dataLabel)}.<br>
<a href="${esc(siteUrl)}/picks/liga" style="color:#77756f">Slå morgenmailen fra</a></p>
</div></body></html>`;
}

/** Recipients: friends who have the morning e-mail on, plus any addresses in MORNING_EMAIL_TO; lower-cased and without duplicates. */
export function recipients(users: string[], extra: string | undefined): string[] {
  const list = [...users, ...(extra ?? "").split(/[,;\s]+/)].map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  return [...new Set(list)];
}
