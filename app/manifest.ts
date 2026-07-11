import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KAIROX Protocol",
    short_name: "KAIROX",
    description: "Liquidity in motion.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0D1117",
    theme_color: "#111820",
    categories: ["finance", "trading"],
    icons: [
      {
        src: "/brand/kairox-appicon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/brand/kairox-appicon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/brand/kairox-appicon.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/brand/kairox-appicon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      },
      {
        src: "/brand/kairox-appicon.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
