"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown, BadgeCheck, ChevronRight, FileText, Headphones, Info, LockKeyhole, ShieldCheck,
  Search, Bell, Gem, Eye, ArrowUpRight,
  Download, Upload, ArrowLeftRight, Clock,
  LayoutGrid, BarChart3, Wallet, User as UserIcon,
  Star, BookOpen
} from "lucide-react";
import { useRouter } from "next/navigation";
import { MarketChartPanel } from "./MarketData";
import { connectRealtime } from "./realtime-client";
import { displayUid } from "@/lib/uid";

type Tab = "markets" | "trade" | "assets" | "profile";
type StackPage =
  | { id: "deposit-asset"; title: "Deposit" }
  | { id: "deposit-network"; title: "Select Network" }
  | { id: "deposit-address"; title: "Deposit Address" }
  | { id: "withdraw-asset"; title: "Withdraw" }
  | { id: "withdraw-network"; title: "Select Network" }
  | { id: "withdraw-form"; title: string }
  | { id: "withdraw-detail"; title: "Withdrawal Details"; record: WithdrawalRecord }
  | { id: "deposit-history"; title: "Deposit History" }
  | { id: "withdraw-history"; title: "Withdraw History" }
  | { id: "funding-records"; title: "Funding Records" }
  | { id: "swap"; title: "Swap" }
  | { id: "security"; title: "Security" }
  | { id: "kyc"; title: "KYC Verification" }
  | { id: "about"; title: "About" }
  | { id: "terms"; title: "Terms of Service" }
  | { id: "privacy"; title: "Privacy Policy" }
  | { id: "support"; title: "Support" };

type Market = { id: number; symbol: string; price: number; max_leverage?: number; is_active: number };
type User = { id?: number; public_uid?: string | null; email: string | null; balance: number; kyc_status?: "none" | "pending" | "approved" | "rejected"; kyc_rejected_reason?: string | null; created_at?: string };
type ApiBinaryOrder = { id: number; symbol: string; direction: "call" | "put"; stake: number; odds: number; risk_amount?: number | null; duration_seconds: number; entry_price: number; expires_at: string; status: "open" | "won" | "lost"; profit?: number | null };
type Summary = { user: User; markets: Market[]; orders?: ApiBinaryOrder[] };
type AssetRow = { asset: string; balance: number; locked: number; updated_at?: string };
type DepositRecord = { id: number; asset: string; network: string; amount: number; status: string; tx_hash?: string | null; note?: string | null; admin_note?: string | null; created_at: string; processed_at?: string | null };
type WithdrawalRecord = { id: number; asset: string; network?: string | null; amount: number; address?: string | null; status: string; note?: string | null; created_at: string; processed_at?: string | null };
type AssetTransaction = { id: number; asset: string; type: string; amount: number; status: string; note?: string | null; created_at: string };
type PublicSettings = { withdrawals_enabled: string; withdrawal_notice: string; whatsapp_support_url: string; whatsapp_url?: string; telegram_url?: string; min_withdrawal_amount?: string; min_withdrawal_usdc?: string; about_content?: string; terms_content?: string; privacy_content?: string; binary_options_config?: string };
type AssetData = {
  user: User;
  settings: PublicSettings;
  summary: { availableBalance: number; marginUsed: number; unrealizedPnl: number; totalEquity: number };
  assets: AssetRow[];
  depositAddresses?: { asset: string; network: string; address: string; source: "default" | "custom" }[];
  deposits?: DepositRecord[];
  withdrawals?: WithdrawalRecord[];
  transactions?: AssetTransaction[];
};
type Tickers = Record<string, { price: number; change: number; source: string }>;
type Duration = { label: string; seconds: number; odds: number; lossRate: number };
type BinaryOrder = { id: number; symbol: string; direction: "call" | "put"; stake: number; riskAmount?: number; duration: Duration; entry: number; expiresAt: number; status: "open" | "win" | "loss"; profit?: number };

const tabPath = (tab: Tab, symbol = "BTC-PERP") => tab === "markets" ? "/markets" : tab === "trade" ? `/trade/${symbol}` : `/${tab}`;
const routeStateFromPath = (pathname: string): { tab: Tab; symbol?: string } | null => {
  if (pathname === "/" || pathname === "/markets") return { tab: "markets" };
  if (pathname === "/assets") return { tab: "assets" };
  if (pathname === "/profile") return { tab: "profile" };
  if (pathname === "/trade") return { tab: "trade" };
  if (pathname.startsWith("/trade/")) return { tab: "trade", symbol: decodeURIComponent(pathname.slice("/trade/".length)).toUpperCase() };
  return null;
};
const coins = ["USDC", "BTC", "ETH", "SOL"];
const coinSet = new Set(coins);
const networks = ["TRC20", "ERC20"];
const defaultDurations: Duration[] = [
  { label: "30s", seconds: 30, odds: 0.3, lossRate: 0.31 },
  { label: "60s", seconds: 60, odds: 0.35, lossRate: 0.36 },
  { label: "180s", seconds: 180, odds: 0.45, lossRate: 0.46 },
  { label: "300s", seconds: 300, odds: 0.55, lossRate: 0.56 }
];
const dataPollMs = 12_000;

const durationLabel = (seconds: number) => seconds < 60 ? `${seconds}s` : seconds % 60 === 0 ? `${seconds / 60}m` : `${seconds}s`;
const binaryDurationsFromSettings = (value?: string): Duration[] => {
  if (!value) return defaultDurations;
  try {
    const rows = JSON.parse(value) as Array<{ seconds?: number; odds?: number; profitRate?: number; label?: string }>;
    if (!Array.isArray(rows)) return defaultDurations;
    const durations = rows
      .map((row) => {
        const seconds = Number(row.seconds);
        const oddsValue = Number(row.odds ?? row.profitRate);
        const odds = oddsValue > 1 ? oddsValue / 100 : oddsValue;
        if (!Number.isInteger(seconds) || seconds <= 0 || !Number.isFinite(odds) || odds <= 0) return null;
        const roundedOdds = Number(odds.toFixed(6));
        return {
          seconds,
          label: row.label?.trim() || durationLabel(seconds),
          odds: roundedOdds,
          lossRate: Number((roundedOdds + 0.01).toFixed(6))
        };
      })
      .filter((item): item is Duration => Boolean(item))
      .sort((a, b) => a.seconds - b.seconds);
    return durations.length ? durations : defaultDurations;
  } catch {
    return defaultDurations;
  }
};

