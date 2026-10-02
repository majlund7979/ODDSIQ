import Link from "next/link";
import { AccountMenu } from "@/components/AccountMenu";
import { UtcClock } from "@/components/Clock";
import { CommandPalette } from "@/components/CommandPalette";
import { Sidebar } from "@/components/Sidebar";
import { Badge } from "@/components/ui";
import { DEMO_MODE } from "@/lib/data";

export default function TerminalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <div className="flex min-h-screen">
          <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line bg-surface md:flex">
            <Link href="/picks" className="flex items-baseline gap-2 border-b border-line px-4 py-3.5">
              <span className="text-[15px] font-bold tracking-[0.18em]">ODDSIQ</span>
              <span className="text-[10px] uppercase tracking-widest text-muted">Terminal</span>
            </Link>
            <div className="flex-1 overflow-y-auto">
              <Sidebar />
            </div>
            <div className="border-t border-line px-4 py-3 text-[10px] leading-relaxed text-muted">
              Analytics only. No bets are placed or brokered. 18+. Gambling involves risk of loss.
            </div>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex h-11 items-center gap-3 border-b border-line bg-page/90 px-4 backdrop-blur">
              <Link href="/picks" className="text-sm font-bold tracking-[0.18em] md:hidden">
                ODDSIQ
              </Link>
              {DEMO_MODE && (
                <Badge tone="warning" className="tracking-[0.14em]">
                  Demo data
                </Badge>
              )}
              <span className="hidden text-xs text-muted sm:inline">See the numbers behind the odds.</span>
              <div className="ml-auto flex items-center gap-4">
                <span className="hidden items-center gap-1.5 rounded border border-line px-2 py-0.5 text-[11px] text-muted sm:flex">
                  <kbd className="num">⌘K</kbd> command
                </span>
                <UtcClock />
                <AccountMenu />
              </div>
            </header>
            <nav aria-label="Main (mobile)" className="flex gap-3 overflow-x-auto border-b border-line px-4 py-2 text-xs text-ink-2 md:hidden">
              <Link href="/picks">Dagens bets</Link>
              <Link href="/matches">Kampe</Link>
              <Link href="/my-bets">Mine bets</Link>
              <Link href="/dashboard">Avanceret</Link>
            </nav>
            <main className="min-w-0 flex-1 px-4 py-5 md:px-6">{children}</main>
          </div>
        </div>
        <CommandPalette />
    </>
  );
}
