// Modelpanel (step 10, part 3): what the prediction engine stored in schema pe, for the owner only.
// The engine runs in shadow mode, so this page reads the tables directly instead of the
// latest_* views (those only show live models). Nothing here feeds "Dagens bedste bets".

import { db } from "@/lib/db";
import { metric, type Metric } from "@/lib/metrics/metric";

export interface PanelRun {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: "ok" | "failed" | "skipped";
  modelVersion: string | null;
  matches: number | null;
  predictions: number | null;
  approved: number | null;
  seconds: number | null;
  unmapped: string[];
  note: string | null;
}

export interface PanelModel {
  version: string;
  status: string;
  createdAt: Date;
  train: number[];
  validate: number | null;
  blend1x2: number | null;
  blendOu25: number | null;
  weights: Record<string, number>;
  validation: { matches: number; model: number; market: number } | null;
}

export interface PanelSelection {
  market: "1x2" | "ou";
  line: number | null;
  selection: string;
  p: number;
  pModel: number | null;
  pMarket: number | null;
  odds: number | null;
  book: string | null;
  edge: number | null;
  ev: number | null;
  evLow: number | null;
  confidence: number | null;
  isBet: boolean | null;
  rejected: string | null;
  stake: number | null;
}

export interface PanelMatch {
  matchId: string;
  kickoff: Date;
  competition: string;
  home: string;
  away: string;
  stage: string;
  modelVersion: string;
  dataAsOf: Date;
  selections: PanelSelection[];
}

export interface PanelData {
  runs: PanelRun[];
  model: PanelModel | null;
  matches: PanelMatch[];
}

/** Raw row of the prediction query (snake_case as Postgres returns it). */
export interface PredictionRow {
  match_id: string;
  kickoff: Date;
  competition: string;
  home: string;
  away: string;
  market: string;
  line: number | null;
  selection: string;
  probability: number;
  raw_probability: number | null;
  market_probability: number | null;
  best_odds: number | null;
  best_book: string | null;
  model_version: string;
  stage: string;
  data_as_of: Date;
  odds: number | null;
  edge: number | null;
  ev: number | null;
  ev_low: number | null;
  confidence: number | null;
  is_bet: boolean | null;
  rejected_because: string | null;
  stake_share: number | null;
}

export interface RunRow {
  id: string;
  started_at: Date;
  finished_at: Date | null;
  status: string;
  model_version: string | null;
  summary: Record<string, unknown> | null;
}

