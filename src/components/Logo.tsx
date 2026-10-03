import Link from "next/link";

export function Logo() {
  return (
    <Link href="/picks" className="flex items-center gap-2">
      <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-[13px] font-black text-page">
        OA
      </span>
      <span className="text-[17px] font-bold tracking-tight">Oddsanalyse</span>
    </Link>
  );
}
