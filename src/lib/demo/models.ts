import type { ModelFamily, ModelVersion, SportId } from "@/lib/domain/types";

const d = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

export const MODEL_FAMILIES: ModelFamily[] = [
  { id: "poisson", name: "Poisson", kind: "poisson", description: "Bivariate Poisson goal model on attack/defence ratings (score-based model for non-football sports)." },
  { id: "xgboost", name: "XGBoost", kind: "gbm", description: "Gradient-boosted trees on form, xG, schedule and availability features." },
  { id: "elo", name: "Elo", kind: "elo", description: "Margin-adjusted Elo ratings with home advantage." },
  { id: "neural", name: "Neural", kind: "neural", description: "Feed-forward network on rolling team and player features." },
  { id: "ensemble", name: "Ensemble", kind: "ensemble", description: "Weighted blend of the component models; the only model recorded in the prediction ledger." },
];

export const COMPONENT_MODELS = [
  { familyId: "poisson", versionId: "poisson-v2.1", weight: 0.25 },
  { familyId: "xgboost", versionId: "xgboost-v1.8", weight: 0.3 },
  { familyId: "elo", versionId: "elo-v3.0", weight: 0.2 },
  { familyId: "neural", versionId: "neural-v0.9", weight: 0.25 },
] as const;

const FOOTBALL_FEATURES = ["xG for/against (rolling 6)", "shot quality", "home/away split", "Elo rating", "squad availability", "rest days", "market opening price"];
const OTHER_FEATURES = ["net rating (rolling 10)", "home/away split", "Elo rating", "availability", "rest days", "market opening price"];

interface EnsembleRelease {
  version: string;
  releasedAt: number;
  trainingFrom: number;
  trainingTo: number;
  /** Demo-only: size of the generator's model error, so versions genuinely differ. */
  noise: number;
  notes: string;
}

export const ENSEMBLE_RELEASES: EnsembleRelease[] = [
  { version: "1.2", releasedAt: d("2025-12-15"), trainingFrom: d("2019-08-01"), trainingTo: d("2025-11-30"), noise: 0.13, notes: "Baseline ensemble of four component models." },
  { version: "1.3", releasedAt: d("2026-04-08"), trainingFrom: d("2019-08-01"), trainingTo: d("2026-03-31"), noise: 0.115, notes: "Added squad-availability feature; re-weighted XGBoost." },
  { version: "1.4", releasedAt: d("2026-07-14"), trainingFrom: d("2020-08-01"), trainingTo: d("2026-06-30"), noise: 0.1, notes: "Shorter training window; recalibrated with isotonic regression." },
];

export function ensembleVersionId(sportId: SportId, version: string): string {
  return `${sportId === "football" ? "football" : "multisport"}-ensemble-v${version}`;
}

export function releaseAt(t: number): EnsembleRelease {
  let current = ENSEMBLE_RELEASES[0];
  for (const r of ENSEMBLE_RELEASES) if (r.releasedAt <= t) current = r;
  return current;
}

export const MODEL_VERSIONS: ModelVersion[] = [
  ...ENSEMBLE_RELEASES.flatMap((r) =>
    (["football", "basketball"] as SportId[]).map((sport) => ({
      id: ensembleVersionId(sport, r.version),
      familyId: "ensemble",
      version: r.version,
      releasedAt: r.releasedAt,
      trainingFrom: r.trainingFrom,
      trainingTo: r.trainingTo,
      features: sport === "football" ? FOOTBALL_FEATURES : OTHER_FEATURES,
      notes: r.notes,
    })),
  ),
  ...COMPONENT_MODELS.map((c) => ({
    id: c.versionId,
    familyId: c.familyId,
    version: c.versionId.split("-v")[1],
    releasedAt: d("2025-11-01"),
    trainingFrom: d("2019-08-01"),
    trainingTo: d("2025-10-31"),
    features: FOOTBALL_FEATURES,
    notes: "Component model; not recorded in the ledger on its own.",
  })),
];
