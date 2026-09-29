import Link from "next/link";
import { PageHeader } from "./ui";

/** Placeholder for sections that are on the roadmap but not built yet. */
export function Planned({ title, phase, children }: { title: string; phase: number; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <PageHeader title={title} subtitle={`Planned for phase ${phase} of the build plan.`} />
      <div className="max-w-2xl rounded-md border border-dashed border-line-strong bg-surface px-5 py-4 text-sm text-ink-2">
        {children}
        <p className="mt-3 text-xs text-muted">
          The data this section needs already exists in the demo universe. Meanwhile, see the{" "}
          <Link href="/markets" className="text-accent hover:underline">
            Market Terminal
          </Link>{" "}
          and the{" "}
          <Link href="/model-lab/ledger" className="text-accent hover:underline">
            Prediction Ledger
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
