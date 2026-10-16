---
name: skaermbilleder
description: Tag før/efter-skærmbilleder af Oddsanalyses faste sider på desktop og mobil med ensartede filnavne.
disable-model-invocation: true
argument-hint: [before|after|<mappenavn>]
---

Tag skærmbilleder af siderne i demo-tilstand og gem dem i mappen `$ARGUMENTS` (standard: `after`).

## Start appen
- `DEMO_MODE=true npm run dev` i baggrunden, og vent til `http://localhost:3000/picks` svarer 200.
- Lad `OWNER_EMAIL` og `ACCOUNTS_ENABLED` være tomme, så login springes over.

## Sider (navn → URL)
| Navn | URL |
|---|---|
| picks | /picks |
| hjorne | /picks?type=hjorne |
| resultater | /picks/resultater |
| liga | /picks/liga |
| spillere | /picks/spillere |
| tips | /tips |
| nyheder | /nyheder |
| konto | /account |
| login | /login |
| 404 | /findes-ikke |

## Størrelser
- Desktop: 1440 × 900. Mobil: 390 × 844 med `deviceScaleFactor: 2`.
- For hver side og størrelse: ét billede af hele siden (`<navn>-desktop.png`, `<navn>-mobil.png`) og ét af det synlige første skærmbillede (`<navn>-desktop-fold.png`, `<navn>-mobil-fold.png`).

## Værktøj
Brug Playwright MCP, hvis den er tilgængelig. Ellers et lille Node-script med `playwright` (i cloud-miljøet: `executablePath: '/opt/pw-browsers/chromium'`, aldrig `playwright install`).

## Gem
- I et projekt med delt mappe: `/mnt/project-files/oddsiq/screenshots/redesign/$ARGUMENTS/`.
- Ellers: en mappe uden for repoet (fx scratch-mappen). Skærmbilleder committes ikke.

Afslut med en kort liste over sider, hvor noget ser forkert ud (vandret scroll på mobil, overlappende tekst, tomme felter forrest, manglende fodlinje).
