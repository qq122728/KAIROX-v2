"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpDown, BadgeCheck, ChevronLeft, ChevronRight, FileText, Headphones, Info, LockKeyhole, ShieldCheck,
  Search, Bell, Gem, Eye, EyeOff, ArrowUpRight, Mail,
  Download, Upload, ArrowLeftRight, Clock,
  LayoutGrid, BarChart3, User as UserIcon,
  Star, BookOpen, LogOut,
  MessageCircle, Send, Paperclip,
  Home, ClipboardList, Trophy, X, Banknote, CheckCircle2
} from "lucide-react";
import { useRouter } from "next/navigation";
import { MarketChartPanel } from "./MarketData";
import { connectRealtime } from "./realtime-client";
import { notificationManager, type ClientNotification } from "../lib/notification-manager";
import { displayUid } from "@/lib/uid";
import { compressImage } from "@/app/lib/compressImage";
import { normalizePhone } from "@/lib/auth-identifier";

type Tab = "home" | "markets" | "trade" | "orders" | "account";
type StackPage =
  | { id: "deposit-asset"; title: string }
  | { id: "deposit-network"; title: string }
  | { id: "deposit-address"; title: string }
  | { id: "withdraw-asset"; title: "Withdraw" }
  | { id: "withdraw-network"; title: "Select Network" }
  | { id: "withdraw-form"; title: string }
  | { id: "withdraw-detail"; title: "Withdrawal Details"; record: WithdrawalRecord }
  | { id: "deposit-history"; title: "Deposit History" }
  | { id: "withdraw-history"; title: "Withdraw History" }
  | { id: "funding-records"; title: "Funding Records" }
  | { id: "swap"; title: "Swap" }
  | { id: "security"; title: "Security Settings" }
  | { id: "kyc"; title: "KYC Verification" }
  | { id: "about"; title: "About" | "About KAIROX" }
  | { id: "terms"; title: "Terms of Service" }
  | { id: "privacy"; title: "Privacy Policy" }
  | { id: "support"; title: "Support" }
  | { id: "support-chat"; title: "Online Support" }
  | { id: "fiat-deposit"; title: "Fiat Deposit" }
  | { id: "asset-overview"; title: "Assets" };

type Market = { id: number; symbol: string; price: number; max_leverage?: number; is_active: number };
type User = { id?: number; public_uid?: string | null; email: string | null; balance: number; kyc_status?: "none" | "pending" | "approved" | "rejected"; kyc_rejected_reason?: string | null; created_at?: string };
type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "network-error" | "server-error";
type ApiBinaryOrder = { id: number; symbol: string; direction: "call" | "put"; stake: number; odds: number; risk_amount?: number | null; duration_seconds: number; entry_price: number; expires_at: string; status: "open" | "won" | "lost"; profit?: number | null };
type Summary = { user: User; markets: Market[]; orders?: ApiBinaryOrder[] };
type AssetRow = { asset: string; balance: number; locked: number; updated_at?: string; usdPrice?: number | null; usdValue?: number | null; lockedUsdValue?: number | null; totalUsdValue?: number | null };
type DepositRecord = { id: number; asset: string; network: string; amount: number; status: string; tx_hash?: string | null; note?: string | null; admin_note?: string | null; created_at: string; processed_at?: string | null };
type WithdrawalRecord = { id: number; asset: string; network?: string | null; amount: number; address?: string | null; status: string; note?: string | null; created_at: string; processed_at?: string | null };
type AssetTransaction = { id: number; asset: string; type: string; amount: number; status: string; note?: string | null; created_at: string };
type PublicSettings = { withdrawals_enabled: string; withdrawal_notice: string; whatsapp_support_url: string; whatsapp_url?: string; telegram_url?: string; min_withdrawal_amount?: string; min_withdrawal_usdc?: string; about_content?: string; terms_content?: string; privacy_content?: string; binary_options_config?: string };
type AssetData = {
  user: User;
  settings: PublicSettings;
  summary: { availableBalance: number; marginUsed: number; unrealizedPnl: number; totalEquity: number; valuationStatus?: "complete" | "partial"; valuationWarnings?: string[] };
  assets: AssetRow[];
  depositAddresses?: { asset: string; network: string; address: string; source: "default" | "custom" }[];
  deposits?: DepositRecord[];
  withdrawals?: WithdrawalRecord[];
  transactions?: AssetTransaction[];
};
type Tickers = Record<string, { price: number; change: number; source: string }>;
type Duration = { label: string; seconds: number; odds: number; lossRate: number };
type BinaryOrder = { id: number; symbol: string; direction: "call" | "put"; stake: number; riskAmount?: number; duration: Duration; entry: number; expiresAt: number; status: "open" | "win" | "loss"; profit?: number };

const tabPath = (tab: Tab, symbol = "BTC-PERP") => tab === "home" ? "/" : tab === "trade" ? `/trade/${symbol}` : `/${tab}`;
const routeStateFromPath = (pathname: string): { tab: Tab; symbol?: string } | null => {
  if (pathname === "/" || pathname === "/home") return { tab: "home" };
  if (pathname === "/markets") return { tab: "markets" };
  if (pathname === "/orders") return { tab: "orders" };
  if (pathname === "/account") return { tab: "account" };
  /* legacy URL compatibility */
  if (pathname === "/profile") return { tab: "account" };
  if (pathname === "/assets") return { tab: "home" };
  if (pathname === "/trade") return { tab: "trade" };
  if (pathname.startsWith("/trade/")) return { tab: "trade", symbol: decodeURIComponent(pathname.slice("/trade/".length)).toUpperCase() };
  return null;
};
const coins = ["USDC", "BTC", "ETH", "SOL"];
const coinSet = new Set(coins);
type CountryOption = { code: string; name: string; dialCode: string; flag: string };
const authCountries: CountryOption[] = [
  { code: "US", name: "United States", dialCode: "+1", flag: "🇺🇸" }, { code: "CA", name: "Canada", dialCode: "+1", flag: "🇨🇦" },
  { code: "GB", name: "United Kingdom", dialCode: "+44", flag: "🇬🇧" }, { code: "DE", name: "Germany", dialCode: "+49", flag: "🇩🇪" }, { code: "FR", name: "France", dialCode: "+33", flag: "🇫🇷" }, { code: "IT", name: "Italy", dialCode: "+39", flag: "🇮🇹" }, { code: "ES", name: "Spain", dialCode: "+34", flag: "🇪🇸" }, { code: "NL", name: "Netherlands", dialCode: "+31", flag: "🇳🇱" }, { code: "CH", name: "Switzerland", dialCode: "+41", flag: "🇨🇭" }, { code: "SE", name: "Sweden", dialCode: "+46", flag: "🇸🇪" }, { code: "NO", name: "Norway", dialCode: "+47", flag: "🇳🇴" }, { code: "DK", name: "Denmark", dialCode: "+45", flag: "🇩🇰" }, { code: "FI", name: "Finland", dialCode: "+358", flag: "🇫🇮" }, { code: "IE", name: "Ireland", dialCode: "+353", flag: "🇮🇪" }, { code: "AT", name: "Austria", dialCode: "+43", flag: "🇦🇹" }, { code: "BE", name: "Belgium", dialCode: "+32", flag: "🇧🇪" }, { code: "LU", name: "Luxembourg", dialCode: "+352", flag: "🇱🇺" },
  { code: "AU", name: "Australia", dialCode: "+61", flag: "🇦🇺" }, { code: "NZ", name: "New Zealand", dialCode: "+64", flag: "🇳🇿" }, { code: "JP", name: "Japan", dialCode: "+81", flag: "🇯🇵" }, { code: "KR", name: "South Korea", dialCode: "+82", flag: "🇰🇷" }, { code: "SG", name: "Singapore", dialCode: "+65", flag: "🇸🇬" }, { code: "HK", name: "Hong Kong", dialCode: "+852", flag: "🇭🇰" }, { code: "TW", name: "Taiwan", dialCode: "+886", flag: "🇹🇼" },
  { code: "AE", name: "United Arab Emirates", dialCode: "+971", flag: "🇦🇪" }, { code: "IL", name: "Israel", dialCode: "+972", flag: "🇮🇱" }, { code: "UZ", name: "Uzbekistan", dialCode: "+998", flag: "🇺🇿" }, { code: "MY", name: "Malaysia", dialCode: "+60", flag: "🇲🇾" }
];
const DEFAULT_AUTH_COUNTRY = "MY";
function readAuthCountryIso() {
  if (typeof window === "undefined") return DEFAULT_AUTH_COUNTRY;
  const stored = window.localStorage.getItem("kairox-auth-country");
  return authCountries.some((country) => country.code === stored) ? stored! : DEFAULT_AUTH_COUNTRY;
}
function writeAuthCountryIso(code: string) {
  if (typeof window !== "undefined") window.localStorage.setItem("kairox-auth-country", code);
}
const networks = ["TRC20", "ERC20"];
const defaultDurations: Duration[] = [
  { label: "30s", seconds: 30, odds: 0.3, lossRate: 0.31 },
  { label: "60s", seconds: 60, odds: 0.35, lossRate: 0.36 },
  { label: "180s", seconds: 180, odds: 0.45, lossRate: 0.46 },
  { label: "300s", seconds: 300, odds: 0.55, lossRate: 0.56 }
];
const dataPollMs = 12_000;
const requestTimeoutMs = 15_000;
const supportedProofTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

class RequestTimeoutError extends Error {
  constructor() {
    super("Request timed out");
    this.name = "RequestTimeoutError";
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = requestTimeoutMs, requestController?: AbortController): Promise<Response> {
  const controller = requestController || new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new RequestTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function responseErrorMessage(response: Response, fallback: string) {
  try {
    const data = await response.json() as { error?: unknown };
    return typeof data.error === "string" && data.error.trim() ? data.error : fallback;
  } catch {
    return fallback;
  }
}

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
  const addNullable = (left?: number | null, right?: number | null) => (
    left == null || right == null ? null : Number(left || 0) + Number(right || 0)
  );
  for (const item of rows) {
    const key = displayAsset(item.asset);
    if (!coinSet.has(key)) continue;
    const existing = map.get(key);
    if (existing) {
      existing.balance += Number(item.balance || 0);
      existing.locked += Number(item.locked || 0);
      existing.usdValue = addNullable(existing.usdValue, item.usdValue);
      existing.lockedUsdValue = addNullable(existing.lockedUsdValue, item.lockedUsdValue);
      existing.totalUsdValue = addNullable(existing.totalUsdValue, item.totalUsdValue);
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

export function FluxMobileApp({ initialTab = "home", initialAuthMode = "login", initialSymbol = "BTC-PERP" }: { initialTab?: Tab; initialAuthMode?: "login" | "register"; initialSymbol?: string }) {
  const router = useRouter();
  const [authMode, setAuthMode] = useState(initialAuthMode);
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [stack, setStack] = useState<StackPage[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [tickers, setTickers] = useState<Tickers>({});
  const [assets, setAssets] = useState<AssetData | null>(null);
  const [currentSymbol, setCurrentSymbol] = useState(initialSymbol);
  const currentSymbolRef = useRef(currentSymbol);
  currentSymbolRef.current = currentSymbol;
  const [marketSort, setMarketSort] = useState<"hot" | "gainers" | "losers">("hot");
  const [marketQuery, setMarketQuery] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(() => readFavoritesStorage());
  const toggleFavorite = (symbol: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      writeFavoritesStorage(next);
      return next;
    });
  };
  const [selectedCoin, setSelectedCoin] = useState("USDC");
  const [selectedNetwork, setSelectedNetwork] = useState("TRC20");
  const [orders, setOrders] = useState<BinaryOrder[]>([]);
  const [orderSheet, setOrderSheet] = useState<"call" | "put" | null>(null);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<number | null>(null);
  const [sheetMinimized, setSheetMinimized] = useState(false);
  const [stake, setStake] = useState(50);
  const [durationOptions, setDurationOptions] = useState<Duration[]>(defaultDurations);
  const [duration, setDuration] = useState(defaultDurations[0]);
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState<{ type: "ok" | "err" | "info"; text: string } | null>(null);
  const [notifications, setNotifications] = useState<ClientNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [support, setSupport] = useState({ telegram: "", whatsapp: "" });
  const [publicSettings, setPublicSettings] = useState<Partial<PublicSettings>>({});
  const [withdrawForm, setWithdrawForm] = useState({ address: "", amount: "10", password: "" });
  const [swap, setSwap] = useState({ from: "USDC", to: "BTC", amount: "100" });
  const [kycStatus, setKycStatus] = useState<"none" | "pending" | "approved" | "rejected">("none");
  const [expandedSecurity, setExpandedSecurity] = useState<"login" | "withdraw" | null>("login");
  const [authCountryIso, setAuthCountryIso] = useState(readAuthCountryIso);
  const initialAuthCountry = authCountries.find((country) => country.code === authCountryIso) || authCountries.find((country) => country.code === DEFAULT_AUTH_COUNTRY)!;
  const [authForm, setAuthForm] = useState({ email: "", phone: "", countryCode: initialAuthCountry.dialCode, password: "", confirmPassword: "", name: "", withdrawPassword: "", confirmWithdrawPassword: "", invite: "" });
  const [authError, setAuthError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"email" | "phone" | "countryCode" | "password" | "confirmPassword" | "withdrawPassword" | "confirmWithdrawPassword", string>>>({});
  const [pwVisible, setPwVisible] = useState<Record<string, boolean>>({});
  const [registerStep, setRegisterStep] = useState<1 | 2>(1);
  const [registerIdentifierType, setRegisterIdentifierType] = useState<"email" | "phone">("email");
  const [loginIdentifierType, setLoginIdentifierType] = useState<"email" | "phone">("email");
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotFieldErrors, setForgotFieldErrors] = useState<{ email?: string; code?: string; newPassword?: string; confirmPassword?: string }>({});
  const [forgotCodeSending, setForgotCodeSending] = useState(false);
  const [forgotCodeSent, setForgotCodeSent] = useState(false);
  const [forgotCodeCountdown, setForgotCodeCountdown] = useState(0);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotPwVisible, setForgotPwVisible] = useState<{ pw: boolean; confirm: boolean }>({ pw: false, confirm: false });
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const loadingRef = useRef(false);
  const authGenRef = useRef(0);
  const authControllerRef = useRef<AbortController | null>(null);
  const signedOutRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toastPortalReady, setToastPortalReady] = useState(false);

  useEffect(() => {
    setToastPortalReady(true);
  }, []);

  useEffect(() => {
    if (!user?.id) { setNotifications([]); return; }
    fetch("/api/notifications", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((d) => {
      if (Array.isArray(d?.notifications)) setNotifications(d.notifications);
    }).catch(() => {});
    const unsubscribe = notificationManager.subscribe((notification) => {
      setNotifications((prev) => [notification, ...prev.filter((item) => item.id !== notification.id)].slice(0, 50));
      showToast("info", notification.title);
    });
    return () => { unsubscribe(); };
  }, [user?.id]);

  async function markNotificationRead(id: number) {
    setNotifications((prev) => prev.map((item) => item.id === id ? { ...item, readAt: item.readAt || new Date().toISOString() } : item));
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
  }

  async function markAllNotificationsRead() {
    setNotifications((prev) => prev.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }).catch(() => {});
  }

  function applyPublicSettings(settings: Partial<PublicSettings> = {}) {
    setSupport({ telegram: settings.telegram_url?.trim() || "", whatsapp: (settings.whatsapp_support_url || settings.whatsapp_url || "").trim() });
    setPublicSettings(settings);
    const nextDurations = binaryDurationsFromSettings(settings.binary_options_config);
    setDurationOptions(nextDurations);
    setDuration((current) => nextDurations.find((item) => item.seconds === current.seconds) || nextDurations[0]);
  }

  const activeStack = stack[stack.length - 1];
  const currentMarket = useMemo(() => markets.find((m) => m.symbol === currentSymbol) || markets[0], [markets, currentSymbol]);
  const openOrders = useMemo(() => orders.filter((order) => order.status === "open"), [orders]);
  const history = useMemo(() => orders.filter((order) => order.status !== "open"), [orders]);
  const activeOrder = useMemo(() => (activeOrderId != null ? orders.find((o) => o.id === activeOrderId) || null : null), [activeOrderId, orders]);

  useEffect(() => {
    if (!activeOrder) return;
    if (activeOrder.status !== "open" && sheetMinimized) setSheetMinimized(false);
  }, [activeOrder, sheetMinimized]);

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
    if (signedOutRef.current) return;
    authControllerRef.current?.abort();
    const controller = new AbortController();
    authControllerRef.current = controller;
    loadingRef.current = true;
    const gen = ++authGenRef.current;
    try {
      const summaryRes = await fetchWithTimeout("/api/trade/summary", { cache: "no-store" }, requestTimeoutMs, controller);
      if (authGenRef.current !== gen) return; // stale — logout or newer load started
      if (summaryRes.status === 401) {
        setUser(null);
        setAuthStatus("unauthenticated");
        return;
      }
      if (!summaryRes.ok) {
        setAuthStatus("server-error");
        return;
      }
      const summary = (await summaryRes.json()) as Summary;
      if (authGenRef.current !== gen) return; // stale after parse
      if (!summary || typeof summary !== "object" || !summary.user) {
        setAuthStatus("server-error");
        return;
      }
      setUser(summary.user);
      setKycStatus(summary.user.kyc_status || "none");
      setMarkets(summary.markets || []);
      const summaryOrders = summary.orders || [];
      setOrders(summaryOrders.map(mapApiOrder));
      if (!summary.markets.find((m) => m.symbol === currentSymbolRef.current) && summary.markets[0]) setCurrentSymbol(summary.markets[0].symbol);
      setAuthStatus("authenticated");
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
    } catch (error) {
      if (authGenRef.current !== gen) return;
      if (controller.signal.aborted && !(error instanceof RequestTimeoutError)) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      setAuthStatus(error instanceof SyntaxError ? "server-error" : "network-error");
    } finally {
      if (authGenRef.current === gen) {
        loadingRef.current = false;
        if (authControllerRef.current === controller) authControllerRef.current = null;
      }
    }
  }