export interface ModelRow {
  version: string;
  status: string;
  created_at: Date;
  train: unknown;
  validate: unknown;
  blend_1x2: unknown;
  blend_ou25: unknown;
  weights: unknown;
  validation: unknown;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function shapeRuns(rows: RunRow[]): PanelRun[] {
  return rows.map((r) => {
    const s = r.summary ?? {};
    const unmapped = Array.isArray(s.unmapped_names) ? (s.unmapped_names as unknown[]).map(String) : [];
    const note = typeof s.why === "string" ? s.why : typeof s.error === "string" ? s.error.slice(0, 200) : null;
    return {
      id: String(r.id),
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      status: r.status === "failed" || r.status === "skipped" ? r.status : "ok",
      modelVersion: r.model_version,
      matches: num(s.matches) ?? num(s.upcoming_mapped),
      predictions: num(s.predictions),
      approved: num(s.approved_bets),
      seconds: num(s.seconds),
      unmapped,
      note,
    };
  });
}

export function shapeModel(r: ModelRow | undefined): PanelModel | null {
  if (!r) return null;
  const v = (r.validation ?? null) as Record<string, unknown> | null;
  const vm = num(v?.log_loss_model_1x2);
  const vk = num(v?.log_loss_market_1x2);
  const weights: Record<string, number> = {};
  for (const [k, w] of Object.entries((r.weights ?? {}) as Record<string, unknown>)) {
    const n = num(w);
    if (n != null) weights[k] = n;
  }
  return {
    version: r.version,
    status: r.status,
    createdAt: r.created_at,
    train: Array.isArray(r.train) ? r.train.map(Number).filter(Number.isFinite) : [],
    validate: num(r.validate),
    blend1x2: num(r.blend_1x2),
    blendOu25: num(r.blend_ou25),
    weights,
    validation: vm != null && vk != null ? { matches: num(v?.matches) ?? 0, model: vm, market: vk } : null,
  };
}

const ORDER: Record<string, number> = { home: 0, draw: 1, away: 2, over: 3, under: 4 };

export function shapeMatches(rows: PredictionRow[]): PanelMatch[] {
  const byMatch = new Map<string, PanelMatch>();
  for (const r of rows) {
    if (r.market !== "1x2" && r.market !== "ou") continue;
    const id = String(r.match_id);
    let m = byMatch.get(id);
    if (!m) {
      m = { matchId: id, kickoff: r.kickoff, competition: r.competition, home: r.home, away: r.away, stage: r.stage,
            modelVersion: r.model_version, dataAsOf: r.data_as_of, selections: [] };
      byMatch.set(id, m);
    }
    if (r.data_as_of > m.dataAsOf) {
      m.dataAsOf = r.data_as_of;
      m.stage = r.stage;
      m.modelVersion = r.model_version;
    }
    m.selections.push({
      market: r.market,
      line: num(r.line),
      selection: r.selection,
      p: Number(r.probability),
      pModel: num(r.raw_probability),
      pMarket: num(r.market_probability),
      odds: num(r.odds) ?? num(r.best_odds),
      book: r.best_book,
      edge: num(r.edge),
      ev: num(r.ev),
      evLow: num(r.ev_low),
      confidence: num(r.confidence),
      isBet: r.is_bet,
      rejected: r.rejected_because,
      stake: num(r.stake_share),
    });
  }
  const out = [...byMatch.values()];
  for (const m of out) m.selections.sort((a, b) => (ORDER[a.selection] ?? 9) - (ORDER[b.selection] ?? 9));
  return out.sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime() || a.home.localeCompare(b.home));
}

/** red: the market is better and the model gets no weight; yellow: worse but adds a little; green: beats the market. */
export function statusOf(model: PanelModel | null): { tone: "good" | "warning" | "critical" | "neutral"; text: string } {
  if (!model?.validation) return { tone: "neutral", text: "Motoren har ikke gemt en model endnu." };
  const { model: lm, market: lk } = model.validation;
  if (lm < lk) return { tone: "good", text: "Modellen slog markedet på valideringssæsonen. Det skal også holde på nye kampe, før den må gå live." };
  if ((model.blend1x2 ?? 0) >= 0.05) return { tone: "warning", text: "Markedet er mere præcist, men modellen tilføjer lidt og får en lille vægt." };
  return { tone: "critical", text: "Markedet er mere præcist end modellen. Motoren bruger derfor markedets sandsynligheder og godkender ingen bets." };
}

export const SELECTION_LABEL: Record<string, string> = {
  home: "Hjemme (1)",
  draw: "Uafgjort (X)",
  away: "Ude (2)",
  over: "Over 2,5 mål",
  under: "Under 2,5 mål",
};

const SEASONS = (from: number, to: number) => ({ periodFrom: Date.UTC(from, 6, 1), periodTo: Date.UTC(to, 5, 30) });
const BT_SOURCE = "Egen backtest (trin 5) på football-data.co.uk, 16 ligaer";
const BT_MODEL = "ensemble, trin 5 (5. okt. 2026)";

