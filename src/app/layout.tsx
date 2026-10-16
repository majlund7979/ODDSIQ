import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

// One variable family for everything: its width axis gives the condensed scoreboard headlines and the normal-width
// text, and its tabular figures line the numbers up.
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin", "latin-ext"], axes: ["wdth"], display: "swap" });

export const metadata: Metadata = {
  title: "Oddsanalyse · Dagens bedste bets",
  description: "Dagens bedste fodbold-bets, analyseret. Kun for inviterede venner.",
  applicationName: "Oddsanalyse",
  appleWebApp: { capable: true, title: "Oddsanalyse", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#0b0d0c" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="da" className={archivo.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
