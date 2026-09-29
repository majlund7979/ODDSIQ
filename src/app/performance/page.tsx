import { Planned } from "@/components/Planned";

export const metadata = { title: "Performance · ODDSIQ" };

export default function PerformancePage() {
  return (
    <Planned title="Performance" phase={5}>
      <p>Accuracy, Brier score, log loss, calibration, simulated ROI, CLV, maximum drawdown and profit factor, broken down by market, league, odds range, confidence and month, each with its sample size and period. Headline figures are already on the Dashboard.</p>
    </Planned>
  );
}