const money = (n: number, digits = 2) => `$${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
const displayAsset = (asset: string) => asset === "USDT" ? "USDC" : asset;
const assetDigits = (asset: string) => displayAsset(asset) === "USDC" ? 2 : 6;
const assetAmount = (amount: number, asset: string, signed = false) => {
  const value = Number(amount || 0);
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("en-US", { maximumFractionDigits: assetDigits(asset), minimumFractionDigits: assetDigits(asset) })} ${displayAsset(asset)}`;
};
const compactDateTime = (value?: string | null) => {
  if (!value) return "Pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};
const mergedAssetRows = (assets: AssetData | null): AssetRow[] => {
  const rows = assets?.assets?.length ? assets.assets : [{ asset: "USDC", balance: assets?.user.balance || 0, locked: 0 }];
  const map = new Map<string, AssetRow>();
  for (const item of rows) {
    const key = displayAsset(item.asset);
    if (!coinSet.has(key)) continue;
    const existing = map.get(key);
    if (existing) {
      existing.balance += Number(item.balance || 0);
      existing.locked += Number(item.locked || 0);
    } else {
      map.set(key, { ...item, asset: key, balance: Number(item.balance || 0), locked: Number(item.locked || 0) });
    }
  }
  for (const asset of coins) {
    if (!map.has(asset)) map.set(asset, { asset, balance: asset === "USDC" ? assets?.user.balance || 0 : 0, locked: 0 });
  }
  return [...map.values()].sort((a, b) => (a.asset === "USDC" ? -1 : b.asset === "USDC" ? 1 : a.asset.localeCompare(b.asset)));
};
const availableForAsset = (assets: AssetData | null, asset: string) => mergedAssetRows(assets).find((row) => row.asset === displayAsset(asset))?.balance || 0;
const pickerCoins = (assets: AssetData | null, mode: "deposit" | "withdraw" | "swap" = "withdraw") => {
  const fromAddresses = mode === "deposit" ? (assets?.depositAddresses || []).map((item) => displayAsset(item.asset)).filter((asset) => coinSet.has(asset)) : [];
  if (mode === "deposit" && fromAddresses.length) return [...new Set(fromAddresses)];
  const fromBalances = mergedAssetRows(assets).map((item) => item.asset);
  return [...new Set([...fromAddresses, ...fromBalances, ...coins].filter((asset) => coinSet.has(asset)))];
};
const symbolName = (symbol: string) => symbol.replace("-PERP", "/USDC");
const baseAsset = (symbol: string) => symbol.split("-")[0];
const networksForCoin = (coin: string) => {
  if (coin === "BTC") return ["Bitcoin"];
  if (coin === "SOL") return ["SOL"];
  if (coin === "BNB") return ["BEP20"];
  if (coin === "ETH") return ["ERC20"];
  return networks;
};
const depositNetworksForCoin = (assets: AssetData | null, coin: string) => {
  const active = (assets?.depositAddresses || []).filter((item) => displayAsset(item.asset) === displayAsset(coin)).map((item) => item.network);
  return active.length ? [...new Set(active)] : networksForCoin(coin);
};
const mapApiOrder = (order: ApiBinaryOrder): BinaryOrder => ({
  id: order.id,
  symbol: order.symbol,
  direction: order.direction,
  stake: order.stake,
  riskAmount: order.risk_amount ?? undefined,
  duration: { label: durationLabel(order.duration_seconds), seconds: order.duration_seconds, odds: order.odds, lossRate: Number((order.odds + 0.01).toFixed(6)) },
  entry: order.entry_price,
  expiresAt: new Date(order.expires_at).getTime(),
  status: order.status === "won" ? "win" : order.status === "lost" ? "loss" : "open",
  profit: order.profit ?? undefined
});

function assetTone(asset: string) {
  const key = displayAsset(asset);
  if (key === "USDC") return "usdc";
  if (key === "BTC") return "btc";
  if (key === "ETH") return "eth";
  if (key === "BNB") return "bnb";
  if (key === "SOL") return "sol";
  if (key === "XRP") return "xrp";
  if (key === "ADA") return "ada";
  if (key === "DOGE") return "doge";
  if (key === "AVAX") return "avax";
  if (key === "LINK") return "link";
  if (key === "DOT") return "polkadot";
  if (key === "TRX") return "trx";
  if (key === "LTC") return "ltc";
  if (key === "BCH") return "bch";
  if (key === "NEAR") return "near";
  if (key === "UNI") return "uni";
  return "default";
}

export function FluxMobileApp({ initialTab = "markets", initialAuthMode = "login", initialSymbol = "BTC-PERP" }: { initialTab?: Tab; initialAuthMode?: "login" | "register"; initialSymbol?: string }) {
  const router = useRouter();
  const [authMode, setAuthMode] = useState(initialAuthMode);
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [stack, setStack] = useState<StackPage[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [tickers, setTickers] = useState<Tickers>({});
  const [assets, setAssets] = useState<AssetData | null>(null);
  const [currentSymbol, setCurrentSymbol] = useState(initialSymbol);
  const [marketSort, setMarketSort] = useState<"hot" | "gainers" | "losers">("hot");
  const [marketQuery, setMarketQuery] = useState("");
  const [selectedCoin, setSelectedCoin] = useState("USDC");
  const [selectedNetwork, setSelectedNetwork] = useState("TRC20");
  const [orders, setOrders] = useState<BinaryOrder[]>([]);
  const [orderSheet, setOrderSheet] = useState<"call" | "put" | null>(null);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [stake, setStake] = useState(50);
  const [durationOptions, setDurationOptions] = useState<Duration[]>(defaultDurations);
  const [duration, setDuration] = useState(defaultDurations[0]);
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState<{ type: "ok" | "err" | "info"; text: string } | null>(null);
  const [support, setSupport] = useState({ telegram: "", whatsapp: "" });
  const [publicSettings, setPublicSettings] = useState<Partial<PublicSettings>>({});
  const [withdrawForm, setWithdrawForm] = useState({ address: "", amount: "10", password: "" });
  const [swap, setSwap] = useState({ from: "USDC", to: "USDC", amount: "100" });
  const [kycStatus, setKycStatus] = useState<"none" | "pending" | "approved" | "rejected">("none");
  const [expandedSecurity, setExpandedSecurity] = useState<"login" | "withdraw" | null>("login");
  const [authForm, setAuthForm] = useState({ email: "", password: "", confirmPassword: "", name: "", withdrawPassword: "", confirmWithdrawPassword: "", invite: "" });
  const [authError, setAuthError] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const loadingRef = useRef(false);

  function applyPublicSettings(settings: Partial<PublicSettings> = {}) {
    setSupport({ telegram: settings.telegram_url?.trim() || "", whatsapp: (settings.whatsapp_support_url || settings.whatsapp_url || "").trim() });
    setPublicSettings(settings);
    const nextDurations = binaryDurationsFromSettings(settings.binary_options_config);
    setDurationOptions(nextDurations);
    setDuration((current) => nextDurations.find((item) => item.seconds === current.seconds) || nextDurations[0]);
  }

  const activeStack = stack[stack.length - 1];
  const currentMarket = markets.find((m) => m.symbol === currentSymbol) || markets[0];
  const openOrders = orders.filter((order) => order.status === "open");
  const history = orders.filter((order) => order.status !== "open");

  useEffect(() => {
    setTab(initialTab);
    setStack([]);
  }, [initialTab]);

  useEffect(() => {
    if (initialSymbol) setCurrentSymbol(initialSymbol);
  }, [initialSymbol]);

  useEffect(() => {
    const syncRoute = () => {
      if (typeof window === "undefined") return;
      const next = routeStateFromPath(window.location.pathname);
      if (!next) return;
      setTab(next.tab);
      setStack([]);
      if (next.symbol) setCurrentSymbol(next.symbol);
    };
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  function pushMobileUrl(path: string) {
    if (typeof window === "undefined") return;
    if (window.location.pathname !== path) window.history.pushState({ fluxMobile: true }, "", path);
  }

  async function load() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const summaryRes = await fetch("/api/trade/summary", { cache: "no-store" });
      if (summaryRes.status === 401) {
        setUser(null);
        setAuthChecked(true);
        return;
      }
      if (!summaryRes.ok) {
        setUser(null);
        setAuthChecked(true);
        return;
      }
      const summary = (await summaryRes.json()) as Summary;
      setUser(summary.user);
      setKycStatus(summary.user.kyc_status || "none");
      setMarkets(summary.markets || []);
      const summaryOrders = summary.orders || [];
      setOrders(summaryOrders.map(mapApiOrder));
      if (!summary.markets.find((m) => m.symbol === currentSymbol) && summary.markets[0]) setCurrentSymbol(summary.markets[0].symbol);
      setAuthChecked(true);
      fetch("/api/market-data/tickers", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => setTickers(d.tickers || {}))
        .catch(() => {});
      fetch("/api/assets", { cache: "no-store" })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => {
          if (d) {
            setAssets(d);
            applyPublicSettings(d.settings || {});
          }
        })
        .catch(() => {});
    } catch {
      setUser(null);
      setAuthChecked(true);
    } finally {
      loadingRef.current = false;
    }
  }

  useEffect(() => {
    const isHidden = () => typeof document !== "undefined" && document.hidden;
    const loadIfVisible = () => {
      if (!isHidden()) void load();
    };
    const refreshWhenVisible = () => {
      if (isHidden()) return;
      setNow(Date.now());
      void load();
    };
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        applyPublicSettings(d.settings || {});
      })
      .catch(() => {});
    load();
    const clockTimer = setInterval(() => {
      if (!isHidden()) setNow(Date.now());
    }, 1000);
    const dataTimer = setInterval(loadIfVisible, dataPollMs);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      clearInterval(clockTimer);
      clearInterval(dataTimer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let socket: Awaited<ReturnType<typeof connectRealtime>> | null = null;
    let active = true;
    const reload = () => load();
    connectRealtime()
      .then((nextSocket) => {
        if (!active) {
          nextSocket.disconnect();
          return;
        }
        socket = nextSocket;
        socket.emit("user:join");
        socket.on("user:update", reload);
        socket.on("binary:created", reload);
        socket.on("binary:expired", reload);
        socket.on("binary:settled", reload);
        socket.on("settings:update", reload);
        socket.on("market:update", reload);
        socket.on("deposit-addresses:update", reload);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (socket) {
        socket.off("user:update", reload);
        socket.off("binary:created", reload);
        socket.off("binary:expired", reload);
        socket.off("binary:settled", reload);
        socket.off("settings:update", reload);
        socket.off("market:update", reload);
        socket.off("deposit-addresses:update", reload);
        socket.disconnect();
      }
    };
  }, [user?.id]);

  function showToast(type: "ok" | "err" | "info", text: string) {
    setToast({ type, text });
    setTimeout(() => setToast(null), 2400);
  }

  function push(page: StackPage) {
    setStack((items) => [...items, page]);
  }

  function pop() {
    setStack((items) => items.slice(0, -1));
  }

  function clearStack() {
    setStack([]);
  }

  function replaceStack(page: StackPage) {
    setStack([page]);
  }

  function switchTab(next: Tab) {
    setTab(next);
    clearStack();
    pushMobileUrl(tabPath(next, currentSymbol));
  }

  async function login() {
    setAuthError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: authForm.email, password: authForm.password })
    });
    if (!res.ok) return setAuthError((await res.json()).error || "Email or password is incorrect");
    await load();
    router.push("/markets");
    setTab("markets");
  }

  async function register() {
    setAuthError("");
    if (authForm.password.trim() !== authForm.confirmPassword.trim()) return setAuthError("Login passwords do not match");
    if (authForm.withdrawPassword.trim() !== authForm.confirmWithdrawPassword.trim()) return setAuthError("Withdrawal passwords do not match");
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: authForm.email,
        password: authForm.password,
        confirmPassword: authForm.confirmPassword,
        withdrawalPassword: authForm.withdrawPassword,
        confirmWithdrawalPassword: authForm.confirmWithdrawPassword
      })
    });
    if (!res.ok) return setAuthError((await res.json()).error || "Registration failed");
    await load();
    setTab("markets");
    router.push("/markets");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setStack([]);
    router.push("/login");
  }

  async function placeOrder(direction: "call" | "put") {
    if (placingOrder) return;
    if (!currentMarket) return showToast("err", "Market unavailable");
    if (stake < 10) return showToast("err", "Minimum stake is 10 USDC");
    setPlacingOrder(true);
    try {
      const res = await fetch("/api/binary-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketId: currentMarket.id, direction, stake, durationSeconds: duration.seconds })
      });
      if (!res.ok) return showToast("err", (await res.json()).error || "Order failed");
      const result = await res.json();
      const entry = Number(result.entryPrice) || tickers[currentMarket.symbol]?.price || currentMarket.price;
      const confirmedDuration = {
        ...duration,
        odds: Number(result.odds ?? duration.odds),
        lossRate: Number(result.lossRate ?? duration.lossRate)
      };
      const order: BinaryOrder = {
        id: result.orderId || Date.now(),
        symbol: currentMarket.symbol,
        direction,
        stake,
        riskAmount: Number(result.riskAmount) || undefined,
        duration: confirmedDuration,
        entry,
        expiresAt: Date.now() + confirmedDuration.seconds * 1000,
        status: "open"
      };
      setOrders((items) => [order, ...items].slice(0, 100));
      setOrderSheet(null);
      showToast("ok", `${direction.toUpperCase()} order placed`);
      await load();
    } finally {
      setPlacingOrder(false);
    }
  }

  const filteredMarkets = useMemo(() => {
    const rows = markets.filter((market) => {
      const q = marketQuery.toLowerCase();
      return market.symbol.toLowerCase().includes(q) || symbolName(market.symbol).toLowerCase().includes(q);
    });
    if (marketSort === "gainers") {
      const sorted = [...rows].sort((a, b) => (tickers[b.symbol]?.change || 0) - (tickers[a.symbol]?.change || 0));
      const gainers = sorted.filter((market) => (tickers[market.symbol]?.change || 0) > 0);
      return gainers.length ? gainers : sorted;
    }
    if (marketSort === "losers") {
      const sorted = [...rows].sort((a, b) => (tickers[a.symbol]?.change || 0) - (tickers[b.symbol]?.change || 0));
      const losers = sorted.filter((market) => (tickers[market.symbol]?.change || 0) < 0);
      return losers.length ? losers : sorted;
    }
    return rows;
  }, [markets, marketQuery, marketSort, tickers]);

  if (!authChecked) return <BootScreen />;
  if (!user) return <AuthScreen mode={authMode} setMode={setAuthMode} form={authForm} setForm={setAuthForm} error={authError} login={login} register={register} support={support} />;

  return (
    <main className="mobile-shell">
      {toast && <div className="mobile-toast-wrap"><div className={`mobile-toast ${toast.type}`}>{toast.text}</div></div>}
      <MobileHeader activeStack={activeStack} pop={pop} currentMarket={currentMarket} tickers={tickers} support={support} activeTab={tab} />
      <section className="mobile-scroll">
        {activeStack ? (
          <StackContent
            page={activeStack}
            user={user}
            assets={assets}
            selectedCoin={selectedCoin}
            setSelectedCoin={setSelectedCoin}
            selectedNetwork={selectedNetwork}
            setSelectedNetwork={setSelectedNetwork}
            push={push}
            replaceStack={replaceStack}
            clearStack={clearStack}
            showToast={showToast}
            withdrawForm={withdrawForm}
            setWithdrawForm={setWithdrawForm}
            swap={swap}
            setSwap={setSwap}
            kycStatus={kycStatus}
            setKycStatus={setKycStatus}
            expandedSecurity={expandedSecurity}
            setExpandedSecurity={setExpandedSecurity}
            support={support}
            settings={publicSettings}
            logout={logout}
          />
        ) : (
          <>
            {tab === "markets" && <MarketsTab rows={filteredMarkets} tickers={tickers} query={marketQuery} setQuery={setMarketQuery} sort={marketSort} setSort={setMarketSort} onSelect={(symbol) => { setCurrentSymbol(symbol); setTab("trade"); clearStack(); pushMobileUrl(tabPath("trade", symbol)); }} goTab={switchTab} push={push} kycStatus={kycStatus} totalEquity={assets?.summary.totalEquity ?? user.balance} availableBalance={assets?.summary.availableBalance ?? user.balance} pnl={assets?.summary.unrealizedPnl ?? 0} />}
            {tab === "trade" && currentMarket && <TradeTab market={currentMarket} tickers={tickers} setCurrentSymbol={(symbol) => { setCurrentSymbol(symbol); pushMobileUrl(tabPath("trade", symbol)); }} markets={markets} openOrders={openOrders} history={history} now={now} openSheet={setOrderSheet} stake={stake} setStake={setStake} duration={duration} durations={durationOptions} setDuration={setDuration} availableBalance={assets?.summary.availableBalance ?? user.balance} />}
            {tab === "assets" && <AssetsTab assets={assets} push={push} />}
            {tab === "profile" && <ProfileTab user={user} kycStatus={kycStatus} push={push} logout={logout} />}
          </>
        )}
      </section>
      {!activeStack && <BottomNav tab={tab} setTab={switchTab} />}
      {orderSheet && currentMarket && <OrderSheet direction={orderSheet} market={currentMarket} price={tickers[currentMarket.symbol]?.price || currentMarket.price} stake={stake} setStake={setStake} duration={duration} durations={durationOptions} setDuration={setDuration} close={() => placingOrder ? undefined : setOrderSheet(null)} submit={() => placeOrder(orderSheet)} submitting={placingOrder} />}
    </main>
  );
}

