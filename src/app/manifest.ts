import type { MetadataRoute } from "next";

/** Lets the site be added to a phone's home screen and open like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Oddsanalyse",
    short_name: "Oddsanalyse",
    description: "Dagens bedste fodbold-bets, analyseret.",
    lang: "da",
    start_url: "/picks",
    scope: "/",
    display: "standalone",
    background_color: "#0b1016",
    theme_color: "#0b1016",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
