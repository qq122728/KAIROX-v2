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
  title: "KAIROX Protocol",
  description: "Liquidity in motion.",
  applicationName: "KAIROX",
  appleWebApp: {
    capable: true,
    title: "KAIROX",
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
