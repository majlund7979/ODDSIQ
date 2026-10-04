import Link from "next/link";

export function Logo() {
  return (
    <Link href="/picks" className="flex items-center gap-2">
      <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-[17px] font-extrabold text-white">
        $
      </span>
      <span className="text-[19px] font-extrabold tracking-[-0.02em] text-ink">Oddsanalyse</span>
    </Link>
  );
}
