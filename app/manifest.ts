import type { MetadataRoute } from "next";
import { PLATFORM_NAME, PLATFORM_TAGLINE } from "./lib/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${PLATFORM_NAME} — ${PLATFORM_TAGLINE}`,
    short_name: PLATFORM_NAME,
    description: "Staff development platform for restaurant operators.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#111827",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
