@AGENTS.md

## ODDSIQ conventions

- Positioning: the site is only "Dagens bedste bets" (/picks, Danish) and its results board (/picks/resultater). Mads retired the analytics terminal on 2026-10-02 and its page code was deleted the same day; old URLs redirect to /picks (next.config.ts). Since 2026-10-03 there is also /nyheder (Google News RSS, src/lib/news) and /venner (owner invites friends, used only with INVITE_ONLY=true). Login is required on every page once OWNER_EMAIL is set; anyone can sign up unless INVITE_ONLY=true. The brand is Oddsanalyse (domain oddsanalyse.dk). Keep new work inside these pages. Never say "lock" or "guaranteed"; no casino styling or flashing odds.
- Every aggregate statistic must carry sample size, period, source and model version (`Metric` in `src/lib/metrics/metric.ts`), and say whether it is historical, simulated, live or estimated.
- Never claim who or what caused a price move; list possible explanations separately from facts.
- The prediction ledger is append-only. Never add code paths that edit or delete predictions; outcomes go in `PredictionOutcome`.
- Demo data must stay deterministic (seeded by id via `src/lib/demo/rng.ts`) and labelled DEMO DATA.
- Before pushing: `npm run lint && npm run typecheck && npm test && npm run build`.

## Claude Code setup (`.claude/`, `.mcp.json`)

- Hooks: ESLint `--fix` runs on every edited TS file; edits to `.env*`, `package-lock.json` and existing migrations are blocked; cloud sessions install npm and `pe/` dependencies on start.
- Skills: `/ny-migration <navn>` for the next numbered migration, `/skaermbilleder [before|after]` for desktop and mobile screenshots.
- Agents: `regel-tjek` (the product rules above) and `leakage-tjek` (look-ahead leakage in `pe/`). Run the relevant one before opening a PR.
- MCP: context7 for current Next.js 16 and Prisma 7 docs, Playwright for driving the site.
