export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="flex flex-col justify-end border-b border-line bg-[radial-gradient(ellipse_at_top_left,rgba(59,140,240,0.22),transparent_65%)] px-6 pt-14 pb-10 lg:border-r lg:border-b-0 lg:justify-center lg:px-16">
        <div className="max-w-md space-y-5">
          <h1 className="display text-5xl text-ink sm:text-6xl">Dagens bedste bets, forklaret.</h1>
          <ul className="space-y-2 text-[17px] text-ink-2">
            <li>Chancen for hvert bet i procent, med begrundelse.</li>
            <li>Bedste odds hos bookmakerne, og om der er værdi.</li>
            <li>Alle resultater vises, også de tabte.</li>
          </ul>
        </div>
      </section>
      <div className="flex flex-col items-center justify-center px-4 py-10">
        <main className="w-full max-w-sm">{children}</main>
        <footer className="mt-10 max-w-sm text-center text-xs leading-relaxed text-muted">Kun analyse, vi formidler ikke spil. 18+. Spil indebærer risiko for tab. Brug for hjælp? Kontakt StopSpillet.dk.</footer>
      </div>
    </div>
  );
}
