import Link from "next/link";
import { FOOTER_LINE } from "@/components/footer-line";
import { Logo } from "@/components/Logo";
import { buttonClass } from "@/components/ui";

export const metadata = { title: "Siden findes ikke · Oddsanalyse" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-10 px-4 py-10">
      <Logo />
      <div className="rise space-y-6">
        <div className="figure text-[120px] leading-none text-ink sm:text-[160px]" aria-hidden>
          4<span className="text-accent">0</span>4
        </div>
        <div>
          <h1 className="display text-[40px]">Siden findes ikke</h1>
          <p className="mt-3 text-md text-ink-2">Linket er forkert, eller siden er flyttet. Dagens bets ligger der, hvor de plejer.</p>
        </div>
        <Link href="/picks" className={buttonClass("primary", "lg", "w-full")}>
          Til dagens bedste bets
        </Link>
      </div>
      <footer className="text-xs leading-relaxed text-ink-2">{FOOTER_LINE}</footer>
    </main>
  );
}