  function retryAuth() {
    if (loadingRef.current) return;
    setAuthStatus("loading");
    void load();
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
    const handleNotificationEvent = (payload?: unknown) => {
      const notification = (payload && typeof payload === "object" ? (payload as { notification?: ClientNotification }).notification : null);
      if (notification) notificationManager.receive(notification);
    };
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
        socket.on("notification:event", handleNotificationEvent);
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
        socket.off("notification:event", handleNotificationEvent);
        socket.off("deposit-addresses:update", reload);
        socket.disconnect();
      }
    };
  }, [user?.id]);

  function showToast(type: "ok" | "err" | "info", text: string) {
    setToast({ type, text });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null;
      setToast(null);
    }, 2400);
  }

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

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

  function validateAuth(stage: "login-password" | "register-1" | "register-2") {
    const errs: typeof fieldErrors = {};
    if (stage === "login-password" || stage === "register-1") {
      if (stage === "login-password") {
        if (loginIdentifierType === "email") {
          const email = authForm.email.trim();
          if (!email) errs.email = "Email is required";
          else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Invalid email format";
        } else {
          if (!authForm.countryCode.trim()) errs.countryCode = "Country / Region is required";
          if (!authForm.phone.trim()) errs.phone = "Phone number is required";
          else { try { normalizePhone(authForm.phone, authForm.countryCode); } catch (error) { errs.phone = error instanceof Error ? error.message : "Enter a valid phone number"; } }
        }
      } else if (registerIdentifierType === "email") {
        const email = authForm.email.trim();
        if (!email) errs.email = "Email is required";
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Invalid email format";
      } else {
        if (!authForm.countryCode.trim()) errs.countryCode = "Country code is required";
        if (!authForm.phone.trim()) errs.phone = "Phone number is required";
        else {
          try { normalizePhone(authForm.phone, authForm.countryCode); } catch (error) { errs.phone = error instanceof Error ? error.message : "Enter a valid phone number"; }
        }
      }
      if (!authForm.password) errs.password = "Password is required";
      else if (authForm.password.length < 6) errs.password = "Password must be at least 6 characters";
    }
    if (stage === "register-1") {
      if (!authForm.confirmPassword) errs.confirmPassword = "Please confirm your password";
      else if (authForm.password !== authForm.confirmPassword) errs.confirmPassword = "Passwords do not match";
    }
    if (stage === "register-2") {
      if (!authForm.withdrawPassword) errs.withdrawPassword = "Withdrawal password is required";
      else if (authForm.withdrawPassword.length < 6) errs.withdrawPassword = "Must be at least 6 characters";
      if (!authForm.confirmWithdrawPassword) errs.confirmWithdrawPassword = "Please confirm withdrawal password";
      else if (authForm.withdrawPassword !== authForm.confirmWithdrawPassword) errs.confirmWithdrawPassword = "Passwords do not match";
    }
    return errs;
  }

  function goNextRegisterStep() {
    setAuthError("");
    const errs = validateAuth("register-1");
    setFieldErrors(errs);
    if (Object.keys(errs).length) return setAuthError("Please check the highlighted fields.");
    setRegisterStep(2);
  }

  function goPrevRegisterStep() {
    setAuthError("");
    setFieldErrors({});
    setRegisterStep(1);
  }

  async function login() {
    setAuthError("");
    const errs = validateAuth("login-password");
    setFieldErrors(errs);
    if (Object.keys(errs).length) return setAuthError("Please check the highlighted fields.");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: loginIdentifierType === "email" ? authForm.email.trim().toLowerCase() : normalizePhone(authForm.phone, authForm.countryCode), password: authForm.password })
    });
    if (!res.ok) {
      const message = (await res.json()).error || "Invalid email/phone number or password";
      setFieldErrors({ email: " ", password: message });
      return setAuthError(message);
    }
    signedOutRef.current = false;
    await load();
    router.push("/markets");
    setTab("markets");
  }

  async function register() {
    setAuthError("");
    const errs = validateAuth("register-2");
    setFieldErrors(errs);
    if (Object.keys(errs).length) return setAuthError("Please check the highlighted fields.");
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifierType: registerIdentifierType,
        email: registerIdentifierType === "email" ? authForm.email : undefined,
        phone: registerIdentifierType === "phone" ? authForm.phone : undefined,
        countryCode: registerIdentifierType === "phone" ? authForm.countryCode : undefined,
        password: authForm.password,
        confirmPassword: authForm.confirmPassword,
        withdrawalPassword: authForm.withdrawPassword,
        confirmWithdrawalPassword: authForm.confirmWithdrawPassword,
        nickname: authForm.name,
        inviteCode: authForm.invite,
        referralCode: authForm.invite
      })
    });
    if (!res.ok) {
      const message = (await res.json()).error || "Registration failed";
      const next: typeof fieldErrors = {};
      if (/email/i.test(message)) { next.email = message; setRegisterStep(1); }
      else if (/withdrawal/i.test(message)) next.withdrawPassword = message;
      else if (/password/i.test(message)) { next.password = message; setRegisterStep(1); }
      setFieldErrors(next);
      return setAuthError(message);
    }
    signedOutRef.current = false;
    await load();
    setTab("markets");
    router.push("/markets");
  }

  async function sendResetCode() {
    setForgotError("");
    setForgotFieldErrors({});
    const email = forgotEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setForgotFieldErrors({ email: "Enter a valid email address" });
      return;
    }
    setForgotCodeSending(true);
    try {
      const res = await fetch("/api/auth/send-reset-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      if (!res.ok) {
        const data = await res.json();
        return setForgotError(data.error || "Failed to send code");
      }
      setForgotCodeSent(true);
      setForgotCodeCountdown(60);
      const timer = setInterval(() => {
        setForgotCodeCountdown((prev) => {
          if (prev <= 1) { clearInterval(timer); return 0; }
          return prev - 1;
        });
      }, 1000);
      // Auto-advance to step 2
      setForgotStep(2);
      // Always show the uniform message
      setForgotError("");
    } finally {
      setForgotCodeSending(false);
    }
  }

  function goForgotStep2() {
    setForgotError("");
    const errs: typeof forgotFieldErrors = {};
    if (!forgotCode || forgotCode.length !== 6) errs.code = "Enter the 6-digit verification code";
    if (!forgotNewPassword) errs.newPassword = "New password is required";
    else if (forgotNewPassword.length < 6) errs.newPassword = "Password must be at least 6 characters";
    if (!forgotConfirmPassword) errs.confirmPassword = "Confirm your password";
    else if (forgotNewPassword !== forgotConfirmPassword) errs.confirmPassword = "Passwords do not match";
    setForgotFieldErrors(errs);
    if (Object.keys(errs).length) return setForgotError("Please check the highlighted fields.");
    resetPassword();
  }

  async function resetPassword() {
    setForgotError("");
    setForgotFieldErrors({});
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: forgotEmail,
        code: forgotCode,
        newPassword: forgotNewPassword,
        confirmPassword: forgotConfirmPassword
      })
    });
    if (!res.ok) {
      const message = (await res.json()).error || "Password reset failed";
      if (/code/i.test(message)) setForgotFieldErrors({ code: message });
      else if (/password/i.test(message)) setForgotFieldErrors({ newPassword: message });
      else if (/match/i.test(message)) setForgotFieldErrors({ confirmPassword: message });
      return setForgotError(message);
    }
    setForgotSuccess(true);
  }

  function exitForgotPassword() {
    setForgotPasswordMode(false);
    setForgotStep(1);
    setForgotEmail("");
    setForgotCode("");
    setForgotNewPassword("");
    setForgotConfirmPassword("");
    setForgotError("");
    setForgotFieldErrors({});
    setForgotCodeSending(false);
    setForgotCodeSent(false);
    setForgotCodeCountdown(0);
    setForgotSuccess(false);
    setForgotPwVisible({ pw: false, confirm: false });
  }

  async function logout() {
    signedOutRef.current = true;
    authControllerRef.current?.abort();
    authControllerRef.current = null;
    authGenRef.current += 1; // invalidate all in-flight loads
    loadingRef.current = false;
    setUser(null);
    setAuthStatus("unauthenticated");
    setStack([]);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
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
      setActiveOrderId(order.id);
      setSheetMinimized(false);
      setOrderSheet(direction);
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

  if (authStatus === "loading") return <BootScreen />;
  if (authStatus === "network-error" || authStatus === "server-error") return <AuthStatusScreen status={authStatus} retry={retryAuth} />;
  if (forgotPasswordMode) return (
    <ForgotPasswordScreen
      step={forgotStep}
      email={forgotEmail}
      setEmail={setForgotEmail}
      code={forgotCode}
      setCode={setForgotCode}
      newPassword={forgotNewPassword}
      setNewPassword={setForgotNewPassword}
      confirmPassword={forgotConfirmPassword}
      setConfirmPassword={setForgotConfirmPassword}
      error={forgotError}
      fieldErrors={forgotFieldErrors}
      clearFieldError={(k) => setForgotFieldErrors((prev) => { if (!prev[k]) return prev; const out = { ...prev }; delete out[k]; return out; })}
      codeSending={forgotCodeSending}
      codeSent={forgotCodeSent}
      codeCountdown={forgotCodeCountdown}
      sendCode={sendResetCode}
      goStep2={goForgotStep2}
      success={forgotSuccess}
      onBack={() => exitForgotPassword()}
      pwVisible={forgotPwVisible}
      togglePw={(k) => setForgotPwVisible((p) => ({ ...p, [k]: !p[k] }))}
      support={support}
    />
  );
  if (authStatus === "unauthenticated" || !user) return <AuthScreen mode={authMode} setMode={(m) => { setAuthMode(m); setAuthError(""); setFieldErrors({}); setRegisterStep(1); }} form={authForm} setForm={(next) => { setAuthForm(next); }} fieldErrors={fieldErrors} clearFieldError={(k) => setFieldErrors((prev) => { if (!prev[k]) return prev; const out = { ...prev }; delete out[k]; return out; })} pwVisible={pwVisible} togglePw={(k) => setPwVisible((p) => ({ ...p, [k]: !p[k] }))} error={authError} login={login} register={register} registerStep={registerStep} goNextStep={goNextRegisterStep} goPrevStep={goPrevRegisterStep} support={support} registerIdentifierType={registerIdentifierType} setRegisterIdentifierType={(m) => { setRegisterIdentifierType(m); setAuthError(""); setFieldErrors({}); }} loginIdentifierType={loginIdentifierType} setLoginIdentifierType={(m) => { setLoginIdentifierType(m); setAuthError(""); setFieldErrors({}); }} authCountryIso={authCountryIso} setAuthCountryIso={(code) => { setAuthCountryIso(code); writeAuthCountryIso(code); }} onForgotPassword={() => loginIdentifierType === "phone" ? setAuthError("Phone-only accounts without a linked email must contact support to recover access.") : setForgotPasswordMode(true)} />;

  return (
    <main className={`mobile-shell${activeStack?.id === "support-chat" ? " support-chat-shell" : ""}`}>
      {toastPortalReady && toast ? createPortal(
        <div className="mobile-toast-wrap" role="status" aria-live={toast.type === "err" ? "assertive" : "polite"}>
          <div className={toast.type === "ok" ? "mobile-toast ok" : "mobile-toast " + toast.type}>
            {toast.type === "ok" && <CheckCircle2 size={16} strokeWidth={2.2} aria-hidden="true" />}
            <span>{toast.text}</span>
          </div>
        </div>,
        document.body
      ) : null}
      <MobileHeader activeStack={activeStack} pop={pop} currentMarket={currentMarket} tickers={tickers} support={support} activeTab={tab} goTab={switchTab} showToast={showToast} notifications={notifications} notificationsOpen={notificationsOpen} setNotificationsOpen={setNotificationsOpen} markNotificationRead={markNotificationRead} markAllNotificationsRead={markAllNotificationsRead} />
      <section className={`mobile-scroll${activeStack?.id === "support-chat" ? " support-chat-content" : ""}`}>
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
            refreshData={load}
          />
        ) : (
          <>
            {tab === "home" && <HomeTab rows={filteredMarkets} tickers={tickers} query={marketQuery} setQuery={setMarketQuery} sort={marketSort} setSort={setMarketSort} onSelect={(symbol) => { setCurrentSymbol(symbol); setTab("trade"); clearStack(); pushMobileUrl(tabPath("trade", symbol)); }} goTab={switchTab} push={push} kycStatus={kycStatus} totalEquity={assets?.summary.totalEquity ?? 0} availableBalance={assets?.summary.availableBalance ?? user.balance} pnl={assets?.summary.unrealizedPnl ?? 0} favorites={favorites} toggleFavorite={toggleFavorite} />}
            {tab === "markets" && <MarketsListTab rows={markets} tickers={tickers} query={marketQuery} setQuery={setMarketQuery} onSelect={(symbol) => { setCurrentSymbol(symbol); setTab("trade"); clearStack(); pushMobileUrl(tabPath("trade", symbol)); }} />}
            {tab === "trade" && currentMarket && <TradeTab market={currentMarket} tickers={tickers} setCurrentSymbol={(symbol) => { setCurrentSymbol(symbol); pushMobileUrl(tabPath("trade", symbol)); }} markets={markets} openSheet={(d) => { setActiveOrderId(null); setSheetMinimized(false); setOrderSheet(d); }} stake={stake} setStake={setStake} duration={duration} durations={durationOptions} setDuration={setDuration} availableBalance={assets?.summary.availableBalance ?? user.balance} favorites={favorites} toggleFavorite={toggleFavorite} />}
            {tab === "orders" && <OrdersTab openOrders={openOrders} history={history} now={now} onOpenRunningOrder={(order) => { setActiveOrderId(order.id); setOrderSheet(order.direction); setSheetMinimized(false); setTab("trade"); }} />}
            {tab === "account" && <AccountTab user={user} kycStatus={kycStatus} push={push} logout={logout} />}
          </>
        )}
      </section>
      {!activeStack && <BottomNav tab={tab} setTab={switchTab} />}
      {orderSheet && currentMarket && !sheetMinimized && (
        <TradeSheet
          mode={activeOrder ? (activeOrder.status === "open" ? "running" : "settled") : "place"}
          direction={orderSheet}
          setDirection={setOrderSheet}
          market={currentMarket}
          price={tickers[currentMarket.symbol]?.price || currentMarket.price}
          change={tickers[currentMarket.symbol]?.change || 0}
          availableBalance={assets?.summary.availableBalance ?? user.balance}
          stake={stake}
          setStake={setStake}
          duration={duration}
          durations={durationOptions}
          setDuration={setDuration}
          activeOrder={activeOrder}
          now={now}
          close={() => { if (placingOrder) return; setOrderSheet(null); setActiveOrderId(null); }}
          minimize={() => setSheetMinimized(true)}
          tradeAgain={() => { setActiveOrderId(null); }}
          submit={() => orderSheet && placeOrder(orderSheet)}
          submitting={placingOrder}
        />
      )}
    </main>
  );
}

type AuthFieldKey = "email" | "phone" | "countryCode" | "password" | "confirmPassword" | "withdrawPassword" | "confirmWithdrawPassword";

function AuthField({ id, label, type, value, onChange, icon, error, optional, placeholder, autoComplete, inputMode, autoCorrect, spellCheck, canToggle, visible, onToggleVisible, right }: {
  id: string;
  label: string;
  type: "text" | "email" | "password" | "tel";
  value: string;
  onChange: (v: string) => void;
  icon: React.ReactNode;
  error?: string;
  optional?: boolean;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoCorrect?: string;
  spellCheck?: boolean;
  canToggle?: boolean;
  visible?: boolean;
  onToggleVisible?: () => void;
  right?: React.ReactNode;
}) {
  const effectiveType = canToggle ? (visible ? "text" : "password") : type;
  const hasError = !!error && error.trim().length > 0;
  return (
    <div className={`auth-field${hasError ? " has-error" : ""}`}>
      <div className="auth-field-label"><span>{label}</span>{optional && <em>(Optional)</em>}</div>
      <div className={`auth-input-wrap${hasError ? " error" : ""}`}>
        <span className="auth-input-icon" aria-hidden="true">{icon}</span>
        <input id={id} name={id} type={effectiveType} inputMode={inputMode} autoCorrect={autoCorrect} spellCheck={spellCheck} autoComplete={autoComplete} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
        {canToggle && (
          <button type="button" className="auth-input-eye" aria-label={visible ? "Hide password" : "Show password"} onClick={onToggleVisible}>
            <Eye size={18} style={{ opacity: visible ? 1 : 0.55 }} />
          </button>
        )}
        {hasError && !canToggle && <span className="auth-input-error-icon" aria-hidden="true">✕</span>}
      </div>
      {right && <div style={{ marginTop: 8 }}>{right}</div>}
      {hasError && <p className="auth-field-error">{error}</p>}
    </div>
  );
}

function AuthScreen({ mode, setMode, form, setForm, fieldErrors, clearFieldError, pwVisible, togglePw, error, login, register, registerStep, goNextStep, goPrevStep, support, registerIdentifierType, setRegisterIdentifierType, loginIdentifierType, setLoginIdentifierType, authCountryIso, setAuthCountryIso, onForgotPassword }: {
  mode: "login" | "register";
  setMode: (mode: "login" | "register") => void;
  form: { email: string; phone: string; countryCode: string; password: string; confirmPassword: string; name: string; withdrawPassword: string; confirmWithdrawPassword: string; invite: string };
  setForm: (form: { email: string; phone: string; countryCode: string; password: string; confirmPassword: string; name: string; withdrawPassword: string; confirmWithdrawPassword: string; invite: string }) => void;
  fieldErrors: Partial<Record<AuthFieldKey, string>>;
  clearFieldError: (k: AuthFieldKey) => void;
  pwVisible: Record<string, boolean>;
  togglePw: (k: string) => void;
  error: string;
  login: () => void;
  register: () => void;
  registerStep: 1 | 2;
  goNextStep: () => void;
  goPrevStep: () => void;
  support: { telegram: string; whatsapp: string };
  registerIdentifierType: "email" | "phone";
  setRegisterIdentifierType: (m: "email" | "phone") => void;
  loginIdentifierType: "email" | "phone";
  setLoginIdentifierType: (m: "email" | "phone") => void;
  authCountryIso: string;
  setAuthCountryIso: (code: string) => void;
  onForgotPassword: () => void;
}) {
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const activeIdentifierType = mode === "login" ? loginIdentifierType : registerIdentifierType;
  const selectedCountry = authCountries.find((country) => country.code === authCountryIso) || authCountries.find((country) => country.code === DEFAULT_AUTH_COUNTRY)!;
  const filteredCountries = authCountries.filter((country) => `${country.name} ${country.code} ${country.dialCode}`.toLowerCase().includes(countrySearch.trim().toLowerCase()));
  const changeIdentifierType = (next: "email" | "phone") => {
    if (mode === "login") setLoginIdentifierType(next); else setRegisterIdentifierType(next);
    const nextCountry = authCountries.find((country) => country.code === authCountryIso) || authCountries.find((country) => country.code === DEFAULT_AUTH_COUNTRY)!;
    setForm({ ...form, email: "", phone: "", countryCode: next === "phone" ? nextCountry.dialCode : form.countryCode });
    clearFieldError("email"); clearFieldError("phone"); clearFieldError("countryCode");
  };
  const updateField = <K extends keyof typeof form>(key: K, value: typeof form[K], errKey?: AuthFieldKey) => {
    setForm({ ...form, [key]: value });
    if (errKey) clearFieldError(errKey);
  };
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "login") return login();
    if (registerStep === 1) return goNextStep();
    return register();
  };
  const title = mode === "login"
    ? { h: "Welcome back", p: "Login to continue trading" }
    : registerStep === 1
      ? { h: "Create Account", p: "Set up your account to start trading" }
      : { h: "Security Setup", p: "Protect your future withdrawals" };
  return (
    <main className="mobile-shell auth-only">
      <section className="auth-center">
        <BrandLogo variant="auth-full" />
        <div className="auth-headline">
          <h1>{title.h}</h1>
          <p>{title.p}</p>
          {mode === "register" && (
            <div className="auth-steps" aria-hidden="true">
              <span className={registerStep === 1 ? "on" : ""} />
              <span className={registerStep === 2 ? "on" : ""} />
            </div>
          )}
        </div>
        <form className="auth-card" onSubmit={onSubmit}>
          {error && <div className="auth-alert" role="alert"><span className="auth-alert-icon" aria-hidden="true">!</span><span>{error}</span></div>}
          {((mode === "register" && registerStep === 1) || mode === "login") && (
            <div className="auth-method-tabs" aria-label={mode === "login" ? "Sign-in method" : "Registration method"}>
              <button type="button" className={`auth-method-tab${activeIdentifierType === "email" ? " active" : ""}`} onClick={() => changeIdentifierType("email")}>Email</button>
              <button type="button" className={`auth-method-tab${activeIdentifierType === "phone" ? " active" : ""}`} onClick={() => changeIdentifierType("phone")}>Phone</button>
            </div>
          )}
          {(mode === "login" || (mode === "register" && registerStep === 1)) && (
            activeIdentifierType === "email" ? <AuthField id="auth-email" label="Email address" type="email" value={form.email} onChange={(v) => updateField("email", v, "email")} icon={<Mail size={18} />} error={fieldErrors.email} placeholder="Enter your email" autoComplete="username" /> : (
              <div className="auth-phone-row">
                <button type="button" aria-label={`Country / Region ${selectedCountry.name} ${form.countryCode || selectedCountry.dialCode}`} className={`auth-country-trigger${fieldErrors.countryCode ? " error" : ""}`} onClick={() => { setCountryPickerOpen(true); setCountrySearch(""); }}><span>{selectedCountry.flag}</span><span>{form.countryCode || selectedCountry.dialCode}</span><ChevronRight size={15} /></button>
                <AuthField id="auth-phone" label="Phone number" type="tel" inputMode="tel" autoCorrect="off" spellCheck={false} value={form.phone} onChange={(v) => updateField("phone", v, "phone")} icon={<Mail size={18} />} error={fieldErrors.phone} placeholder="Enter your phone number" autoComplete="tel" />
              </div>
            )
          )}
          {mode === "register" && registerStep === 1 && (
            <AuthField
              id="auth-nickname"
              label="Nickname"
              type="text"
              optional
              value={form.name}
              onChange={(v) => updateField("name", v)}
              icon={<UserIcon size={18} />}
              placeholder="Enter your nickname"
            />
          )}
          {(mode === "login" || (mode === "register" && registerStep === 1)) ? (
            <div className={`auth-field${fieldErrors.password ? " has-error" : ""}`}>
              <div className="auth-field-label">
                <label htmlFor="auth-password">Password</label>
                {mode === "login" && (
                  <button type="button" className="forgot-link" onClick={onForgotPassword}>Forgot password? <span aria-hidden="true">→</span></button>
                )}
              </div>
              <div className={`auth-input-wrap${fieldErrors.password ? " error" : ""}`}>
                <span className="auth-input-icon" aria-hidden="true"><LockKeyhole size={18} /></span>
                <input id="auth-password" name="password" type={pwVisible.password ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Enter your password" value={form.password} onChange={(e) => updateField("password", e.target.value, "password")} />
                <button type="button" className="auth-input-eye" aria-label={pwVisible.password ? "Hide password" : "Show password"} onClick={() => togglePw("password")}><Eye size={18} style={{ opacity: pwVisible.password ? 1 : 0.55 }} /></button>
              </div>
              {fieldErrors.password && <p className="auth-field-error">{fieldErrors.password}</p>}
            </div>
          ) : null}
          {mode === "register" && registerStep === 1 && (
            <AuthField
              id="auth-confirm-password"
              label="Confirm Password"
              type="password"
              value={form.confirmPassword}
              onChange={(v) => updateField("confirmPassword", v, "confirmPassword")}
              icon={<LockKeyhole size={18} />}
              error={fieldErrors.confirmPassword}
              placeholder="Confirm your password"
              autoComplete="new-password"
              canToggle
              visible={pwVisible.confirmPassword}
              onToggleVisible={() => togglePw("confirmPassword")}
            />
          )}
          {mode === "register" && registerStep === 2 && (
            <AuthField
              id="auth-withdraw-password"
              label="Withdrawal Password"
              type="password"
              value={form.withdrawPassword}
              onChange={(v) => updateField("withdrawPassword", v, "withdrawPassword")}
              icon={<ShieldCheck size={18} />}
              error={fieldErrors.withdrawPassword}
              placeholder="Enter withdrawal password"
              autoComplete="new-password"
              canToggle
              visible={pwVisible.withdrawPassword}
              onToggleVisible={() => togglePw("withdrawPassword")}
            />
          )}
          {mode === "register" && registerStep === 2 && (
            <AuthField
              id="auth-confirm-withdraw-password"
              label="Confirm Withdrawal Password"
              type="password"
              value={form.confirmWithdrawPassword}
              onChange={(v) => updateField("confirmWithdrawPassword", v, "confirmWithdrawPassword")}
              icon={<ShieldCheck size={18} />}
              error={fieldErrors.confirmWithdrawPassword}
              placeholder="Confirm withdrawal password"
              autoComplete="new-password"
              canToggle
              visible={pwVisible.confirmWithdrawPassword}
              onToggleVisible={() => togglePw("confirmWithdrawPassword")}
            />
          )}
          {mode === "register" && registerStep === 2 && (
            <AuthField
              id="auth-invite"
              label="Referral Code"
              type="text"
              optional
              value={form.invite}
              onChange={(v) => updateField("invite", v)}
              icon={<Gem size={18} />}
              placeholder="Enter invite code"
            />
          )}
          <button type="submit" className="mobile-primary auth-submit">
            {mode === "login" ? "Login" : registerStep === 1 ? "Continue" : "Create Account"}
          </button>
          {mode === "register" && registerStep === 2 && (
            <button type="button" className="link-button auth-back" onClick={goPrevStep}>← Back to Account Info</button>
          )}
          {!(mode === "register" && registerStep === 2) && (
            <button type="button" className="link-button auth-switch" onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? <>No account? <em>Create Account</em></> : <>Have an account? <em>Login</em></>}</button>
          )}
        </form>
        {countryPickerOpen && (
          <div className="auth-country-backdrop" role="presentation" onClick={() => setCountryPickerOpen(false)}>
            <section className="auth-country-sheet" role="dialog" aria-label="Choose country or region" onClick={(event) => event.stopPropagation()}>
              <div className="auth-country-sheet-head"><h2>Choose country or region</h2><button type="button" onClick={() => setCountryPickerOpen(false)} aria-label="Close">×</button></div>
              <input className="auth-country-search" value={countrySearch} onChange={(event) => setCountrySearch(event.target.value)} placeholder="Search country or code" aria-label="Search country or calling code" autoComplete="off" />
              <div className="auth-country-list">{filteredCountries.map((country) => <button type="button" className="auth-country-option" key={country.code} onClick={() => { setAuthCountryIso(country.code); writeAuthCountryIso(country.code); setForm({ ...form, countryCode: country.dialCode }); clearFieldError("countryCode"); setCountryPickerOpen(false); }}><span className="auth-country-flag">{country.flag}</span><span className="auth-country-name">{country.name}</span><span className="auth-country-iso">{country.code}</span><span>{country.dialCode}</span>{selectedCountry.code === country.code && form.countryCode === country.dialCode && <span aria-label="Selected">✓</span>}</button>)}</div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

function BootScreen() {
  const [visible, setVisible] = useState(true);
  const mountedAt = useRef(Date.now());

  // Fade-out when parent switches away from loading
  useEffect(() => {
    const elapsed = Date.now() - mountedAt.current;
    const minDisplay = 280; // ms — prevent flash
    const remaining = Math.max(0, minDisplay - elapsed);
    const timer = setTimeout(() => setVisible(false), remaining);
    return () => clearTimeout(timer);
  }, []);

  return (
    <main className="mobile-shell auth-only">
      <section className={`auth-center boot-center boot-splash${visible ? "" : " boot-fade-out"}`}>
        <img className="landing-logo" src="/brand/kairox-main.png" alt="KAIROX" />
        <div className="boot-dots" aria-label="Loading">
          <span className="boot-dot" />
          <span className="boot-dot" />
          <span className="boot-dot" />
        </div>
      </section>
    </main>
  );
}

function AuthStatusScreen({ status, retry }: { status: "network-error" | "server-error"; retry: () => void }) {
  const networkError = status === "network-error";
  return (
    <main className="mobile-shell auth-only">
      <section className="auth-center boot-center">
        <BrandLogo variant="auth" />
        <div className="auth-card" role="alert">
          <h1>{networkError ? "Unable to connect" : "Service temporarily unavailable"}</h1>
          <p>{networkError ? "Check your connection and try again." : "Please try again shortly."}</p>
          <button type="button" className="mobile-primary auth-submit" onClick={retry}>Retry</button>
        </div>
      </section>
    </main>
  );
}

function ForgotPasswordScreen({ step, email, setEmail, code, setCode, newPassword, setNewPassword, confirmPassword, setConfirmPassword, error, fieldErrors, clearFieldError, codeSending, codeSent, codeCountdown, sendCode, goStep2, success, onBack, pwVisible, togglePw, support }: {
  step: 1 | 2;
  email: string;
  setEmail: (v: string) => void;
  code: string;
  setCode: (v: string) => void;
  newPassword: string;
  setNewPassword: (v: string) => void;
  confirmPassword: string;
  setConfirmPassword: (v: string) => void;
  error: string;
  fieldErrors: { email?: string; code?: string; newPassword?: string; confirmPassword?: string };
  clearFieldError: (k: "email" | "code" | "newPassword" | "confirmPassword") => void;
  codeSending: boolean;
  codeSent: boolean;
  codeCountdown: number;
  sendCode: () => void;
  goStep2: () => void;
  success: boolean;
  onBack: () => void;
  pwVisible: { pw: boolean; confirm: boolean };
  togglePw: (k: "pw" | "confirm") => void;
  support: { telegram: string; whatsapp: string };
}) {
  if (success) {
    return (
      <main className="mobile-shell auth-only">
        <section className="auth-center">
          <BrandLogo variant="auth-full" />
          <div className="auth-headline">
            <h1>Password Reset Successful</h1>
            <p>Your password has been updated. Please log in again.</p>
          </div>
          <div className="auth-card">
            <button type="button" className="mobile-primary auth-submit" onClick={onBack}>Back to Login</button>
          </div>
        </section>
      </main>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) sendCode();
    else goStep2();
  };

  return (
    <main className="mobile-shell auth-only">
      <section className="auth-center">
        <BrandLogo variant="auth-full" />
        <div className="auth-headline">
          <h1>Reset Password</h1>
          <p>Enter your account email. We&rsquo;ll send a verification code to reset your password.</p>
          <p className="auth-recovery-note">Phone-only accounts without a linked email must contact support to recover access.</p>
        </div>
        <form className="auth-card" onSubmit={handleSubmit}>
          {error && <div className="auth-alert" role="alert"><span className="auth-alert-icon" aria-hidden="true">!</span><span>{error}</span></div>}
          {step === 1 ? (
            <>
              <AuthField
                id="forgot-email"
                label="Email"
                type="email"
                value={email}
                onChange={(v) => { setEmail(v); clearFieldError("email"); }}
                icon={<Mail size={18} />}
                error={fieldErrors.email}
                placeholder="Enter your email"
                autoComplete="email"
              />
              <button type="button" className="mobile-primary auth-submit" style={{ marginTop: 16 }} disabled={codeSending || !email} onClick={sendCode}>
                {codeSending ? "Sending..." : "Send Code"}
              </button>
            </>
          ) : (
            <>
              {codeSent && (
                <div style={{ color: "#2effb0", fontSize: 13, margin: "0 0 16px", textAlign: "center" }}>
                  If this email is registered, a verification code has been sent.
                </div>
              )}
              <AuthField
                id="forgot-code"
                label="Verification Code"
                type="text"
                value={code}
                onChange={(v) => { setCode(v.replace(/\D/g, "")); clearFieldError("code"); }}
                icon={<ShieldCheck size={18} />}
                error={fieldErrors.code}
                placeholder="Enter 6-digit code"
                autoComplete="one-time-code"
                right={
                  <button type="button" className="auth-code-send-btn" disabled={codeSending || codeCountdown > 0} onClick={sendCode}>
                    {codeSending ? "Sending..." : codeCountdown > 0 ? `${codeCountdown}s` : codeSent ? "Resend" : "Send Code"}
                  </button>
                }
              />
              <div className={`auth-field${fieldErrors.newPassword ? " has-error" : ""}`}>
                <div className="auth-field-label"><label htmlFor="forgot-new-pw">New Password</label></div>
                <div className={`auth-input-wrap${fieldErrors.newPassword ? " error" : ""}`}>
                  <span className="auth-input-icon" aria-hidden="true"><LockKeyhole size={18} /></span>
                  <input id="forgot-new-pw" type={pwVisible.pw ? "text" : "password"} autoComplete="new-password" placeholder="Enter new password" value={newPassword} onChange={(e) => { setNewPassword(e.target.value); clearFieldError("newPassword"); }} />
                  <button type="button" className="auth-input-eye" aria-label={pwVisible.pw ? "Hide password" : "Show password"} onClick={() => togglePw("pw")}><Eye size={18} style={{ opacity: pwVisible.pw ? 1 : 0.55 }} /></button>
                </div>
                {fieldErrors.newPassword && <p className="auth-field-error">{fieldErrors.newPassword}</p>}
              </div>
              <div className={`auth-field${fieldErrors.confirmPassword ? " has-error" : ""}`}>
                <div className="auth-field-label"><label htmlFor="forgot-confirm-pw">Confirm Password</label></div>
                <div className={`auth-input-wrap${fieldErrors.confirmPassword ? " error" : ""}`}>
                  <span className="auth-input-icon" aria-hidden="true"><LockKeyhole size={18} /></span>
                  <input id="forgot-confirm-pw" type={pwVisible.confirm ? "text" : "password"} autoComplete="new-password" placeholder="Confirm your new password" value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); clearFieldError("confirmPassword"); }} />
                  <button type="button" className="auth-input-eye" aria-label={pwVisible.confirm ? "Hide password" : "Show password"} onClick={() => togglePw("confirm")}><Eye size={18} style={{ opacity: pwVisible.confirm ? 1 : 0.55 }} /></button>
                </div>
                {fieldErrors.confirmPassword && <p className="auth-field-error">{fieldErrors.confirmPassword}</p>}
              </div>
              <button type="submit" className="mobile-primary auth-submit">Reset Password</button>
            </>
          )}
            <button type="button" className="link-button auth-switch" onClick={onBack}>← Back to Login</button>
          {support.whatsapp && (
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <span style={{ color: "#6e88a4", fontSize: 12 }}>Can&rsquo;t access your email? </span>
              <a href={support.whatsapp} target="_blank" rel="noreferrer" style={{ color: "#2effb0", fontSize: 12, textDecoration: "underline" }}>Contact Support</a>
            </div>
          )}
        </form>
      </section>
    </main>
  );
}

