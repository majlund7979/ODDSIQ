import Link from "next/link";
import { signIn } from "@/app/auth-actions";
import { AuthForm } from "@/components/AuthForm";
import { ACCOUNTS_ENABLED } from "@/lib/auth/session";

export const metadata = { title: "Sign in · ODDSIQ" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/dashboard" } = await searchParams;
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-xl font-semibold">Sign in</h1>
      {ACCOUNTS_ENABLED ? (
        <>
          <div className="mt-6">
            <AuthForm action={signIn} submitLabel="Sign in" next={next} />
          </div>
          <p className="mt-4 text-sm text-ink-2">
            New here?{" "}
            <Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-accent hover:underline">
              Create an account
            </Link>
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-ink-2">Accounts are not switched on yet. The terminal works without one.</p>
      )}
    </div>
  );
}
