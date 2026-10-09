import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Siden findes ikke · Oddsanalyse" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <Logo />
      <div className="rounded-[28px] border border-line bg-surface p-6">
        <h1 className="text-lg font-semibold text-ink">Siden findes ikke</h1>
        <p className="mt-1 mb-5 text-sm text-ink-2">Linket er forkert, eller siden er flyttet.</p>
        <Link href="/picks" className="block w-full rounded-full bg-lime px-3 py-3 text-center text-[16px] font-semibold text-accent transition-colors hover:brightness-125">
          Til dagens bedste bets
        </Link>
      </div>
    </main>
  );
}
