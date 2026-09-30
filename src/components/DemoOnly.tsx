import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui";

/** Shown in place of a page that still needs data the live feeds do not provide. */
export function DemoOnly({ title, needs }: { title: string; needs: string }) {
  return (
    <div className="space-y-4">
      <PageHeader title={title} subtitle="Not available on live data yet." />
      <Panel title="Why this page is empty">
        <div className="space-y-2 px-4 py-3 text-sm text-ink-2">
          <p>This page needs {needs}, which the connected feeds do not provide yet. It runs on the demo universe when DEMO_MODE is on.</p>
          <p>
            Live pages: <Link href="/markets" className="text-accent hover:underline">Market Terminal</Link>, <Link href="/value-scanner" className="text-accent hover:underline">Value Scanner</Link>,{" "}
            <Link href="/matches" className="text-accent hover:underline">Matches</Link>, <Link href="/markets/alerts" className="text-accent hover:underline">Alerts</Link>,{" "}
            <Link href="/model-lab/real-model" className="text-accent hover:underline">Real Model</Link>, <Link href="/performance" className="text-accent hover:underline">Performance</Link> and{" "}
            <Link href="/watchlist" className="text-accent hover:underline">Watchlist</Link>.
          </p>
        </div>
      </Panel>
    </div>
  );
}
