import { redirect } from "next/navigation";
import { signUp } from "@/app/auth-actions";
import { AuthCard } from "@/components/AuthCard";
import { AuthForm } from "@/components/AuthForm";
import { inviteOnly } from "@/lib/auth/friends";
import { safeNext } from "@/lib/auth/redirect";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { ACCOUNTS_ENABLED } from "@/lib/auth/session";

export const metadata = { title: "Opret konto · Oddsanalyse" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (!ACCOUNTS_ENABLED) redirect(next);
  return (
    <AuthCard mode="signup" next={next} inviteOnly={inviteOnly()}>
      {inviteOnly() && <p className="mb-4 text-sm text-ink-2">Brug den email, du er inviteret med.</p>}
      <AuthForm action={signUp} submitLabel="Opret konto" next={next} passwordHint={`Mindst ${MIN_PASSWORD_LENGTH} tegn.`} />
    </AuthCard>
  );
}
