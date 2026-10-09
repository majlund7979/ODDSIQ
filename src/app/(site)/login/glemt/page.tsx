import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { RequestResetForm } from "@/components/ResetForms";
import { RESET_MINUTES } from "@/lib/auth/reset";
import { ACCOUNTS_ENABLED } from "@/lib/auth/session";

export const metadata = { title: "Glemt adgangskode · Oddsanalyse" };

export default function ForgotPage() {
  if (!ACCOUNTS_ENABLED) redirect("/picks");
  return (
    <div className="space-y-6">
      <Logo />
      <div className="rounded-[28px] border border-line bg-surface p-6">
        <h1 className="text-lg font-semibold text-ink">Glemt adgangskode</h1>
        <p className="mt-1 mb-5 text-sm text-ink-2">Skriv din email, så sender vi et link, hvor du kan vælge en ny adgangskode.</p>
        <RequestResetForm minutes={RESET_MINUTES} />
      </div>
      <Link href="/login" className="block text-center text-sm text-ink-2 hover:text-accent">
        ← Tilbage til log ind
      </Link>
    </div>
  );
}