function AuthScreen({ mode, setMode, form, setForm, error, login, register, support }: { mode: "login" | "register"; setMode: (mode: "login" | "register") => void; form: { email: string; password: string; confirmPassword: string; name: string; withdrawPassword: string; confirmWithdrawPassword: string; invite: string }; setForm: (form: { email: string; password: string; confirmPassword: string; name: string; withdrawPassword: string; confirmWithdrawPassword: string; invite: string }) => void; error: string; login: () => void; register: () => void; support: { telegram: string; whatsapp: string } }) {
  return (
    <main className="mobile-shell auth-only">
      <section className="auth-center">
        <BrandLogo variant="auth" />
        <p>{mode === "login" ? "Welcome back" : "Create Account"}</p>
        <label className="mobile-field"><span>Email</span><input id="auth-email" name="email" type="email" autoComplete="email" placeholder="trader@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        {mode === "register" && <label className="mobile-field"><span>Nickname</span><input placeholder="Optional" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>}
        <label className="mobile-field"><span>Password</span><input id="auth-password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Min 6 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        {mode === "register" && <label className="mobile-field"><span>Confirm Password</span><input id="auth-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" placeholder="Repeat login password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} /></label>}
        {mode === "register" && <label className="mobile-field"><span>Withdrawal Password</span><input id="auth-withdraw-password" name="withdrawalPassword" type="password" autoComplete="new-password" placeholder="6+ characters" value={form.withdrawPassword} onChange={(e) => setForm({ ...form, withdrawPassword: e.target.value })} /></label>}
        {mode === "register" && <label className="mobile-field"><span>Confirm Withdrawal Password</span><input id="auth-confirm-withdraw-password" name="confirmWithdrawalPassword" type="password" autoComplete="new-password" placeholder="Repeat withdrawal password" value={form.confirmWithdrawPassword} onChange={(e) => setForm({ ...form, confirmWithdrawPassword: e.target.value })} /></label>}
        {mode === "register" && <label className="mobile-field"><span>Invite Code</span><input placeholder="Optional" value={form.invite} onChange={(e) => setForm({ ...form, invite: e.target.value })} /></label>}
        <button className="mobile-primary" onClick={mode === "login" ? login : register}>{mode === "login" ? "Login" : "Create Account"}</button>
        {mode === "login" && (support.whatsapp ? <a className="forgot-link" href={support.whatsapp} target="_blank" rel="noreferrer">Forgot password? Contact WhatsApp support</a> : <span className="forgot-link disabled">Forgot password? Contact support unavailable</span>)}
        <button className="link-button" onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "No account? Create one" : "Have an account? Sign in"}</button>
        {error && <div className="form-error">{error}</div>}
      </section>
    </main>
  );
}

function BootScreen() {
  return <main className="mobile-shell auth-only"><section className="auth-center boot-center"><BrandLogo variant="auth" /><p>Loading account</p></section></main>;
}

