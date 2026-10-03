export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,rgba(59,140,240,0.14),transparent_60%)] px-4 py-12">
      <main className="w-full max-w-sm">{children}</main>
      <footer className="mt-10 max-w-sm text-center text-xs leading-relaxed text-muted">Kun analyse, vi formidler ikke spil. 18+. Spil indebærer risiko for tab.</footer>
    </div>
  );
}
