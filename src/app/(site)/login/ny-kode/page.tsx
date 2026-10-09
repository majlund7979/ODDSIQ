import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Logo } from "@/components/Logo";
import { NewPasswordForm } from "@/components/ResetForms";
import { checkReset } from "@/lib/auth/reset";
import { ACCOUNTS_ENABLED } from "@/lib/auth/session";
import { one, type SearchParams } from "@/lib/url";

export const metadata = { title: "Ny adgangskode · Oddsanalyse" };

const WHY = { unknown: "Linket er ikke gyldigt.", used: "Linket er allerede brugt.", expired: "Linket er udløbet." };

export default async function NewPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  if (!ACCOUNTS_ENABLED) redirect("/picks");
  const token = one((await searchParams).token) ?? "";
  const check = await checkReset(token);
  return (
    <div className="space-y-6">
      <Logo />
      <div className="rounded-[28px] border border-line bg-surface p-6">
        <h1 className="text-lg font-semibold text-ink">Ny adgangskode</h1>
        {check.ok ? (
          <>
            <p className="mt-1 mb-5 text-sm text-ink-2">
              For <b>{check.email}</b>. Når du gemmer, logges du ind, og alle andre steder, du var logget ind, bliver logget ud.
            </p>
            <NewPasswordForm token={token} email={check.email} />
          </>
        ) : (
          <p className="mt-2 text-sm text-ink-2">
            {WHY[check.reason]}{" "}
            <Link href="/login/glemt" className="font-semibold text-accent hover:underline">
              Bed om et nyt link
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