function MobileHeader({ activeStack, pop, currentMarket, tickers, activeTab }: { activeStack?: StackPage; pop: () => void; currentMarket?: Market; tickers: Tickers; support: { telegram: string; whatsapp: string }; activeTab: Tab }) {
  if (activeStack) return <header className="mobile-header"><button onClick={pop}>{"<"}</button><h2>{activeStack.title}</h2><span /></header>;
  const titles: Record<Tab, { title: string; sub: string }> = {
    markets: { title: "Markets", sub: "Live perpetual pairs" },
    trade:   { title: "Trade", sub: currentMarket ? `${symbolName(currentMarket.symbol)} Perpetual` : "Perpetual" },
    assets:  { title: "Assets", sub: "Wallet & balances" },
    profile: { title: "Profile", sub: "Account & security" }
  };
  const h = titles[activeTab] || titles.markets;
  return (
    <header className="mobile-header mobile-topbar">
      <div className="topbar-title">
        <h1>{h.title}</h1>
        <p>{h.sub}</p>
      </div>
      <div className="top-actions">
        <button className="top-icon" aria-label="search">
          <Search size={18} strokeWidth={1.8} />
        </button>
        <span className="top-pill top-pro">
          <Gem size={14} strokeWidth={1.8} />
          Pro
        </span>
        <button className="top-icon" aria-label="notifications">
          <Bell size={18} strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
}

function BrandLogo({ variant = "header" }: { variant?: "header" | "auth" }) {
  return (
    <div className={`brand-lockup ${variant === "auth" ? "brand-lockup-auth" : ""}`}>
      <span className="brand-mark" aria-hidden="true"><span /></span>
      <span className="brand-copy">
        <strong><span>FLUX</span><em>PERP</em></strong>
        <small>Perpetual Exchange</small>
      </span>
    </div>
  );
}

function BottomNav({ tab, setTab }: { tab: Tab; setTab: (tab: Tab) => void }) {
  const items: { id: Tab; label: string; icon: string }[] = [
    { id: "markets", label: "Markets", icon: "grid" },
    { id: "trade", label: "Trade", icon: "pulse" },
    { id: "assets", label: "Assets", icon: "wallet" },
    { id: "profile", label: "Profile", icon: "user" }
  ];
  return (
    <nav className="mobile-bottom">
      {items.map((item) => (
        <button key={item.id} className={tab === item.id ? "on" : ""} onClick={() => setTab(item.id)}>
          <MobileIcon name={item.icon} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

const ICONS: Record<string, typeof LayoutGrid> = {
  grid: LayoutGrid,
  pulse: BarChart3,
  wallet: Wallet,
  user: UserIcon,
  "arrow-down": Download,
  "arrow-up": Upload,
  swap: ArrowLeftRight,
  history: Clock,
  shield: ShieldCheck
};

function MobileIcon({ name }: { name: string }) {
  const Cmp = ICONS[name] || UserIcon;
  return <Cmp strokeWidth={1.8} />;
}

function CryptoIcon({ asset }: { asset: string }) {
  const key = displayAsset(asset);
  const tone = assetTone(key);
  const slug = key.toLowerCase();
  return (
    <span className={`coin-dot coin-real coin-${tone}`}>
      <img
        src={`https://assets.coincap.io/assets/icons/${slug}@2x.png`}
        alt={key}
        loading="lazy"
        onError={(e) => {
          const t = e.currentTarget;
          t.style.display = "none";
          const fb = t.nextElementSibling as HTMLElement | null;
          if (fb) fb.style.display = "flex";
        }}
      />
      <span className="coin-fb" style={{ display: "none" }}>{key.slice(0, 1)}</span>
    </span>
  );
}


function MarketsTab({ rows, tickers, query, onSelect, push, kycStatus, totalEquity, availableBalance, pnl }: { rows: Market[]; tickers: Tickers; query: string; setQuery: (v: string) => void; sort: "hot" | "gainers" | "losers"; setSort: (v: "hot" | "gainers" | "losers") => void; onSelect: (symbol: string) => void; goTab: (t: Tab) => void; push: (p: StackPage) => void; kycStatus: string; totalEquity: number; availableBalance: number; pnl: number }) {
  const quickActions: { icon: string; label: string; action: () => void }[] = [
    { icon: "arrow-down", label: "Deposit",  action: () => push({ id: "deposit-asset",  title: "Deposit" }) },
    { icon: "arrow-up",   label: "Withdraw", action: () => push({ id: "withdraw-asset", title: "Withdraw" }) },
    { icon: "swap",       label: "Swap",     action: () => push({ id: "swap",           title: "Swap" }) },
    { icon: "history",    label: "History",  action: () => push({ id: "deposit-history", title: "Deposit History" }) }
  ];
  const kycNeedsAttention = kycStatus !== "approved";
  const pnlPos = pnl >= 0;
  return (
    <div className="tab-page">
      <div className="portfolio-card">
        <div className="pc-head">
          <span className="pc-label">Total Portfolio Value <Eye size={14} strokeWidth={1.6} /></span>
          <button className="pc-expand" aria-label="expand">
            <ArrowUpRight size={14} strokeWidth={1.8} />
          </button>
        </div>
        <div className="pc-value">{money(totalEquity)}</div>
        <div className="pc-sub">
          <span className={`pc-pnl ${pnlPos ? "up" : "down"}`}>{pnlPos ? "+" : ""}{money(pnl)}</span>
          <span className="pc-badge">{pnlPos ? "+" : ""}{pnl >= 0 ? "0.00%" : "0.00%"}</span>
          <span className="pc-period">Past 30D</span>
        </div>
        <svg className="pc-spark" viewBox="0 0 340 110" preserveAspectRatio="none">
          <defs>
            <linearGradient id="pcGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0,95 L12,92 L24,93 L36,88 L48,85 L60,87 L72,82 L84,80 L96,75 L108,77 L120,70 L132,72 L144,65 L156,60 L168,62 L180,55 L192,58 L204,50 L216,47 L228,42 L240,45 L252,38 L264,35 L276,30 L288,32 L300,25 L312,22 L324,18 L336,12 L340,8 L340,110 L0,110 Z" fill="url(#pcGrad)" stroke="none" />
          <path d="M0,95 L12,92 L24,93 L36,88 L48,85 L60,87 L72,82 L84,80 L96,75 L108,77 L120,70 L132,72 L144,65 L156,60 L168,62 L180,55 L192,58 L204,50 L216,47 L228,42 L240,45 L252,38 L264,35 L276,30 L288,32 L300,25 L312,22 L324,18 L336,12 L340,8" stroke="#fff" strokeWidth="1.4" fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx="340" cy="8" r="3" fill="#fff" />
        </svg>
        <div className="pc-axis"><span>30D ago</span><span>Today</span></div>
      </div>
      <div className="quick-actions">
        {quickActions.map((a) => (
          <button key={a.label} className="qa-item" onClick={a.action}>
            <span className="qa-icon-wrap"><MobileIcon name={a.icon} /></span>
            <span className="qa-label">{a.label}</span>
          </button>
        ))}
      </div>
      {kycNeedsAttention && (
        <button className="promo-banner" onClick={() => push({ id: "kyc", title: "KYC Verification" })}>
          <div className="promo-icon"><ShieldCheck size={26} strokeWidth={1.6} /></div>
          <div className="promo-body">
            <strong>Verify your identity</strong>
            <small>Unlock higher limits, withdrawals and exclusive features.</small>
            <span className="promo-cta">Verify Now  →</span>
          </div>
        </button>
      )}
      <div className="market-cols"><span>Market</span><span>Price / Change</span></div>
      <div className="market-list">
        {rows.slice(0, 3).map((market) => {
          const ticker = tickers[market.symbol];
          const change = ticker?.change || 0;
          const price = ticker?.price || market.price;
          const volume = (Math.abs(price * 1234) / 1_000_000).toFixed(1);
          const changeTone = change > 0 ? "up" : change < 0 ? "down" : "flat";
          return (
            <button key={market.symbol} className="market-line hover:bg-slate-800/50 transition-colors" onClick={() => onSelect(market.symbol)}>
              <CryptoIcon asset={baseAsset(market.symbol)} />
              <span className="ml-name">
                <span className="ml-title"><b>{symbolName(market.symbol)}</b><em className="ml-tag">Perp</em></span>
                <small className="text-slate-400">Vol <span className="tabular-nums">{volume}</span>M</small>
              </span>
              <Sparkline symbol={market.symbol} change={change} />
              <span className="ml-price">
                <b className="tabular-nums">{money(price)}</b>
                <small className={`change-badge ${changeTone} tabular-nums`}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</small>
              </span>
              <span className="ml-star" aria-hidden="true"><Star size={14} strokeWidth={1.6} /></span>
            </button>
          );
        })}
      </div>
      {!rows.length && <div className="empty-state">No markets found for "{query}"</div>}
      <button className="footer-card" onClick={() => push({ id: "about", title: "About" })}>
        <div className="footer-icon"><BookOpen size={22} strokeWidth={1.6} /></div>
        <div className="footer-body">
          <strong>Trading Guide</strong>
          <small>Learn how FluxPerp works and start trading.</small>
        </div>
        <ChevronRight size={18} className="footer-arrow" />
      </button>
    </div>
  );
}

function TradeTab({ market, tickers, markets, setCurrentSymbol, openOrders, history, now, openSheet, stake, setStake, duration, durations, setDuration, availableBalance }: { market: Market; tickers: Tickers; markets: Market[]; setCurrentSymbol: (symbol: string) => void; openOrders: BinaryOrder[]; history: BinaryOrder[]; now: number; openSheet: (d: "call" | "put") => void; stake: number; setStake: (n: number) => void; duration: Duration; durations: Duration[]; setDuration: (d: Duration) => void; availableBalance: number }) {
  const price = tickers[market.symbol]?.price || market.price;
  const change = tickers[market.symbol]?.change || 0;
  const [ordersView, setOrdersView] = useState<"open" | "closed">("open");
  const [pairMenuOpen, setPairMenuOpen] = useState(false);
  const sourceOrders = ordersView === "open" ? openOrders : history;
  const visibleOrders = sourceOrders.slice(0, 20);
  return (
    <div className="tab-page trade-screen">
      <section className="chart-card">
        <div className="chart-card-head">
          <div className="pair-menu-wrap">
            <button className="pair-menu-trigger" onClick={() => setPairMenuOpen((open) => !open)}>
              {symbolName(market.symbol)} <span className="pair-caret">⌄</span>
            </button>
            {pairMenuOpen && <div className="pair-menu">{markets.map((m) => <button key={m.symbol} className={m.symbol === market.symbol ? "on" : ""} onClick={() => { setCurrentSymbol(m.symbol); setPairMenuOpen(false); }}>{symbolName(m.symbol)}</button>)}</div>}
          </div>
          <div className="chart-card-price">
            <b className="tabular-nums">{money(price)}</b>
            <small className={`${change >= 0 ? "good" : "bad"} tabular-nums`}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</small>
          </div>
        </div>
        <MarketChartPanel symbol={market.symbol} />
      </section>
      <section className="trade-ticket settings-card">
        <h3 className="settings-title">Trade Settings</h3>
        <div className="ticket-row">
          <span>Time Unit</span>
          <div className="ticket-control">
            <select value={duration.seconds} onChange={(e) => setDuration(durations.find((item) => item.seconds === Number(e.target.value)) || durations[0])}>
              {durations.map((item) => <option key={item.seconds} value={item.seconds}>{item.label}</option>)}
            </select>
          </div>
        </div>
        <div className="ticket-row">
          <span>Amount (USDC)</span>
          <div className="amount-stepper"><button onClick={() => setStake(Math.max(10, stake - 10))}>-</button><input className="tabular-nums" type="number" min={10} max={5000} value={stake} onChange={(e) => setStake(Number(e.target.value || 0))} /><button onClick={() => setStake(stake + 10)}>+</button></div>
        </div>
        <div className="stats-row">
          <div className="stat"><small>Available</small><b className="tabular-nums">{availableBalance.toFixed(2)} USDC</b></div>
          <div className="stat"><small>Profit</small><b className="good">{Math.round(duration.odds * 100)}%</b></div>
          <div className="stat"><small>Win</small><b className="good tabular-nums">+{(stake * duration.odds).toFixed(2)} USDC</b></div>
          <div className="stat"><small>Loss</small><b className="bad tabular-nums">-{(stake * duration.lossRate).toFixed(2)} USDC</b></div>
        </div>
        <div className="call-put-row trade-actions"><button className="call" onClick={() => openSheet("call")}>↗ Up</button><button className="put" onClick={() => openSheet("put")}>↘ Down</button></div>
      </section>
      <div className="order-tabs"><button className={ordersView === "open" ? "on" : ""} onClick={() => setOrdersView("open")}>Open ({openOrders.length})</button><button className={ordersView === "closed" ? "on" : ""} onClick={() => setOrdersView("closed")}>Closed ({history.length})</button></div>
      <div className="order-list">{visibleOrders.map((order) => <OrderCard key={order.id} order={order} now={now} />)}{!visibleOrders.length && <div className="empty-state">{ordersView === "open" ? "No open positions" : "No closed orders"}</div>}{sourceOrders.length > visibleOrders.length && <div className="empty-state">Showing latest {visibleOrders.length} orders</div>}</div>
    </div>
  );
}

function OrderSheet({ direction, market, price, stake, setStake, duration, durations, setDuration, close, submit, submitting }: { direction: "call" | "put"; market: Market; price: number; stake: number; setStake: (n: number) => void; duration: Duration; durations: Duration[]; setDuration: (d: Duration) => void; close: () => void; submit: () => void; submitting: boolean }) {
  const winAmount = stake * duration.odds;
  const lossAmount = stake * duration.lossRate;
  return <div className="sheet-bg" onClick={close}><div className="bottom-sheet" onClick={(e) => e.stopPropagation()}><div className="sheet-handle" /><h3>{symbolName(market.symbol)} - <span className="tabular-nums">{money(price)}</span></h3><div className={`direction-lock ${direction}`}>{direction.toUpperCase()}</div><div className="stake-stepper"><button disabled={submitting} onClick={() => setStake(Math.max(10, stake - 10))}>-</button><input className="tabular-nums" type="number" min={10} max={5000} value={stake} disabled={submitting} onChange={(e) => setStake(Number(e.target.value || 0))} /><button disabled={submitting} onClick={() => setStake(stake + 10)}>+</button></div><small className="muted-line">Min 10 - Max 5000</small><div className="duration-grid">{durations.map((item) => <button key={item.seconds} disabled={submitting} className={duration.seconds === item.seconds ? "on" : ""} onClick={() => setDuration(item)}>{item.label}<br />+{Math.round(item.odds * 100)}%</button>)}</div><div className="estimate-row"><span>Win Profit</span><b className="tabular-nums good">+{money(winAmount)}</b></div><div className="estimate-row"><span>Max Loss</span><b className="tabular-nums bad">-{money(lossAmount)}</b></div><button className={`mobile-primary ${direction}`} disabled={submitting} onClick={submit}>{submitting ? "Placing..." : `Place ${direction.toUpperCase()} - ${money(stake)}`}</button></div></div>;
}

function OrderCard({ order, now }: { order: BinaryOrder; now: number }) {
  const remaining = Math.ceil((order.expiresAt - now) / 1000);
  const awaitingManualSettlement = order.status === "open" && remaining <= 0;
  const riskAmount = order.riskAmount ?? order.stake * order.duration.lossRate;
  return <div className="order-card"><div><span className={`tag ${order.direction}`}>{order.direction.toUpperCase()}</span><b>{symbolName(order.symbol)}</b></div>{order.status === "open" ? <strong className="tabular-nums">{awaitingManualSettlement ? "Settling" : `${Math.max(0, remaining)}s`}</strong> : <strong className={`${order.status === "win" ? "good" : "bad"} tabular-nums`}>{order.status === "win" ? "Won" : "Lost"} {money(order.profit || 0)}</strong>}<small>Entry <span className="tabular-nums">{money(order.entry)}</span> - Stake <span className="tabular-nums">{money(order.stake)}</span> - Risk <span className="tabular-nums">{money(riskAmount)}</span></small></div>;
}

function AssetsTab({ assets, push }: { assets: AssetData | null; push: (p: StackPage) => void }) {
  const rows = mergedAssetRows(assets);
  const totalEquity = assets?.summary.totalEquity ?? rows.reduce((sum, item) => sum + Number(item.balance || 0), 0);
  const available = assets?.summary.availableBalance ?? rows.reduce((sum, item) => sum + Number(item.balance || 0), 0);
  const frozen = rows.reduce((sum, item) => sum + Number(item.locked || 0), 0);
  const pnl = assets?.summary.unrealizedPnl ?? 0;
  return (
    <div className="tab-page">
      <section className="asset-hero">
        <small>Total Equity</small>
        <strong className="tabular-nums">{money(totalEquity)}</strong>
        <div className="asset-metrics">
          <span><small>Available</small><b className="tabular-nums">{money(available)}</b></span>
          <span><small>Frozen</small><b className="tabular-nums">{money(frozen)}</b></span>
          <span><small>Today PnL</small><b className={`${pnl >= 0 ? "good" : "bad"} tabular-nums`}>{pnl >= 0 ? "+" : ""}{money(pnl)}</b></span>
        </div>
      </section>
      <div className="asset-actions">
        <button onClick={() => push({ id: "deposit-asset", title: "Deposit" })}>Deposit</button>
        <button onClick={() => push({ id: "withdraw-asset", title: "Withdraw" })}>Withdraw</button>
        <button onClick={() => push({ id: "swap", title: "Swap" })}>Swap</button>
      </div>
      <div className="wallet-list">{rows.map((asset) => <div className="wallet-line" key={asset.asset}><CryptoIcon asset={asset.asset} /><span><b>{asset.asset}</b><small>Spot</small></span><span><b className="tabular-nums">{Number(asset.balance || 0).toFixed(assetDigits(asset.asset))}</b><small className="tabular-nums">Frozen {Number(asset.locked || 0).toFixed(assetDigits(asset.asset))}</small></span></div>)}</div>
      <div className="funding-list">
        <button onClick={() => push({ id: "deposit-history", title: "Deposit History" })}>Deposit History<span>{">"}</span></button>
        <button onClick={() => push({ id: "withdraw-history", title: "Withdraw History" })}>Withdraw History<span>{">"}</span></button>
        <button onClick={() => push({ id: "funding-records", title: "Funding Records" })}>Funding Records<span>{">"}</span></button>
      </div>
    </div>
  );
}

function Sparkline({ symbol, change }: { symbol: string; change: number }) {
  const tone = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const seed = baseAsset(symbol).split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const points = Array.from({ length: 7 }, (_, index) => {
    const wave = Math.sin((seed + index * 11) / 8) * 8;
    const trend = tone === "up" ? 24 - index * 2.2 : tone === "down" ? 10 + index * 2.2 : 17 + Math.sin(index) * 1.2;
    return `${index * 9},${Math.max(5, Math.min(31, trend + wave * 0.35)).toFixed(1)}`;
  }).join(" ");
  return (
    <svg className={`sparkline ${tone}`} viewBox="0 0 54 36" aria-hidden="true">
      <polyline points={points} />
    </svg>
  );
}

const identiconPalette = ["#26e0a4", "#1b8dff", "#8b5cf6", "#f59e0b", "#ff4770", "#14b8a6"];

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function UserIdenticon({ seed, label }: { seed: string; label: string }) {
  const hash = hashSeed(seed || "flux-user");
  const primary = identiconPalette[hash % identiconPalette.length];
  const secondary = identiconPalette[(hash >>> 7) % identiconPalette.length];
  const cells = Array.from({ length: 49 }, (_, index) => {
    const row = Math.floor(index / 7);
    const col = index % 7;
    const mirroredCol = col > 3 ? 6 - col : col;
    const bit = (hash >>> ((row * 4 + mirroredCol) % 28)) & 1;
    return bit === 1 || (row === 3 && mirroredCol <= 2);
  });
  return (
    <div className="profile-identicon pixel-identicon" style={{ "--avatar-accent": primary, "--avatar-accent-2": secondary } as CSSProperties} aria-hidden="true">
      <div className="identicon-grid">{cells.map((active, index) => <span key={index} className={active ? "active" : ""} />)}</div>
      <span className="pixel-initial">{label}</span>
    </div>
  );
}

function ProfileTab({ user, kycStatus, push, logout }: { user: User; kycStatus: string; push: (p: StackPage) => void; logout: () => void }) {
  const uid = displayUid(user);
  const email = user.email || "user@fluxperp.local";
  const displayName = email.split("@")[0] || `UID ${uid}`;
  const avatarLabel = (displayName.match(/[a-z0-9]/i)?.[0] || "U").toUpperCase();
  const kycText = kycStatus === "approved" ? "Verified" : kycStatus === "pending" ? "Reviewing" : kycStatus === "rejected" ? "Rejected" : "Unverified";
  const menu = [
    { page: { id: "security", title: "Security" } as StackPage, Icon: LockKeyhole },
    { page: { id: "kyc", title: "KYC Verification" } as StackPage, Icon: ShieldCheck },
    { page: { id: "about", title: "About" } as StackPage, Icon: Info },
    { page: { id: "terms", title: "Terms of Service" } as StackPage, Icon: FileText },
    { page: { id: "privacy", title: "Privacy Policy" } as StackPage, Icon: FileText },
    { page: { id: "support", title: "Support" } as StackPage, Icon: Headphones }
  ];

  return (
    <div className="tab-page profile-page">
      <div className="profile-card profile-account">
        <UserIdenticon seed={`${uid}:${email}`} label={avatarLabel} />
        <div className="profile-main">
          <div className="profile-title-row">
            <h2>{displayName}</h2>
            <span className={`kyc-chip ${kycStatus}`}><BadgeCheck size={13} aria-hidden="true" />{kycText}</span>
          </div>
          <p>{email}</p>
          <div className="profile-meta">
            <span><small>UID</small><b>{uid}</b></span>
            <span><small>Ref</small><b>FX789</b></span>
          </div>
        </div>
      </div>
      <div className="menu-list profile-menu">
        {menu.map(({ page, Icon }) => (
          <button key={page.id} onClick={() => push(page)}>
            <span className="menu-icon"><Icon size={18} aria-hidden="true" /></span>
            <span className="menu-title">{page.title}</span>
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        ))}
      </div>
      <button className="logout-outline profile-logout" onClick={logout}>Logout</button>
    </div>
  );
}

function StackContent(props: { page: StackPage; user: User; assets: AssetData | null; selectedCoin: string; setSelectedCoin: (v: string) => void; selectedNetwork: string; setSelectedNetwork: (v: string) => void; push: (p: StackPage) => void; replaceStack: (p: StackPage) => void; clearStack: () => void; showToast: (type: "ok" | "err" | "info", text: string) => void; withdrawForm: { address: string; amount: string; password: string }; setWithdrawForm: (v: { address: string; amount: string; password: string }) => void; swap: { from: string; to: string; amount: string }; setSwap: (v: { from: string; to: string; amount: string }) => void; kycStatus: string; setKycStatus: (v: "none" | "pending" | "approved" | "rejected") => void; expandedSecurity: "login" | "withdraw" | null; setExpandedSecurity: (v: "login" | "withdraw" | null) => void; support: { telegram: string; whatsapp: string }; settings: Partial<PublicSettings>; logout: () => void }) {
  const { page, selectedCoin, setSelectedCoin, selectedNetwork, setSelectedNetwork, push, replaceStack, clearStack, showToast } = props;
  if (page.id === "deposit-asset" || page.id === "withdraw-asset") {
    const mode = page.id.startsWith("deposit") ? "deposit" : "withdraw";
    return <AssetPicker title={mode === "deposit" ? "Select Asset" : "Withdraw"} mode={mode} assets={props.assets} onPick={(coin) => { setSelectedCoin(coin); push({ id: mode === "deposit" ? "deposit-network" : "withdraw-network", title: "Select Network" }); }} />;
  }
  if (page.id === "deposit-network") return <NetworkPicker coin={selectedCoin} mode="deposit" assets={props.assets} onPick={(network) => { setSelectedNetwork(network); push({ id: "deposit-address", title: "Deposit Address" }); }} />;
  if (page.id === "withdraw-network") return <NetworkPicker coin={selectedCoin} mode="withdraw" assets={props.assets} onPick={(network) => { setSelectedNetwork(network); push({ id: "withdraw-form", title: `Withdraw ${selectedCoin}` }); }} />;
  if (page.id === "deposit-address") return <DepositAddress coin={selectedCoin} network={selectedNetwork} assets={props.assets} showToast={showToast} done={() => { showToast("info", "Deposit submitted for system review"); clearStack(); }} />;
  if (page.id === "withdraw-form") return <WithdrawForm coin={selectedCoin} network={selectedNetwork} assets={props.assets} form={props.withdrawForm} setForm={props.setWithdrawForm} done={(record) => { showToast("ok", "Withdrawal request submitted"); replaceStack({ id: "withdraw-detail", title: "Withdrawal Details", record }); }} />;
  if (page.id === "withdraw-detail") return <WithdrawalDetail record={page.record} />;
  if (page.id === "deposit-history") return <RecordList kind="deposits" assets={props.assets} />;
  if (page.id === "withdraw-history") return <RecordList kind="withdrawals" assets={props.assets} push={push} />;
  if (page.id === "funding-records") return <RecordList kind="transactions" assets={props.assets} />;
  if (page.id === "swap") return <SwapPage assets={props.assets} swap={props.swap} setSwap={props.setSwap} />;
  if (page.id === "security") return <SecurityPage expanded={props.expandedSecurity} setExpanded={props.setExpandedSecurity} showToast={showToast} />;
  if (page.id === "kyc") return <KycPage kycStatus={props.kycStatus} rejectedReason={props.user.kyc_rejected_reason} setKycStatus={props.setKycStatus} done={() => { showToast("ok", "KYC submitted"); clearStack(); }} />;
  if (page.id === "support") return <SupportPage support={props.support} />;
  return <StaticPage page={page} settings={props.settings} />;
}

function AssetPicker({ title, mode, assets, onPick }: { title: string; mode: "deposit" | "withdraw"; assets: AssetData | null; onPick: (coin: string) => void }) {
  return <div className="stack-page"><small className="muted-line">{title}</small>{pickerCoins(assets, mode).map((coin) => {
    const available = availableForAsset(assets, coin);
    return <button className="picker-line" key={coin} onClick={() => onPick(coin)}><CryptoIcon asset={coin} /><span><b>{coin}</b><small className="tabular-nums">Available {assetAmount(available, coin)}</small></span><span>{">"}</span></button>;
  })}</div>;
}

function NetworkPicker({ coin, mode, assets, onPick }: { coin: string; mode: "deposit" | "withdraw"; assets: AssetData | null; onPick: (network: string) => void }) {
  const rows = mode === "deposit" ? depositNetworksForCoin(assets, coin) : networksForCoin(coin);
  return <div className="stack-page"><small className="muted-line">Select Network - {coin}</small>{rows.map((network) => <button className="picker-line" key={network} onClick={() => onPick(network)}><span className="green-dot" /><span><b>{network}</b><small>{mode === "deposit" ? "Active deposit network" : `Fee: 1 ${coin}`}</small></span><span>{">"}</span></button>)}</div>;
}

function StatusChip({ status }: { status: string }) {
  const key = status.toLowerCase();
  return <span className={`status-chip ${key}`}>{status}</span>;
}

function fundingRecordLabel(type: string) {
  const labels: Record<string, string> = {
    deposit: "Deposit completed",
    deposit_request: "Deposit submitted",
    withdrawal_request: "Withdrawal submitted",
    withdrawal_completed: "Withdrawal completed",
    withdrawal_rejected: "Withdrawal returned",
    system_adjustment: "System adjustment",
    signup_bonus: "Promotion credit"
  };
  return labels[type] || type.replaceAll("_", " ");
}

function RecordList({ kind, assets, push }: { kind: "deposits" | "withdrawals" | "transactions"; assets: AssetData | null; push?: (p: StackPage) => void }) {
  if (kind === "deposits") {
    const rows = assets?.deposits || [];
    return <div className="stack-page"><div className="record-list">{rows.map((row) => <div className="record-line" key={row.id}><div><b>{assetAmount(row.amount, row.asset)}</b><StatusChip status={row.status} /></div><small>{row.network} - {compactDateTime(row.created_at)}</small>{row.tx_hash && <small className="record-hash">TX {row.tx_hash}</small>}</div>)}{!rows.length && <div className="empty-state">No deposit records</div>}</div></div>;
  }
  if (kind === "withdrawals") {
    const rows = assets?.withdrawals || [];
    return <div className="stack-page"><div className="record-list">{rows.map((row) => <button className="record-line record-button" key={row.id} onClick={() => push?.({ id: "withdraw-detail", title: "Withdrawal Details", record: row })}><div><b>{assetAmount(row.amount, row.asset)}</b><StatusChip status={row.status} /></div><small>{row.network || "Network"} - {compactDateTime(row.created_at)}</small>{row.address && <small className="record-hash">{row.address}</small>}<span className="record-arrow">{">"}</span></button>)}{!rows.length && <div className="empty-state">No withdrawal records</div>}</div></div>;
  }
  const rows = assets?.transactions || [];
  return <div className="stack-page"><div className="record-list">{rows.map((row) => <div className="record-line" key={row.id}><div><b>{fundingRecordLabel(row.type)}</b><StatusChip status={row.status} /></div><small className={`tabular-nums ${row.amount >= 0 ? "good" : "bad"}`}>{assetAmount(row.amount, row.asset, true)}</small>{row.note && <small>{row.note}</small>}<small>{compactDateTime(row.created_at)}</small></div>)}{!rows.length && <div className="empty-state">No funding records</div>}</div></div>;
}

function DetailRow({ label, value, mono = false }: { label: string; value?: string | number | null; mono?: boolean }) {
  return <div className="detail-row"><span>{label}</span><b className={mono ? "tabular-nums" : ""}>{value || "-"}</b></div>;
}

function WithdrawalDetail({ record }: { record: WithdrawalRecord }) {
  return (
    <div className="stack-page withdraw-detail">
      <section className="detail-status">
        <span className="detail-check">✓</span>
        <small>Submitted</small>
        <strong className="tabular-nums">{assetAmount(record.amount, record.asset)}</strong>
        <StatusChip status={record.status || "pending"} />
      </section>
      <section className="detail-panel">
        <DetailRow label="Request ID" value={`#${record.id}`} mono />
        <DetailRow label="Asset" value={displayAsset(record.asset)} />
        <DetailRow label="Network" value={record.network || "Network"} />
        <DetailRow label="Address" value={record.address} mono />
        <DetailRow label="Submitted" value={compactDateTime(record.created_at)} mono />
      </section>
    </div>
  );
}

const qrExp = (() => {
  const table = new Array<number>(512);
  let value = 1;
  for (let i = 0; i < 255; i += 1) {
    table[i] = value;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) table[i] = table[i - 255];
  return table;
})();
const qrLog = (() => {
  const table = new Array<number>(256).fill(0);
  for (let i = 0; i < 255; i += 1) table[qrExp[i]] = i;
  return table;
})();
const qrMul = (a: number, b: number) => a === 0 || b === 0 ? 0 : qrExp[qrLog[a] + qrLog[b]];
const qrPolyMul = (a: number[], b: number[]) => {
  const out = new Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) out[i + j] ^= qrMul(a[i], b[j]);
  }
  return out;
};
const qrRsGenerator = (degree: number) => {
  let gen = [1];
  for (let i = 0; i < degree; i += 1) gen = qrPolyMul(gen, [1, qrExp[i]]);
  return gen;
};
const qrRemainder = (data: number[], degree: number) => {
  const gen = qrRsGenerator(degree);
  const out = [...data, ...new Array<number>(degree).fill(0)];
  for (let i = 0; i < data.length; i += 1) {
    const factor = out[i];
    if (!factor) continue;
    for (let j = 0; j < gen.length; j += 1) out[i + j] ^= qrMul(gen[j], factor);
  }
  return out.slice(data.length);
};
const qrFormatBits = (mask: number) => {
  let value = mask;
  let data = value << 10;
  const generator = 0x537;
  for (let i = 14; i >= 10; i -= 1) {
    if ((data >>> i) & 1) data ^= generator << (i - 10);
  }
  return ((value << 10) | data) ^ 0x5412;
};
const addQrBits = (bits: number[], value: number, length: number) => {
  for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
};
const makeQrMatrix = (value: string) => {
  const version = 5;
  const size = version * 4 + 17;
  const dataCodewords = 86;
  const blockDataCodewords = 43;
  const eccCodewords = 24;
  const bytes = [...new TextEncoder().encode(value)].slice(0, 80);
  const bits: number[] = [];
  addQrBits(bits, 0b0100, 4);
  addQrBits(bits, bytes.length, 8);
  bytes.forEach((byte) => addQrBits(bits, byte, 8));
  const capacity = dataCodewords * 8;
  for (let i = 0; i < 4 && bits.length < capacity; i += 1) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((sum, bit) => (sum << 1) | bit, 0));
  for (let pad = 0xec; data.length < dataCodewords; pad = pad === 0xec ? 0x11 : 0xec) data.push(pad);
  const blocks = [data.slice(0, blockDataCodewords), data.slice(blockDataCodewords, blockDataCodewords * 2)];
  const ecc = blocks.map((block) => qrRemainder(block, eccCodewords));
  const codewords: number[] = [];
  for (let i = 0; i < blockDataCodewords; i += 1) blocks.forEach((block) => codewords.push(block[i]));
  for (let i = 0; i < eccCodewords; i += 1) ecc.forEach((block) => codewords.push(block[i]));

  const matrix = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const reserved = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean, fixed = true) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    matrix[y][x] = dark;
    if (fixed) reserved[y][x] = true;
  };
  const finder = (x: number, y: number) => {
    for (let yy = -1; yy <= 7; yy += 1) {
      for (let xx = -1; xx <= 7; xx += 1) {
        const inPattern = xx >= 0 && xx <= 6 && yy >= 0 && yy <= 6;
        const dark = inPattern && (xx === 0 || xx === 6 || yy === 0 || yy === 6 || (xx >= 2 && xx <= 4 && yy >= 2 && yy <= 4));
        set(x + xx, y + yy, dark);
      }
    }
  };
  finder(0, 0);
  finder(size - 7, 0);
  finder(0, size - 7);
  const alignment = (cx: number, cy: number) => {
    for (let y = -2; y <= 2; y += 1) {
      for (let x = -2; x <= 2; x += 1) set(cx + x, cy + y, Math.max(Math.abs(x), Math.abs(y)) !== 1);
    }
  };
  alignment(30, 30);
  for (let i = 8; i < size - 8; i += 1) {
    set(i, 6, i % 2 === 0);
    set(6, i, i % 2 === 0);
  }
  set(8, 29, true);
  for (let i = 0; i <= 5; i += 1) {
    set(8, i, false);
    set(i, 8, false);
  }
  set(8, 7, false);
  set(8, 8, false);
  set(7, 8, false);
  for (let i = 0; i < 8; i += 1) set(size - 1 - i, 8, false);
  for (let i = 8; i < 15; i += 1) set(8, size - 15 + i, false);

  const dataBits = codewords.flatMap((word) => Array.from({ length: 8 }, (_, index) => (word >>> (7 - index)) & 1));
  let bitIndex = 0;
  let upward = true;
  for (let x = size - 1; x >= 1; x -= 2) {
    if (x === 6) x -= 1;
    for (let yOffset = 0; yOffset < size; yOffset += 1) {
      const y = upward ? size - 1 - yOffset : yOffset;
      for (let dx = 0; dx < 2; dx += 1) {
        const xx = x - dx;
        if (reserved[y][xx]) continue;
        const bit = dataBits[bitIndex] || 0;
        const mask = (xx + y) % 2 === 0;
        set(xx, y, Boolean(bit) !== mask, false);
        bitIndex += 1;
      }
    }
    upward = !upward;
  }
  const format = qrFormatBits(0);
  const formatBit = (i: number) => Boolean((format >>> i) & 1);
  for (let i = 0; i <= 5; i += 1) set(8, i, formatBit(i));
  set(8, 7, formatBit(6));
  set(8, 8, formatBit(7));
  set(7, 8, formatBit(8));
  for (let i = 9; i < 15; i += 1) set(14 - i, 8, formatBit(i));
  for (let i = 0; i < 8; i += 1) set(size - 1 - i, 8, formatBit(i));
  for (let i = 8; i < 15; i += 1) set(8, size - 15 + i, formatBit(i));
  return matrix;
};

function LocalQrCode({ value }: { value: string }) {
  const matrix = useMemo(() => makeQrMatrix(value), [value]);
  const quiet = 4;
  const size = matrix.length;
  return <svg className="qr" viewBox={`0 0 ${size + quiet * 2} ${size + quiet * 2}`} role="img" aria-label="Deposit address QR" shapeRendering="crispEdges"><rect width={size + quiet * 2} height={size + quiet * 2} rx="2" fill="#fff" />{matrix.flatMap((row, y) => row.map((dark, x) => dark ? <rect key={`${x}-${y}`} x={x + quiet} y={y + quiet} width="1" height="1" fill="#050409" /> : null))}</svg>;
}

function DepositAddress({ coin, network, assets, showToast, done }: { coin: string; network: string; assets: AssetData | null; showToast: (type: "ok" | "err" | "info", text: string) => void; done: () => void }) {
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const selected = assets?.depositAddresses?.find((item) => displayAsset(item.asset) === displayAsset(coin) && item.network === network);
  const address = selected?.address || "";
  async function copyAddress() {
    if (!address) return showToast("err", "No active address to copy");
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(address);
      showToast("ok", "Address copied");
    } catch {
      showToast("err", "Copy failed");
    }
  }
  function pickProof(file: File | undefined) {
    setError("");
    if (!file) return setProof(null);
    if (!file.type.startsWith("image/")) return setError("Proof must be an image file");
    if (file.size > 2_000_000) return setError("Proof image must be smaller than 2MB");
    setProof(file);
  }
  async function submit() {
    setError("");
    const numericAmount = Number(amount);
    if (!selected?.address) return setError("No active deposit address for this asset/network");
    if (!amount.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) return setError("Enter a valid deposit amount");
    if (proof && (!proof.type.startsWith("image/") || proof.size > 2_000_000)) return setError("Proof must be an image under 2MB");
    setSubmitting(true);
    const form = new FormData();
    form.set("asset", selected.asset);
    form.set("network", network);
    form.set("amount", amount);
    form.set("txHash", txHash);
    if (proof) form.set("proof", proof);
    const res = await fetch("/api/assets/deposits", { method: "POST", body: form });
    setSubmitting(false);
    if (!res.ok) return setError((await res.json()).error || "Deposit submission failed");
    done();
  }
  return <div className="stack-page"><div className="address-card"><b>{coin} ({network}) Deposit Address</b><p>{address || "No active address"}</p><small className="muted-line">{selected?.source === "custom" ? "Assigned address" : selected ? "Platform default address" : "Choose an active deposit network"}</small></div><LocalQrCode value={address || `${coin}:${network}`} /><button className="mobile-primary" onClick={copyAddress}>Copy Address</button><label className="mobile-field"><span>Amount ({coin})</span><input type="number" min="0" step="any" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} /></label><label className="mobile-field"><span>TX Hash</span><input value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="Optional transaction hash" /></label><label className="upload-box"><input type="file" accept="image/*" onChange={(e) => pickProof(e.target.files?.[0])} />{proof ? proof.name : "Tap to upload proof"}</label>{error && <div className="form-error">{error}</div>}<button className="mobile-primary call" disabled={submitting} onClick={submit}>{submitting ? "Submitting..." : "Submit Deposit"}</button></div>;
}

