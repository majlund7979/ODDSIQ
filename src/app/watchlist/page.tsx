import { Planned } from "@/components/Planned";

export const metadata = { title: "Watchlist · ODDSIQ" };

export default function WatchlistPage() {
  return (
    <Planned title="Watchlist" phase={8}>
      <p>Track teams, leagues, markets and models, and ask the market assistant what changed in your watchlist.</p>
    </Planned>
  );
}
