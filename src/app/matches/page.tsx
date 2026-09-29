import { Planned } from "@/components/Planned";

export const metadata = { title: "Matches · ODDSIQ" };

export default function MatchesPage() {
  return (
    <Planned title="Matches" phase={7}>
      <p>Fixtures and results across every tracked league, with a “What changed?” timeline for each match.</p>
    </Planned>
  );
}
