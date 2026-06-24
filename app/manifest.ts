import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VORX Protocol",
    short_name: "VORX",
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
        src: "/brand/vorx-appicon.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/brand/vorx-appicon.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
