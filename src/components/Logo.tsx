import Link from "next/link";

export function Logo() {
  return (
    <Link href="/picks" className="flex items-center gap-2">
      <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-[13px] font-black text-page">
        IQ
      </span>
      <span className="text-[15px] font-bold tracking-[0.14em]">ODDSIQ</span>
    </Link>
  );
}
