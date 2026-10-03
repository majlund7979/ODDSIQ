import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ODDSIQ · Dagens bedste bets",
  description: "Dagens bedste fodbold-bets, analyseret. Kun for inviterede venner.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="da" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
