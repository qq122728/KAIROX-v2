import type { Metadata, Viewport } from "next";
import { Orbitron } from "next/font/google";
import "./styles.css";
import "./mobile-polish.css";

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-brand",
  display: "swap"
});

export const metadata: Metadata = {
  title: "KAIROX Markets",
  description: "Liquidity in motion.",
  applicationName: "KAIROX Markets",
  appleWebApp: {
    capable: true,
    title: "KAIROX Markets",
    statusBarStyle: "black-translucent"
  },
  formatDetection: {
    telephone: false
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#111820" },
    { media: "(prefers-color-scheme: dark)", color: "#0D1117" }
  ]
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={orbitron.variable}>
      <body>{children}</body>
    </html>
  );
}
