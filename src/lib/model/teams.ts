// Team-name matching across sources. Results come from openfootball
// ("Brighton & Hove Albion FC"), prices from The Odds API ("Brighton and Hove
// Albion"), and each source varies its own spelling between seasons. Names are
// reduced to a key; anything that still does not match is reported, never guessed.

const DROP = new Set([
  "fc", "afc", "cf", "sc", "ac", "ssc", "bc", "cfc", "kv", "kaa", "krc", "rsc", "kvc", "sv", "vfl", "vfb", "tsg", "fsv", "us", "ud", "cd", "rc", "rcd", "sd", "ca",
  "club", "de", "del", "la", "le", "calcio", "balompie", "futbol", "fk", "hsc", "sco", "osc", "ogc", "fco", "estac", "sbv", "skn", "scr", "sk", "gd", "cs", "ss", "e", "and", "the", "af", "ev",
]);
const EXPAND: Record<string, string> = { bor: "borussia", utd: "united", st: "saint", munich: "munchen", internazionale: "inter" };

/** Hand-checked equivalences, written as normalized keys. */
const ALIASES: Record<string, string> = {
  "inter milano": "inter",
  "inter milan": "inter",
  "bayern munchen": "bayern",
  "atletico madrid": "atletico",
  "atletico": "atletico",
  "athletic bilbao": "athletic",
  "paris saint germain": "psg",
  "olympique lyonnais": "lyon",
  "olympique marseille": "marseille",
  "sporting lisbon": "sporting cp",
  "sporting portugal": "sporting cp",
  "sport lisboa benfica": "benfica",
  "sl benfica": "benfica",
  "sporting braga": "braga",
  "wolverhampton wanderers": "wolves",
  "tottenham hotspur": "tottenham",
  "brighton hove albion": "brighton",
  "west bromwich albion": "west brom",
  "newcastle united": "newcastle",
  "west ham united": "west ham",
  "nottingham forest": "nottingham forest",
  "leeds united": "leeds",
  "sheffield united": "sheffield united",
  "psv eindhoven": "psv",
  "az alkmaar": "az",
  "nec nijmegen": "nec",
  "feyenoord rotterdam": "feyenoord",
  "lazio roma": "lazio",
  "as roma": "roma",
  "celta vigo": "celta",
  "espanyol barcelona": "espanyol",
  "real betis": "betis",
  "rayo vallecano madrid": "rayo vallecano",
  "hertha bsc": "hertha",
  // National teams (international_results vs API-Football)
  "turkiye": "turkey",
  "ireland": "republic of ireland",
  "czechia": "czech republic",
  "macedonia": "north macedonia",
  "fyr macedonia": "north macedonia",
  "korea republic": "south korea",
  "usa": "united states",
  "cape verde islands": "cape verde",
  // football-data.co.uk short names
  "man united": "manchester united",
  "man city": "manchester city",
  "nottm forest": "nottingham forest",
  "sheffield weds": "sheffield wednesday",
  "qpr": "queens park rangers",
  "ath madrid": "atletico",
  "ath bilbao": "athletic",
  "sociedad": "real sociedad",
  "vallecano": "rayo vallecano",
  "espanol": "espanyol",
  "paris sg": "psg",
  "sp lisbon": "sporting cp",
  "sp braga": "braga",
  "ein frankfurt": "eintracht frankfurt",
  "mgladbach": "borussia monchengladbach",
};

export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((t) => EXPAND[t] ?? t)
    .filter((t) => !DROP.has(t) && !/^\d+$/.test(t))
    .join(" ");
}

export function teamKey(name: string): string {
  const n = normalizeName(name);
  return ALIASES[n] ?? n;
}

/**
 * Finds `name` among `candidates` (display names from another source).
 * Exact key first; then a unique candidate whose key tokens contain, or are
 * contained in, the name's tokens. Returns null when nothing or several match.
 */
export function matchTeam(name: string, candidates: string[]): string | null {
  const key = teamKey(name);
  const exact = candidates.filter((c) => teamKey(c) === key);
  if (exact.length) return exact[0];
  const tokens = new Set(key.split(" "));
  const subset = candidates.filter((c) => {
    const ct = teamKey(c).split(" ");
    const inName = ct.every((t) => tokens.has(t));
    const inCand = [...tokens].every((t) => ct.includes(t));
    return inName || inCand;
  });
  const keys = new Set(subset.map(teamKey));
  return keys.size === 1 ? subset[0] : null;
}