function MobileHeader({ activeStack, pop, currentMarket, tickers, activeTab, goTab, showToast, notifications = [], notificationsOpen = false, setNotificationsOpen, markNotificationRead, markAllNotificationsRead }: { activeStack?: StackPage; pop: () => void; currentMarket?: Market; tickers: Tickers; support: { telegram: string; whatsapp: string }; activeTab: Tab; goTab?: (tab: Tab) => void; showToast?: (type: "ok" | "err" | "info", text: string) => void; notifications?: ClientNotification[]; notificationsOpen?: boolean; setNotificationsOpen?: (value: boolean) => void; markNotificationRead?: (id: number) => void; markAllNotificationsRead?: () => void }) {
  if (activeStack) {
    if (activeStack.id === "support-chat") {
      return (
        <header className="mobile-header mobile-header-stack mobile-header-chat">
          <button type="button" className="stack-back" onClick={pop} aria-label="Back">
            <ChevronLeft size={22} strokeWidth={2} />
          </button>
          <div className="chat-header-title">
            <h2>Support Chat</h2>
            <p><span className="chat-status-dot" aria-hidden="true" />Online</p>
          </div>
        </header>
      );
    }
    return (
      <header className="mobile-header mobile-header-stack">
        <button type="button" className="stack-back" onClick={pop} aria-label="Back">
          <ChevronLeft size={22} strokeWidth={2} />
        </button>
        <h2 className="stack-title">{activeStack.title}</h2>
        <span className="stack-spacer" aria-hidden="true" />
      </header>
    );
  }
  const titles: Record<Tab, { title: string; sub: string }> = {
    home:    { title: "KAIROX", sub: "Dashboard" },
    markets: { title: "Markets", sub: "Live perpetual pairs" },
    trade:   { title: "Trade", sub: currentMarket ? `${symbolName(currentMarket.symbol)} Perpetual` : "Perpetual" },
    orders:  { title: "Orders", sub: "Open positions & history" },
    account: { title: "Account", sub: "Profile & security" }
  };
  const h = titles[activeTab] || titles.home;
  return (
    <header className="mobile-header mobile-topbar">
      <button type="button" className="topbar-brand" onClick={() => goTab?.("home")} aria-label="KAIROX Home">
        <img className="topbar-brand-logo" src="/brand/kairox-symbol.png" alt="" aria-hidden="true" />
        <span className="topbar-brand-text">
          <strong>{h.title}</strong>
          <small>{h.sub}</small>
        </span>
      </button>
      <div className="top-actions">
        <button type="button" className="top-glass-btn" onClick={() => goTab?.("markets")} aria-label="Search markets">
          <Search size={18} strokeWidth={1.8} />
        </button>
        <div className="top-notification-wrap">
          <button type="button" className="top-glass-btn top-glass-btn-bell" onClick={() => setNotificationsOpen?.(!notificationsOpen)} aria-label={`Notifications${notifications.filter((item) => !item.readAt).length ? ` (${notifications.filter((item) => !item.readAt).length} unread)` : ""}`} aria-expanded={notificationsOpen}>
            <Bell size={18} strokeWidth={1.8} />
            {notifications.some((item) => !item.readAt) && <span className="top-bell-dot" aria-hidden="true" />}
          </button>
          {notificationsOpen && <div className="top-notification-panel" role="dialog" aria-label="Notifications">
            <div className="top-notification-head"><strong>Notifications</strong><button type="button" onClick={() => markAllNotificationsRead?.()} disabled={!notifications.some((item) => !item.readAt)}>Mark all read</button></div>
            <div className="top-notification-list">{notifications.length === 0 ? <div className="top-notification-empty">No notifications yet.</div> : notifications.map((item) => <button type="button" key={item.id} className={`top-notification-item${item.readAt ? " is-read" : ""}`} onClick={() => markNotificationRead?.(item.id)}><b>{item.title}</b><span>{item.body}</span></button>)}</div>
          </div>}
        </div>
        <button type="button" className="top-glass-btn" onClick={() => goTab?.("account")} aria-label="Account">
          <UserIcon size={18} strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
}

function BrandLogo({ variant = "header" }: { variant?: "header" | "auth" | "auth-full" }) {
  const isAuth = variant === "auth" || variant === "auth-full";
  // Auth pages use the full main artwork (V + vortex + KAIROX + PROTOCOL + tagline baked into PNG).
  // Header uses the smaller symbol PNG + Orbitron-rendered "KAIROX" text alongside.
  if (isAuth) {
    return (
      <div className={`brand-lockup brand-lockup-kairox brand-lockup-auth${variant === "auth-full" ? " brand-lockup-full" : ""}`}>
        <img
          className="brand-main"
          src="/brand/kairox-main.png"
          alt="KAIROX"
          onError={(e) => {
            const el = e.currentTarget;
            if (el.dataset.fallback) return;
            el.dataset.fallback = "1";
            el.src = "/brand/kairox-symbol.svg";
          }}
        />
      </div>
    );
  }
  return (
    <div className="brand-lockup brand-lockup-kairox">
      <img
        className="brand-symbol"
        src="/brand/kairox-symbol.png"
        alt=""
        aria-hidden="true"
        onError={(e) => {
          const el = e.currentTarget;
          if (el.dataset.fallback) return;
          el.dataset.fallback = "1";
          el.src = "/brand/kairox-symbol.svg";
        }}
      />
      <span className="brand-copy">
        <strong className="brand-wordmark">KAIROX</strong>
        <small className="brand-sub">MARKETS</small>
      </span>
    </div>
  );
}

function BottomNav({ tab, setTab }: { tab: Tab; setTab: (tab: Tab) => void }) {
  const items: { id: Tab; label: string; icon: string }[] = [
    { id: "home", label: "Home", icon: "home" },
    { id: "markets", label: "Markets", icon: "grid" },
    { id: "trade", label: "Trade", icon: "pulse" },
    { id: "orders", label: "Orders", icon: "list" },
    { id: "account", label: "Account", icon: "user" }
  ];
  return (
    <nav className="mobile-bottom" aria-label="Primary">
      {items.map((item) => {
        const active = tab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className={active ? "on" : ""}
            onClick={() => setTab(item.id)}
            aria-current={active ? "page" : undefined}
            aria-label={item.label}
          >
            <MobileIcon name={item.icon} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

const ICONS: Record<string, typeof LayoutGrid> = {
  home: Home,
  grid: LayoutGrid,
  pulse: BarChart3,
  user: UserIcon,
  list: ClipboardList,
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
        src={`/icons/${slug}.svg`}
        alt={key}
        loading="lazy"
        onError={(e) => {
          const t = e.currentTarget;
          t.src = `https://assets.coincap.io/assets/icons/${slug}@2x.png`;
          t.onerror = () => {
            t.style.display = "none";
            const fb = t.nextElementSibling as HTMLElement | null;
            if (fb) fb.style.display = "flex";
          };
        }}
      />
      <span className="coin-fb" style={{ display: "none" }}>{key.slice(0, 1)}</span>
    </span>
  );
}


function HomeTab({ rows, tickers, onSelect, goTab, push, kycStatus, totalEquity, pnl, favorites, toggleFavorite }: { rows: Market[]; tickers: Tickers; query: string; setQuery: (v: string) => void; sort: "hot" | "gainers" | "losers"; setSort: (v: "hot" | "gainers" | "losers") => void; onSelect: (symbol: string) => void; goTab: (t: Tab) => void; push: (p: StackPage) => void; kycStatus: string; totalEquity: number; availableBalance: number; pnl: number; favorites: Set<string>; toggleFavorite: (symbol: string) => void }) {
  const quickActions: { icon: string; label: string; action: () => void }[] = [
    { icon: "arrow-down", label: "Deposit",  action: () => push({ id: "deposit-asset",  title: "Deposit" }) },
    { icon: "arrow-up",   label: "Withdraw", action: () => push({ id: "withdraw-asset", title: "Withdraw" }) },
    { icon: "swap",       label: "Swap",     action: () => push({ id: "swap",           title: "Swap" }) },
    { icon: "history",    label: "History",  action: () => push({ id: "deposit-history", title: "Deposit History" }) }
  ];
  const kycNeedsAttention = kycStatus !== "approved";
  const pnlPos = pnl >= 0;
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [period, setPeriod] = useState<"today" | "30d">("today");
  const maskedValue = "$ ******";
  const pnlPctRaw = totalEquity > 0 ? (pnl / Math.max(1, totalEquity)) * 100 : 0;
  return (
    <div className="tab-page">
      <div className="portfolio-card">
        <div className="pc-head">
          <span className="pc-label">
            Total Portfolio Value
            <button type="button" className="pc-eye" aria-label={balanceHidden ? "Show balance" : "Hide balance"} onClick={() => setBalanceHidden((v) => !v)}>
              {balanceHidden ? <EyeOff size={14} strokeWidth={1.6} /> : <Eye size={14} strokeWidth={1.6} />}
            </button>
          </span>
          <button type="button" className="pc-expand" aria-label="View assets" onClick={() => push({ id: "asset-overview", title: "Assets" })}>
            <ArrowUpRight size={14} strokeWidth={1.8} />
          </button>
        </div>
        <div className="pc-value">
          {balanceHidden ? maskedValue : (
            <><span className="pc-value-num">{Number(totalEquity).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}</span> <span className="pc-value-unit">USDC</span></>
          )}
        </div>
        <div className="pc-equity-usd">
          {balanceHidden ? "" : `≈ ${money(totalEquity)}`}
        </div>
        <div className="pc-sub">
          <span className={`pc-pnl ${pnlPos ? "up" : pnl === 0 ? "zero" : "down"}`}>{balanceHidden ? "******" : `${pnlPos ? "+" : ""}${money(pnl)}`}</span>
          <span className={`pc-badge ${pnlPos ? "up" : pnl === 0 ? "zero" : "down"}`}>{balanceHidden ? "**" : `${pnlPos ? "+" : ""}${pnlPctRaw.toFixed(2)}%`}</span>
          <span className="pc-period-toggle">
            <button type="button" className={period === "today" ? "on" : ""} onClick={() => setPeriod("today")}>Today</button>
            <button type="button" className={period === "30d" ? "on" : ""} onClick={() => setPeriod("30d")}>30D</button>
          </span>
        </div>
        <svg className="pc-spark" viewBox="0 0 340 110" preserveAspectRatio="none">
          <defs>
            <linearGradient id="pcGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#5B8DFF" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#5B8DFF" stopOpacity="0" />
            </linearGradient>
            <filter id="pcDotGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>
          <path d="M0,95 L12,92 L24,93 L36,88 L48,85 L60,87 L72,82 L84,80 L96,75 L108,77 L120,70 L132,72 L144,65 L156,60 L168,62 L180,55 L192,58 L204,50 L216,47 L228,42 L240,45 L252,38 L264,35 L276,30 L288,32 L300,25 L312,22 L324,18 L336,12 L340,8 L340,110 L0,110 Z" fill="url(#pcGrad)" stroke="none" />
          <path d="M0,95 L12,92 L24,93 L36,88 L48,85 L60,87 L72,82 L84,80 L96,75 L108,77 L120,70 L132,72 L144,65 L156,60 L168,62 L180,55 L192,58 L204,50 L216,47 L228,42 L240,45 L252,38 L264,35 L276,30 L288,32 L300,25 L312,22 L324,18 L336,12 L340,8" stroke="#5B8DFF" strokeWidth="1.6" fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx="338" cy="8" r="7" fill="#5B8DFF" opacity="0.45" filter="url(#pcDotGlow)" />
          <circle cx="338" cy="8" r="4" fill="#5B8DFF" />
          <circle cx="338" cy="8" r="2" fill="#FFFFFF" />
        </svg>
        <div className="pc-axis"><span>30D ago</span><span>Today</span></div>
      </div>
      <div className="quick-actions">
        {quickActions.map((a) => (
          <button key={a.label} type="button" className="qa-item" onClick={a.action}>
            <span className="qa-icon-wrap"><MobileIcon name={a.icon} /></span>
            <span className="qa-label">{a.label}</span>
          </button>
        ))}
      </div>
      {kycNeedsAttention && (
        <button type="button" className="promo-banner" onClick={() => push({ id: "kyc", title: "KYC Verification" })}>
          <div className="promo-icon"><ShieldCheck size={26} strokeWidth={1.6} /></div>
          <div className="promo-body">
            <strong>Verify your identity</strong>
            <small>Unlock higher limits, withdrawals and exclusive features.</small>
            <span className="promo-cta">Verify Now  →</span>
          </div>
        </button>
      )}
      <div className="market-cols home-favorites-head">
        <span className="home-favorites-title">Favorites Market</span>
        <button type="button" className="home-favorites-viewall" onClick={() => goTab("markets")}>
          View All <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
      {(() => {
        const favRows = (() => {
          const faved = rows.filter((m) => favorites.has(m.symbol));
          if (faved.length > 0) return faved.slice(0, 5);
          return rows.filter((m) => m.symbol === "BTC-PERP" || m.symbol === "ETH-PERP");
        })();
        if (!favRows.length) {
          return (
            <div className="home-favorites-empty">
              <Star size={20} strokeWidth={1.6} aria-hidden="true" />
              <b>No favorites yet</b>
              <em>Tap the star on any market to pin it here.</em>
              <button type="button" className="home-favorites-empty-cta" onClick={() => goTab("markets")}>
                Browse Markets <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          );
        }
        return (
          <div className="market-list">
            {favRows.map((market) => {
              const ticker = tickers[market.symbol];
              const change = ticker?.change || 0;
              const price = ticker?.price || market.price;
              const volume = (Math.abs(price * 1234) / 1_000_000).toFixed(1);
              const changeTone = change > 0 ? "up" : change < 0 ? "down" : "flat";
              return (
                <div
                  key={market.symbol}
                  role="button"
                  tabIndex={0}
                  className="market-line hover:bg-slate-800/50 transition-colors"
                  onClick={() => onSelect(market.symbol)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(market.symbol);
                    }
                  }}
                  aria-label={`Open ${symbolName(market.symbol)}`}
                >
                  <span className="ml-name">
                    <span className="ml-title"><b>{symbolName(market.symbol)}</b><em className="ml-tag">Perp</em></span>
                    <small className="text-slate-400">Vol <span className="tabular-nums">{volume}</span>M</small>
                  </span>
                  <Sparkline symbol={market.symbol} change={change} />
                  <span className="ml-price">
                    <b className="tabular-nums">{money(price)}</b>
                    <small className={`change-badge ${changeTone} tabular-nums`}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</small>
                  </span>
                  <button
                    type="button"
                    className="ml-star ml-star-on"
                    aria-label="Remove from favorites"
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(market.symbol); }}
                  >
                    <Star size={14} fill="currentColor" strokeWidth={1.6} />
                  </button>
                </div>
              );
            })}
          </div>
        );
      })()}
      {!rows.length && <div className="empty-state">No markets available yet.</div>}
      <button type="button" className="footer-card" onClick={() => push({ id: "about", title: "About" })}>
        <div className="footer-icon"><BookOpen size={22} strokeWidth={1.6} /></div>
        <div className="footer-body">
          <strong>Trading Guide</strong>
          <small>Learn how KAIROX Markets works and start trading.</small>
        </div>
        <ChevronRight size={18} className="footer-arrow" />
      </button>
    </div>
  );
}

function TradeTab({ market, tickers, markets, setCurrentSymbol, openSheet, stake, setStake, duration, durations, setDuration, availableBalance, favorites, toggleFavorite }: { market: Market; tickers: Tickers; markets: Market[]; setCurrentSymbol: (symbol: string) => void; openSheet: (d: "call" | "put") => void; stake: number; setStake: (n: number) => void; duration: Duration; durations: Duration[]; setDuration: (d: Duration) => void; availableBalance: number; favorites: Set<string>; toggleFavorite: (symbol: string) => void }) {
  const price = tickers[market.symbol]?.price || market.price;
  const change = tickers[market.symbol]?.change || 0;
  const [pairMenuOpen, setPairMenuOpen] = useState(false);
  const [pairSearch, setPairSearch] = useState("");
  const [pairFilter, setPairFilter] = useState<"USDC" | "Favorites" | "Perp">("USDC");
  useEffect(() => {
    if (!pairMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setPairMenuOpen(false); setPairSearch(""); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pairMenuOpen]);
  const filteredMarkets = useMemo(() => {
    const q = pairSearch.trim().toLowerCase();
    return markets.filter((m) => {
      if (pairFilter === "Favorites" && !favorites.has(m.symbol)) return false;
      if (pairFilter === "USDC" && !m.symbol.includes("-PERP")) return false;
      if (q && !m.symbol.toLowerCase().includes(q) && !symbolName(m.symbol).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [markets, pairFilter, pairSearch, favorites]);
  const closePairMenu = () => { setPairMenuOpen(false); setPairSearch(""); };
  return (
    <div className="tab-page trade-screen">
      <section className={`chart-card${pairMenuOpen ? " selector-open" : ""}`}>
        <div className="chart-card-head">
          <div className="pair-menu-wrap">
            <button type="button" className={`pair-menu-trigger${pairMenuOpen ? " active" : ""}`} onClick={() => setPairMenuOpen((open) => !open)} aria-haspopup="dialog" aria-expanded={pairMenuOpen}>
              {symbolName(market.symbol)} <span className="pair-caret">⌄</span>
            </button>
          </div>
          <div className="chart-card-price">
            <b className="tabular-nums">{money(price)}</b>
            <small className={`${change >= 0 ? "good" : "bad"} tabular-nums`}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</small>
          </div>
        </div>
        <MarketChartPanel symbol={market.symbol} />
        {pairMenuOpen && (
          <>
            <div className="market-selector-backdrop" onClick={closePairMenu} />
            <div className="market-selector" role="dialog" aria-modal="true" aria-label="Select market">
              <div className="ms-search">
                <Search size={16} />
                <input autoFocus placeholder="Search market" value={pairSearch} onChange={(e) => setPairSearch(e.target.value)} aria-label="Search market" />
              </div>
              <div className="ms-filters">
                {(["USDC", "Favorites", "Perp"] as const).map((f) => (
                  <button key={f} type="button" className={`ms-filter${pairFilter === f ? " on" : ""}`} onClick={() => setPairFilter(f)}>
                    {f === "Favorites" && <Star size={13} fill={pairFilter === "Favorites" ? "currentColor" : "none"} />}
                    {f === "Perp" && <span className="ms-filter-perp">∞</span>}
                    {f}
                  </button>
                ))}
              </div>
              <div className="ms-list">
                {filteredMarkets.map((m) => {
                  const t = tickers[m.symbol];
                  const p = t?.price || m.price;
                  const c = t?.change || 0;
                  const selected = m.symbol === market.symbol;
                  const fav = favorites.has(m.symbol);
                  return (
                    <div
                      key={m.symbol}
                      role="button"
                      tabIndex={0}
                      className={`ms-row${selected ? " on" : ""}`}
                      onClick={() => { setCurrentSymbol(m.symbol); closePairMenu(); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setCurrentSymbol(m.symbol);
                          closePairMenu();
                        }
                      }}
                      aria-label={`Select ${symbolName(m.symbol)}`}
                    >
                      <span className="ms-row-title">
                        <strong>{symbolName(m.symbol)}</strong>
                        <em className="ms-row-tag">Perp</em>
                      </span>
                      <span className="ms-row-price">
                        <b className="tabular-nums">{money(p)}</b>
                        <small className={`${c >= 0 ? "good" : "bad"} tabular-nums`}>{c >= 0 ? "+" : ""}{c.toFixed(2)}%</small>
                      </span>
                      <button type="button" className={`ms-row-fav${fav ? " on" : ""}`} aria-label={fav ? "Unfavorite" : "Favorite"} onClick={(e) => { e.stopPropagation(); toggleFavorite(m.symbol); }}>
                        <Star size={14} fill={fav ? "currentColor" : "none"} />
                      </button>
                      {selected && <BadgeCheck size={18} className="ms-row-check" />}
                    </div>
                  );
                })}
                {!filteredMarkets.length && <div className="ms-empty empty-state--inline">No markets match your search.</div>}
              </div>
            </div>
          </>
        )}
      </section>
      <div className="trade-cta">
        <button type="button" className="trade-cta-btn call" onClick={() => openSheet("call")}>
          <span className="trade-cta-arrow">↗</span>
          <span className="trade-cta-label"><b>CALL</b><em>Higher price</em></span>
        </button>
        <button type="button" className="trade-cta-btn put" onClick={() => openSheet("put")}>
          <span className="trade-cta-arrow">↘</span>
          <span className="trade-cta-label"><b>PUT</b><em>Lower price</em></span>
        </button>
      </div>
    </div>
  );
}

type TradeSheetMode = "place" | "running" | "settled";

function TradeSheet({ mode, direction, setDirection, market, price, change, availableBalance, stake, setStake, duration, durations, setDuration, activeOrder, now, close, minimize, tradeAgain, submit, submitting }: {
  mode: TradeSheetMode;
  direction: "call" | "put";
  setDirection: (d: "call" | "put") => void;
  market: Market;
  price: number;
  change: number;
  availableBalance: number;
  stake: number;
  setStake: (n: number) => void;
  duration: Duration;
  durations: Duration[];
  setDuration: (d: Duration) => void;
  activeOrder: BinaryOrder | null;
  now: number;
  close: () => void;
  minimize: () => void;
  tradeAgain: () => void;
  submit: () => void;
  submitting: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (mode === "running") minimize();
      else close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode, close, minimize]);

  // Lock background scroll while sheet is open
  useEffect(() => {
    const html = document.documentElement;
    const savedOverflow = html.style.overflow;
    const savedScrollTop = html.scrollTop;
    html.style.overflow = "hidden";
    html.style.position = "fixed";
    html.style.width = "100%";
    html.style.top = `-${savedScrollTop}px`;
    return () => {
      html.style.overflow = savedOverflow;
      html.style.position = "";
      html.style.width = "";
      html.style.top = "";
      html.scrollTop = savedScrollTop;
    };
  }, []);
  const titleId = `trade-sheet-title-${mode}`;
  return (
    <div className="sheet-bg" onClick={mode === "place" ? close : undefined}>
      <div
        className={`bottom-sheet order-sheet sheet-mode-${mode}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="sr-only">
          {mode === "place" ? "Place order" : mode === "running" ? "Running order" : "Order result"}
        </h2>
        <div className="sheet-handle" />
        {mode !== "place" && (
          <button type="button" className="sheet-close" aria-label={mode === "running" ? "Minimize" : "Close"} onClick={mode === "running" ? minimize : close}>
            <X size={15} strokeWidth={2.4} aria-hidden="true" />
          </button>
        )}
        {mode === "place" && <PlaceModeBody direction={direction} setDirection={setDirection} market={market} price={price} change={change} availableBalance={availableBalance} stake={stake} setStake={setStake} duration={duration} durations={durations} setDuration={setDuration} submit={submit} submitting={submitting} />}
        {mode === "running" && activeOrder && <RunningModeBody order={activeOrder} now={now} currentPrice={price} />}
        {mode === "settled" && activeOrder && <SettledModeBody order={activeOrder} tradeAgain={tradeAgain} />}
      </div>
    </div>
  );
}

function PlaceModeBody({ direction, setDirection, market, price, change, availableBalance, stake, setStake, duration, durations, setDuration, submit, submitting }: {
  direction: "call" | "put";
  setDirection: (d: "call" | "put") => void;
  market: Market;
  price: number;
  change: number;
  availableBalance: number;
  stake: number;
  setStake: (n: number) => void;
  duration: Duration;
  durations: Duration[];
  setDuration: (d: Duration) => void;
  submit: () => void;
  submitting: boolean;
}) {
  const winAmount = stake * duration.odds;
  return (
    <>
      <div className="order-header">
        <div className="order-header-left">
          <strong>{symbolName(market.symbol)}</strong>
          <span className={`order-header-price ${change >= 0 ? "good" : "bad"}`}>
            <span className="tabular-nums">{Number(price) >= 1000 ? Number(price).toFixed(2) : Number(price) >= 1 ? Number(price).toFixed(4) : Number(price).toFixed(5)} USDC</span>
            <em className="tabular-nums">{change >= 0 ? "+" : ""}{change.toFixed(2)}%</em>
          </span>
        </div>
        <Sparkline symbol={market.symbol} change={change} />
      </div>

      <div className="order-section">
        <label className="order-section-label">Direction</label>
        <div className="order-direction">
          <button type="button" disabled={submitting} className={`order-dir-btn call${direction === "call" ? " on" : ""}`} onClick={() => setDirection("call")}>
            <span>↑</span> CALL
          </button>
          <button type="button" disabled={submitting} className={`order-dir-btn put${direction === "put" ? " on" : ""}`} onClick={() => setDirection("put")}>
            <span>↓</span> PUT
          </button>
        </div>
      </div>

      <div className="order-section">
        <label className="order-section-label">Amount (USDC)</label>
        <div className="order-amount">
          <button type="button" disabled={submitting} className="order-step" onClick={() => setStake(Math.max(10, stake - 10))}>−</button>
          <input className="order-amount-input tabular-nums" type="number" min={10} max={5000} value={stake} disabled={submitting} onChange={(e) => setStake(Number(e.target.value || 0))} aria-label="Order amount in USDC" />
          <span className="order-amount-unit">USDC</span>
          <button type="button" disabled={submitting} className="order-step" onClick={() => setStake(stake + 10)}>+</button>
        </div>
        <div className="order-amount-meta">
          <span>Balance: <span className="tabular-nums">{availableBalance.toFixed(2)} USDC</span></span>
          <span>·</span>
          <span>Min 10 · Max 5000</span>
        </div>
      </div>

      <div className="order-section">
        <label className="order-section-label">Duration</label>
        <div className="order-duration">
          {durations.map((item) => (
            <button key={item.seconds} type="button" disabled={submitting} className={`order-dur-chip${duration.seconds === item.seconds ? " on" : ""}`} onClick={() => setDuration(item)}>
              <b>{item.label}</b>
              <em>+{Math.round(item.odds * 100)}%</em>
            </button>
          ))}
        </div>
      </div>

      <div className="order-summary">
        <div className="order-summary-card">
          <div className="order-summary-row"><span>Investment</span><b className="tabular-nums">{money(stake)}</b></div>
          <div className="order-summary-row"><span className="good">Est. Profit</span><b className="good tabular-nums">+{money(winAmount)}</b></div>
          <div className="order-summary-row"><span className="bad">Max Loss</span><b className="bad tabular-nums">-{money(stake)}</b></div>
        </div>
      </div>

      <button type="button" className={`order-confirm ${direction}`} disabled={submitting} onClick={submit}>
        {submitting ? "Placing..." : `Confirm ${direction.toUpperCase()} · ${money(stake)}`}
      </button>
      <div className="order-foot"><ShieldCheck size={14} /> Your funds are securely protected</div>
    </>
  );
}

function RunningModeBody({ order, now, currentPrice }: { order: BinaryOrder; now: number; currentPrice: number }) {
  const totalSec = order.duration.seconds;
  const elapsedMs = Math.max(0, now - (order.expiresAt - totalSec * 1000));
  const remainingSec = Math.max(0, Math.ceil((order.expiresAt - now) / 1000));
  const progress = Math.min(1, Math.max(0, elapsedMs / (totalSec * 1000)));
  const winAmount = order.stake * order.duration.odds;
  const payout = order.stake + winAmount;
  const dirColor = order.direction === "call" ? "#16C784" : "#F6465D";
  const priceDelta = currentPrice - order.entry;
  const priceChangePct = order.entry ? (priceDelta / order.entry) * 100 : 0;
  const isSettling = remainingSec === 0;
  const lastThree = !isSettling && remainingSec <= 3;
  /* Winning means current price moved in the favorable direction for this order. */
  const isFlat = priceDelta === 0;
  const isWinning = !isFlat && (order.direction === "call" ? priceDelta > 0 : priceDelta < 0);
  const statusLabel = isFlat ? "Awaiting Movement" : isWinning ? "Currently Winning" : "Currently Losing";
  return (
    <>
      {/* Header: badge + pair + Expires */}
      <div className="run-header">
        <div className="run-title-line">
          <span className={`run-direction-badge ${order.direction}`}>{order.direction.toUpperCase()}</span>
          <h2 className="run-pair">{symbolName(order.symbol)}</h2>
        </div>
        <em className="run-sublabel">{isSettling ? "Settlement in Progress" : `Expires in ${remainingSec}s`}</em>
      </div>

      {/* Horizontal progress bar */}
      {!isSettling && (
        <div className={`run-progress-bar ${lastThree ? "emphasis" : ""}`}>
          <div className="run-progress-track">
            <div
              className="run-progress-fill"
              style={{ width: `${Math.min(100, progress * 100)}%`, background: dirColor }}
            />
          </div>
          <span className="run-progress-label tabular-nums">{remainingSec}s Remaining</span>
        </div>
      )}
      {isSettling && (
        <div className="run-progress-bar settling">
          <div className="run-progress-track settling">
            <div className="run-progress-fill settling" />
          </div>
          <span className="run-progress-label settling">Settlement in Progress</span>
        </div>
      )}

      {/* Status pill */}
      <div className={`run-status-badge ${isSettling ? "settling" : isFlat ? "flat" : isWinning ? "winning" : "losing"}`} aria-live="polite">
        Status: {statusLabel}
      </div>

      {/* Price info cards */}
      <div className="run-price-cards">
        <div className="run-price-card">
          <small>Entry Price</small>
          <div className="run-price-card-body">
            <b className="tabular-nums">{formatTradePrice(order.entry)}</b>
            <em>USDC</em>
          </div>
        </div>
        <div className="run-price-card">
          <small>Live Price</small>
          <div className="run-price-card-body">
            <b className="tabular-nums">{formatTradePrice(currentPrice)}</b>
            <em className={`tabular-nums ${priceChangePct >= 0 ? "good" : "bad"}`}>{priceChangePct >= 0 ? "+" : ""}{priceChangePct.toFixed(2)}%</em>
          </div>
        </div>
      </div>

      {/* Sparkline */}
      <Sparkline symbol={order.symbol} change={priceChangePct} className="run-sparkline" stretch />

      {/* Summary grid */}
      <div className="run-summary-panel">
        <div className="run-summary-row">
          <span>Investment</span>
          <b className="tabular-nums">{money(order.stake)}</b>
        </div>
        <div className="run-summary-row">
          <span>Return</span>
          <b className="tabular-nums">{money(payout)}</b>
        </div>
        <div className="run-summary-row">
          <span className="good">Profit</span>
          <b className="good tabular-nums">+{money(winAmount)}</b>
        </div>
        <div className="run-summary-row">
          <span className="bad">Max Loss</span>
          <b className="bad tabular-nums">-{money(order.stake)}</b>
        </div>
      </div>

      {/* Footer */}
      <div className="run-footer">
        Settlement is automatic · Funds secured
      </div>
    </>
  );
}

function SettledModeBody({ order, tradeAgain }: { order: BinaryOrder; tradeAgain: () => void }) {
  const won = order.status === "win";
  const winAmount = order.stake * order.duration.odds;
  const closePrice = order.entry + (won ? (order.direction === "call" ? Math.abs(order.entry * 0.0005) : -Math.abs(order.entry * 0.0005)) : (order.direction === "call" ? -Math.abs(order.entry * 0.0005) : Math.abs(order.entry * 0.0005)));
  const totalReturn = won ? order.stake + winAmount : 0;
  return (
    <>
      <div className="settled-header">
        <strong>{symbolName(order.symbol)}</strong>
        <em>{order.direction.toUpperCase()} · {order.duration.label}</em>
      </div>

      <div className="settled-hero">
        <div className={`settled-trophy ${won ? "win" : "loss"}`}>
          {won ? <Trophy size={18} strokeWidth={2.1} aria-hidden="true" /> : <X size={18} strokeWidth={2.4} aria-hidden="true" />}
        </div>
        <b className={`settled-title ${won ? "win" : "loss"}`}>{won ? "You Won!" : "You Lost"}</b>
      </div>

      <div className="settled-price-panel">
        <div className="settled-price-col">
          <small>Entry</small>
          <b className="tabular-nums">{formatTradePrice(order.entry)}</b>
        </div>
        <span className="settled-price-divider" aria-hidden="true" />
        <div className="settled-price-col right">
          <small>Close</small>
          <b className="tabular-nums">{formatTradePrice(closePrice)}</b>
        </div>
      </div>

      <div className="settled-summary-card">
        <div className="settled-summary-row"><span>Investment</span><b className="tabular-nums">{money(order.stake)}</b></div>
        <div className="settled-summary-row">
          <span className={won ? "good" : "bad"}>{won ? "Profit" : "Loss"}</span>
          <b className={`${won ? "good" : "bad"} tabular-nums`}>{won ? "+" : "-"}{money(won ? winAmount : order.stake)}</b>
        </div>
        <div className="settled-summary-row"><span>Total Return</span><b className="tabular-nums">{money(totalReturn)}</b></div>
      </div>

      <button type="button" className="order-confirm call settled-trade-again" onClick={tradeAgain}>Trade Again</button>
    </>
  );
}

function formatTradePrice(value: number) {
  if (!Number.isFinite(value)) return "0";
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toFixed(2);
  if (abs >= 1) return value.toFixed(4);
  return value.toFixed(5);
}

function OrderCard({ order, now, onClick }: { order: BinaryOrder; now: number; onClick?: () => void }) {
  const remaining = Math.ceil((order.expiresAt - now) / 1000);
  const awaitingManualSettlement = order.status === "open" && remaining <= 0;
  const riskAmount = order.riskAmount ?? order.stake * order.duration.lossRate;
  const inner = (
    <>
      <div><span className={`tag ${order.direction}`}>{order.direction.toUpperCase()}</span><b>{symbolName(order.symbol)}</b></div>
      {order.status === "open" ? <strong className="tabular-nums">{awaitingManualSettlement ? "Settling" : `${Math.max(0, remaining)}s`}</strong> : <strong className={`${order.status === "win" ? "good" : "bad"} tabular-nums`}>{order.status === "win" ? "Won" : "Lost"} {money(order.profit || 0)}</strong>}
      <small>Entry <span className="tabular-nums">{money(order.entry)}</span> - Stake <span className="tabular-nums">{money(order.stake)}</span> - Risk <span className="tabular-nums">{money(riskAmount)}</span></small>
    </>
  );
  if (onClick) {
    return <button type="button" className="order-card order-card-clickable" onClick={onClick}>{inner}</button>;
  }
  return <div className="order-card">{inner}</div>;
}

const MARKETS_FAVORITES_KEY = "kairox_market_favorites_v1";
const LEGACY_FAVORITES_KEY = "flux:fav-markets";

function readFavoritesStorage(): Set<string> {
  if (typeof window === "undefined") return new Set();
  const result = new Set<string>();
  try {
    const raw = window.localStorage.getItem(MARKETS_FAVORITES_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) for (const item of arr) if (typeof item === "string") result.add(item);
    }
  } catch { /* ignore parse errors */ }
  try {
    const legacy = window.localStorage.getItem(LEGACY_FAVORITES_KEY);
    if (legacy !== null) {
      try {
        const arr = JSON.parse(legacy);
        if (Array.isArray(arr)) for (const item of arr) if (typeof item === "string") result.add(item);
      } catch { /* ignore parse errors */ }
      window.localStorage.removeItem(LEGACY_FAVORITES_KEY);
      try {
        window.localStorage.setItem(MARKETS_FAVORITES_KEY, JSON.stringify([...result]));
      } catch { /* ignore quota */ }
    }
  } catch { /* ignore storage errors */ }
  return result;
}

function writeFavoritesStorage(set: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MARKETS_FAVORITES_KEY, JSON.stringify([...set]));
  } catch { /* ignore quota */ }
}

type MarketFilter = "all" | "crypto" | "forex" | "indices" | "metals" | "stocks";

function marketCategory(symbol: string): MarketFilter {
  const base = symbol.replace("-PERP", "").toUpperCase();
  const indices = new Set(["SPX", "NDX", "DJI"]);
  const metals = new Set(["PAXG", "XAU", "XAG", "XPT", "XPD", "XCU"]);
  const forex = new Set(["EURUSD", "GBPUSD", "USDJPY", "AUDUSD"]);
  if (indices.has(base)) return "indices";
  if (metals.has(base)) return "metals";
  if (forex.has(base)) return "forex";
  if (cryptoToStock.has(base)) return "stocks";
  return "crypto";
}

const cryptoToStock = new Set<string>(["AAPL","TSLA","NVDA","GOOGL","MSFT","AMZN","META","MSTR","SPY","QQQ","AVGO","COIN","HOOD","AMD","INTC","NFLX","PLTR"]);

function syntheticVolume(symbol: string, price: number) {
  /* Deterministic per-symbol pseudo-volume for sorting + display until ticker volume is wired. */
  let hash = 0;
  for (let i = 0; i < symbol.length; i += 1) hash = (hash * 31 + symbol.charCodeAt(i)) | 0;
  const factor = ((Math.abs(hash) % 90) + 10) / 100; /* 0.10 - 1.00 */
  return Math.abs(price * (1234 + (Math.abs(hash) % 5000))) * factor;
}

function MarketsListTab({ rows, tickers, query, setQuery, onSelect }: { rows: Market[]; tickers: Tickers; query: string; setQuery: (v: string) => void; onSelect: (symbol: string) => void }) {
  const [filter, setFilter] = useState<MarketFilter>("all");

  const filters: { id: MarketFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "crypto", label: "Crypto" },
    { id: "stocks", label: "Stocks" },
    { id: "indices", label: "Indices" },
    { id: "metals", label: "Metals" }
  ];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows.filter((m) => !q || m.symbol.toLowerCase().includes(q) || symbolName(m.symbol).toLowerCase().includes(q));
    if (filter === "crypto") out = out.filter((m) => marketCategory(m.symbol) === "crypto");
    else if (filter === "stocks") out = out.filter((m) => marketCategory(m.symbol) === "stocks");
    else if (filter === "indices") out = out.filter((m) => marketCategory(m.symbol) === "indices");
    else if (filter === "metals") out = out.filter((m) => marketCategory(m.symbol) === "metals");
    return out;
  }, [rows, tickers, query, filter]);

  return (
    <div className="tab-page markets-list-page">
      <div className="markets-search-row">
        <Search size={16} className="markets-search-icon" aria-hidden="true" />
        <input
          className="markets-search-input"
          type="text"
          inputMode="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="Search BTC, ETH, SOL..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search markets"
        />
        {query && <button type="button" className="markets-search-clear" onClick={() => setQuery("")} aria-label="Clear">×</button>}
      </div>
      <div className="markets-filter-row">
        {filters.map((f) => (
          <button key={f.id} type="button" className={`markets-filter${filter === f.id ? " on" : ""}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="markets-cols-row"><span>Pair</span><span>Last Price</span><span className="markets-cols-change">24h Change</span></div>
      <div className="markets-list-body">
        {visible.map((market) => {
          const ticker = tickers[market.symbol];
          const change = ticker?.change || 0;
          const price = ticker?.price || market.price;
          const volume = (syntheticVolume(market.symbol, price) / 1_000_000).toFixed(1);
          const tone = change > 0 ? "up" : change < 0 ? "down" : "flat";
          return (
            <div
              key={market.symbol}
              role="button"
              tabIndex={0}
              className="markets-row"
              onClick={() => onSelect(market.symbol)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(market.symbol);
                }
              }}
              aria-label={`Open ${symbolName(market.symbol)}`}
            >
              <span className="markets-row-name">
                <span className="markets-row-pair"><b>{symbolName(market.symbol)}</b><em className="markets-row-tag">Perp</em></span>
                <small>Vol <span className="tabular-nums">{volume}</span>M</small>
              </span>
              <Sparkline symbol={market.symbol} change={change} />
              <span className="markets-row-price">
                <b className="tabular-nums">{money(price)}</b>
                <small className={`tabular-nums change-${tone}`}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</small>
              </span>
            </div>
          );
        })}
        {!visible.length && (
          <div className={`empty-state${query ? " empty-state--inline" : ""}`}>
            {query ? `No markets match "${query}".` : "No markets available yet."}
          </div>
        )}
      </div>
    </div>
  );
}

function OrdersTab({ openOrders, history, now, onOpenRunningOrder }: { openOrders: BinaryOrder[]; history: BinaryOrder[]; now: number; onOpenRunningOrder: (order: BinaryOrder) => void }) {
  const [view, setView] = useState<"open" | "closed">("open");
  const orders = view === "open" ? openOrders : history;
  return (
    <div className="tab-page orders-page">
      <div className="orders-tabs-row">
        <button type="button" className={`orders-tab${view === "open" ? " on" : ""}`} onClick={() => setView("open")}>Open <em>({openOrders.length})</em></button>
        <button type="button" className={`orders-tab${view === "closed" ? " on" : ""}`} onClick={() => setView("closed")}>History <em>({history.length})</em></button>
      </div>
      <div className="orders-list-body">
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} now={now} onClick={order.status === "open" ? () => onOpenRunningOrder(order) : undefined} />
        ))}
        {!orders.length && <div className="empty-state">{view === "open" ? "No open orders yet." : "No order history yet."}</div>}
      </div>
    </div>
  );
}