function WithdrawForm({ coin, network, assets, form, setForm, done }: { coin: string; network: string; assets: AssetData | null; form: { address: string; amount: string; password: string }; setForm: (v: { address: string; amount: string; password: string }) => void; done: (record: WithdrawalRecord) => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const available = availableForAsset(assets, coin);
  const minWithdrawal = Number(assets?.settings?.min_withdrawal_usdc || assets?.settings?.min_withdrawal_amount || 10);
  async function submit() {
    setError("");
    const numericAmount = Number(form.amount);
    if (!form.address.trim()) return setError("Withdrawal address is required");
    if (!form.amount.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) return setError("Enter a valid withdrawal amount");
    if (Number.isFinite(minWithdrawal) && numericAmount < minWithdrawal) return setError(`Minimum withdrawal is ${assetAmount(minWithdrawal, coin)}`);
    if (numericAmount > available) return setError("Insufficient available balance");
    if (!form.password.trim()) return setError("Withdrawal password is required");
    setSubmitting(true);
    const res = await fetch("/api/assets/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset: coin,
        network,
        amount: Number(form.amount),
        address: form.address,
        withdrawalPassword: form.password
      })
    });
    setSubmitting(false);
    if (!res.ok) return setError((await res.json()).error || "Withdrawal submission failed");
    const result = await res.json();
    const record: WithdrawalRecord = {
      id: Number(result.withdrawalId || Date.now()),
      asset: coin,
      network,
      amount: numericAmount,
      address: form.address.trim(),
      status: "pending",
      created_at: new Date().toISOString()
    };
    setForm({ address: "", amount: "10", password: "" });
    done(record);
  }
  return <div className="stack-page"><p className="muted-line">Network: {network} - Available: <span className="tabular-nums">{assetAmount(available, coin)}</span></p><label className="mobile-field"><span>Withdrawal Address</span><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder={`Enter ${coin} address`} /></label><label className="mobile-field"><span>Amount ({coin})</span><input type="number" min="0" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label><label className="mobile-field"><span>Withdrawal Password</span><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>{error && <div className="form-error">{error}</div>}<button className="mobile-primary call" disabled={submitting} onClick={submit}>{submitting ? "Submitting..." : "Withdraw"}</button></div>;
}

