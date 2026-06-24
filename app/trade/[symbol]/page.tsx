import { FluxMobileApp } from "@/app/components/FluxMobileApp";

export default async function SymbolTradePage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return <FluxMobileApp initialTab="trade" initialSymbol={decodeURIComponent(symbol || "BTC-PERP").toUpperCase()} />;
}
