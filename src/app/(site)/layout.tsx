import { FOOTER_LINE } from "@/components/footer-line";

/** The pitch's centre, drawn in chalk behind the login headline. */
function PitchLines() {
  return (
    <svg viewBox="0 0 600 600" className="pointer-events-none absolute -right-40 -bottom-40 h-[620px] w-[620px] text-line-strong lg:-right-56 lg:top-1/2 lg:bottom-auto lg:-translate-y-1/2" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="300" cy="300" r="150" />
      <circle cx="300" cy="300" r="5" fill="currentColor" />
      <path d="M0 300h600M300 0v600" opacity="0.6" />
      <circle cx="300" cy="300" r="290" opacity="0.35" />
    </svg>
  );
}

export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative isolate flex flex-col justify-end overflow-hidden border-b border-line px-6 pt-10 pb-8 lg:justify-center lg:py-16 lg:border-r lg:border-b-0 lg:px-16">
        <PitchLines />
        <div className="rise relative max-w-lg space-y-4 lg:space-y-8">
          <div className="eyebrow hidden text-accent lg:block">Oddsanalyse</div>
          <h1 className="display text-[40px] text-ink sm:text-[64px] lg:text-[80px]">Dagens bedste bets, forklaret.</h1>
          <ul className="hidden space-y-3 text-md text-ink-2 sm:text-lg lg:block">
            {["Chancen for hvert bet i procent, med begrundelse.", "Bedste odds hos bookmakerne, og om der er værdi.", "Alle resultater vises, også de tabte."].map((t) => (
              <li key={t} className="flex gap-3">
                <span aria-hidden className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <div className="flex flex-col items-center justify-center px-4 py-8 lg:py-12">
        <main className="rise w-full max-w-sm [--i:1]">{children}</main>
        <footer className="mt-10 max-w-sm text-center text-xs leading-relaxed text-ink-2">{FOOTER_LINE}</footer>
      </div>
    </div>
  );
}
