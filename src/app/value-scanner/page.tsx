import { Planned } from "@/components/Planned";

export const metadata = { title: "Value Scanner · ODDSIQ" };

export default function ValueScannerPage() {
  return (
    <Planned title="Value Scanner" phase={6}>
      <p>Scan every open market with filters for sport, league, market, minimum EV, minimum edge, confidence, odds range, kickoff, bookmaker, movement, model agreement and CLV history. Results are grouped by characteristic, never ranked as a single “best bet”.</p>
    </Planned>
  );
}
