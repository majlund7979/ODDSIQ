import Link from "next/link";
import { signUp } from "@/app/auth-actions";
import { AuthForm } from "@/components/AuthForm";
import { ACCOUNTS_ENABLED } from "@/lib/auth/session";

export const metadata = { title: "Create account · ODDSIQ" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/picks" } = await searchParams;
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-xl font-semibold">Create an account</h1>
      {ACCOUNTS_ENABLED ? (
        <>
          <div className="mt-6">
            <AuthForm action={signUp} submitLabel="Create account" passwordHint="At least 10 characters." next={next} />
          </div>
          <p className="mt-4 text-sm text-ink-2">
            Already have one?{" "}
            <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-accent hover:underline">
              Sign in
            </Link>
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-ink-2">Accounts are not switched on yet. The terminal works without one.</p>
      )}
    </div>
  );
}
