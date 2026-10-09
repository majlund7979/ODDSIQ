"use client";

// Replaces the root layout when it fails, so it brings its own document and
// the dark colours from globals.css inline.

const page = "#0b1016";
const surface = "#121921";
const text = "#f1f4f8";
const text2 = "#b9c3ce";
const accent = "#3b8cf0";

export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="da">
      <body style={{ margin: 0, minHeight: "100vh", background: page, color: text, fontFamily: "system-ui, sans-serif" }}>
        <title>Noget gik galt · Oddsanalyse</title>
        <main style={{ boxSizing: "border-box", maxWidth: 384, margin: "0 auto", padding: "80px 16px" }}>
          <div role="alert" style={{ borderRadius: 28, border: "1px solid rgba(255, 255, 255, 0.08)", background: surface, padding: 24 }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Noget gik galt</h1>
            <p style={{ margin: "4px 0 20px", fontSize: 14, color: text2 }}>Siden kunne ikke hentes lige nu.</p>
            <button
              type="button"
              onClick={() => retry()}
              style={{ width: "100%", border: 0, borderRadius: 999, padding: 12, background: "rgba(59, 140, 240, 0.18)", color: accent, font: "inherit", fontSize: 16, fontWeight: 600, cursor: "pointer" }}
            >
              Prøv igen
            </button>
            {/* A full page load, since the app's own layout could not render. */}
            <a href="/picks" style={{ display: "block", marginTop: 16, textAlign: "center", fontSize: 14, color: text2 }}>
              Til dagens bedste bets
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
