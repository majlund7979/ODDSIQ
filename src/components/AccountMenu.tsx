import Link from "next/link";
import { ACCOUNTS_ENABLED, currentUser } from "@/lib/auth/session";

export async function AccountMenu() {
  if (!ACCOUNTS_ENABLED) return null;
  const user = await currentUser();
  return user ? (
    <Link href="/account" className="text-xs text-ink-2 hover:text-ink">
      {user.email}
      {user.plan === "pro" && <span className="ml-1.5 rounded border border-accent/50 px-1 text-[10px] text-accent">PRO</span>}
    </Link>
  ) : (
    <Link href="/login" className="text-xs text-accent hover:underline">
      Sign in
    </Link>
  );
}