function SwapPage({ assets, swap, setSwap }: { assets: AssetData | null; swap: { from: string; to: string; amount: string }; setSwap: (v: { from: string; to: string; amount: string }) => void }) {
  const amount = Number(swap.amount || 0);
  const referenceUsd: Record<string, number> = { USDC: 1 };
  const fromRate = referenceUsd[swap.from] || 1;
  const toRate = referenceUsd[swap.to] || 1;
  const estimated = Number.isFinite(amount) && amount > 0 ? (amount * fromRate * 0.9975) / toRate : 0;
  const options = pickerCoins(assets, "swap");
  return <div className="stack-page"><div className="swap-card"><small>From</small><div><select value={swap.from} onChange={(e) => setSwap({ ...swap, from: e.target.value })}>{options.map((c) => <option key={c}>{c}</option>)}</select><input type="number" min="0" step="any" value={swap.amount} onChange={(e) => setSwap({ ...swap, amount: e.target.value })} /></div><small className="muted-line tabular-nums">Available {assetAmount(availableForAsset(assets, swap.from), swap.from)}</small></div><button className="flip-button" aria-label="Flip swap assets" onClick={() => setSwap({ ...swap, from: swap.to, to: swap.from })}><ArrowUpDown size={18} aria-hidden="true" /></button><div className="swap-card"><small>To (Estimated)</small><div><select value={swap.to} onChange={(e) => setSwap({ ...swap, to: e.target.value })}>{options.map((c) => <option key={c}>{c}</option>)}</select><b className="tabular-nums">{assetAmount(estimated, swap.to)}</b></div></div><div className="rate-card">Preview only<br />Estimated fee: 0.25%</div><button className="mobile-primary call" disabled>Swap unavailable</button></div>;
}

