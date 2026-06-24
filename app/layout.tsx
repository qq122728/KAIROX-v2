import type { Metadata, Viewport } from "next";
import "./styles.css";
import "./mobile-polish.css";

export const metadata: Metadata = {
  title: "FLUXPERP",
  description: "Crypto perpetual exchange dashboard"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