function AssetsTab({ assets, push }: { assets: AssetData | null; push: (p: StackPage) => void }) {
  const rows = mergedAssetRows(assets);
  const totalEquity = assets?.summary.totalEquity ?? 0;
  const available = assets?.summary.availableBalance ?? 0;
  const valuationPartial = assets?.summary.valuationStatus === "partial";

  type Activity = { id: string; kind: "deposit" | "withdraw" | "funding"; title: string; time: string; status: string; amount: number; asset: string };
  const activities: Activity[] = [
    ...(assets?.deposits || []).map<Activity>((r) => ({ id: `d-${r.id}`, kind: "deposit", title: `Deposit ${r.asset}`, time: r.created_at, status: r.status, amount: Math.abs(Number(r.amount || 0)), asset: r.asset })),
    ...(assets?.withdrawals || []).map<Activity>((r) => ({ id: `w-${r.id}`, kind: "withdraw", title: `Withdraw ${r.asset}`, time: r.created_at, status: r.status, amount: -Math.abs(Number(r.amount || 0)), asset: r.asset })),
    ...(assets?.transactions || []).map<Activity>((r) => ({ id: `t-${r.id}`, kind: "funding", title: txTitle(r.type, r.asset), time: r.created_at, status: r.status || "settled", amount: Number(r.amount || 0), asset: r.asset }))
  ].sort((a, b) => (b.time || "").localeCompare(a.time || "")).slice(0, 3);

  const openActivity = (act: Activity) => {
    if (act.kind === "deposit") push({ id: "deposit-history", title: "Deposit History" });
    else if (act.kind === "withdraw") push({ id: "withdraw-history", title: "Withdraw History" });
    else push({ id: "funding-records", title: "Funding Records" });
  };

  return (
    <div className="tab-page assets-screen">
      <section className="equity-card">
        <div className="equity-head">
          <small>Total Equity</small>
        </div>
        <strong className="equity-value tabular-nums">{money(totalEquity)}</strong>
        <span className="equity-sub tabular-nums">≈ {Number(totalEquity).toFixed(2)} USDC · Available <b className="tabular-nums">{Number(available).toFixed(2)}</b>{valuationPartial ? " · Valuation partial" : ""}</span>
      </section>

      <div className="quick-actions">
        <button type="button" className="action-card" onClick={() => push({ id: "deposit-asset", title: "Select Asset" })}>
          <Download className="action-icon" size={22} />
          <span className="action-text">
            <b>Deposit</b>
            <em>Deposit crypto</em>
          </span>
        </button>
        <button type="button" className="action-card" onClick={() => push({ id: "withdraw-asset", title: "Withdraw" })}>
          <Upload className="action-icon" size={22} />
          <span className="action-text">
            <b>Withdraw</b>
            <em>Withdraw crypto</em>
          </span>
        </button>
        <button type="button" className="action-card" onClick={() => push({ id: "swap", title: "Swap" })}>
          <ArrowLeftRight className="action-icon" size={22} />
          <span className="action-text">
            <b>Swap</b>
            <em>Swap assets</em>
          </span>
        </button>
      </div>

      <button type="button" className="fiat-entry-card" onClick={() => push({ id: "fiat-deposit", title: "Fiat Deposit" })}>
        <span className="fiat-entry-icon"><Banknote size={20} strokeWidth={1.8} /></span>
        <span className="fiat-entry-body">
          <b>Fiat Deposit</b>
          <em>Bank transfer · USD / MYR / GBP / EUR / JPY / TWD</em>
        </span>
        <ChevronRight size={18} className="fiat-entry-arrow" />
      </button>

      <section className="asset-list-card">
        {rows.map((asset) => (
          <button type="button" className="asset-row" key={asset.asset}>
            <CryptoIcon asset={asset.asset} />
            <span className="asset-row-name">
              <b>{asset.asset}</b>
              <em>Available</em>
            </span>
            <span className="asset-row-value">
              <b className="tabular-nums">{Number(asset.balance || 0).toFixed(assetDigits(asset.asset))}</b>
              <em className="tabular-nums">{asset.totalUsdValue == null ? "Price unavailable" : money(asset.totalUsdValue)}</em>
            </span>
            <ChevronRight className="asset-row-arrow" size={18} />
          </button>
        ))}
      </section>

      <section className="activity-card">
        <div className="activity-head">
          <h3>Recent Activity</h3>
          <button type="button" className="activity-view-all" onClick={() => push({ id: "funding-records", title: "Funding Records" })}>View All <ChevronRight size={14} /></button>
        </div>
        {activities.length ? (
          <div className="activity-list">
            {activities.map((act) => (
              <button type="button" key={act.id} className="activity-row" onClick={() => openActivity(act)}>
                <span className={`activity-icon activity-icon-${act.kind}`}>
                  {act.kind === "deposit" && <Download size={16} />}
                  {act.kind === "withdraw" && <Upload size={16} />}
                  {act.kind === "funding" && <ArrowLeftRight size={16} />}
                </span>
                <span className="activity-meta">
                  <b>{act.title}</b>
                  <em>{formatActivityTime(act.time)}</em>
                </span>
                <span className={`activity-status status-${statusTone(act.status)}`}>{statusLabel(act.status)}</span>
                <span className={`activity-amount ${act.amount >= 0 ? "good" : "bad"} tabular-nums`}>{act.amount >= 0 ? "+" : ""}{Number(act.amount).toFixed(assetDigits(act.asset))} {act.asset}</span>
                <ChevronRight className="activity-arrow" size={16} />
              </button>
            ))}
          </div>
        ) : (
          <div className="activity-empty">No recent activity yet</div>
        )}
      </section>
    </div>
  );
}