function SecurityPage({ expanded, setExpanded, showToast }: { expanded: "login" | "withdraw" | null; setExpanded: (v: "login" | "withdraw" | null) => void; showToast: (type: "ok" | "err" | "info", text: string) => void }) {
  return <div className="stack-page"><SecurityPanel id="login" title="Change Password" expanded={expanded} setExpanded={setExpanded} showToast={showToast} /><SecurityPanel id="withdraw" title="Withdrawal Password" expanded={expanded} setExpanded={setExpanded} showToast={showToast} /></div>;
}

function SecurityPanel({ id, title, expanded, setExpanded, showToast }: { id: "login" | "withdraw"; title: string; expanded: "login" | "withdraw" | null; setExpanded: (v: "login" | "withdraw" | null) => void; showToast: (type: "ok" | "err" | "info", text: string) => void }) {
  const open = expanded === id;
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function save() {
    setError("");
    const current = form.current.trim();
    const next = form.next.trim();
    const confirm = form.confirm.trim();
    if (!current) return setError(id === "login" ? "Current password is required" : "Current withdrawal password is required");
    if (next.length < 6) return setError(id === "login" ? "Login password must be at least 6 characters" : "Withdrawal password must be at least 6 characters");
    if (next !== confirm) return setError(id === "login" ? "Login passwords do not match" : "Withdrawal passwords do not match");
    setSubmitting(true);
    const res = await fetch(id === "login" ? "/api/auth/password" : "/api/auth/withdrawal-password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id === "login"
        ? { currentPassword: current, newPassword: next, confirmPassword: confirm }
        : { currentWithdrawalPassword: current, newWithdrawalPassword: next, confirmWithdrawalPassword: confirm })
    });
    setSubmitting(false);
    if (!res.ok) return setError((await res.json()).error || "Password update failed");
    setForm({ current: "", next: "", confirm: "" });
    setExpanded(null);
    showToast("ok", id === "login" ? "Password updated" : "Withdrawal password updated");
  }
  return <div className="accordion"><button onClick={() => setExpanded(open ? null : id)}>{title}<span>{open ? "v" : ">"}</span></button>{open && <div className="accordion-body"><input placeholder={id === "login" ? "Current password" : "Current withdrawal password"} type="password" autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} /><input placeholder={id === "login" ? "New password (6+ chars)" : "New withdrawal password"} type="password" autoComplete="new-password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} /><input placeholder="Confirm password" type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />{error && <div className="form-error">{error}</div>}<button className="mobile-primary" disabled={submitting} onClick={save}>{submitting ? "Saving..." : "Save"}</button></div>}</div>;
}

