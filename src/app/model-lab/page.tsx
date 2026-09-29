import { Planned } from "@/components/Planned";

export const metadata = { title: "Model Lab · ODDSIQ" };

export default function ModelLabPage() {
  return (
    <Planned title="Model Lab" phase={5}>
      <p>Models, versions, calibration, backtesting, error analysis, market comparison, CLV and drift monitoring. The Prediction Ledger and Model Audit are already live under Model Lab.</p>
    </Planned>
  );
}
