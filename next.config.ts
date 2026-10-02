import type { NextConfig } from "next";

/**
 * The analytics terminal is retired from the site (Mads, 2026-10-02): only
 * Dagens bedste bets and its results board are shown. The old pages were
 * removed; their URLs send visitors to the picks.
 */
const RETIRED = ["/", "/dashboard", "/markets", "/matches", "/value-scanner", "/live", "/market-replay", "/ai-analyst", "/model-lab", "/performance", "/watchlist", "/my-bets", "/data-feed"];

const nextConfig: NextConfig = {
  async redirects() {
    return RETIRED.flatMap((path) => [
      { source: path, destination: "/picks", permanent: false },
      ...(path === "/" ? [] : [{ source: `${path}/:rest*`, destination: "/picks", permanent: false }]),
    ]);
  },
};

export default nextConfig;