function KycPage({ kycStatus, rejectedReason, setKycStatus, done }: { kycStatus: string; rejectedReason?: string | null; setKycStatus: (v: "none" | "pending" | "approved" | "rejected") => void; done: () => void }) {
  const [legalName, setLegalName] = useState("");
  const [documentType, setDocumentType] = useState("Passport");
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function submit() {
    setError("");
    setSubmitting(true);
    const form = new FormData();
    form.set("legalName", legalName);
    form.set("documentType", documentType);
    if (front) form.set("front", front);
    if (back) form.set("back", back);
    const res = await fetch("/api/kyc", { method: "POST", body: form });
    setSubmitting(false);
    if (!res.ok) return setError((await res.json()).error || "KYC submission failed");
    setKycStatus("pending");
    done();
  }
  if (kycStatus === "pending") {
    return <div className="stack-page"><div className="profile-card"><h2>KYC Under Review</h2><p>Your identity information has been submitted and is waiting for review.</p><span className="kyc-chip pending">pending</span></div></div>;
  }
  if (kycStatus === "approved") {
    return <div className="stack-page"><div className="profile-card"><h2>KYC Approved</h2><p>Your identity verification has been approved.</p><span className="kyc-chip approved">approved</span></div></div>;
  }
  if (kycStatus === "rejected") {
    return <div className="stack-page"><div className="profile-card"><h2>KYC Rejected</h2><p>{rejectedReason || "Please contact support or submit updated documents."}</p><span className="kyc-chip rejected">rejected</span></div></div>;
  }
  return <div className="stack-page"><label className="mobile-field"><span>Legal Name</span><input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="As shown on your ID document" /></label><label className="mobile-field"><span>Document Type</span><select value={documentType} onChange={(e) => setDocumentType(e.target.value)}><option>Passport</option><option>National ID</option><option>Driving License</option></select></label><label className="upload-box"><input type="file" accept="image/*" onChange={(e) => setFront(e.target.files?.[0] || null)} />{front ? front.name : "Tap to upload front image"}</label><label className="upload-box"><input type="file" accept="image/*" onChange={(e) => setBack(e.target.files?.[0] || null)} />{back ? back.name : "Tap to upload back image"}</label>{error && <div className="form-error">{error}</div>}<button className="mobile-primary call" disabled={submitting} onClick={submit}>{submitting ? "Submitting..." : "Submit KYC"}</button></div>;
}

function SupportPage({ support }: { support: { telegram: string; whatsapp: string } }) {
  return (
    <div className="stack-page support-page">
      <div className="support-icon">Support</div>
      <h2>24/7 Support</h2>
      <p>Average response under 15 minutes</p>
      {support.telegram ? <a href={support.telegram} target="_blank" rel="noreferrer">Telegram <span>{">"}</span></a> : <span className="support-disabled">Telegram <span>{">"}</span></span>}
      {support.whatsapp ? <a href={support.whatsapp} target="_blank" rel="noreferrer">WhatsApp <span>{">"}</span></a> : <span className="support-disabled">WhatsApp <span>{">"}</span></span>}
    </div>
  );
}

function StaticPage({ page, settings }: { page: StackPage; settings: Partial<PublicSettings> }) {
  const content =
    page.id === "about" ? settings.about_content :
    page.id === "terms" ? settings.terms_content :
    page.id === "privacy" ? settings.privacy_content :
    "";
  const body = (content || "Content will be updated soon.").trim();
  return (
    <div className="stack-page static-page">
      <h2>{page.title}</h2>
      {body.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </div>
  );
}
