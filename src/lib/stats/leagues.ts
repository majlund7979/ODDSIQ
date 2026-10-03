// Competition key → API-Football league id: the leagues the real model covers
// plus every competition whose odds come from API-Football.

import { AF_COMPETITIONS } from "@/lib/providers/api-football-odds";

export const STATS_LEAGUES: Record<string, number> = {
  soccer_epl: 39,
  soccer_efl_champ: 40,
  soccer_germany_bundesliga: 78,
  soccer_spain_la_liga: 140,
  soccer_italy_serie_a: 135,
  soccer_france_ligue_one: 61,
  soccer_netherlands_eredivisie: 88,
  soccer_portugal_primeira_liga: 94,
  soccer_belgium_first_div: 144,
  soccer_austria_bundesliga: 218,
  soccer_denmark_superliga: 119,
  soccer_uefa_champs_league: 2,
  ...Object.fromEntries(AF_COMPETITIONS.map((c) => [c.key, c.leagueId])),
};
