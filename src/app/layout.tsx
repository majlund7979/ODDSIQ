import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Oddsanalyse · Dagens bedste bets",
  description: "Dagens bedste fodbold-bets, analyseret. Kun for inviterede venner.",
  applicationName: "Oddsanalyse",
  appleWebApp: { capable: true, title: "Oddsanalyse", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#0b1016" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="da" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
