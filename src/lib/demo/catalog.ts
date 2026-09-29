// Static reference data for DEMO_MODE. Team names are real clubs so the demo
// reads naturally; every rating, price and result generated from them is
// synthetic and labelled DEMO DATA in the UI. Bookmakers are fictional.

import type { Bookmaker, League, Sport, Team } from "@/lib/domain/types";
import { Rng } from "./rng";

export const SPORTS: Sport[] = [
  { id: "football", name: "Football" },
  { id: "basketball", name: "Basketball" },
  { id: "tennis", name: "Tennis" },
  { id: "american-football", name: "American Football" },
  { id: "ice-hockey", name: "Ice Hockey" },
];

export const LEAGUES: League[] = [
  { id: "epl", sportId: "football", name: "Premier League", country: "England" },
  { id: "laliga", sportId: "football", name: "La Liga", country: "Spain" },
  { id: "bundesliga", sportId: "football", name: "Bundesliga", country: "Germany" },
  { id: "seriea", sportId: "football", name: "Serie A", country: "Italy" },
  { id: "ligue1", sportId: "football", name: "Ligue 1", country: "France" },
  { id: "eredivisie", sportId: "football", name: "Eredivisie", country: "Netherlands" },
  { id: "superliga", sportId: "football", name: "Superliga", country: "Denmark" },
  { id: "championship", sportId: "football", name: "Championship", country: "England" },
  { id: "nba", sportId: "basketball", name: "NBA", country: "USA" },
  { id: "atp", sportId: "tennis", name: "ATP Tour", country: "International" },
  { id: "nfl", sportId: "american-football", name: "NFL", country: "USA" },
  { id: "nhl", sportId: "ice-hockey", name: "NHL", country: "USA" },
];

const TEAM_NAMES: Record<string, string[]> = {
  epl: ["Liverpool", "Arsenal", "Manchester City", "Chelsea", "Tottenham", "Newcastle", "Aston Villa", "Brighton", "Manchester United", "West Ham", "Brentford", "Fulham"],
  laliga: ["Real Madrid", "Barcelona", "Atlético Madrid", "Athletic Club", "Real Sociedad", "Villarreal", "Real Betis", "Sevilla", "Valencia", "Girona"],
  bundesliga: ["Bayern Munich", "Bayer Leverkusen", "Borussia Dortmund", "RB Leipzig", "VfB Stuttgart", "Eintracht Frankfurt", "SC Freiburg", "Wolfsburg", "Union Berlin", "Werder Bremen"],
  seriea: ["Inter", "Napoli", "Juventus", "AC Milan", "Atalanta", "Roma", "Lazio", "Fiorentina", "Bologna", "Torino"],
  ligue1: ["Paris Saint-Germain", "Marseille", "Monaco", "Lille", "Lyon", "Nice", "Lens", "Rennes", "Strasbourg", "Nantes"],
  eredivisie: ["PSV", "Ajax", "Feyenoord", "AZ", "Twente", "Utrecht", "Heerenveen", "Sparta Rotterdam"],
  superliga: ["FC Copenhagen", "FC Midtjylland", "Brøndby", "AGF", "FC Nordsjælland", "Silkeborg", "Randers", "Viborg"],
  championship: ["Leeds United", "Burnley", "Sunderland", "Sheffield United", "Middlesbrough", "Norwich City", "West Brom", "Coventry City", "Watford", "Stoke City"],
  nba: ["Boston Celtics", "Denver Nuggets", "Oklahoma City Thunder", "Milwaukee Bucks", "Los Angeles Lakers", "Golden State Warriors", "New York Knicks", "Dallas Mavericks", "Miami Heat", "Phoenix Suns"],
  atp: ["J. Sinner", "C. Alcaraz", "N. Djokovic", "A. Zverev", "D. Medvedev", "T. Fritz", "C. Ruud", "H. Rune", "A. de Minaur", "S. Tsitsipas"],
  nfl: ["Kansas City Chiefs", "Baltimore Ravens", "San Francisco 49ers", "Detroit Lions", "Buffalo Bills", "Philadelphia Eagles", "Dallas Cowboys", "Green Bay Packers", "Miami Dolphins", "Cincinnati Bengals"],
  nhl: ["Florida Panthers", "Edmonton Oilers", "Colorado Avalanche", "New York Rangers", "Dallas Stars", "Carolina Hurricanes", "Vegas Golden Knights", "Toronto Maple Leafs", "Boston Bruins", "Winnipeg Jets"],
};

function shortName(name: string): string {
  const words = name.replace(/\./g, "").split(" ");
  if (words.length === 1) return name.slice(0, 3).toUpperCase();
  return words.map((w) => w[0]).join("").slice(0, 3).toUpperCase();
}

export const TEAMS: Team[] = Object.entries(TEAM_NAMES).flatMap(([leagueId, names]) =>
  names.map((name, i) => {
    const rng = new Rng(`team:${leagueId}:${name}`);
    // Earlier-listed teams are stronger on average.
    const tier = 0.35 - (0.6 * i) / names.length;
    return {
      id: `${leagueId}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      leagueId,
      name,
      shortName: shortName(name),
      attack: tier + rng.normal(0, 0.08),
      defence: tier + rng.normal(0, 0.08),
    };
  }),
);

export const BOOKMAKERS: Bookmaker[] = [
  { id: "northline", name: "Northline", margin: 0.045, reliability: 0.98 },
  { id: "meridian", name: "Meridian", margin: 0.052, reliability: 0.97 },
  { id: "kestrel", name: "Kestrel", margin: 0.038, reliability: 0.99 },
  { id: "atlas", name: "Atlas Sports", margin: 0.061, reliability: 0.94 },
  { id: "bluewater", name: "Bluewater", margin: 0.055, reliability: 0.96 },
  { id: "summit", name: "Summit Line", margin: 0.029, reliability: 0.99 },
  { id: "fjord", name: "Fjord", margin: 0.058, reliability: 0.93 },
  { id: "ironbridge", name: "Ironbridge", margin: 0.066, reliability: 0.91 },
  { id: "polaris", name: "Polaris", margin: 0.049, reliability: 0.95 },
  { id: "vantage", name: "Vantage", margin: 0.071, reliability: 0.9 },
];

export const teamById = new Map(TEAMS.map((t) => [t.id, t]));
export const leagueById = new Map(LEAGUES.map((l) => [l.id, l]));
export const bookmakerById = new Map(BOOKMAKERS.map((b) => [b.id, b]));
export const teamsByLeague = new Map(LEAGUES.map((l) => [l.id, TEAMS.filter((t) => t.leagueId === l.id)]));
