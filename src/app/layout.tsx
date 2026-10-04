import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Oddsanalyse · Dagens bedste bets",
  description: "Dagens bedste fodbold-bets, analyseret. Kun for inviterede venner.",
  applicationName: "Oddsanalyse",
  appleWebApp: { capable: true, title: "Oddsanalyse", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="da" className={inter.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
