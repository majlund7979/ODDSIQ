"use client";

// Replaces the root layout when it fails, so it brings its own document and
// the dark colours from globals.css inline.

import { FOOTER_LINE } from "@/components/footer-line";

const page = "#0b0d0c";
const surface = "#121513";
const text = "#eef1ea";
const text2 = "#b7bdb3";
const muted = "#949b90";
const accent = "#d2f65a";

export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="da">
      <body style={{ margin: 0, minHeight: "100vh", background: page, color: text, fontFamily: "system-ui, sans-serif" }}>
        <title>Noget gik galt · Oddsanalyse</title>
        <main style={{ boxSizing: "border-box", maxWidth: 384, margin: "0 auto", padding: "80px 16px" }}>
          <div role="alert" style={{ borderRadius: 22, border: "1px solid rgba(232, 240, 224, 0.08)", background: surface, padding: 24 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Noget gik galt</h1>
            <p style={{ margin: "4px 0 20px", fontSize: 14, color: text2 }}>Siden kunne ikke hentes lige nu.</p>
            <button
              type="button"
              onClick={() => retry()}
              style={{ width: "100%", border: 0, borderRadius: 10, padding: 14, background: accent, color: page, font: "inherit", fontSize: 16, fontWeight: 600, cursor: "pointer" }}
            >
              Prøv igen
            </button>
            {/* A full page load, since the app's own layout could not render. */}
            <a href="/picks" style={{ display: "block", marginTop: 16, textAlign: "center", fontSize: 14, color: text2 }}>
              Til dagens bedste bets
            </a>
          </div>
          <footer style={{ marginTop: 24, textAlign: "center", fontSize: 12, lineHeight: 1.6, color: muted }}>{FOOTER_LINE}</footer>
        </main>
      </body>
    </html>
  );
}