/** The step-5 backtest headline numbers (historical; walk-forward over 10 test seasons, 2016/17-2025/26). */
export const BACKTEST: { label: string; m: Metric<string>; compare?: string }[] = [
  {
    label: "Log loss 1X2, model mod bet365",
    m: metric("1,002 mod 0,989", { n: 54_773, ...SEASONS(2016, 2026), modelVersion: BT_MODEL, source: BT_SOURCE, basis: "historical",
      definition: "Gennemsnitlig log loss på testsæsonerne; lavere er bedre. bet365's odds uden margin var bedre i alle 10 sæsoner." }),
  },
  {
    label: "Mest sandsynlige 1X2-udfald (sitets regel)",
    m: metric("−4,0 % ROI", { n: 54_773, ...SEASONS(2016, 2026), modelVersion: BT_MODEL, source: BT_SOURCE, basis: "simulated",
      definition: "Flad indsats på det mest sandsynlige 1X2-udfald til bet365's odds. 90 %-interval −4,7 % til −3,3 %. Hit rate 51 %." }),
  },
  {
    label: "Value bets, edge ≥ 2 %, bet365",
    m: metric("−11,8 % ROI", { n: 318, ...SEASONS(2016, 2026), modelVersion: BT_MODEL, source: BT_SOURCE, basis: "simulated",
      definition: "Blandet model, kvart Kelly. 90 %-interval −25 % til +2 %. Hit rate 29 % mod ventet 35 %." }),
  },
  {
    label: "Value bets, edge ≥ 2 %, højeste odds",
    m: metric("−5,9 % ROI", { n: 914, ...SEASONS(2016, 2026), modelVersion: BT_MODEL, source: BT_SOURCE, basis: "simulated",
      definition: "Som ovenfor, men til den højeste odds blandt bookmakerne. 90 %-interval −13 % til +2 %." }),
  },
];

const RUNS_SQL = `
  SELECT id::text, started_at, finished_at, status, model_version, summary
  FROM pe.job_run WHERE job = 'pe-predict' ORDER BY started_at DESC LIMIT 14`;

const MODEL_SQL = `
  SELECT version, status, created_at, params->'train' AS train, params->'validate' AS validate,
         params->'blend_1x2' AS blend_1x2, params->'blend_ou25' AS blend_ou25, params->'weights' AS weights,
         params->'validation' AS validation
  FROM pe.model WHERE family = 'ensemble' ORDER BY created_at DESC LIMIT 1`;

// Newest prediction per match and selection (shadow models included), with the value
// evaluation made from it. Matches that kicked off more than two hours ago are left out.
const PREDICTIONS_SQL = `
  WITH latest AS (
    SELECT DISTINCT ON (p.match_id, p.market, p.line, p.selection) p.*
    FROM pe.prediction p JOIN pe.match m ON m.id = p.match_id
    WHERE NOT p.is_backtest AND m.kickoff > $1 AND p.market IN ('1x2', 'ou')
    ORDER BY p.match_id, p.market, p.line, p.selection, p.created_at DESC, p.id DESC
  )
  SELECT l.match_id::text, m.kickoff, c.name AS competition, ht.name AS home, at.name AS away,
         l.market, l.line::float8 AS line, l.selection, l.probability, l.raw_probability, l.market_probability,
         l.best_odds::float8 AS best_odds, b.key AS best_book, l.model_version, l.stage, l.data_as_of,
         v.odds::float8 AS odds, v.edge, v.ev, v.ev_low, v.confidence, v.is_bet, v.rejected_because, v.stake_share
  FROM latest l
  JOIN pe.match m ON m.id = l.match_id
  JOIN pe.season s ON s.id = m.season_id
  JOIN pe.competition c ON c.id = s.competition_id
  JOIN pe.team ht ON ht.id = m.home_team_id
  JOIN pe.team at ON at.id = m.away_team_id
  LEFT JOIN pe.bookmaker b ON b.id = l.best_bookmaker_id
  LEFT JOIN LATERAL (SELECT * FROM pe.value_bet v WHERE v.prediction_id = l.id ORDER BY v.run_at DESC LIMIT 1) v ON true
  ORDER BY m.kickoff, l.match_id
  LIMIT 3000`;

/** Reads everything the page shows. Throws when schema pe is missing or unreadable. */
export async function loadPanel(now: number): Promise<PanelData> {
  const q = db();
  const [runs, models, preds] = await Promise.all([
    q.$queryRawUnsafe<RunRow[]>(RUNS_SQL),
    q.$queryRawUnsafe<ModelRow[]>(MODEL_SQL),
    q.$queryRawUnsafe<PredictionRow[]>(PREDICTIONS_SQL, new Date(now - 2 * 3_600_000)),
  ]);
  return { runs: shapeRuns(runs), model: shapeModel(models[0]), matches: shapeMatches(preds) };
}
