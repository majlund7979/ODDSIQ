import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn } from "@/app/auth-actions";
import { AuthCard } from "@/components/AuthCard";
import { AuthForm } from "@/components/AuthForm";
import { safeNext } from "@/lib/auth/redirect";
import { inviteOnly, isInvited } from "@/lib/auth/friends";
import { ACCOUNTS_ENABLED, currentUser } from "@/lib/auth/session";

export const metadata = { title: "Log ind · Oddsanalyse" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; adgang?: string }> }) {
  const q = await searchParams;
  const next = safeNext(q.next);
  if (!ACCOUNTS_ENABLED) redirect(next);
  const user = await currentUser();
  if (user && (await isInvited(user.email))) redirect(next);
  return (
    <AuthCard mode="login" next={next} inviteOnly={inviteOnly()} notice={q.adgang === "fjernet" ? "Din adgang er fjernet. Spørg den, der inviterede dig." : undefined}>
      <AuthForm action={signIn} submitLabel="Log ind" next={next} />
      <Link href="/login/glemt" className="mt-4 block text-center text-sm text-ink-2 hover:text-accent">
        Glemt adgangskode?
      </Link>
    </AuthCard>
  );
}
