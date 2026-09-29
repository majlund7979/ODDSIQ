import { Planned } from "@/components/Planned";

export const metadata = { title: "My Bets · ODDSIQ" };

export default function MyBetsPage() {
  return (
    <Planned title="My Bets" phase={8}>
      <p>A personal record of the positions you choose to track, with CLV and results measured the same way as the model&rsquo;s ledger.</p>
    </Planned>
  );
}