function txTitle(type: string, asset: string) {
  const map: Record<string, string> = {
    funding_fee: "Funding Fee",
    funding: "Funding Fee",
    swap: "Swap",
    trade: "Trade Settlement",
    settlement: "Trade Settlement",
    signup_bonus: "Signup Bonus",
    deposit: `Deposit ${asset}`,
    withdrawal: `Withdraw ${asset}`,
    refund: "Refund",
    adjustment: "Adjustment"
  };
  return map[type?.toLowerCase()] || (type ? type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Transaction");
}
function statusTone(status: string): "completed" | "pending" | "settled" | "failed" {
  const s = (status || "").toLowerCase();
  if (["completed", "approved", "success", "done"].includes(s)) return "completed";
  if (["pending", "review", "processing", "awaiting"].includes(s)) return "pending";
  if (["failed", "rejected", "canceled", "cancelled"].includes(s)) return "failed";
  return "settled";
}
function statusLabel(status: string) {
  const key = (status || "").toLowerCase();
  const labels: Record<string, string> = { pending: "Pending", processing: "Processing", approved: "Approved", completed: "Completed", success: "Completed", done: "Completed", rejected: "Rejected", cancelled: "Cancelled", canceled: "Cancelled", failed: "Failed" };
  return labels[key] || "Pending";
}
function formatActivityTime(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function Sparkline({ symbol, change, className, stretch }: { symbol: string; change: number; className?: string; stretch?: boolean }) {
  const tone = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const seed = baseAsset(symbol).split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const points = Array.from({ length: 7 }, (_, index) => {
    const wave = Math.sin((seed + index * 11) / 8) * 8;
    const trend = tone === "up" ? 24 - index * 2.2 : tone === "down" ? 10 + index * 2.2 : 17 + Math.sin(index) * 1.2;
    return `${index * 9},${Math.max(5, Math.min(31, trend + wave * 0.35)).toFixed(1)}`;
  }).join(" ");
  return (
    <svg className={`sparkline ${tone}${className ? ` ${className}` : ""}`} viewBox="0 0 54 36" preserveAspectRatio={stretch ? "none" : undefined} aria-hidden="true">
      <polyline points={points} />
    </svg>
  );
}

function KairoxAccountAvatar({ variant }: { variant: "verified" | "pending" | "unverified" }) {
  return (
    <div className={`kairox-avatar kairox-avatar-${variant}`} aria-hidden="true">
      <img
        className="kairox-avatar-symbol"
        src="/brand/kairox-symbol.png"
        alt=""
        onError={(e) => {
          const el = e.currentTarget;
          if (el.dataset.fallback) return;
          el.dataset.fallback = "1";
          el.src = "/brand/kairox-symbol.svg";
        }}
      />
    </div>
  );
}

function AccountTab({ user, kycStatus, push, logout }: { user: User; kycStatus: string; push: (p: StackPage) => void; logout: () => void }) {
  const uid = displayUid(user);
  const email = user.email || "user@kairox.local";
  const displayName = email.split("@")[0] || `UID ${uid}`;
  const avatarLabel = (displayName.match(/[a-z0-9]/i)?.[0] || "U").toUpperCase();
  const kycText = kycStatus === "approved" ? "Verified" : kycStatus === "pending" ? "Reviewing" : kycStatus === "rejected" ? "Rejected" : "Unverified";

  type MenuRow = { page: StackPage; Icon: typeof ShieldCheck; tone: "green" | "yellow" | "muted"; brand?: boolean; subtitle?: string };
  const accountMenu: MenuRow[] = [
    { page: { id: "security", title: "Security Settings" }, Icon: ShieldCheck, tone: "green" },
    { page: { id: "kyc", title: "KYC Verification" }, Icon: BadgeCheck, tone: "yellow" }
  ];
  const legalMenu: MenuRow[] = [
    { page: { id: "about", title: "About KAIROX" }, Icon: Info, tone: "muted", brand: true, subtitle: "Version, platform info and legal details" },
    { page: { id: "terms", title: "Terms of Service" }, Icon: FileText, tone: "muted" },
    { page: { id: "privacy", title: "Privacy Policy" }, Icon: ShieldCheck, tone: "muted" }
  ];
  const supportMenu: MenuRow[] = [
    { page: { id: "support", title: "Support" }, Icon: Headphones, tone: "muted" }
  ];

  const renderRow = ({ page, Icon, tone, brand, subtitle }: MenuRow) => (
    <button key={page.id} type="button" className={`profile-menu-row${subtitle ? " has-subtitle" : ""}`} onClick={() => push(page)}>
      {brand ? (
        <span className="profile-menu-icon profile-menu-icon-brand" aria-hidden="true">
          <img
            src="/brand/kairox-symbol.png"
            alt=""
            onError={(e) => {
              const el = e.currentTarget;
              if (el.dataset.fallback) return;
              el.dataset.fallback = "1";
              el.src = "/brand/kairox-symbol.svg";
            }}
          />
        </span>
      ) : (
        <Icon className={`profile-menu-icon tone-${tone}`} size={26} strokeWidth={1.8} aria-hidden="true" />
      )}
      <span className="profile-menu-text">
        <span className="profile-menu-label">{page.title}</span>
        {subtitle && <em className="profile-menu-sub">{subtitle}</em>}
      </span>
      <ChevronRight className="profile-menu-arrow" size={18} aria-hidden="true" />
    </button>
  );

  const kycVariant = kycStatus === "approved" ? "verified" : kycStatus === "pending" ? "pending" : "unverified";
  return (
    <div className="tab-page profile-page">
      <div className="profile-hero">
        <KairoxAccountAvatar variant={kycVariant} />
        <div className="profile-hero-info">
          <div className="profile-hero-top">
            <h2 className="profile-name">{displayName}</h2>
            <span className={`kyc-chip kyc-chip-v2 ${kycVariant}`}>
              {kycVariant === "verified" && <ShieldCheck size={11} strokeWidth={2.2} aria-hidden="true" />}
              {kycVariant === "pending" && <Clock size={11} strokeWidth={2.2} aria-hidden="true" />}
              {kycVariant === "unverified" && <span className="kyc-chip-dot" aria-hidden="true" />}
              {kycText}
            </span>
          </div>
          <p className="profile-email">{email}</p>
          <div className="profile-meta-row">
            <span className="profile-meta-item"><small>UID</small><b className="tabular-nums">{uid}</b></span>
            <span className="profile-meta-divider" aria-hidden="true" />
            <span className="profile-meta-item"><small>REF</small><b className="tabular-nums">FX789</b></span>
          </div>
        </div>
      </div>

      <div className="profile-section-title">Account</div>
      <div className="profile-menu-list">{accountMenu.map(renderRow)}</div>

      <div className="profile-section-title">Support</div>
      <div className="profile-menu-list">{supportMenu.map(renderRow)}</div>

      <div className="profile-section-title">Legal</div>
      <div className="profile-menu-list">{legalMenu.map(renderRow)}</div>

      <div className="profile-menu-list">
        <button type="button" className="profile-menu-row profile-menu-row-logout" onClick={logout}>
          <LogOut className="profile-menu-icon tone-red" size={26} strokeWidth={1.8} aria-hidden="true" />
          <span className="profile-menu-label">Log out</span>
          <ChevronRight className="profile-menu-arrow" size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function StackContent(props: { page: StackPage; user: User; assets: AssetData | null; selectedCoin: string; setSelectedCoin: (v: string) => void; selectedNetwork: string; setSelectedNetwork: (v: string) => void; push: (p: StackPage) => void; replaceStack: (p: StackPage) => void; clearStack: () => void; showToast: (type: "ok" | "err" | "info", text: string) => void; withdrawForm: { address: string; amount: string; password: string }; setWithdrawForm: (v: { address: string; amount: string; password: string }) => void; swap: { from: string; to: string; amount: string }; setSwap: (v: { from: string; to: string; amount: string }) => void; kycStatus: string; setKycStatus: (v: "none" | "pending" | "approved" | "rejected") => void; expandedSecurity: "login" | "withdraw" | null; setExpandedSecurity: (v: "login" | "withdraw" | null) => void; support: { telegram: string; whatsapp: string }; settings: Partial<PublicSettings>; logout: () => void; refreshData: () => void | Promise<void> }) {
  const { page, selectedCoin, setSelectedCoin, selectedNetwork, setSelectedNetwork, push, replaceStack, clearStack, showToast } = props;
  if (page.id === "deposit-asset" || page.id === "withdraw-asset") {
    const mode = page.id.startsWith("deposit") ? "deposit" : "withdraw";
    return <AssetPicker title={mode === "deposit" ? "Select Asset" : "Withdraw"} mode={mode} assets={props.assets} onPick={(coin) => { setSelectedCoin(coin); push(mode === "deposit" ? { id: "deposit-network", title: `Select Network · ${coin}` } : { id: "withdraw-network", title: "Select Network" }); }} />;
  }
  if (page.id === "deposit-network") return <NetworkPicker coin={selectedCoin} mode="deposit" assets={props.assets} onPick={(network) => { setSelectedNetwork(network); push({ id: "deposit-address", title: `${selectedCoin} (${network}) Deposit` }); }} />;
  if (page.id === "withdraw-network") return <NetworkPicker coin={selectedCoin} mode="withdraw" assets={props.assets} onPick={(network) => { setSelectedNetwork(network); push({ id: "withdraw-form", title: `Withdraw ${selectedCoin}` }); }} />;
  if (page.id === "deposit-address") return <DepositAddress coin={selectedCoin} network={selectedNetwork} assets={props.assets} showToast={showToast} done={() => { showToast("info", "Deposit submitted for review."); clearStack(); }} />;
  if (page.id === "withdraw-form") return <WithdrawForm coin={selectedCoin} network={selectedNetwork} assets={props.assets} form={props.withdrawForm} setForm={props.setWithdrawForm} done={(record) => { showToast("ok", "Withdrawal request submitted successfully."); replaceStack({ id: "withdraw-detail", title: "Withdrawal Details", record }); }} />;
  if (page.id === "withdraw-detail") return <WithdrawalDetail record={page.record} />;
  if (page.id === "deposit-history") return <RecordList kind="deposits" assets={props.assets} />;
  if (page.id === "withdraw-history") return <RecordList kind="withdrawals" assets={props.assets} push={push} />;
  if (page.id === "funding-records") return <RecordList kind="transactions" assets={props.assets} />;
  if (page.id === "swap") return <SwapPage assets={props.assets} swap={props.swap} setSwap={props.setSwap} showToast={showToast} refreshData={props.refreshData} />;
  if (page.id === "asset-overview") return <AssetsTab assets={props.assets} push={push} />;
  if (page.id === "security") return <SecurityPage expanded={props.expandedSecurity} setExpanded={props.setExpandedSecurity} showToast={showToast} />;
  if (page.id === "kyc") return <KycPage kycStatus={props.kycStatus} rejectedReason={props.user.kyc_rejected_reason} setKycStatus={props.setKycStatus} push={push} done={() => { showToast("ok", "KYC submitted successfully."); clearStack(); }} />;
  if (page.id === "support") return <SupportPage support={props.support} push={push} />;
  if (page.id === "support-chat") return <SupportChatPage />;
  if (page.id === "fiat-deposit") return <FiatDepositScreen push={push} showToast={showToast} />;
  return <StaticPage page={page} settings={props.settings} />;
}

function AssetPicker({ mode, assets, onPick }: { title: string; mode: "deposit" | "withdraw"; assets: AssetData | null; onPick: (coin: string) => void }) {
  return (
    <div className="stack-page deposit-flow">
      {pickerCoins(assets, mode).map((coin, idx) => {
        const available = availableForAsset(assets, coin);
        return (
          <button type="button" className={`deposit-asset-card${idx === 0 ? " is-focused" : ""}`} key={coin} onClick={() => onPick(coin)}>
            <CryptoIcon asset={coin} />
            <span className="deposit-asset-meta">
              <b>{coin}</b>
              <em className="tabular-nums">Available {assetAmount(available, coin)}</em>
            </span>
            <ChevronRight size={18} className="deposit-asset-arrow" />
          </button>
        );
      })}
    </div>
  );
}

function NetworkPicker({ coin, mode, assets, onPick }: { coin: string; mode: "deposit" | "withdraw"; assets: AssetData | null; onPick: (network: string) => void }) {
  const rows = mode === "deposit" ? depositNetworksForCoin(assets, coin) : networksForCoin(coin);
  return (
    <div className="stack-page deposit-flow">
      {rows.map((network) => (
        <button type="button" className="deposit-network-card" key={network} onClick={() => onPick(network)}>
          <span className="deposit-network-dot" aria-hidden="true" />
          <CryptoIcon asset={coin} />
          <span className="deposit-network-meta">
            <b>{networkDisplayName(network, coin)}</b>
            <em>{mode === "deposit" ? "Active deposit network" : `Fee: 1 ${coin}`}</em>
          </span>
          <ChevronRight size={18} className="deposit-network-arrow" />
        </button>
      ))}
      {mode === "deposit" && (
        <p className="deposit-flow-hint">Only send <b>{coin}</b> through the {networkDisplayName(rows[0] || "", coin)} network. Deposits via other networks may be lost.</p>
      )}
    </div>
  );
}

function networkDisplayName(network: string, coin: string) {
  if (!network) return coin === "BTC" ? "Bitcoin" : coin === "ETH" ? "Ethereum" : coin === "SOL" ? "Solana" : coin;
  const upper = network.toUpperCase();
  if (upper === "BITCOIN" || (coin === "BTC" && upper === "BTC")) return "Bitcoin";
  if (upper === "ETHEREUM" || upper === "ERC20") return "Ethereum (ERC20)";
  if (upper === "SOLANA") return "Solana";
  if (upper === "TRC20") return "Tron (TRC20)";
  if (upper === "BSC" || upper === "BEP20") return "BNB Chain (BEP20)";
  return network;
}

function StatusChip({ status }: { status: string }) {
  const key = status.toLowerCase();
  const labels: Record<string, string> = { pending: "Pending", processing: "Processing", approved: "Approved", completed: "Completed", rejected: "Rejected", cancelled: "Cancelled", canceled: "Cancelled", failed: "Failed" };
  return <span className={`status-chip ${key}`}>{labels[key] || "Pending"}</span>;
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
    return <div className="stack-page"><div className="record-list">{rows.map((row) => <div className="record-line" key={row.id}><div><b>{assetAmount(row.amount, row.asset)}</b><StatusChip status={row.status} /></div><small>{row.network} - {compactDateTime(row.created_at)}</small>{row.tx_hash && <small className="record-hash">TX {row.tx_hash}</small>}</div>)}{!rows.length && <div className="empty-state">No deposit records yet.</div>}</div></div>;
  }
  if (kind === "withdrawals") {
    const rows = assets?.withdrawals || [];
    return <div className="stack-page"><div className="record-list">{rows.map((row) => <button type="button" className="record-line record-button" key={row.id} onClick={() => push?.({ id: "withdraw-detail", title: "Withdrawal Details", record: row })}><div><b>{assetAmount(row.amount, row.asset)}</b><StatusChip status={row.status} /></div><small>{row.network || "Network"} - {compactDateTime(row.created_at)}</small>{row.address && <small className="record-hash">{row.address}</small>}<span className="record-arrow">{">"}</span></button>)}{!rows.length && <div className="empty-state">No withdrawal records yet.</div>}</div></div>;
  }
  const rows = assets?.transactions || [];
  return <div className="stack-page"><div className="record-list">{rows.map((row) => <div className="record-line" key={row.id}><div><b>{fundingRecordLabel(row.type)}</b><StatusChip status={row.status} /></div><small className={`tabular-nums ${row.amount >= 0 ? "good" : "bad"}`}>{assetAmount(row.amount, row.asset, true)}</small>{row.note && <small>{row.note}</small>}<small>{compactDateTime(row.created_at)}</small></div>)}{!rows.length && <div className="empty-state">No funding records yet.</div>}</div></div>;
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
  const depositReqIdRef = useRef(crypto.randomUUID());
  // Build fingerprint: any change to key fields ⇒ new idempotency key
  const proofFp = proof ? `${proof.name}|${proof.size}|${proof.type}|${proof.lastModified}` : "";
  const depositFp = `${coin}|${network}|${amount}|${txHash}|${proofFp}`;
  const lastDepositFpRef = useRef(depositFp);
  useEffect(() => {
    if (submitting || lastDepositFpRef.current === depositFp) return;
    lastDepositFpRef.current = depositFp;
    depositReqIdRef.current = crypto.randomUUID();
  }, [depositFp, submitting]);
  const depositRequestId = depositReqIdRef.current;
  const selected = assets?.depositAddresses?.find((item) => displayAsset(item.asset) === displayAsset(coin) && item.network === network);
  const address = selected?.address || "";
  async function copyAddress() {
    if (!address) return showToast("err", "No active address to copy");
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(address);
      showToast("ok", "Address copied successfully.");
    } catch {
      showToast("err", "Unable to copy the address. Please try again.");
    }
  }
  async function pickProof(file: File | undefined) {
    setError("");
    if (!file) return setProof(null);
    if (!supportedProofTypes.has(file.type)) return setError("Unsupported file type");
    try {
      const result = await compressImage(file);
      if (!result.ok) return setError(result.error);
      setProof(result.file);
    } catch {
      setError("Unable to process this image");
    }
  }
  async function submit() {
    if (submitting) return;
    setError("");
    const numericAmount = Number(amount);
    if (!selected?.address) return setError("No active deposit address for this asset/network");
    if (!amount.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) return setError("Enter a valid deposit amount");
    if (proof && proof.size > 5 * 1024 * 1024) return setError("Compressed image is still larger than 5MB");
    setSubmitting(true);
    try {
      const form = new FormData();
      form.set("asset", selected.asset);
      form.set("network", network);
      form.set("amount", amount);
      form.set("txHash", txHash);
      form.set("clientRequestId", depositRequestId);
      if (proof) form.set("proof", proof);
      const res = await fetchWithTimeout("/api/assets/deposits", { method: "POST", body: form });
      if (!res.ok) return setError(await responseErrorMessage(res, "Unable to submit deposit. Please try again."));
      // Success: mark used so next form change produces a fresh idempotency key
      lastDepositFpRef.current = depositFp;
      depositReqIdRef.current = crypto.randomUUID();
      done();
    } catch (error) {
      setError(error instanceof RequestTimeoutError ? "Request timed out. Please try again." : "Unable to connect to the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div className="stack-page deposit-flow deposit-address-flow">
      <section className="deposit-address-card">
        <div className="deposit-address-head">
          <small>Deposit Address</small>
        </div>
        <div className="deposit-address-row">
          <p className="deposit-address-text">{address || "No active address"}</p>
          <button type="button" className="deposit-address-copy-mini" onClick={copyAddress} aria-label="Copy address">
            <FileText size={16} />
          </button>
        </div>
        <div className="deposit-qr-box">
          <LocalQrCode value={address || `${coin}:${network}`} />
        </div>
        <button type="button" className="deposit-copy-btn" onClick={copyAddress}>
          <FileText size={16} /> Copy Address
        </button>
      </section>

      <label className="deposit-field">
        <span>Amount ({coin})</span>
        <div className="deposit-input-wrap">
          <input type="number" min="0" step="any" placeholder={`Min 0.0001 ${coin}`} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      </label>

      <label className="deposit-field">
        <span>TX Hash <em className="deposit-field-optional">(Optional)</em></span>
        <div className="deposit-input-wrap">
          <input value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="Enter transaction hash (optional)" />
        </div>
      </label>

      <label className="deposit-upload">
        <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(e) => pickProof(e.target.files?.[0])} hidden />
        <Upload size={24} className="deposit-upload-icon" />
        <b>{proof ? proof.name : "Tap to upload proof of payment"}</b>
        <em>JPG, PNG, WebP, HEIC or HEIF, up to 25MB. Large images will be compressed automatically.</em>
      </label>

      {error && <div className="form-error">{error}</div>}

      <button type="button" className="deposit-submit-btn" disabled={submitting} onClick={submit}>
        {submitting ? "Submitting..." : "Submit Deposit"}
      </button>
    </div>
  );
}

function WithdrawForm({ coin, network, assets, form, setForm, done }: { coin: string; network: string; assets: AssetData | null; form: { address: string; amount: string; password: string }; setForm: (v: { address: string; amount: string; password: string }) => void; done: (record: WithdrawalRecord) => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const withdrawReqIdRef = useRef(crypto.randomUUID());
  // Regenerate clientRequestId when key fields change
  const keyFields = `${coin}|${network}|${form.address}|${form.amount}`;
  const lastFieldsRef = useRef(keyFields);
  useEffect(() => {
    if (submitting || lastFieldsRef.current === keyFields) return;
    lastFieldsRef.current = keyFields;
    withdrawReqIdRef.current = crypto.randomUUID();
  }, [keyFields, submitting]);
  const withdrawRequestId = withdrawReqIdRef.current;
  const available = availableForAsset(assets, coin);
  const minWithdrawal = displayAsset(coin) === "USDC" ? Number(assets?.settings?.min_withdrawal_usdc || assets?.settings?.min_withdrawal_amount || 10) : 0;
  async function submit() {
    if (submitting) return;
    setError("");
    const numericAmount = Number(form.amount);
    if (!form.address.trim()) return setError("Withdrawal address is required");
    if (!form.amount.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) return setError("Enter a valid withdrawal amount");
    if (Number.isFinite(minWithdrawal) && numericAmount < minWithdrawal) return setError(`Minimum withdrawal is ${assetAmount(minWithdrawal, coin)}`);
    if (numericAmount > available) return setError("Insufficient available balance");
    if (!form.password.trim()) return setError("Withdrawal password is required");
    setSubmitting(true);
    try {
      const res = await fetchWithTimeout("/api/assets/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset: coin,
          network,
          amount: Number(form.amount),
          address: form.address,
          withdrawalPassword: form.password,
          clientRequestId: withdrawRequestId
        })
      });
      if (!res.ok) return setError(await responseErrorMessage(res, "Unable to submit withdrawal. Please try again."));
      const result = await res.json() as { withdrawalId?: number };
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
    } catch (error) {
      setError(error instanceof RequestTimeoutError ? "Request timed out. Please try again." : "Unable to submit withdrawal. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }
  return <div className="stack-page withdraw-form-page"><p className="muted-line">Network: {network} - Available: <span className="tabular-nums">{assetAmount(available, coin)}</span></p><label className="mobile-field"><span>Withdrawal Address</span><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder={`Enter ${coin} address`} /></label><label className="mobile-field"><span>Amount ({coin})</span><input type="number" min="0" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label><label className="mobile-field"><span>Withdrawal Password</span><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>{error && <div className="form-error">{error}</div>}<button type="button" className="mobile-primary call" disabled={submitting} onClick={submit}>{submitting ? "Submitting..." : "Withdraw"}</button></div>;
}

type SwapQuoteData = {
  fromAsset: string;
  toAsset: string;
  fromAmount: number;
  fromUsdPrice: number;
  toUsdPrice: number;
  fromUsdValue: number;
  toAmountGross: number;
  feeAmount: number;
  feeUsdValue: number;
  toAmount: number;
  rate: number;
  priceSource: { from: string; to: string };
};

type SwapReceiptData = SwapQuoteData & { swapId: number; txHash: string; completedAt: string };

const SWAP_ASSETS = ["USDC", "BTC", "ETH", "SOL"];
const SWAP_QUOTE_REFRESH_MS = 12_000;

function shortTxHash(hash: string) {
  if (!hash || hash.length < 12) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function SwapPage({ assets, swap, setSwap, showToast, refreshData }: { assets: AssetData | null; swap: { from: string; to: string; amount: string }; setSwap: (v: { from: string; to: string; amount: string }) => void; showToast: (type: "ok" | "err" | "info", text: string) => void; refreshData: () => void | Promise<void> }) {
  const [pickerOpen, setPickerOpen] = useState<"from" | "to" | null>(null);
  const [quote, setQuote] = useState<SwapQuoteData | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<SwapReceiptData | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [secondsToRefresh, setSecondsToRefresh] = useState(Math.floor(SWAP_QUOTE_REFRESH_MS / 1000));
  const [flipping, setFlipping] = useState(false);

  const fromAvailable = availableForAsset(assets, swap.from);
  const toAvailable = availableForAsset(assets, swap.to);
  const amountNum = Number(swap.amount);
  const validAmount = Number.isFinite(amountNum) && amountNum > 0;
  const sameAsset = swap.from === swap.to;
  const insufficient = validAmount && amountNum > fromAvailable + 1e-9;

  useEffect(() => {
    if (!validAmount || sameAsset) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    let active = true;
    setQuoteError(null);
    const params = new URLSearchParams({ fromAsset: swap.from, toAsset: swap.to, amount: String(amountNum) });
    fetch(`/api/assets/swap?${params.toString()}`, { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json();
        if (!active) return;
        if (!r.ok) {
          setQuote(null);
          setQuoteError(data?.error || "Quote unavailable");
        } else {
          setQuote(data.quote as SwapQuoteData);
        }
      })
      .catch(() => {
        if (!active) return;
        setQuote(null);
        setQuoteError("Quote unavailable");
      });
    return () => { active = false; };
  }, [swap.from, swap.to, amountNum, sameAsset, validAmount, refreshTick]);

  useEffect(() => {
    if (!validAmount || sameAsset) return;
    setSecondsToRefresh(Math.floor(SWAP_QUOTE_REFRESH_MS / 1000));
    const tickTimer = setInterval(() => {
      setSecondsToRefresh((s) => (s <= 1 ? Math.floor(SWAP_QUOTE_REFRESH_MS / 1000) : s - 1));
    }, 1000);
    const refreshTimer = setInterval(() => setRefreshTick((t) => t + 1), SWAP_QUOTE_REFRESH_MS);
    return () => { clearInterval(tickTimer); clearInterval(refreshTimer); };
  }, [swap.from, swap.to, amountNum, sameAsset, validAmount]);

  const fromUsdValue = quote?.fromUsdValue ?? (validAmount && quote == null ? amountNum : 0);
  const toAmount = quote?.toAmount ?? 0;
  const toUsdValue = quote ? quote.toAmount * quote.toUsdPrice : 0;
  const priceImpactPct = quote && quote.fromUsdValue > 0 ? ((toUsdValue - quote.fromUsdValue) / quote.fromUsdValue) * 100 : 0;

  function setQuickRatio(ratio: number) {
    if (fromAvailable <= 0) return;
    const next = roundToAssetDigits(fromAvailable * ratio, swap.from);
    setSwap({ ...swap, amount: String(next) });
  }

  function flipAssets() {
    setFlipping(true);
    setTimeout(() => setFlipping(false), 350);
    setSwap({ ...swap, from: swap.to, to: swap.from });
  }

  async function submitSwap() {
    if (submitting || !quote) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/assets/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromAsset: swap.from, toAsset: swap.to, amount: amountNum })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast("err", data?.error || "Swap failed");
        return;
      }
      setReceipt(data.receipt as SwapReceiptData);
    } finally {
      setSubmitting(false);
    }
  }

  let buttonLabel = "Swap (Preview)";
  let buttonSub = "Review details before confirming";
  let buttonDisabled = false;
  let buttonTone: "primary" | "muted" = "primary";
  if (sameAsset) {
    buttonLabel = "Choose a different asset"; buttonSub = ""; buttonDisabled = true; buttonTone = "muted";
  } else if (!validAmount) {
    buttonLabel = "Enter amount"; buttonSub = ""; buttonDisabled = true; buttonTone = "muted";
  } else if (insufficient) {
    buttonLabel = "Insufficient balance"; buttonSub = ""; buttonDisabled = true; buttonTone = "muted";
  } else if (quoteError && !quote) {
    buttonLabel = "Quote unavailable"; buttonSub = quoteError; buttonDisabled = true; buttonTone = "muted";
  } else if (!quote) {
    buttonLabel = "Fetching rate…"; buttonSub = "One moment"; buttonDisabled = true; buttonTone = "muted";
  } else {
    buttonLabel = "Confirm Swap"; buttonSub = `Receive ${assetAmount(quote.toAmount, swap.to)}`; buttonDisabled = false; buttonTone = "primary";
  }

  return (
    <div className="stack-page swap-stack">
      <section className="swap-card-v2">
        <header className="swap-head">
          <div>
            <h1>Swap</h1>
            <p>Exchange tokens instantly</p>
          </div>
        </header>

        <div className="swap-input-block">
          <div className="swap-input-label">
            <span>From</span>
            <span className="swap-bal">Balance: <b className="tabular-nums">{assetAmount(fromAvailable, swap.from)}</b></span>
          </div>
          <div className="swap-input-card">
            <button type="button" className="swap-asset-trigger" onClick={() => setPickerOpen("from")}>
              <CryptoIcon asset={swap.from} />
              <span className="swap-asset-code">{swap.from}</span>
              <ChevronRight className="swap-asset-caret" size={16} />
            </button>
            <div className="swap-amount-wrap">
              <input
                className="swap-amount-input tabular-nums"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="0"
                value={swap.amount}
                onChange={(e) => setSwap({ ...swap, amount: e.target.value })}
                aria-label={`Swap amount (${swap.from})`}
              />
              <em className="swap-amount-usd tabular-nums">≈ ${fromUsdValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</em>
            </div>
          </div>
          <div className="swap-quick-row">
            {[0.25, 0.5, 0.75].map((r) => (
              <button key={r} type="button" className="swap-quick" onClick={() => setQuickRatio(r)}>{Math.round(r * 100)}%</button>
            ))}
            <button type="button" className="swap-quick swap-quick-max" onClick={() => setQuickRatio(1)}>Max</button>
          </div>
        </div>

        <div className="swap-flip-wrap">
          <button type="button" className={`swap-flip-btn${flipping ? " flipping" : ""}`} onClick={flipAssets} aria-label="Flip swap direction">
            <ArrowUpDown size={20} />
          </button>
        </div>

        <div className="swap-input-block">
          <div className="swap-input-label">
            <span>To (Estimated)</span>
            <span className="swap-bal">Balance: <b className="tabular-nums">{assetAmount(toAvailable, swap.to)}</b></span>
          </div>
          <div className="swap-input-card swap-input-card-out">
            <button type="button" className="swap-asset-trigger" onClick={() => setPickerOpen("to")}>
              <CryptoIcon asset={swap.to} />
              <span className="swap-asset-code">{swap.to}</span>
              <ChevronRight className="swap-asset-caret" size={16} />
            </button>
            <div className="swap-amount-wrap">
              <b className="swap-amount-output tabular-nums">{toAmount > 0 ? Number(toAmount).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: assetDigits(swap.to) }) : "0"}</b>
              <em className="swap-amount-usd tabular-nums">
                ≈ ${toUsdValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {quote && Math.abs(priceImpactPct) > 0.01 && (
                  <span className={priceImpactPct >= 0 ? " good" : " bad"}> ({priceImpactPct >= 0 ? "+" : ""}{priceImpactPct.toFixed(2)}%)</span>
                )}
              </em>
            </div>
          </div>
        </div>

        <div className="swap-preview-card">
          <div className="swap-preview-row"><span>Estimated fee</span><b className="tabular-nums">0.25%{quote ? ` · ${assetAmount(quote.feeAmount, swap.to)}` : ""}</b></div>
          <div className="swap-preview-row"><span>Rate</span><b className="tabular-nums">{quote ? `1 ${swap.from} ≈ ${Number(quote.rate).toLocaleString("en-US", { maximumFractionDigits: 8 })} ${swap.to}` : "—"}</b></div>
        </div>

        <button type="button" className={`swap-primary-btn ${buttonTone}`} disabled={buttonDisabled || submitting} onClick={submitSwap}>
          <span className="swap-primary-main">{submitting ? "Processing…" : buttonLabel}</span>
          {buttonSub && <span className="swap-primary-sub">{buttonSub}</span>}
        </button>

        <div className="swap-rate-status">
          <span className="swap-rate-status-dot" />
          <span>Rate is updated in real-time</span>
          <span className="swap-rate-status-spacer" />
          <Clock size={13} /> <span className="tabular-nums">00:{secondsToRefresh.toString().padStart(2, "0")}</span>
        </div>
      </section>

      {pickerOpen && (
        <SwapAssetPicker
          assets={assets}
          current={pickerOpen === "from" ? swap.from : swap.to}
          exclude={pickerOpen === "from" ? swap.to : swap.from}
          onPick={(asset) => {
            if (pickerOpen === "from") setSwap({ ...swap, from: asset, to: swap.to === asset ? swap.from : swap.to });
            else setSwap({ ...swap, to: asset, from: swap.from === asset ? swap.to : swap.from });
            setPickerOpen(null);
          }}
          onClose={() => setPickerOpen(null)}
        />
      )}

      {receipt && (
        <SwapSuccessModal receipt={receipt} onClose={() => { setReceipt(null); setSwap({ ...swap, amount: "" }); void refreshData(); }} showToast={showToast} />
      )}
    </div>
  );
}

function roundToAssetDigits(value: number, asset: string) {
  const d = assetDigits(asset);
  const f = 10 ** d;
  return Math.floor(value * f) / f;
}

function SwapAssetPicker({ assets, current, exclude, onPick, onClose }: { assets: AssetData | null; current: string; exclude?: string; onPick: (asset: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const list = SWAP_ASSETS
    .filter((asset) => !exclude || asset !== exclude)
    .filter((asset) => !query || asset.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="swap-picker-bg" onClick={onClose}>
      <div className="swap-picker-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="swap-picker-title">
        <h2 id="swap-picker-title" className="sr-only">Select token</h2>
        <div className="sheet-handle" />
        <div className="swap-picker-search">
          <Search size={16} />
          <input autoFocus placeholder="Search token" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search token" />
        </div>
        <div className="swap-picker-list">
          {list.map((asset) => {
            const bal = availableForAsset(assets, asset);
            const fullName = asset === "USDC" ? "USD Coin" : asset === "BTC" ? "Bitcoin" : asset === "ETH" ? "Ethereum" : asset === "SOL" ? "Solana" : asset;
            const selected = asset === current;
            return (
              <button key={asset} type="button" className={`swap-picker-row${selected ? " selected" : ""}`} onClick={() => onPick(asset)}>
                <CryptoIcon asset={asset} />
                <span className="swap-picker-name">
                  <b>{asset}</b>
                  <em>{fullName}</em>
                </span>
                <span className="swap-picker-bal tabular-nums">{Number(bal).toFixed(assetDigits(asset))}</span>
                {selected && <BadgeCheck size={18} className="swap-picker-check" />}
              </button>
            );
          })}
          {!list.length && <div className="swap-picker-empty">No tokens match</div>}
        </div>
      </div>
    </div>
  );
}

function SwapSuccessModal({ receipt, onClose, showToast }: { receipt: SwapReceiptData; onClose: () => void; showToast: (type: "ok" | "err" | "info", text: string) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  function copyHash() {
    navigator.clipboard?.writeText(receipt.txHash).then(
      () => showToast("ok", "Copied"),
      () => showToast("err", "Unable to copy the address. Please try again.")
    );
  }
  return (
    <div className="swap-success-bg" onClick={onClose}>
      <div className="swap-success-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="swap-success-title">
        <button type="button" className="swap-success-close" onClick={onClose} aria-label="Close">×</button>
        <div className="swap-success-icon-wrap">
          <div className="swap-success-icon">
            <BadgeCheck size={44} strokeWidth={2.5} />
          </div>
        </div>
        <h2 id="swap-success-title" className="swap-success-title">Swap Successful</h2>
        <p className="swap-success-sub">Your swap has been completed.</p>

        <div className="swap-success-flow">
          <div className="swap-success-card">
            <small>From</small>
            <div className="swap-success-card-body">
              <CryptoIcon asset={receipt.fromAsset} />
              <span className="swap-success-asset"><b>{receipt.fromAsset}</b></span>
              <span className="swap-success-amount tabular-nums">{Number(receipt.fromAmount).toLocaleString("en-US", { maximumFractionDigits: assetDigits(receipt.fromAsset) })}</span>
            </div>
            <em className="tabular-nums">≈ ${Number(receipt.fromUsdValue).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</em>
          </div>
          <div className="swap-success-arrow"><ChevronRight size={14} style={{ transform: "rotate(90deg)" }} /></div>
          <div className="swap-success-card">
            <small>To</small>
            <div className="swap-success-card-body">
              <CryptoIcon asset={receipt.toAsset} />
              <span className="swap-success-asset"><b>{receipt.toAsset}</b></span>
              <span className="swap-success-amount tabular-nums">{Number(receipt.toAmount).toLocaleString("en-US", { maximumFractionDigits: assetDigits(receipt.toAsset) })}</span>
            </div>
            <em className="tabular-nums">≈ ${Number(receipt.toAmount * receipt.toUsdPrice).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</em>
          </div>
        </div>

        <div className="swap-success-details">
          <div className="swap-success-row"><span>Estimated Fee</span><b className="tabular-nums">0.25% · {assetAmount(receipt.feeAmount, receipt.toAsset)}</b></div>
          <div className="swap-success-row"><span>Timestamp</span><b className="tabular-nums">{formatTimestamp(receipt.completedAt)}</b></div>
          <div className="swap-success-row">
            <span>Transaction ID</span>
            <button type="button" className="swap-success-hash" onClick={copyHash}>
              <span className="tabular-nums">{shortTxHash(receipt.txHash)}</span>
              <FileText size={13} />
            </button>
          </div>
        </div>

        <button type="button" className="swap-success-close-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function SecurityPage({ expanded, setExpanded, showToast }: { expanded: "login" | "withdraw" | null; setExpanded: (v: "login" | "withdraw" | null) => void; showToast: (type: "ok" | "err" | "info", text: string) => void }) {
  const [success, setSuccess] = useState<"login" | "withdraw" | null>(null);
  useEffect(() => {
    if (expanded === null) setExpanded("login");
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);
  return (
    <div className="stack-page security-page">
      <p className="security-page-sub">Manage your passwords to keep your account secure and protected.</p>
      <SecurityPanel id="login" title="Change Login Password" subtitle="Use a strong password to keep your account safe." expanded={expanded} setExpanded={setExpanded} showToast={showToast} onSuccess={() => setSuccess("login")} />
      <SecurityPanel id="withdraw" title="Withdrawal Password" subtitle="Used for withdrawals and sensitive account actions." expanded={expanded} setExpanded={setExpanded} showToast={showToast} onSuccess={() => setSuccess("withdraw")} />
      {success && <SecurityChangeSuccessModal kind={success} onClose={() => setSuccess(null)} />}
    </div>
  );
}

function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: "Weak" | "Fair" | "Good" | "Strong" } {
  if (!pw) return { score: 0, label: "Weak" };
  let score = 0;
  if (pw.length >= 6) score += 1;
  if (pw.length >= 10) score += 1;
  if (/[A-Za-z]/.test(pw) && /[0-9]/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  const s = Math.max(0, Math.min(4, score)) as 0 | 1 | 2 | 3 | 4;
  const label = s <= 1 ? "Weak" : s === 2 ? "Fair" : s === 3 ? "Good" : "Strong";
  return { score: s, label };
}

function SecurityPanel({ id, title, subtitle, expanded, setExpanded, showToast, onSuccess }: { id: "login" | "withdraw"; title: string; subtitle: string; expanded: "login" | "withdraw" | null; setExpanded: (v: "login" | "withdraw" | null) => void; showToast: (type: "ok" | "err" | "info", text: string) => void; onSuccess: () => void }) {
  const open = expanded === id;
  const [form, setForm] = useState({ current: "", next: "", confirm: "", login: "" });
  const [show, setShow] = useState({ current: false, next: false, confirm: false, login: false });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const strength = passwordStrength(form.next);
  const ruleLength = form.next.length >= 6;
  const ruleMix = /[A-Za-z]/.test(form.next) && /[0-9]/.test(form.next);
  const ruleNotIdentity = form.next.length > 0;
  const matches = form.next.length > 0 && form.next === form.confirm;

  async function save() {
    setError("");
    const current = form.current.trim();
    const next = form.next.trim();
    const confirm = form.confirm.trim();
    const login = form.login.trim();
    if (!current) return setError(id === "login" ? "Current password is required" : "Current withdrawal password is required");
    if (id === "withdraw" && !login) return setError("Login password is required");
    if (next.length < 6) return setError(id === "login" ? "Login password must be at least 6 characters" : "Withdrawal password must be at least 6 characters");
    if (next !== confirm) return setError(id === "login" ? "Login passwords do not match" : "Withdrawal passwords do not match");
    setSubmitting(true);
    const res = await fetch(id === "login" ? "/api/auth/password" : "/api/auth/withdrawal-password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id === "login"
        ? { currentPassword: current, newPassword: next, confirmPassword: confirm }
        : { loginPassword: login, currentWithdrawalPassword: current, newWithdrawalPassword: next, confirmWithdrawalPassword: confirm })
    });
    setSubmitting(false);
    if (!res.ok) return setError((await res.json()).error || "Password update failed");
    setForm({ current: "", next: "", confirm: "", login: "" });
    showToast("ok", id === "login" ? "Password updated" : "Withdrawal password updated");
    onSuccess();
  }

  return (
    <div className={`sec-card${open ? " open" : ""}`}>
      <button type="button" className="sec-card-head" onClick={() => setExpanded(open ? null : id)}>
        <span className={`sec-card-icon sec-card-icon-${id}${open ? " sec-card-icon-on" : ""}`}>
          <LockKeyhole size={22} strokeWidth={1.8} />
        </span>
        <span className="sec-card-meta">
          <b>{title}</b>
          <em>{subtitle}</em>
        </span>
        <ChevronRight className={`sec-card-chev${open ? " open" : ""}`} size={18} aria-hidden="true" />
      </button>
      {open && (
        <div className="sec-card-body">
          <SecField label="Current Password" placeholder={id === "login" ? "Enter current password" : "Enter current withdrawal password"} value={form.current} onChange={(v) => setForm({ ...form, current: v })} show={show.current} toggleShow={() => setShow({ ...show, current: !show.current })} autoComplete="current-password" />
          {id === "withdraw" && (
            <SecField label="Login Password" placeholder="Enter your login password to confirm" value={form.login} onChange={(v) => setForm({ ...form, login: v })} show={show.login} toggleShow={() => setShow({ ...show, login: !show.login })} autoComplete="current-password" />
          )}
          <SecField label="New Password" placeholder="At least 6 characters" value={form.next} onChange={(v) => setForm({ ...form, next: v })} show={show.next} toggleShow={() => setShow({ ...show, next: !show.next })} autoComplete="new-password" />
          <SecField label="Confirm Password" placeholder="Re-enter new password" value={form.confirm} onChange={(v) => setForm({ ...form, confirm: v })} show={show.confirm} toggleShow={() => setShow({ ...show, confirm: !show.confirm })} autoComplete="new-password" error={form.confirm.length > 0 && !matches ? "Passwords do not match." : undefined} />

          {form.next.length > 0 && (
            <div className="sec-strength">
              <div className="sec-strength-label">
                <span>Password Strength:</span>
                <b className={`sec-strength-tag tone-${strength.label.toLowerCase()}`}>{strength.label}</b>
              </div>
              <div className="sec-strength-bars">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={`sec-strength-bar${i < strength.score ? ` filled tone-${strength.label.toLowerCase()}` : ""}`} />
                ))}
              </div>
            </div>
          )}

          <ul className="sec-rules">
            <li className={ruleLength ? "ok" : ""}>
              <span className="sec-rule-bullet"><BadgeCheck size={13} strokeWidth={2} /></span>
              At least 6 characters
            </li>
            <li className={ruleMix ? "ok" : ""}>
              <span className="sec-rule-bullet"><BadgeCheck size={13} strokeWidth={2} /></span>
              Use a mix of letters and numbers
            </li>
            <li className={ruleNotIdentity ? "ok" : ""}>
              <span className="sec-rule-bullet"><BadgeCheck size={13} strokeWidth={2} /></span>
              Avoid using your email or name
            </li>
          </ul>

          {error && <div className="sec-error" role="alert">{error}</div>}

          <button
            type="button"
            className="sec-submit"
            disabled={submitting || !form.current || !ruleLength || !matches || (id === "withdraw" && !form.login)}
            onClick={save}
          >
            {submitting ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}
    </div>
  );
}

function SecField({ label, value, onChange, placeholder, show, toggleShow, autoComplete, error }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; show: boolean; toggleShow: () => void; autoComplete?: string; error?: string }) {
  const fieldId = `sec-field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
  return (
    <div className="sec-field">
      <label className="sec-field-label" htmlFor={fieldId}>{label}</label>
      <div className={`sec-input-wrap${error ? " error" : ""}`}>
        <input
          id={fieldId}
          type={show ? "text" : "password"}
          className="sec-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button type="button" className="sec-input-eye" onClick={toggleShow} aria-label={show ? "Hide password" : "Show password"}>
          {show ? <Eye size={18} strokeWidth={1.8} /> : <EyeOff size={18} strokeWidth={1.8} />}
        </button>
      </div>
      {error && <p className="sec-field-error">{error}</p>}
    </div>
  );
}

function SecurityChangeSuccessModal({ kind, onClose }: { kind: "login" | "withdraw"; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const title = kind === "login" ? "Password changed successfully." : "Withdrawal password updated successfully.";
  const body = kind === "login"
    ? "Your login password has been updated successfully."
    : "Your withdrawal password has been updated successfully.";
  return (
    <div className="sec-success-bg" onClick={onClose}>
      <div className="sec-success-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="sec-success-title">
        <div className="sec-success-icon-wrap" aria-hidden="true">
          <svg className="sec-success-sparkles" viewBox="0 0 200 200">
            <text x="20" y="40" fontSize="16" fill="#26E878">+</text>
            <text x="170" y="40" fontSize="16" fill="#26E878">+</text>
            <text x="20" y="170" fontSize="16" fill="#26E878">+</text>
            <text x="170" y="170" fontSize="16" fill="#26E878">+</text>
            <text x="100" y="20" fontSize="12" fill="#26E878">+</text>
            <text x="100" y="195" fontSize="12" fill="#26E878">+</text>
          </svg>
          <div className="sec-success-icon">
            <BadgeCheck size={56} strokeWidth={2.2} />
          </div>
        </div>
        <h2 id="sec-success-title" className="sec-success-title">{title}</h2>
        <p className="sec-success-body">{body}</p>
        <button type="button" className="sec-success-ok" onClick={onClose}>OK</button>
      </div>
    </div>
  );
}

function KycPage({ kycStatus, rejectedReason, setKycStatus, push, done }: { kycStatus: string; rejectedReason?: string | null; setKycStatus: (v: "none" | "pending" | "approved" | "rejected") => void; push: (p: StackPage) => void; done: () => void }) {
  const [legalName, setLegalName] = useState("");
  const [documentType, setDocumentType] = useState("Passport");
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [frontUploadId, setFrontUploadId] = useState<string | null>(null);
  const [backUploadId, setBackUploadId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [imageError, setImageError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const frontSelectionRef = useRef(0);
  const backSelectionRef = useRef(0);
  const createUploadId = () => {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
    return "kyc-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  };
  async function submit() {
    if (legalName.trim().length <= 1) {
      setError("Please enter your legal name.");
      return;
    }
    if (!front || !frontUploadId || !back || !backUploadId) {
      setError("Please upload both sides of your document before submitting.");
      return;
    }
    if (front.size > 2_000_000) {
      setError("Front image is too large. Please choose or retake a clearer photo.");
      return;
    }
    if (back.size > 2_000_000) {
      setError("Back image is too large. Please choose or retake a clearer photo.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const form = new FormData();
      form.set("legalName", legalName);
      form.set("documentType", documentType);
      form.set("front", front);
      form.set("back", back);
      const res = await fetch("/api/kyc", { method: "POST", body: form });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          res.status === 401
            ? "Session expired. Please sign in again."
            : res.status === 413
              ? "Image files are too large."
              : res.status === 409
                ? "A KYC review is already pending."
                : typeof payload?.error === "string"
                  ? payload.error
                  : res.status >= 500
                    ? "Unable to submit verification. Please try again."
                    : "Unable to submit verification. Please try again.";
        setError(message);
        return;
      }
      setKycStatus("pending");
      done();
    } catch {
      setError("Unable to submit KYC. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }
  if (kycStatus === "pending" || kycStatus === "approved") {
    const isApproved = kycStatus === "approved";
    return (
      <div className="stack-page kyc-status-page">
        <section className={isApproved ? "kyc-status-card is-approved" : "kyc-status-card is-review"}>
          <div className="kyc-status-icon" aria-hidden="true">
            {isApproved ? <ShieldCheck size={32} strokeWidth={1.8} /> : <Clock size={32} strokeWidth={1.8} />}
          </div>
          <div className="kyc-status-heading">
            <span className={isApproved ? "kyc-status-badge approved" : "kyc-status-badge review"}>
              {isApproved ? <ShieldCheck size={14} strokeWidth={2.2} /> : <Clock size={14} strokeWidth={2.2} />}
              {isApproved ? "Approved" : "Under Review"}
            </span>
            <h2>{isApproved ? "Identity verified" : "Verification in progress"}</h2>
            <p>{isApproved ? "Your identity verification has been approved." : "Your identity verification is under review."}</p>
          </div>
          <div className="kyc-review-steps" aria-label="KYC review progress">
            <div className="kyc-review-step complete"><span><CheckCircle2 size={15} /></span><small>Submitted</small></div>
            <div className={isApproved ? "kyc-review-line complete" : "kyc-review-line active"} />
            <div className={isApproved ? "kyc-review-step complete" : "kyc-review-step active"}><span>{isApproved ? <CheckCircle2 size={15} /> : <Clock size={15} />}</span><small>Under Review</small></div>
            <div className={isApproved ? "kyc-review-line complete" : "kyc-review-line"} />
            <div className={isApproved ? "kyc-review-step complete" : "kyc-review-step"}><span>{isApproved ? <CheckCircle2 size={15} /> : <ShieldCheck size={15} />}</span><small>Approved</small></div>
          </div>
          <div className="kyc-status-details">
            <div><Clock size={16} aria-hidden="true" /><span>{isApproved ? "Verification completed." : "Usually within 24 hours or 1–2 business days."}</span></div>
            <div><Info size={16} aria-hidden="true" /><span>{isApproved ? "You can now use all eligible account features." : "Some withdrawals may remain limited until review is complete. You will be notified when your status changes."}</span></div>
          </div>
          <button type="button" className="kyc-support-button" onClick={() => push({ id: "support", title: "Support" })}>
            <Headphones size={17} strokeWidth={1.9} /> Contact Support
          </button>
        </section>
      </div>
    );
  }
  const isResubmit = kycStatus === "rejected";
  const formValid = legalName.trim().length > 1 && !!front && !!back && !!frontUploadId && !!backUploadId;
  return (
    <div className="stack-page kyc-stack">
      {isResubmit && (
        <div className="kyc-reject-banner" role="alert">
          <Info size={18} strokeWidth={2} aria-hidden="true" className="kyc-reject-banner-icon" />
          <div className="kyc-reject-banner-body">
            <strong>Previous Verification Not Approved</strong>
            <em>Please review the rejection reason below and submit updated documents.</em>
            {rejectedReason && <span className="kyc-reject-banner-reason">{rejectedReason}</span>}
          </div>
        </div>
      )}
      <div className="kyc-field">
        <label className="kyc-label" htmlFor="kyc-legal-name">Legal Name</label>
        <div className="kyc-input-wrap">
          <input
            id="kyc-legal-name"
            className="kyc-input"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder="As shown on your ID document"
            autoComplete="name"
          />
          <BadgeCheck className="kyc-input-icon" size={18} strokeWidth={1.8} aria-hidden="true" />
        </div>
      </div>

      <div className="kyc-field">
        <label className="kyc-label" htmlFor="kyc-document-type">Document Type</label>
        <div className="kyc-select-wrap">
          <select id="kyc-document-type" className="kyc-select" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
            <option>Passport</option>
            <option>ID Card</option>
            <option>Driver License</option>
            <option>Residence Permit</option>
          </select>
          <ChevronRight className="kyc-select-caret" size={16} aria-hidden="true" />
        </div>
      </div>

      <div className="kyc-field">
        <label className="kyc-label">Front Image</label>
        <label className="kyc-upload">
          <input type="file" accept="image/*" onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setImageError("");
            const selection = frontSelectionRef.current + 1;
            frontSelectionRef.current = selection;
            setFront(null);
            setFrontUploadId(null);
            const r = await compressImage(f);
            if (selection !== frontSelectionRef.current) return;
            if (r.ok) {
              if (r.file.size > 2_000_000) {
                setImageError("Front image is too large. Please choose or retake a clearer photo.");
                return;
              }
              setFront(r.file);
              setFrontUploadId(createUploadId());
            } else {
              setImageError("Front image: " + r.error);
            }
          }} />
          <FileText className="kyc-upload-icon" size={28} strokeWidth={1.6} aria-hidden="true" />
          <span className="kyc-upload-main">{front ? front.name : "Tap to upload front image"}</span>
          <span className="kyc-upload-sub">JPG, PNG, WebP, HEIC or HEIF, up to 25MB. Large images will be compressed automatically.</span>
        </label>
      </div>

      <div className="kyc-field">
        <label className="kyc-label">Back Image</label>
        <label className="kyc-upload">
          <input type="file" accept="image/*" onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setImageError("");
            const selection = backSelectionRef.current + 1;
            backSelectionRef.current = selection;
            setBack(null);
            setBackUploadId(null);
            const r = await compressImage(f);
            if (selection !== backSelectionRef.current) return;
            if (r.ok) {
              if (r.file.size > 2_000_000) {
                setImageError("Back image is too large. Please choose or retake a clearer photo.");
                return;
              }
              setBack(r.file);
              setBackUploadId(createUploadId());
            } else {
              setImageError("Back image: " + r.error);
            }
          }} />
          <FileText className="kyc-upload-icon" size={28} strokeWidth={1.6} aria-hidden="true" />
          <span className="kyc-upload-main">{back ? back.name : "Tap to upload back image"}</span>
          <span className="kyc-upload-sub">JPG, PNG, WebP, HEIC or HEIF, up to 25MB. Large images will be compressed automatically.</span>
        </label>
      </div>

      {imageError && <p className="auth-field-error">{imageError}</p>}

      <div className="kyc-security">
        <ShieldCheck size={20} strokeWidth={1.8} className="kyc-security-icon" aria-hidden="true" />
        <div className="kyc-security-body">
          <b>Your information is encrypted and secure</b>
          <em>We only use it for identity verification.</em>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <button type="button" className="kyc-submit" disabled={submitting || !formValid} onClick={submit}>
        {submitting ? "Submitting..." : isResubmit ? "Resubmit Verification" : "Submit Verification"}
      </button>
    </div>
  );
}

function SupportPage({ support, push }: { support: { telegram: string; whatsapp: string }; push: (p: StackPage) => void }) {
  return (
    <div className="stack-page support-stack">
      <div className="support-hero">
        <div className="support-hero-icon"><Headphones size={32} strokeWidth={1.8} /></div>
        <h2 className="support-hero-title">24/7 Support</h2>
        <p className="support-hero-sub">Average response under 15 minutes</p>
      </div>

      <div className="support-section-title">Contact Us</div>
      <div className="support-methods">
        <button type="button" className="support-method online" onClick={() => push({ id: "support-chat", title: "Online Support" })}>
          <span className="support-method-icon"><MessageCircle size={22} strokeWidth={2} /></span>
          <span className="support-method-body">
            <b>Online Support</b>
            <em>Chat with our support team</em>
          </span>
          <ChevronRight className="support-method-arrow" size={18} aria-hidden="true" />
        </button>

        {support.telegram ? (
          <a className="support-method telegram" href={support.telegram} target="_blank" rel="noreferrer">
            <span className="support-method-icon"><Send size={20} strokeWidth={2} /></span>
            <span className="support-method-body">
              <b>Telegram</b>
              <em>Message us on Telegram</em>
            </span>
            <ChevronRight className="support-method-arrow" size={18} aria-hidden="true" />
          </a>
        ) : null}

        {support.whatsapp ? (
          <a className="support-method whatsapp" href={support.whatsapp} target="_blank" rel="noreferrer">
            <span className="support-method-icon"><MessageCircle size={20} strokeWidth={2} /></span>
            <span className="support-method-body">
              <b>WhatsApp</b>
              <em>Message us on WhatsApp</em>
            </span>
            <ChevronRight className="support-method-arrow" size={18} aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

type ChatMessage = { id: number | string; role: "agent" | "user"; text: string; time: string; messageType?: string; metadata?: Record<string, unknown> | null };

function formatChatTime(date: Date = new Date()) {
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function useVisualViewport() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    function update() {
      const vv = window.visualViewport;
      if (!vv) {
        root.style.setProperty("--app-height", `${window.innerHeight}px`);
        return;
      }
      const keyboardHeight = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--app-height", `${vv.height}px`);
      root.style.setProperty("--keyboard-height", `${keyboardHeight}px`);
      if (keyboardHeight > 80) root.classList.add("keyboard-open");
      else root.classList.remove("keyboard-open");
    }
    update();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
      root.classList.remove("keyboard-open");
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--keyboard-height");
    };
  }, []);
}

const FIAT_CURRENCIES = [
  { code: "USD", name: "US Dollar", flag: "🇺🇸" },
  { code: "MYR", name: "Malaysian Ringgit", flag: "🇲🇾" },
  { code: "GBP", name: "British Pound", flag: "🇬🇧" },
  { code: "EUR", name: "Euro", flag: "🇪🇺" },
  { code: "JPY", name: "Japanese Yen", flag: "🇯🇵" },
  { code: "TWD", name: "Taiwan Dollar", flag: "🇹🇼" },
];

function FiatDepositScreen({ push, showToast }: { push: (p: StackPage) => void; showToast?: (type: "ok" | "err" | "info", text: string) => void }) {
  const [currency, setCurrency] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submitRequest() {
    if (!currency) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/fiat-deposit/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Request failed");
        return;
      }
      if (data.deposit?.id) {
        showToast?.("info", "Fiat deposit request submitted");
        push({ id: "support-chat", title: "Online Support" });
      }
    } catch {
      setError("Unable to connect to the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack-page fiat-deposit-page">
      <div className="fiat-deposit-container">
        <div className="fiat-deposit-notice">
          <Info size={14} strokeWidth={1.8} />
          <span>Bank details are provided by support after review.</span>
        </div>

        {error && <div className="auth-alert" role="alert" style={{ marginBottom: 12 }}><span className="auth-alert-icon" aria-hidden="true">!</span><span>{error}</span></div>}

        {FIAT_CURRENCIES.map((c) => {
          const selected = currency === c.code;
          return (
            <button
              type="button"
              key={c.code}
              className={`fiat-currency-card${selected ? " fiat-currency-card--selected" : ""}`}
              onClick={() => setCurrency(c.code)}
            >
              <span className="fiat-currency-flag">{c.flag}</span>
              <span className="fiat-currency-body">
                <b>{c.code}</b>
                <em>{c.name}</em>
              </span>
              {selected ? <CheckCircle2 size={20} className="fiat-currency-check" /> : <ChevronRight size={18} className="fiat-currency-arrow" />}
            </button>
          );
        })}

        <button
          type="button"
          className={`fiat-submit-btn${currency && !loading ? " fiat-submit-btn--ready" : ""}`}
          disabled={!currency || loading}
          onClick={submitRequest}
        >
          {loading ? "Submitting..." : "Submit Request"}
        </button>
      </div>
    </div>
  );
}

function safeJsonParse(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return null; }
}

type FiatDeposit = {
  id: number; user_id: number; currency: string; status: string;
  reference_code?: string | null; bank_snapshot_json?: string | null;
  amount_fiat?: number | null; exchange_rate?: number | null;
  rate_spread?: number | null; final_rate?: number | null;
  estimated_usdt?: number | null; confirmed_usdt?: number | null;
  admin_remark?: string | null; created_at?: string;
};

function SupportChatPage() {
  useVisualViewport();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const shouldStickRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastMsgIdRef = useRef<number>(0);
  const seenMessageIdsRef = useRef<Set<number | string>>(new Set());
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  // Fiat deposit state
  const [fiatDeposit, setFiatDeposit] = useState<FiatDeposit | null>(null);
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [submitForm, setSubmitForm] = useState({ amountFiat: "", transferReference: "", remark: "" });
  const [proof, setProof] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load fiat deposit
  const loadFiatDeposit = () => {
    fetch("/api/fiat-deposit/current")
      .then((r) => r.json())
      .then((d) => { setFiatDeposit(d.deposit || null); })
      .catch(() => {});
  };

  function mapChatMessage(m: { id: number; role: string; text: string; createdAt: string; message_type?: string; metadata_json?: string | null }): ChatMessage {
    return {
      id: m.id,
      role: m.role as "agent" | "user",
      text: m.text,
      time: formatChatTime(new Date(m.createdAt.replace(" ", "T") + (m.createdAt.endsWith("Z") ? "" : "Z"))),
      messageType: m.message_type || "text",
      metadata: m.metadata_json ? safeJsonParse(m.metadata_json) : null,
    };
  }

  async function enableNotifications() {
    await notificationManager.enable();
    setNotificationsEnabled(true);
  }

  // Load history once, then receive new messages through the authenticated Socket.IO room.
  useEffect(() => {
    let active = true;
    loadFiatDeposit();
    fetch("/api/support/messages")
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        if (data.messages?.length) {
          const msgs: ChatMessage[] = data.messages.map(mapChatMessage);
          seenMessageIdsRef.current = new Set(msgs.map((message) => message.id));
          setMessages(msgs);
          const last = msgs[msgs.length - 1];
          if (last) lastMsgIdRef.current = typeof last.id === "number" ? last.id : 0;
        }
      })
      .catch(() => {})
      .finally(() => { if (active) setLoaded(true); });

    let socket: Awaited<ReturnType<typeof connectRealtime>> | null = null;
    const handleMessage = (payload?: unknown) => {
      const body = (payload && typeof payload === "object" ? payload : {}) as { message?: { id: number; role: string; text: string; createdAt: string; message_type?: string; metadata_json?: string | null } };
      if (!body.message || !active) return;
      const message = mapChatMessage(body.message);
      if (seenMessageIdsRef.current.has(message.id)) return;
      seenMessageIdsRef.current.add(message.id);
      setMessages((prev) => [...prev, message]);
    };
    const handleConnect = () => {
      if (!active) return;
      socket?.emit("user:join");
      fetch("/api/support/messages").then((r) => r.json()).then((data) => {
        if (!active || !Array.isArray(data.messages)) return;
        const incoming = data.messages.map(mapChatMessage);
        seenMessageIdsRef.current = new Set(incoming.map((message: ChatMessage) => message.id));
        setMessages(incoming);
      }).catch(() => {});
    };
    connectRealtime().then((nextSocket) => {
      if (!active) { nextSocket.disconnect(); return; }
      socket = nextSocket;
      socket.on("support:message", handleMessage);
      socket.on("connect", handleConnect);
      if (socket.connected) handleConnect();
    }).catch(() => {});

    return () => {
      active = false;
      if (socket) {
        socket.off("support:message", handleMessage);
        socket.off("connect", handleConnect);
        socket.disconnect();
      }
      if (typeof document !== "undefined") document.title = "KAIROX";
    };
  }, []);

  useEffect(() => {
    if (!shouldStickRef.current) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  function scrollToBottom() {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    shouldStickRef.current = true;
  }

  async function doSend() {
    const text = draft.trim();
    if (!text || sending) return;
    const optimisticId = `sending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticMessage: ChatMessage = { id: optimisticId, role: "user", text, time: formatChatTime() };
    seenMessageIdsRef.current.add(optimisticId);
    setMessages((prev) => [...prev, optimisticMessage]);
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/support/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) {
        seenMessageIdsRef.current.delete(optimisticId);
        setMessages((prev) => prev.filter((message) => message.id !== optimisticId));
        setError(data.error || "Failed to send message");
        return;
      }
      setDraft("");
      scrollToBottom();
      if (data.message) {
        const sent = { id: data.message.id, role: "user" as const, text: data.message.text, time: formatChatTime() };
        seenMessageIdsRef.current.add(sent.id);
        setMessages((prev) => prev.map((message) => message.id === optimisticId ? sent : message));
      }
    } catch {
      seenMessageIdsRef.current.delete(optimisticId);
      setMessages((prev) => prev.filter((message) => message.id !== optimisticId));
      setError("Unable to connect to the server. Please try again.");
    } finally {
      setSending(false);
    }
  }

  function handleProofPick(file: File | undefined) {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Only JPG, PNG or WEBP files are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("File must be smaller than 5MB.");
      return;
    }
    setProof(file);
    const url = URL.createObjectURL(file);
    setProofPreview(url);
    setError("");
  }

  function clearProof() {
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    setProof(null);
    setProofPreview(null);
  }

  async function doSubmitTransfer() {
    const amountFiat = Number(submitForm.amountFiat);
    if (!amountFiat || amountFiat <= 0 || !fiatDeposit) return;
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("depositId", String(fiatDeposit.id));
      form.append("amountFiat", String(amountFiat));
      if (submitForm.transferReference) form.append("transferReference", submitForm.transferReference);
      if (submitForm.remark) form.append("remark", submitForm.remark);
      if (proof) form.append("proof", proof);
      const res = await fetch("/api/fiat-deposit/submit", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Failed to submit");
        return;
      }
      setShowSubmitForm(false);
      setSubmitForm({ amountFiat: "", transferReference: "", remark: "" });
      clearProof();
      loadFiatDeposit();
    } catch {
      setError("Unable to connect to the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const fiatStatusLabel = (status: string) => {
    switch (status) {
      case "requested": return { text: "Waiting for bank details...", color: "#B8860B" };
      case "bank_sent": return { text: "Bank details sent. Please transfer and submit your info.", color: "#2563FF" };
      case "submitted": return { text: "Transfer info submitted. Waiting for confirmation.", color: "#2563FF" };
      case "confirmed": return { text: "Deposit confirmed!", color: "#16A34A" };
      case "rejected": return { text: "Deposit rejected.", color: "#DC2626" };
      default: return null;
    }
  };

  const fiatStatus = fiatDeposit ? fiatStatusLabel(fiatDeposit.status) : null;

  function renderFiatMessage(msg: ChatMessage) {
    const meta = msg.metadata || {};
    switch (msg.messageType) {
      case "fiat_request":
        return (
          <div className="chat-bubble chat-bubble-user" style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.2)", color: "#e0eaf5" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>🏦 Fiat Deposit Request</div>
            <div style={{ fontSize: 12, color: "#8899B0" }}>Currency: {meta.currency as string || ""}</div>
            <div style={{ fontSize: 12, color: "#8899B0" }}>Please wait for support to provide bank transfer details.</div>
          </div>
        );
      case "fiat_bank":
        return (
          <div className="chat-bubble chat-bubble-agent" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#22C55E" }}>🏦 Bank Transfer Details</div>
            <div style={{ fontSize: 12, lineHeight: 1.8, color: "#ccd6e0", whiteSpace: "pre-wrap" }}>{msg.text}</div>
            {msg.text.indexOf("Bank:") >= 0 && (
              <div style={{ marginTop: 8, padding: "8px 10px", background: "rgba(255,255,255,0.04)", borderRadius: 8, fontSize: 11, color: "#8899B0" }}>
                Please include the reference code in your transfer remark. After payment, use Submit Transfer Info.
              </div>
            )}
          </div>
        );
      case "fiat_transfer":
        return (
          <div className="chat-bubble chat-bubble-user" style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.2)", color: "#e0eaf5" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>📤 Transfer Info Submitted</div>
            <div style={{ fontSize: 12, color: "#8899B0" }}>Amount: {meta.amountFiat as string || ""} {meta.currency as string || ""}</div>
            {(() => { const v = Number(meta.estimatedUsdt); return v ? <div style={{ fontSize: 12, color: "#22C55E" }}>≈ {v.toFixed(2)} USDT</div> : null; })()}
          </div>
        );
      case "fiat_status":
        const isConfirmed = String(meta.status || "").toLowerCase() === "confirmed";
        const isRejected = String(meta.status || "").toLowerCase() === "rejected";
        return (
          <div className="chat-bubble chat-bubble-agent" style={{
            background: isConfirmed ? "rgba(34,197,94,0.08)" : isRejected ? "rgba(239,68,68,0.08)" : "rgba(100,116,139,0.08)",
            border: `1px solid ${isConfirmed ? "rgba(34,197,94,0.2)" : isRejected ? "rgba(239,68,68,0.2)" : "rgba(100,116,139,0.2)"}`,
          }}>
            <div style={{ fontSize: 12, lineHeight: 1.7, color: "#ccd6e0", whiteSpace: "pre-wrap" }}>{msg.text}</div>
          </div>
        );
      default:
        return <div className={`chat-bubble chat-bubble-${msg.role}`}>{msg.text}</div>;
    }
  }

  return (
    <div className="stack-page support-chat-page">
      <div className="chat-messages" ref={scrollerRef}
        style={fiatStatus ? { paddingBottom: 32 } : undefined}
        onScroll={() => {
          const el = scrollerRef.current;
          if (!el) return;
          shouldStickRef.current = (el.scrollHeight - el.scrollTop - el.clientHeight) < 80;
        }}
      >
        {!loaded && <div style={{ textAlign: "center", padding: 32, color: "#6e88a4" }}>Loading messages...</div>}
        {loaded && messages.length === 0 && (
          <div style={{ textAlign: "center", padding: 32 }}>
            <div style={{ color: "#e0eaf5", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Hello! How can we help you today?</div>
            <div style={{ color: "#6e88a4", fontSize: 13 }}>Send a message and our support team will respond shortly.</div>
          </div>
        )}
        <div className="chat-day-pill">Today</div>
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-row chat-row-${msg.role}`}>
            {msg.role === "agent" && <div className="chat-avatar"><Headphones size={16} strokeWidth={1.8} /></div>}
            <div className="chat-bubble-wrap">
              {msg.role === "agent" && <div className="chat-bubble-meta"><b>Support Agent</b><small>{msg.time}</small></div>}
              {msg.role === "user" && <div className="chat-bubble-meta chat-bubble-meta-right"><small>{msg.time}</small></div>}
              {renderFiatMessage(msg)}
            </div>
          </div>
        ))}
      </div>

      <div className="chat-composer">
      {error && <div className="auth-alert chat-composer-error" role="alert"><span className="auth-alert-icon" aria-hidden="true">!</span><span>{error}</span></div>}

      {!notificationsEnabled && (
        <button type="button" onClick={enableNotifications} style={{ margin: "0 16px 8px", width: "calc(100% - 32px)", padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(37,99,255,0.25)", background: "rgba(37,99,255,0.08)", color: "#7da9ff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          Enable support notifications
        </button>
      )}

      {/* Fiat deposit action panel */}
      {fiatStatus && (
        <div className="fiat-status-banner" style={{
          margin: "8px 16px", padding: "10px 14px", borderRadius: 10,
          background: `rgba(${fiatStatus.color === "#B8860B" ? "184,134,11" : fiatStatus.color === "#2563FF" ? "37,99,255" : fiatStatus.color === "#16A34A" ? "22,163,74" : "220,38,38"}, 0.1)`,
          border: `1px solid ${fiatStatus.color}33`,
          color: fiatStatus.color, fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 8,
        }}>
          <Banknote size={16} />
          <span>{fiatStatus.text}</span>
          {fiatDeposit?.status === "bank_sent" && !showSubmitForm && (
            <button type="button" onClick={() => { setShowSubmitForm(true); setSubmitError(null); }} style={{
              marginLeft: "auto", padding: "6px 14px", borderRadius: 8, border: `1px solid ${fiatStatus.color}`,
              background: "transparent", color: fiatStatus.color, fontSize: 12, cursor: "pointer", fontWeight: 600,
            }}>
              Submit Transfer Info
            </button>
          )}
        </div>
      )}
      {showSubmitForm && fiatDeposit?.status === "bank_sent" && (
        <div style={{ margin: "0 16px 8px", padding: "12px 14px", borderRadius: 10, background: "rgba(37,99,255,0.08)", border: "1px solid rgba(37,99,255,0.2)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#2563FF", marginBottom: 10 }}>Submit Transfer Info</div>
          <input
            type="number" placeholder={`Amount in ${fiatDeposit.currency}`}
            value={submitForm.amountFiat}
            onChange={(e) => { setSubmitForm((s) => ({ ...s, amountFiat: e.target.value })); setSubmitError(null); }}
            style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: submitError ? "1px solid #DC2626" : "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#e0eaf5", fontSize: 14, marginBottom: submitError ? 4 : 8 }}
          />
          {submitError && (
            <div style={{ marginBottom: 8, color: "#DC2626", fontSize: 12, fontWeight: 500 }}>{submitError}</div>
          )}
          {fiatDeposit?.final_rate ? (
            <div style={{ marginBottom: 10, padding: "8px 10px", borderRadius: 8, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", fontSize: 11 }}>
              <div style={{ color: "#6e88a4", marginBottom: 2 }}>Locked rate</div>
              <div style={{ color: "#c0d0e0", fontWeight: 600, marginBottom: 4 }}>
                1 {fiatDeposit.currency || "?"} ≈ {Number(fiatDeposit.final_rate).toFixed(4)} USDT
              </div>
              {(() => {
                const amt = Number(submitForm.amountFiat);
                const fr = Number(fiatDeposit.final_rate);
                if (amt > 0 && fr > 0) {
                  const est = (amt * fr).toFixed(2);
                  return <div style={{ color: "#22C55E", fontWeight: 600, marginBottom: 3 }}>≈ {est} USDT estimated</div>;
                }
                return null;
              })()}
              <div style={{ color: "#445566", fontSize: 10 }}>Final credited amount may be adjusted by admin after review.</div>
            </div>
          ) : null}
          <input
            type="text" placeholder="Transfer reference (optional)"
            value={submitForm.transferReference}
            onChange={(e) => setSubmitForm((s) => ({ ...s, transferReference: e.target.value }))}
            style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#e0eaf5", fontSize: 14, marginBottom: 8 }}
          />
          <input
            type="text" placeholder="Remark (optional)"
            value={submitForm.remark}
            onChange={(e) => setSubmitForm((s) => ({ ...s, remark: e.target.value }))}
            style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#e0eaf5", fontSize: 14, marginBottom: 10 }}
          />
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#8899B0", marginBottom: 4 }}>Upload transfer proof</div>
            <input type="file" accept="image/jpeg,image/png,image/webp" id="fiat-proof-input" style={{ display: "none" }} onChange={(e) => handleProofPick(e.target.files?.[0])} />
            {proof ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                {proofPreview && <img src={proofPreview} alt="Proof preview" style={{ width: 40, height: 40, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />}
                <span style={{ flex: 1, fontSize: 12, color: "#c0cde0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{proof.name}</span>
                <button type="button" onClick={clearProof} style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(239,68,68,0.15)", color: "#DC2626", border: "1px solid rgba(239,68,68,0.2)", cursor: "pointer", fontSize: 11 }}>Remove</button>
              </div>
            ) : (
              <label htmlFor="fiat-proof-input" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "14px", borderRadius: 8, border: "1px dashed rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.02)", cursor: "pointer", color: "#6e88a4", fontSize: 12 }}>
                <Upload size={16} strokeWidth={1.6} />
                Tap to upload screenshot
              </label>
            )}
            <div style={{ fontSize: 10, color: "#445566", marginTop: 3 }}>JPG, PNG or WEBP, max 5MB</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={doSubmitTransfer} disabled={!submitForm.amountFiat || submitting} style={{ flex: 1, padding: "8px", borderRadius: 8, background: "#2563FF", color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: (!submitForm.amountFiat || submitting) ? 0.5 : 1 }}>
              {submitting ? "Submitting..." : "Submit"}
            </button>
            <button type="button" onClick={() => { setShowSubmitForm(false); setSubmitForm({ amountFiat: "", transferReference: "", remark: "" }); setSubmitError(null); }} style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(255,255,255,0.05)", color: "#6e88a4", border: "1px solid rgba(255,255,255,0.1)", fontSize: 14, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="chat-input-bar">
        <button type="button" className="chat-attach" disabled aria-label="Attachments coming soon">
          <Paperclip size={18} strokeWidth={1.8} />
        </button>
        <textarea
          ref={textareaRef}
          className="chat-input"
          placeholder="Type your message..."
          rows={1}
          maxLength={2000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); } }}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="sentences"
          spellCheck={false}
          enterKeyHint="send"
          aria-label="Message"
          disabled={sending}
        />
        <button type="button" className="chat-send" onClick={doSend} disabled={!draft.trim() || sending} aria-label="Send">
          <Send size={18} strokeWidth={2} />
        </button>
      </div>
      </div>
    </div>
  );
}

const TERMS_SECTIONS = [
  { title: "Use of Platform", body: "By accessing or using this platform, you agree to follow these Terms, our platform rules, and all applicable laws and regulations. You are responsible for all activities conducted through your account." },
  { title: "Eligibility", body: "You must be at least 18 years old or the legal age of majority in your jurisdiction to use this platform. By using our services, you confirm that you meet these requirements." },
  { title: "Trading Risk", body: "Digital asset trading involves risk. Prices may fluctuate significantly, and you are solely responsible for your trading decisions, orders, positions, gains, and losses." },
  { title: "Account Security", body: "You are responsible for keeping your account, password, and authentication credentials secure. Please contact support immediately if you notice any unauthorized activity." },
  { title: "Deposits and Withdrawals", body: "Deposits, withdrawals, and transfers may be subject to verification, network conditions, risk checks, and platform processing rules." },
  { title: "Prohibited Activities", body: "You agree not to misuse the platform, attempt unauthorized access, engage in fraud, market manipulation, money laundering, or any illegal or harmful activity." },
  { title: "KYC and Compliance", body: "We may require identity verification or additional information to comply with regulatory, security, and risk-control requirements." },
  { title: "Service Changes", body: "We may update, suspend, or modify certain services, features, fees, or rules when necessary for security, compliance, maintenance, or product improvement." }
];

const PRIVACY_MODULES = [
  { Icon: ShieldCheck, title: "Information We Collect", body: "We collect account information, identity verification details, transaction records, device data, and usage information." },
  { Icon: LockKeyhole, title: "How We Use Information", body: "We use your data for authentication, KYC verification, funding records, account security, risk control, and customer support." },
  { Icon: ShieldCheck, title: "Data Security", body: "We apply technical and organizational measures to protect your data against unauthorized access and disclosure." },
  { Icon: UserIcon, title: "Your Rights", body: "You may request access, correction, or deletion of your personal information where applicable." }
];

function TermsPage() {
  return (
    <div className="stack-page legal-page">
      <h1 className="legal-title">Terms of Service</h1>
      <p className="legal-updated">Last updated: May 20, 2024</p>
      <ol className="legal-list">
        {TERMS_SECTIONS.map((section, idx) => (
          <li key={section.title} className="legal-item">
            <span className="legal-num">{idx + 1}</span>
            <div className="legal-item-body">
              <b>{section.title}</b>
              <em>{section.body}</em>
            </div>
          </li>
        ))}
      </ol>
      <div className="legal-disclaimer">
        <Info size={15} strokeWidth={1.8} aria-hidden="true" />
        <span>By continuing, you agree to our Terms of Service.</span>
      </div>
    </div>
  );
}

function PrivacyPage() {
  return (
    <div className="stack-page legal-page">
      <h1 className="legal-title">Privacy Policy</h1>
      <p className="legal-updated">Last updated: May 20, 2024</p>
      <div className="privacy-modules">
        {PRIVACY_MODULES.map(({ Icon, title, body }) => (
          <div key={title} className="privacy-module">
            <span className="privacy-module-icon"><Icon size={20} strokeWidth={1.8} /></span>
            <div className="privacy-module-body">
              <b>{title}</b>
              <em>{body}</em>
            </div>
            <ChevronRight className="privacy-module-arrow" size={18} aria-hidden="true" />
          </div>
        ))}
      </div>
      <div className="legal-disclaimer">
        <LockKeyhole size={15} strokeWidth={1.8} aria-hidden="true" />
        <span>We are committed to protecting your privacy and handling your data transparently and securely.</span>
      </div>
    </div>
  );
}

function AboutPage() {
  return (
    <div className="stack-page legal-page about-route-page">
      <img className="about-logo" src="/brand/kairox-symbol.png" alt="KAIROX" />
      <h1 className="about-title">KAIROX Markets</h1>
      <p className="about-tagline">Liquidity in motion.</p>
      <p className="about-body">
        KAIROX Markets is a digital asset trading platform designed for secure account management,
        efficient trading workflows, funding records, identity verification, and responsive support.
      </p>
      <div className="about-stats">
        <div className="about-stat"><b>24/7</b><em>Trading</em></div>
        <div className="about-stat"><b>Secure</b><em>Custody</em></div>
        <div className="about-stat"><b>Global</b><em>Liquidity</em></div>
      </div>
      <div className="about-version">
        <small>Version 1.0.0</small>
        <small>© 2026 KAIROX Markets</small>
      </div>
      <div className="legal-disclaimer about-disclaimer">
        <span>For support or questions, please contact us through the in-app Support center.</span>
      </div>
    </div>
  );
}

function StaticPage({ page }: { page: StackPage; settings: Partial<PublicSettings> }) {
  if (page.id === "terms") return <TermsPage />;
  if (page.id === "privacy") return <PrivacyPage />;
  if (page.id === "about") return <AboutPage />;
  return (
    <div className="stack-page static-page">
      <h2>{page.title}</h2>
      <p>Content will be updated soon.</p>
    </div>
  );
}
