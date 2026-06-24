"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  BarChart3,
  Check,
  CircleDollarSign,
  Edit3,
  FileText,
  Gauge,
  KeyRound,
  Landmark,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  Users,
  WalletCards,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { connectRealtime } from "@/app/components/realtime-client";
import { displayUid } from "@/lib/uid";

type User = {
  id: number;
  public_uid?: string | null;
  username: string;
  email: string | null;
  role: string;
  balance: number;
  total_assets?: number;
  remark?: string | null;
  trading_enabled?: number;
  login_enabled?: number;
  created_at: string;
};
type AssetRow = { user_id: number; asset: string; balance: number; locked: number };
type LedgerRow = { id: number; user_id: number; user_public_uid?: string | null; username: string; email: string | null; asset: string; type: string; amount: number; status: string; note: string | null; created_at: string };
type Market = { id: number; symbol: string; price: number; max_leverage: number; fee_rate: number; maintenance_margin_rate: number; is_active: number };
type Position = { id: number; username: string; email?: string | null; symbol: string; side: string; margin: number; leverage: number; unrealized_pnl: number; pnl_override: number | null };
type Order = { id: number; user_id: number; user_public_uid?: string | null; username: string; email?: string | null; symbol: string; direction: "call" | "put"; stake: number; odds: number; risk_amount?: number | null; duration_seconds: number; entry_price: number; settle_price?: number | null; manual_result?: "won" | "lost" | null; manual_settle_price?: number | null; manual_result_set_at?: string | null; status: "open" | "won" | "lost"; profit?: number | null; note: string | null; created_at: string; expires_at: string };
type Withdrawal = { id: number; user_id: number; user_public_uid?: string | null; username: string; email: string | null; amount: number; address: string; status: string; note: string | null; created_at: string };
type DepositAddress = { id: number; asset: string; network: string; address: string; is_active: number };
type UserDepositAddress = DepositAddress & { user_id: number; user_public_uid?: string | null; email: string | null; username: string };
type Deposit = { id: number; user_id: number; user_public_uid?: string | null; username: string; email: string | null; asset: string; network: string; amount: number; tx_hash: string | null; proof_data: string | null; deposit_address: string | null; status: "pending" | "approved" | "rejected"; admin_note: string | null; created_at: string };
type KycSubmission = { id: number; user_id: number; user_public_uid?: string | null; username: string; email: string | null; legal_name: string; document_type: string; front_data: string | null; back_data: string | null; status: "pending" | "approved" | "rejected"; rejection_reason: string | null; created_at: string; reviewed_at: string | null };
type Settings = {
  whatsapp_support_url: string;
  telegram_url: string;
  registration_enabled: string;
  withdrawals_enabled: string;
  default_signup_balance: string;
  min_withdrawal_amount: string;
  withdrawal_notice: string;
  about_content: string;
  terms_content: string;
  privacy_content: string;
  trading_enabled: string;
  binary_options_config: string;
};
type AdminData = {
  stats: { users: number; open_positions: number; trader_realized_pnl: number; fees: number; pending_withdrawals: number; pending_deposits?: number; pending_kyc?: number; markets?: number; total_stable_balance?: number };
  settings: Settings;
  users: User[];
  assetRows: AssetRow[];
  ledger: LedgerRow[];
  deposits: Deposit[];
  kycSubmissions: KycSubmission[];
  markets: Market[];
  positions: Position[];
  orders: Order[];
  withdrawals: Withdrawal[];
};
type TabId = "dashboard" | "depositAddresses" | "deposits" | "withdrawals" | "kyc" | "users" | "orders" | "markets" | "settings";
type ModalState =
  | { type: "funds"; user: User }
  | { type: "loginPassword"; user: User }
  | { type: "withdrawPassword"; user: User }
  | { type: "remark"; user: User }
  | null;
type ConfirmVariant = "primary" | "good" | "danger" | "warn";
type ConfirmOptions = { title: string; message: string; confirmText?: string; variant?: ConfirmVariant };
type ConfirmState = (ConfirmOptions & { action: () => Promise<void> }) | null;
type AdminRealtimePayload = { type?: string; [key: string]: unknown };
type RealtimeStatus = "connecting" | "connected" | "polling";

const coins = ["USDC", "BTC", "ETH", "SOL"];
const bellNotificationTypes = new Set(["deposit:created", "withdrawal:created", "kyc:created", "binary:created", "trade:created"]);
const money = (n: number, digits = 2) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
const actor = (item: { email?: string | null; username: string }) => item.email || item.username;
const cnTime = (value: string) => new Date(value).toLocaleString("zh-CN", { hour12: false });
const defaultBinaryOptionsText = "30,30\n60,35\n180,45\n300,55";

function formatBinaryOptionsConfig(value?: string) {
  if (!value) return defaultBinaryOptionsText;
  try {
    const rows = JSON.parse(value) as Array<{ seconds?: number; odds?: number; profitRate?: number }>;
    if (!Array.isArray(rows) || !rows.length) return defaultBinaryOptionsText;
    return rows
      .map((row) => {
        const seconds = Number(row.seconds);
        const odds = Number(row.odds ?? row.profitRate);
        if (!Number.isFinite(seconds) || !Number.isFinite(odds)) return "";
        return `${seconds},${Number((odds > 1 ? odds : odds * 100).toFixed(4))}`;
      })
      .filter(Boolean)
      .join("\n") || defaultBinaryOptionsText;
  } catch {
    return defaultBinaryOptionsText;
  }
}

function binaryOptionsTextToConfig(value: string) {
  const rows = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [secondsRaw, percentRaw] = line.split(/[,\s:]+/);
      const seconds = Number(secondsRaw);
      const percent = Number(String(percentRaw || "").replace("%", ""));
      if (!Number.isInteger(seconds) || seconds < 5 || seconds > 86400 || !Number.isFinite(percent) || percent <= 0) {
        throw new Error("Binary options format: seconds,profitPercent");
      }
      return { seconds, odds: Number((percent / 100).toFixed(6)) };
    });
  if (!rows.length) throw new Error("Add at least one binary option preset");
  return JSON.stringify(rows);
}

const adminCss = `
.admin-page{min-height:100vh;background:#f4f7fb;color:#172033;font-family:Inter,Arial,"Microsoft YaHei",sans-serif}
.admin-page *{box-sizing:border-box}.admin-page button,.admin-page input,.admin-page select,.admin-page textarea{font:inherit}
.admin-shell{display:grid;grid-template-columns:232px 1fr;min-height:100vh}
.admin-side{background:#111827;color:#cbd5e1;display:flex;flex-direction:column}
.brand{padding:22px 20px;border-bottom:1px solid rgba(255,255,255,.08)}.brand b{display:block;color:#fff;font-size:18px;letter-spacing:.08em}.brand span{display:block;color:#38bdf8;font-size:11px;letter-spacing:.16em;text-transform:uppercase;margin-top:3px}
.nav{padding:12px 10px;display:grid;gap:4px;flex:1}.nav button{border:0;background:transparent;color:#94a3b8;border-radius:8px;display:flex;align-items:center;gap:10px;padding:11px 12px;text-align:left;cursor:pointer;font-size:14px}.nav button:hover{background:#1f2937;color:#fff}.nav button.on{background:#2563eb;color:#fff}.nav svg{width:17px;height:17px}.badge{margin-left:auto;background:#ef4444;color:#fff;border-radius:999px;font-size:11px;font-weight:800;padding:1px 7px}
.side-foot{display:grid;gap:8px;padding:14px;border-top:1px solid rgba(255,255,255,.08)}
.main{min-width:0}.topbar{height:64px;background:#fff;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;padding:0 24px}.topbar h1{font-size:18px;margin:0}.topbar p{margin:3px 0 0;color:#64748b;font-size:12px}.tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.realtime-state{display:inline-flex;align-items:center;gap:6px;border:1px solid #d8dee9;border-radius:999px;background:#fff;color:#64748b;font-size:12px;font-weight:800;min-height:28px;padding:4px 9px}.realtime-state span{width:7px;height:7px;border-radius:999px;background:#94a3b8}.realtime-state.connected{color:#15803d;border-color:#bbf7d0;background:#f0fdf4}.realtime-state.connected span{background:#22c55e}.realtime-state.polling{color:#b45309;border-color:#fed7aa;background:#fff7ed}.realtime-state.polling span{background:#f97316}.realtime-state.connecting span{background:#38bdf8}
.content{padding:22px;display:grid;gap:16px}.btn{border:1px solid #d8dee9;background:#fff;color:#334155;border-radius:6px;min-height:34px;padding:7px 12px;font-size:13px;font-weight:700;display:inline-flex;gap:7px;align-items:center;justify-content:center;cursor:pointer;text-decoration:none}.btn:hover{border-color:#2563eb;color:#2563eb}.btn svg{width:15px;height:15px}.btn.primary{background:#2563eb;border-color:#2563eb;color:#fff}.btn.good{background:#16a34a;border-color:#16a34a;color:#fff}.btn.danger{background:#ef4444;border-color:#ef4444;color:#fff}.btn.warn{background:#fff7ed;border-color:#fdba74;color:#ea580c}.btn.icon{width:32px;padding:0}.btn.disabled{opacity:.55;pointer-events:none}
.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;box-shadow:0 1px 2px rgba(15,23,42,.04)}.stat{display:flex;justify-content:space-between;gap:12px}.stat label{display:block;color:#64748b;font-size:13px}.stat strong{display:block;margin-top:10px;font-size:24px;letter-spacing:-.02em}.stat small{display:block;color:#94a3b8;margin-top:4px}.stat svg{width:22px;height:22px;color:#2563eb}
.panel{background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden}.panel-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #e5e7eb}.panel-head h2{font-size:15px;margin:0;display:flex;align-items:center;gap:8px}.panel-head svg{width:17px;height:17px;color:#2563eb}.panel-body{padding:16px}.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px}.form-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.field{display:grid;gap:6px}.field span{font-size:12px;color:#64748b}.input,.select,.textarea{width:100%;border:1px solid #cfd8e3;border-radius:5px;background:#fff;color:#111827;padding:8px 10px;outline:0}.input:focus,.select:focus,.textarea:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.1)}.textarea{min-height:74px;resize:vertical}
.table-wrap{overflow:auto}.table{width:100%;border-collapse:collapse;min-width:900px}.table th{background:#f1f5f9;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;font-weight:800;padding:13px 14px;text-align:left;white-space:nowrap}.table td{border-bottom:1px solid #edf2f7;padding:13px 14px;font-size:13px;vertical-align:middle}.table tr:hover td{background:#f8fafc}.mono{font-family:Consolas,"DM Mono",monospace}.muted{color:#64748b}.empty{text-align:center!important;color:#94a3b8!important;padding:38px!important}
.pill{display:inline-flex;align-items:center;border-radius:5px;padding:3px 8px;font-size:12px;font-weight:700}.pill.sys{background:#fee2e2;color:#ef4444}.pill.ok{background:#dcfce7;color:#15803d}.pill.wait{background:#fef3c7;color:#b45309}.pill.off{background:#e5e7eb;color:#64748b}.user-chip{background:#eef2ff;color:#4f46e5;border:1px solid #c7d2fe;border-radius:4px;padding:3px 10px;display:inline-flex}
.switch{width:42px;height:22px;border:0;border-radius:999px;background:#cbd5e1;padding:3px;cursor:pointer}.switch span{display:block;width:16px;height:16px;background:#fff;border-radius:50%;transition:.16s}.switch.on{background:#5b6cff}.switch.on span{transform:translateX(20px)}
.actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.asset-mini{display:grid;grid-template-columns:repeat(5,minmax(90px,1fr));border:1px solid #e2e8f0;border-bottom:0;margin-bottom:16px}.asset-mini div{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #e2e8f0}.asset-mini b{background:#f1f5f9;padding:11px 12px}.asset-mini span{padding:11px 12px}
.tabs{display:flex;gap:8px;flex-wrap:wrap}.tabs button{border:1px solid #d8dee9;background:#fff;border-radius:6px;padding:7px 12px;cursor:pointer}.tabs button.on{background:#2563eb;border-color:#2563eb;color:#fff}
.ledger{display:grid}.ledger-row{display:grid;grid-template-columns:1fr auto;gap:10px;padding:11px 0;border-bottom:1px solid #edf2f7}.ledger-row:last-child{border-bottom:0}.error{border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;border-radius:8px;padding:10px 12px}.loading{display:grid;place-items:center;min-height:45vh;color:#64748b}
.modal-bg{position:fixed;inset:0;background:rgba(15,23,42,.5);display:grid;place-items:center;z-index:40;padding:20px}.modal{background:#fff;border-radius:8px;box-shadow:0 22px 60px rgba(15,23,42,.28);width:min(720px,100%)}.modal.confirm{width:min(440px,100%)}.modal-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #e5e7eb}.modal-head h3{font-size:16px;margin:0}.modal-body{padding:20px}.modal-body p{margin:0;color:#475569;line-height:1.65}.modal-foot{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid #e5e7eb}
@media(max-width:980px){.admin-shell{grid-template-columns:1fr}.admin-side{position:static}.nav{display:flex;overflow:auto}.nav button{white-space:nowrap}.side-foot{display:none}.cards,.grid-2{grid-template-columns:1fr 1fr}.form-grid{grid-template-columns:1fr 1fr}}
@media(max-width:640px){.topbar{height:auto;align-items:flex-start;padding:14px;gap:12px;flex-direction:column}.content{padding:14px}.cards,.grid-2,.form-grid{grid-template-columns:1fr}.asset-mini{grid-template-columns:1fr}.table{min-width:760px}}
`;

export default function AdminPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminData | null>(null);
  const [tab, setTab] = useState<TabId>("dashboard");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [orderQuery, setOrderQuery] = useState("");
  const [orderStatus, setOrderStatus] = useState<"all" | "open" | "won" | "lost">("all");
  const [depositStatus, setDepositStatus] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [kycStatusFilter, setKycStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [withdrawStatus, setWithdrawStatus] = useState("all");
  const [modal, setModal] = useState<ModalState>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [settings, setSettings] = useState<Partial<Settings>>({});
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("connecting");
  const [newMarket, setNewMarket] = useState({ symbol: "DOGE-PERP", price: 0.18, maxLeverage: 20, feeRate: 0.0008, mmr: 0.0075 });
  const loadingRef = useRef(false);
  const settingsDirtyRef = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);
  const notifiedEventsRef = useRef<Set<string>>(new Set());

  async function load(options: { forceSettings?: boolean } = {}) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      setError("");
      const res = await fetch("/api/admin/summary", { cache: "no-store" });
      if (res.status === 401) return router.push("/admin/login");
      if (res.status === 403) return router.push("/markets");
      if (!res.ok) {
        const result = await res.json().catch(() => ({ error: "????????" }));
        setError(result.error || "????????");
        setLoading(false);
        return;
      }
      const json = await res.json();
      setData(json);
      if (options.forceSettings || !settingsDirtyRef.current) setSettings(json.settings);
      setLoading(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "????????");
      setLoading(false);
    } finally {
      loadingRef.current = false;
    }
  }

  function getAudioContext() {
    if (typeof window === "undefined") return null;
    if (audioRef.current) return audioRef.current;
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    audioRef.current = new AudioContextClass();
    return audioRef.current;
  }

  async function armNotificationAudio() {
    const audio = getAudioContext();
    if (!audio || audio.state !== "suspended") return;
    await audio.resume().catch(() => {});
  }

  async function playNotificationBell() {
    const audio = getAudioContext();
    if (!audio) return;
    if (audio.state === "suspended") await audio.resume().catch(() => {});
    if (audio.state === "suspended") return;

    const now = audio.currentTime;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
    gain.connect(audio.destination);

    const first = audio.createOscillator();
    const second = audio.createOscillator();
    first.type = "sine";
    second.type = "triangle";
    first.frequency.setValueAtTime(880, now);
    second.frequency.setValueAtTime(1320, now + 0.08);
    first.connect(gain);
    second.connect(gain);
    first.start(now);
    first.stop(now + 0.48);
    second.start(now + 0.08);
    second.stop(now + 0.64);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const arm = () => { void armNotificationAudio(); };
    window.addEventListener("pointerdown", arm);
    window.addEventListener("keydown", arm);
    return () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, []);

  useEffect(() => {
    let socket: Awaited<ReturnType<typeof connectRealtime>> | null = null;
    let active = true;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let connectTimer: ReturnType<typeof setTimeout> | null = null;
    const clearConnectTimer = () => {
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
    };
    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };
    const startPolling = () => {
      if (!active) return;
      clearConnectTimer();
      setRealtimeStatus("polling");
      if (pollTimer) return;
      void load();
      pollTimer = setInterval(() => {
        void load();
      }, 10000);
    };
    const reload = () => load();
    const handleConnect = () => {
      if (!active) return;
      clearConnectTimer();
      stopPolling();
      setRealtimeStatus("connected");
      socket?.emit("admin:join");
      void load();
    };
    const handleDisconnect = () => startPolling();
    const handleConnectError = () => startPolling();
    const handleAdminUpdate = (payload?: unknown) => {
      const body = typeof payload === "object" && payload ? (payload as AdminRealtimePayload) : undefined;
      const type = body?.type;
      if (type && bellNotificationTypes.has(type)) {
        const eventId = body.withdrawalId || body.depositId || body.submissionId || body.orderId || body.positionId || body.userId || "unknown";
        const key = `${type}:${eventId}`;
        if (!notifiedEventsRef.current.has(key)) {
          notifiedEventsRef.current.add(key);
          if (notifiedEventsRef.current.size > 120) notifiedEventsRef.current.clear();
          void playNotificationBell();
        }
      }
      void load();
    };
    setRealtimeStatus("connecting");
    connectTimer = setTimeout(startPolling, 5000);
    connectRealtime()
      .then((nextSocket) => {
        if (!active) {
          nextSocket.disconnect();
          return;
        }
        socket = nextSocket;
        socket.on("connect", handleConnect);
        socket.on("disconnect", handleDisconnect);
        socket.on("connect_error", handleConnectError);
        socket.on("admin:update", handleAdminUpdate);
        socket.on("binary:expired", reload);
        socket.on("binary:settled", reload);
        socket.on("deposit-addresses:update", reload);
        if (socket.connected) handleConnect();
      })
      .catch(() => startPolling());
    return () => {
      active = false;
      clearConnectTimer();
      stopPolling();
      if (socket) {
        socket.off("connect", handleConnect);
        socket.off("disconnect", handleDisconnect);
        socket.off("connect_error", handleConnectError);
        socket.off("admin:update", handleAdminUpdate);
        socket.off("binary:expired", reload);
        socket.off("binary:settled", reload);
        socket.off("deposit-addresses:update", reload);
        socket.disconnect();
      }
    };
  }, []);

  async function executeMutate(url: string, method: string, body: unknown) {
    setError("");
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) {
      const result = await res.json().catch(() => ({ error: "Operation failed" }));
      const message = result.error || "Operation failed";
      setError(message);
      throw new Error(message);
    }
    await load();
  }

  async function mutate(url: string, method: string, body: unknown) {
    const confirmOptions = getConfirmOptions(url, method, body);
    if (confirmOptions) {
      setConfirm({ ...confirmOptions, action: () => executeMutate(url, method, body) });
      return;
    }
    await executeMutate(url, method, body);
  }

  function updateSettingsDraft(nextSettings: Partial<Settings>) {
    settingsDirtyRef.current = true;
    setSettings(nextSettings);
  }

  function markSettingsDirty() {
    settingsDirtyRef.current = true;
  }

  async function saveSettingsDraft(nextSettings: Partial<Settings>) {
    setError("");
    const res = await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nextSettings) });
    if (!res.ok) {
      const result = await res.json().catch(() => ({ error: "Operation failed" }));
      const message = result.error || "Operation failed";
      setError(message);
      throw new Error(message);
    }
    settingsDirtyRef.current = false;
    setSettings(nextSettings);
    await load({ forceSettings: true });
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
  }

  const users = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data?.users ?? [];
    return (data?.users ?? []).filter((u) => `${u.id} ${displayUid(u)} ${u.username} ${u.email ?? ""} ${u.remark ?? ""}`.toLowerCase().includes(q));
  }, [data?.users, query]);

  const orders = useMemo(() => {
    const q = orderQuery.trim().toLowerCase();
    let rows = data?.orders ?? [];
    if (orderStatus !== "all") rows = rows.filter((o) => o.status === orderStatus);
    if (!q) return rows;
    return rows.filter((o) => `${o.id} ${o.user_id} ${displayUid(o)} ${o.username} ${o.email ?? ""} ${o.symbol} ${o.direction} ${o.note ?? ""}`.toLowerCase().includes(q));
  }, [data?.orders, orderQuery, orderStatus]);

  const withdrawals = useMemo(() => {
    const list = data?.withdrawals ?? [];
    return withdrawStatus === "all" ? list : list.filter((w) => w.status === withdrawStatus);
  }, [data?.withdrawals, withdrawStatus]);

  const deposits = useMemo(() => {
    const rows = data?.deposits ?? [];
    return depositStatus === "all" ? rows : rows.filter((row) => row.status === depositStatus);
  }, [data?.deposits, depositStatus]);

  const kycRows = useMemo(() => {
    const rows = data?.kycSubmissions ?? [];
    return kycStatusFilter === "all" ? rows : rows.filter((row) => row.status === kycStatusFilter);
  }, [data?.kycSubmissions, kycStatusFilter]);

  const nav: Array<{ id: TabId; label: string; icon: LucideIcon; badge?: number }> = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "depositAddresses", label: "Deposit Addresses", icon: Landmark },
    { id: "deposits", label: "Deposits", icon: CircleDollarSign, badge: data?.stats.pending_deposits },
    { id: "withdrawals", label: "Withdrawals", icon: ArrowDownToLine, badge: data?.stats.pending_withdrawals },
    { id: "kyc", label: "KYC", icon: ShieldCheck, badge: data?.stats.pending_kyc },
    { id: "users", label: "Users", icon: Users },
    { id: "orders", label: "Orders", icon: WalletCards },
    { id: "markets", label: "Markets", icon: Activity },
    { id: "settings", label: "Settings", icon: Settings2 }
  ];
  const realtimeLabel = realtimeStatus === "connected" ? "Realtime" : realtimeStatus === "polling" ? "Polling" : "Connecting";

  return (
    <main className="admin-page">
      <style>{adminCss}</style>
      <div className="admin-shell">
        <aside className="admin-side">
          <div className="brand"><b>FLUXPERP</b><span>Admin Console</span></div>
          <nav className="nav">
            {nav.map((item) => {
              const Icon = item.icon;
              return <button key={item.id} className={tab === item.id ? "on" : ""} onClick={() => setTab(item.id)}><Icon />{item.label}{!!item.badge && item.badge > 0 && <span className="badge">{item.badge}</span>}</button>;
            })}
          </nav>
          <div className="side-foot">
            <Link href="/markets" className="btn">返回前台</Link>
            <button className="btn" onClick={logout}><LogOut />退出登录</button>
          </div>
        </aside>

        <section className="main">
          <div className="topbar">
            <div><h1>{nav.find((item) => item.id === tab)?.label}</h1><p>中文后台管理，当前接入本地 SQLite 与 Next.js API。</p></div>
            <div className="tools">
              <span className={`realtime-state ${realtimeStatus}`} title={realtimeStatus === "polling" ? "Socket offline; polling admin summary" : "Admin realtime connection state"}><span />{realtimeLabel}</span>
              <Link href="/markets" className="btn">前台</Link>
              <button className="btn primary" onClick={() => void load()}><RefreshCw />刷新</button>
            </div>
          </div>
          <div className="content">
            {error && <div className="error">{error}</div>}
            {loading && <div className="loading">正在加载后台数据...</div>}
            {!loading && data && (
              <>
                {tab === "dashboard" && <Dashboard data={data} setTab={setTab} />}
                {tab === "depositAddresses" && <DepositAddressesTab />}
                {tab === "deposits" && <DepositsTab deposits={deposits} all={data.deposits} status={depositStatus} setStatus={setDepositStatus} mutate={mutate} />}
                {tab === "withdrawals" && <WithdrawalsTab withdrawals={withdrawals} all={data.withdrawals} status={withdrawStatus} setStatus={setWithdrawStatus} mutate={mutate} />}
                {tab === "kyc" && <KycTab submissions={kycRows} all={data.kycSubmissions} status={kycStatusFilter} setStatus={setKycStatusFilter} mutate={mutate} />}
                {tab === "users" && <UsersTab users={users} assets={data.assetRows} query={query} setQuery={setQuery} mutate={mutate} openModal={setModal} />}
                {tab === "orders" && <ManualOrdersTab orders={orders} allOrders={data.orders} query={orderQuery} setQuery={setOrderQuery} status={orderStatus} setStatus={setOrderStatus} mutate={mutate} />}
                {tab === "markets" && <MarketsTab markets={data.markets} newMarket={newMarket} setNewMarket={setNewMarket} mutate={mutate} />}
                {tab === "settings" && <SettingsTab settings={settings} setSettings={updateSettingsDraft} markDirty={markSettingsDirty} saveSettings={saveSettingsDraft} />}
              </>
            )}
          </div>
        </section>
      </div>
      {modal && <UserModal modal={modal} assets={data?.assetRows ?? []} close={() => setModal(null)} mutate={mutate} />}
      {confirm && <ConfirmDialog confirm={confirm} close={() => setConfirm(null)} />}
    </main>
  );
}

function getConfirmOptions(url: string, method: string, body: unknown): ConfirmOptions | null {
  if (method !== "PATCH") return null;
  const payload = (body || {}) as Record<string, unknown>;

  if (url === "/api/admin/kyc") {
    const id = payload.submissionId;
    if (payload.status === "approved") return { title: "\u786e\u8ba4\u901a\u8fc7 KYC\uff1f", message: `KYC \u8bb0\u5f55 #${id} \u5c06\u88ab\u6807\u8bb0\u4e3a\u5df2\u901a\u8fc7\uff0c\u7528\u6237\u7aef\u4f1a\u540c\u6b65\u663e\u793a\u5df2\u8ba4\u8bc1\u3002`, confirmText: "\u786e\u8ba4\u901a\u8fc7", variant: "good" };
    if (payload.status === "rejected") return { title: "\u786e\u8ba4\u62d2\u7edd KYC\uff1f", message: `KYC \u8bb0\u5f55 #${id} \u5c06\u88ab\u62d2\u7edd\uff0c\u7528\u6237\u7aef\u4f1a\u770b\u5230\u62d2\u7edd\u72b6\u6001\u548c\u539f\u56e0\u3002`, confirmText: "\u786e\u8ba4\u62d2\u7edd", variant: "danger" };
  }

  if (url === "/api/admin/deposits") {
    const id = payload.depositId;
    if (payload.status === "approved") return { title: "\u786e\u8ba4\u901a\u8fc7\u5145\u503c\uff1f", message: `\u5145\u503c\u5355 #${id} \u901a\u8fc7\u540e\uff0c\u7cfb\u7edf\u4f1a\u7ed9\u7528\u6237\u589e\u52a0\u5bf9\u5e94\u6a21\u62df\u8d44\u4ea7\u5e76\u5199\u5165\u8d26\u672c\u3002`, confirmText: "\u786e\u8ba4\u901a\u8fc7", variant: "good" };
    if (payload.status === "rejected") return { title: "\u786e\u8ba4\u62d2\u7edd\u5145\u503c\uff1f", message: `\u5145\u503c\u5355 #${id} \u5c06\u88ab\u6807\u8bb0\u4e3a\u5df2\u62d2\u7edd\uff0c\u4e0d\u4f1a\u7ed9\u7528\u6237\u52a0\u4f59\u989d\u3002`, confirmText: "\u786e\u8ba4\u62d2\u7edd", variant: "danger" };
  }

  if (url === "/api/admin/withdrawals") {
    const id = payload.withdrawalId;
    if (payload.status === "approved") return { title: "\u786e\u8ba4\u901a\u8fc7\u63d0\u73b0\uff1f", message: `\u63d0\u73b0\u5355 #${id} \u901a\u8fc7\u540e\uff0c\u51bb\u7ed3\u8d44\u91d1\u4f1a\u88ab\u6b63\u5f0f\u6263\u9664\u3002`, confirmText: "\u786e\u8ba4\u901a\u8fc7", variant: "good" };
    if (payload.status === "rejected") return { title: "\u786e\u8ba4\u62d2\u7edd\u63d0\u73b0\uff1f", message: `\u63d0\u73b0\u5355 #${id} \u62d2\u7edd\u540e\uff0c\u51bb\u7ed3\u8d44\u91d1\u4f1a\u9000\u56de\u7528\u6237\u53ef\u7528\u4f59\u989d\u3002`, confirmText: "\u786e\u8ba4\u62d2\u7edd", variant: "danger" };
  }

  if (url === "/api/admin/orders") {
    const id = payload.orderId;
    if (payload.result === "won") return { title: "\u786e\u8ba4\u5224\u8d62\u8ba2\u5355\uff1f", message: `\u8ba2\u5355 #${id} \u5c06\u6309\u540e\u53f0\u624b\u52a8\u5224\u8d62\u7ed3\u7b97\uff0c\u7528\u6237\u4f59\u989d\u548c\u8ba2\u5355\u72b6\u6001\u4f1a\u7acb\u5373\u66f4\u65b0\u3002`, confirmText: "\u786e\u8ba4\u5224\u8d62", variant: "good" };
    if (payload.result === "lost") return { title: "\u786e\u8ba4\u5224\u8f93\u8ba2\u5355\uff1f", message: `\u8ba2\u5355 #${id} \u5c06\u6309\u540e\u53f0\u624b\u52a8\u5224\u8f93\u7ed3\u7b97\uff0c\u7528\u6237\u4f59\u989d\u548c\u8ba2\u5355\u72b6\u6001\u4f1a\u7acb\u5373\u66f4\u65b0\u3002`, confirmText: "\u786e\u8ba4\u5224\u8f93", variant: "danger" };
  }

  return null;
}

function ConfirmDialog({ confirm, close }: { confirm: NonNullable<ConfirmState>; close: () => void }) {
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await confirm.action();
      close();
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="modal-bg" onClick={close}>
      <div className="modal confirm" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head"><h3>{confirm.title}</h3><button className="btn icon" onClick={close}><X /></button></div>
        <div className="modal-body"><p>{confirm.message}</p></div>
        <div className="modal-foot">
          <button className="btn" onClick={close} disabled={busy}>{"\u53d6\u6d88"}</button>
          <button className={`btn ${confirm.variant || "primary"}`} onClick={submit} disabled={busy}>{busy ? "\u5904\u7406\u4e2d..." : confirm.confirmText || "\u786e\u8ba4"}</button>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ data, setTab }: { data: AdminData; setTab: (tab: TabId) => void }) {
  return (
    <>
      <div className="cards">
        <Stat label="USDC 总余额" value={money(data.stats.total_stable_balance || 0, 8)} sub="用户 USDC 资产合计" icon={<CircleDollarSign />} />
        <Stat label="用户数" value={data.stats.users} sub="平台注册账户" icon={<Users />} />
        <Stat label="待审核充值" value={0} sub="充值 API 待接入" icon={<Check />} />
        <Stat label="交易对数量" value={data.markets.length} sub={`${data.markets.filter((m) => m.is_active).length} 个已开启`} icon={<Landmark />} />
      </div>
      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><h2><WalletCards />近期账本流水</h2><button className="btn" onClick={() => setTab("users")}>查看用户</button></div>
          <div className="panel-body ledger">
            {data.ledger.length === 0 && <div className="empty">暂无账本流水</div>}
            {data.ledger.slice(0, 8).map((row) => (
              <div className="ledger-row" key={row.id}>
                <div><b>{actor(row)}</b> <span className="muted">{row.type}</span><br /><span className="muted">{row.asset} {money(row.amount, 2)} - {row.note || "-"}</span></div>
                <span className="muted">{cnTime(row.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h2><Gauge />风控概览</h2><button className="btn" onClick={() => setTab("orders")}>订单管理</button></div>
          <div className="panel-body">
            <div className="cards" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Stat label="开放仓位" value={data.stats.open_positions} sub="当前未结算" icon={<Gauge />} />
              <Stat label="累计手续费" value={`$${money(data.stats.fees)}`} sub={`用户已实现 PnL $${money(data.stats.trader_realized_pnl)}`} icon={<SlidersHorizontal />} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function UsersTab({ users, assets, query, setQuery, mutate, openModal }: { users: User[]; assets: AssetRow[]; query: string; setQuery: (value: string) => void; mutate: (url: string, method: string, body: unknown) => Promise<void>; openModal: (modal: ModalState) => void }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h2><Users />用户管理</h2>
        <div className="tools"><Search size={16} /><input className="input" style={{ width: 280 }} placeholder="搜索 ID / 邮箱 / 用户名" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>ID</th><th>用户名</th><th>资金</th><th>备注</th><th>交易</th><th>登录</th><th>操作</th></tr></thead>
          <tbody>
            {users.length === 0 && <tr><td colSpan={7} className="empty">没有匹配用户</td></tr>}
            {users.map((u) => {
              const rows = assets.filter((asset) => asset.user_id === u.id);
              return (
                <tr key={u.id}>
                  <td className="mono">{displayUid(u)}</td>
                  <td><span className="user-chip">{u.email || u.username}</span><div className="muted" style={{ marginTop: 6 }}>{u.username}</div></td>
                  <td><span className="muted">USDC 总计</span><br /><span className="mono" style={{ fontSize: 18 }}>{money(u.total_assets ?? u.balance, 8)}</span><br /><button className="btn" style={{ padding: 0, border: 0, minHeight: 22 }} onClick={() => openModal({ type: "funds", user: u })}>查看资金</button></td>
                  <td>{u.role === "admin" ? <span className="pill sys">系统用户</span> : <span className="muted">{u.remark || "-"}</span>}</td>
                  <td><Toggle enabled={u.trading_enabled !== 0} onChange={(enabled) => mutate("/api/admin/users", "PATCH", { userId: u.id, tradingEnabled: enabled })} /></td>
                  <td><Toggle enabled={u.login_enabled !== 0} onChange={(enabled) => mutate("/api/admin/users", "PATCH", { userId: u.id, loginEnabled: enabled })} /></td>
                  <td><div className="actions">
                    <button className="btn icon primary" title="编辑备注" onClick={() => openModal({ type: "remark", user: u })}><Edit3 /></button>
                    <button className="btn icon warn" title="上下分" onClick={() => openModal({ type: "funds", user: u })}><SlidersHorizontal /></button>
                    <button className="btn icon warn" title="资产明细" onClick={() => openModal({ type: "funds", user: u })}><UserCog /></button>
                    <button className="btn icon danger" title="修改登录密码" onClick={() => openModal({ type: "loginPassword", user: u })}><KeyRound /></button>
                    <button className="btn icon danger" title="修改提款密码" onClick={() => openModal({ type: "withdrawPassword", user: u })}><LockKeyhole /></button>
                  </div><div className="muted" style={{ marginTop: 6 }}>{rows.length ? `${rows.length} 个币种资产` : "未初始化资产"}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserModal({ modal, assets, close, mutate }: { modal: Exclude<ModalState, null>; assets: AssetRow[]; close: () => void; mutate: (url: string, method: string, body: unknown) => Promise<void> }) {
  const [asset, setAsset] = useState("USDC");
  const [operation, setOperation] = useState<"credit" | "debit" | "freeze" | "unfreeze">("credit");
  const [amount, setAmount] = useState("0");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [remark, setRemark] = useState(modal.user.remark || "");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const balances = coins.map((coin) => assets.find((row) => row.user_id === modal.user.id && row.asset === coin) || { user_id: modal.user.id, asset: coin, balance: 0, locked: 0 });

  async function submit() {
    setFormError("");
    if ((modal.type === "loginPassword" || modal.type === "withdrawPassword") && password.trim().length < 6) return setFormError("\u5bc6\u7801\u81f3\u5c11 6 \u4f4d");
    if ((modal.type === "loginPassword" || modal.type === "withdrawPassword") && password.trim() !== confirmPassword.trim()) return setFormError("\u4e24\u6b21\u8f93\u5165\u7684\u5bc6\u7801\u4e0d\u4e00\u81f4");
    setSaving(true);
    try {
      if (modal.type === "funds") await mutate("/api/admin/users", "PATCH", { userId: modal.user.id, asset, operation, delta: Number(amount) });
      if (modal.type === "loginPassword") await mutate("/api/admin/users", "PATCH", { userId: modal.user.id, loginPassword: password.trim() });
      if (modal.type === "withdrawPassword") await mutate("/api/admin/users", "PATCH", { userId: modal.user.id, withdrawalPassword: password.trim() });
      if (modal.type === "remark") await mutate("/api/admin/users", "PATCH", { userId: modal.user.id, remark });
      close();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "\u4fdd\u5b58\u5931\u8d25");
    } finally {
      setSaving(false);
    }
  }

  const title = modal.type === "funds" ? "上下分" : modal.type === "loginPassword" ? "修改登录密码" : modal.type === "withdrawPassword" ? "修改提款密码" : "编辑备注";
  return (
    <div className="modal-bg">
      <div className="modal">
        <div className="modal-head"><h3>{title}</h3><button className="btn icon" onClick={close}><X /></button></div>
        <div className="modal-body">
          {modal.type === "funds" && (
            <>
              <div className="asset-mini">{balances.map((row) => <div key={row.asset}><b>{row.asset}</b><span className="mono">{money(row.balance, 8)}</span></div>)}</div>
              <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
                <label className="field"><span>用户 ID</span><input className="input" value={displayUid(modal.user)} readOnly /></label>
                <label className="field"><span>币种</span><div className="tabs">{coins.map((coin) => <button key={coin} className={asset === coin ? "on" : ""} onClick={() => setAsset(coin)}>{coin}</button>)}</div></label>
                <label className="field"><span>操作类型</span><div className="tabs">
                  {[["credit", "上分"], ["debit", "下分"], ["freeze", "冻结"], ["unfreeze", "解除冻结"]].map(([id, label]) => <button key={id} className={operation === id ? "on" : ""} onClick={() => setOperation(id as typeof operation)}>{label}</button>)}
                </div></label>
                <label className="field"><span>操作金额</span><input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
              </div>
            </>
          )}
          {(modal.type === "loginPassword" || modal.type === "withdrawPassword") && (
            <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
              <label className="field"><span>新密码</span><input className="input" type="password" placeholder="至少 6 位" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
              <label className="field"><span>确认新密码</span><input className="input" type="password" placeholder="再次输入新密码" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></label>
              <p className="muted">用户：{modal.user.email || modal.user.username} / UID {displayUid(modal.user)}</p>
            </div>
          )}
          {modal.type === "remark" && <label className="field"><span>备注</span><textarea className="textarea" value={remark} onChange={(e) => setRemark(e.target.value)} /></label>}
          {formError && <div className="error">{formError}</div>}
        </div>
        <div className="modal-foot"><button className="btn" onClick={close} disabled={saving}>取消</button><button className="btn primary" onClick={submit} disabled={saving}>{saving ? "保存中..." : "确定"}</button></div>
      </div>
    </div>
  );
}

function DepositsTab({ deposits, all, status, setStatus, mutate }: { deposits: Deposit[]; all: Deposit[]; status: "all" | "pending" | "approved" | "rejected"; setStatus: (value: "all" | "pending" | "approved" | "rejected") => void; mutate: (url: string, method: string, body: unknown) => Promise<void> }) {
  const [note, setNote] = useState<Record<number, string>>({});
  const [preview, setPreview] = useState<{ title: string; src: string } | null>(null);
  const tabs: Array<["all" | "pending" | "approved" | "rejected", string]> = [["all", "\u5168\u90e8"], ["pending", "\u5f85\u5ba1\u6838"], ["approved", "\u5df2\u901a\u8fc7"], ["rejected", "\u5df2\u62d2\u7edd"]];

  return (
    <div className="panel">
      <div className="panel-head">
        <h2><CircleDollarSign />{"\u5145\u503c\u5ba1\u6838"}</h2>
        <div className="tabs">
          {tabs.map(([id, label]) => <button key={id} className={status === id ? "on" : ""} onClick={() => setStatus(id)}>{label} {id === "all" ? all.length : all.filter((row) => row.status === id).length}</button>)}
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>ID</th><th>{"\u7528\u6237"}</th><th>{"\u5e01\u79cd/\u7f51\u7edc"}</th><th>{"\u91d1\u989d"}</th><th>TX</th><th>{"\u622a\u56fe"}</th><th>{"\u5730\u5740"}</th><th>{"\u72b6\u6001"}</th><th>{"\u65f6\u95f4"}</th><th>{"\u64cd\u4f5c"}</th></tr>
          </thead>
          <tbody>
            {deposits.length === 0 && <tr><td colSpan={10} className="empty">{"\u6ca1\u6709\u5145\u503c\u8bb0\u5f55"}</td></tr>}
            {deposits.map((d) => (
              <tr key={d.id}>
                <td className="mono">{d.id}</td>
                <td>{d.email || d.username}<br /><span className="muted mono">UID {displayUid(d)}</span></td>
                <td>{d.asset}<br /><span className="muted">{d.network}</span></td>
                <td className="mono">{money(d.amount, 8)}</td>
                <td className="mono">{d.tx_hash || "-"}</td>
                <td>{d.proof_data ? <button className="btn" onClick={() => setPreview({ title: "\u5145\u503c\u622a\u56fe #" + d.id, src: d.proof_data! })}>{"\u67e5\u770b\u622a\u56fe"}</button> : <span className="muted">-</span>}</td>
                <td className="mono">{d.deposit_address || "-"}</td>
                <td><Status status={d.status} /></td>
                <td className="muted">{cnTime(d.created_at)}</td>
                <td>
                  {String(d.status).trim() === "pending" ? (
                    <div className="actions">
                      <input className="input" style={{ width: 120 }} placeholder="\u5907\u6ce8" value={note[d.id] || ""} onChange={(e) => setNote({ ...note, [d.id]: e.target.value })} />
                      <button className="btn good" onClick={() => mutate("/api/admin/deposits", "PATCH", { depositId: d.id, status: "approved", adminNote: note[d.id] || "" })}>{"\u901a\u8fc7"}</button>
                      <button className="btn danger" onClick={() => mutate("/api/admin/deposits", "PATCH", { depositId: d.id, status: "rejected", adminNote: note[d.id] || "" })}>{"\u62d2\u7edd"}</button>
                    </div>
                  ) : <span className="muted">{"\u5df2\u5904\u7406"}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview && (
        <div className="modal-bg" onClick={() => setPreview(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head"><h3>{preview.title}</h3><button className="btn icon" onClick={() => setPreview(null)}><X /></button></div>
            <div className="modal-body">
              <img src={preview.src} alt={preview.title} style={{ display: "block", width: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: 8, background: "#0f172a" }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KycTab({ submissions, all, status, setStatus, mutate }: { submissions: KycSubmission[]; all: KycSubmission[]; status: "all" | "pending" | "approved" | "rejected"; setStatus: (value: "all" | "pending" | "approved" | "rejected") => void; mutate: (url: string, method: string, body: unknown) => Promise<void> }) {
  const [reason, setReason] = useState<Record<number, string>>({});
  const [preview, setPreview] = useState<{ title: string; src: string } | null>(null);
  const tabs: Array<["all" | "pending" | "approved" | "rejected", string]> = [["all", "\u5168\u90e8"], ["pending", "\u5f85\u5ba1\u6838"], ["approved", "\u5df2\u901a\u8fc7"], ["rejected", "\u5df2\u62d2\u7edd"]];

  return (
    <div className="panel">
      <div className="panel-head">
        <h2><ShieldCheck />KYC {"\u5ba1\u6838"}</h2>
        <div className="tabs">
          {tabs.map(([id, label]) => <button key={id} className={status === id ? "on" : ""} onClick={() => setStatus(id)}>{label} {id === "all" ? all.length : all.filter((row) => row.status === id).length}</button>)}
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>ID</th><th>{"\u7528\u6237"}</th><th>{"\u59d3\u540d"}</th><th>{"\u8bc1\u4ef6\u7c7b\u578b"}</th><th>{"\u8bc1\u4ef6\u56fe\u7247"}</th><th>{"\u72b6\u6001"}</th><th>{"\u63d0\u4ea4\u65f6\u95f4"}</th><th>{"\u62d2\u7edd\u539f\u56e0"}</th><th>{"\u64cd\u4f5c"}</th></tr>
          </thead>
          <tbody>
            {submissions.length === 0 && <tr><td colSpan={9} className="empty">{"\u6ca1\u6709 KYC \u8bb0\u5f55"}</td></tr>}
            {submissions.map((k) => (
              <tr key={k.id}>
                <td className="mono">{k.id}</td>
                <td>{k.email || k.username}<br /><span className="muted mono">UID {displayUid(k)}</span></td>
                <td>{k.legal_name}</td>
                <td>{k.document_type}</td>
                <td>
                  <div className="actions">
                    {k.front_data ? <button className="btn" onClick={() => setPreview({ title: k.legal_name + " \u6b63\u9762\u8bc1\u4ef6", src: k.front_data! })}>{"\u6b63\u9762"}</button> : <span className="muted">-</span>}
                    {k.back_data ? <button className="btn" onClick={() => setPreview({ title: k.legal_name + " \u53cd\u9762\u8bc1\u4ef6", src: k.back_data! })}>{"\u53cd\u9762"}</button> : null}
                  </div>
                </td>
                <td><Status status={k.status} /></td>
                <td className="muted">{cnTime(k.created_at)}</td>
                <td>{k.rejection_reason || "-"}</td>
                <td>
                  {String(k.status).trim() === "pending" ? (
                    <div className="actions">
                      <input className="input" style={{ width: 140 }} placeholder={"拒绝原因"} value={reason[k.id] || ""} onChange={(e) => setReason({ ...reason, [k.id]: e.target.value })} />
                      <button type="button" className="btn good" onClick={(event) => { event.preventDefault(); mutate("/api/admin/kyc", "PATCH", { submissionId: k.id, status: "approved" }); }}>{"\u901a\u8fc7"}</button>
                      <button type="button" className="btn danger" onClick={(event) => { event.preventDefault(); mutate("/api/admin/kyc", "PATCH", { submissionId: k.id, status: "rejected", reason: reason[k.id] || "\u8d44\u6599\u4e0d\u7b26\u5408\u8981\u6c42" }); }}>{"\u62d2\u7edd"}</button>
                    </div>
                  ) : <span className="muted">已处理</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview && (
        <div className="modal-bg" onClick={() => setPreview(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h3>{preview.title}</h3><button className="btn icon" onClick={() => setPreview(null)}><X /></button></div>
            <div className="modal-body">
              <img src={preview.src} alt={preview.title} style={{ display: "block", width: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: 8, background: "#0f172a" }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WithdrawalsTab({ withdrawals, all, status, setStatus, mutate }: { withdrawals: Withdrawal[]; all: Withdrawal[]; status: string; setStatus: (value: string) => void; mutate: (url: string, method: string, body: unknown) => Promise<void> }) {
  const tabs = [["all", "\u5168\u90e8"], ["pending", "\u5f85\u5ba1\u6838"], ["approved", "\u5df2\u901a\u8fc7"], ["rejected", "\u5df2\u62d2\u7edd"]];
  return (
    <div className="panel">
      <div className="panel-head"><h2><ArrowDownToLine />{"\u63d0\u73b0\u5ba1\u6838"}</h2><div className="tabs">{tabs.map(([id, label]) => <button key={id} className={status === id ? "on" : ""} onClick={() => setStatus(id)}>{label} {id === "all" ? all.length : all.filter((w) => w.status === id).length}</button>)}</div></div>
      <div className="table-wrap"><table className="table"><thead><tr><th>ID</th><th>{"\u7528\u6237"}</th><th>{"\u8d44\u4ea7"}</th><th>{"\u91d1\u989d"}</th><th>{"\u5730\u5740"}</th><th>{"\u72b6\u6001"}</th><th>{"\u65f6\u95f4"}</th><th>{"\u64cd\u4f5c"}</th></tr></thead><tbody>
        {withdrawals.length === 0 && <tr><td className="empty" colSpan={8}>{"\u6ca1\u6709\u63d0\u73b0\u8bb0\u5f55"}</td></tr>}
        {withdrawals.map((w) => (
          <tr key={w.id}>
            <td className="mono">{w.id}</td>
            <td>{actor(w)}<br /><span className="muted mono">UID {displayUid(w)}</span></td>
            <td>{(w as Withdrawal & { asset?: string }).asset || "USDC"}</td>
            <td className="mono">{money(w.amount)}</td>
            <td className="mono">{w.address || "-"}</td>
            <td><Status status={w.status} /></td>
            <td className="muted">{cnTime(w.created_at)}</td>
            <td>{String(w.status).trim() === "pending" ? <div className="actions"><button className="btn good" onClick={() => mutate("/api/admin/withdrawals", "PATCH", { withdrawalId: w.id, status: "approved", note: "" })}>{"\u901a\u8fc7"}</button><button className="btn danger" onClick={() => mutate("/api/admin/withdrawals", "PATCH", { withdrawalId: w.id, status: "rejected", note: "" })}>{"\u62d2\u7edd"}</button></div> : <span className="muted">{"\u5df2\u5904\u7406"}</span>}</td>
          </tr>
        ))}
      </tbody></table></div>
    </div>
  );
}

function DepositAddressesTab() {
  const [rows, setRows] = useState<{ defaultAddresses: DepositAddress[]; userAddresses: UserDepositAddress[] }>({ defaultAddresses: [], userAddresses: [] });
  const [form, setForm] = useState({ scope: "default", userId: "", asset: "USDC", network: "TRC20", address: "" });
  const [editing, setEditing] = useState<{ scope: "default" | "user"; id: number } | null>(null);
  const [error, setError] = useState("");

  async function loadAddresses() {
    const res = await fetch("/api/admin/deposit-addresses", { cache: "no-store" });
    if (res.ok) setRows(await res.json());
  }
  useEffect(() => {
    loadAddresses();
  }, []);

  async function saveAddress() {
    setError("");
    const res = await fetch("/api/admin/deposit-addresses", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, id: editing?.id, scope: editing?.scope || form.scope, userId: form.userId.trim() })
    });
    if (!res.ok) return setError((await res.json()).error || "保存失败");
    setForm({ ...form, address: "" });
    setEditing(null);
    await loadAddresses();
  }

  async function toggleAddress(scope: "default" | "user", id: number, enabled: boolean) {
    const res = await fetch("/api/admin/deposit-addresses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, id, isActive: enabled })
    });
    if (!res.ok) return setError((await res.json()).error || "操作失败");
    await loadAddresses();
  }

  async function deleteAddress(scope: "default" | "user", id: number) {
    const res = await fetch("/api/admin/deposit-addresses", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, id })
    });
    if (!res.ok) return setError((await res.json()).error || "删除失败");
    await loadAddresses();
  }

  function editDefault(row: DepositAddress) {
    setEditing({ scope: "default", id: row.id });
    setForm({ scope: "default", userId: "", asset: row.asset, network: row.network, address: row.address });
  }

  function editUser(row: UserDepositAddress) {
    setEditing({ scope: "user", id: row.id });
    setForm({ scope: "user", userId: displayUid(row), asset: row.asset, network: row.network, address: row.address });
  }

  return (
    <div className="grid-2">
      <div className="panel">
        <div className="panel-head"><h2><Landmark />存款地址分配</h2></div>
        <div className="panel-body form-grid" style={{ gridTemplateColumns: "1fr" }}>
          {error && <div className="error">{error}</div>}
          <label className="field"><span>地址类型</span><select className="select" value={form.scope} disabled={!!editing} onChange={(e) => setForm({ ...form, scope: e.target.value })}><option value="default">平台默认充值地址</option><option value="user">用户自定义充值地址</option></select></label>
          {form.scope === "user" && <label className="field"><span>用户 ID</span><input className="input" value={form.userId} disabled={!!editing} onChange={(e) => setForm({ ...form, userId: e.target.value })} placeholder="例如 123456" /></label>}
          <label className="field"><span>币种</span><input className="input" value={form.asset} disabled={!!editing} onChange={(e) => setForm({ ...form, asset: e.target.value.toUpperCase() })} /></label>
          <label className="field"><span>网络</span><input className="input" value={form.network} disabled={!!editing} onChange={(e) => setForm({ ...form, network: e.target.value })} /></label>
          <label className="field"><span>充值地址</span><textarea className="textarea" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
          <div className="actions">
            <button className="btn primary" onClick={saveAddress}>{editing ? "保存修改" : "保存地址"}</button>
            {editing && <button className="btn" onClick={() => { setEditing(null); setForm({ scope: "default", userId: "", asset: "USDC", network: "TRC20", address: "" }); }}>取消编辑</button>}
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><h2><CircleDollarSign />平台默认地址</h2></div>
        <div className="table-wrap"><table className="table"><thead><tr><th>ID</th><th>币种</th><th>网络</th><th>地址</th><th>操作</th><th>状态</th></tr></thead><tbody>{rows.defaultAddresses.map((row) => <tr key={row.id}><td>{row.id}</td><td>{row.asset}</td><td>{row.network}</td><td className="mono">{row.address}</td><td><div className="actions"><button className="btn" onClick={() => editDefault(row)}>编辑</button><button className="btn warn" onClick={() => toggleAddress("default", row.id, !row.is_active)}>{row.is_active ? "停用" : "启用"}</button><button className="btn danger" onClick={() => deleteAddress("default", row.id)}>删除</button></div></td><td><Status status={row.is_active ? "approved" : "rejected"} /></td></tr>)}</tbody></table></div>
      </div>
      <div className="panel" style={{ gridColumn: "1 / -1" }}>
        <div className="panel-head"><h2><Users />用户自定义地址</h2><span className="muted">优先级高于平台默认地址</span></div>
        <div className="table-wrap"><table className="table"><thead><tr><th>ID</th><th>用户 ID</th><th>邮箱</th><th>币种</th><th>网络</th><th>地址</th><th>操作</th><th>状态</th></tr></thead><tbody>{rows.userAddresses.length === 0 && <tr><td colSpan={8} className="empty">暂无用户自定义地址</td></tr>}{rows.userAddresses.map((row) => <tr key={row.id}><td>{row.id}</td><td className="mono">{displayUid(row)}</td><td>{row.email || row.username}</td><td>{row.asset}</td><td>{row.network}</td><td className="mono">{row.address}</td><td><div className="actions"><button className="btn" onClick={() => editUser(row)}>编辑</button><button className="btn warn" onClick={() => toggleAddress("user", row.id, !row.is_active)}>{row.is_active ? "停用" : "启用"}</button><button className="btn danger" onClick={() => deleteAddress("user", row.id)}>删除</button></div></td><td><Status status={row.is_active ? "approved" : "rejected"} /></td></tr>)}</tbody></table></div>
      </div>
    </div>
  );
}

function ManualOrdersTab({ orders, allOrders, query, setQuery, status, setStatus, mutate }: { orders: Order[]; allOrders: Order[]; query: string; setQuery: (value: string) => void; status: "all" | "open" | "won" | "lost"; setStatus: (value: "all" | "open" | "won" | "lost") => void; mutate: (url: string, method: string, body: unknown) => Promise<void> }) {
  const [settlePrice, setSettlePrice] = useState<Record<number, string>>({});
  const tabs: Array<["all" | "open" | "won" | "lost", string]> = [["all", "All"], ["open", "Open"], ["won", "Won"], ["lost", "Lost"]];
  const now = Date.now();

  return (
    <div className="panel">
      <div className="panel-head">
        <h2><WalletCards />Binary Orders</h2>
        <div className="tools">
          <input className="input" style={{ width: 220 }} placeholder="Search user ID / email / symbol" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <div className="panel-body">
        <div className="tabs">
          {tabs.map(([id, label]) => <button key={id} className={status === id ? "on" : ""} onClick={() => setStatus(id)}>{label} {id === "all" ? allOrders.length : allOrders.filter((o) => o.status === id).length}</button>)}
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>ID</th><th>User ID</th><th>User</th><th>Symbol</th><th>Side</th><th>Stake</th><th>Duration</th><th>Entry</th><th>Status</th><th>Expires</th><th>PnL</th><th>Manual Settlement</th></tr>
          </thead>
          <tbody>
            {orders.length === 0 && <tr><td colSpan={12} className="empty">No orders</td></tr>}
            {orders.map((o) => {
              const expiresAt = new Date(o.expires_at).getTime();
              const expired = Number.isFinite(expiresAt) && expiresAt <= now;
              const canConfigure = o.status === "open";
              const rawSettlePrice = settlePrice[o.id] ?? (o.manual_settle_price ? String(o.manual_settle_price) : "");
              const nextSettlePrice = Number(rawSettlePrice || o.entry_price);
              const presetLabel = o.manual_result === "won" ? "preset win" : o.manual_result === "lost" ? "preset loss" : "";
              const riskAmount = Number(o.risk_amount || o.stake);
              return (
                <tr key={o.id}>
                  <td className="mono">{o.id}</td>
                  <td className="mono">{displayUid(o)}</td>
                  <td>{o.email || o.username}</td>
                  <td className="mono">{o.symbol}</td>
                  <td><span className={`pill ${o.direction === "call" ? "ok" : "sys"}`}>{o.direction.toUpperCase()}</span></td>
                  <td className="mono">{money(o.stake)}</td>
                  <td>{o.duration_seconds}s / +{Math.round(o.odds * 100)}% / -{money(riskAmount)}</td>
                  <td className="mono">{money(o.entry_price)}</td>
                  <td>{o.status === "open" && presetLabel ? <span className={`pill ${o.manual_result === "won" ? "ok" : "sys"}`}>{expired ? presetLabel : presetLabel}</span> : o.status === "open" && expired ? <span className="pill wait">pending</span> : <Status status={o.status} />}</td>
                  <td className="muted">{cnTime(o.expires_at)}</td>
                  <td className="mono">{o.profit == null ? "-" : money(o.profit)}</td>
                  <td>
                    <div className="actions">
                      <input className="input" style={{ width: 110 }} placeholder="Preset price" value={rawSettlePrice} onChange={(e) => setSettlePrice({ ...settlePrice, [o.id]: e.target.value })} disabled={!canConfigure} />
                      <button className={`btn good ${!canConfigure ? "disabled" : ""}`} disabled={!canConfigure} onClick={() => mutate("/api/admin/orders", "PATCH", { orderId: o.id, result: "won", settlePrice: nextSettlePrice, note: "Admin preset win" })}>{o.manual_result === "won" ? "Win Set" : "Set Win"}</button>
                      <button className={`btn danger ${!canConfigure ? "disabled" : ""}`} disabled={!canConfigure} onClick={() => mutate("/api/admin/orders", "PATCH", { orderId: o.id, result: "lost", settlePrice: nextSettlePrice, note: "Admin preset loss" })}>{o.manual_result === "lost" ? "Loss Set" : "Set Loss"}</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OrdersTab({ orders, allOrders, query, setQuery, status, setStatus, mutate }: { orders: Order[]; allOrders: Order[]; query: string; setQuery: (value: string) => void; status: "all" | "open" | "won" | "lost"; setStatus: (value: "all" | "open" | "won" | "lost") => void; mutate: (url: string, method: string, body: unknown) => Promise<void> }) {
  const [settlePrice, setSettlePrice] = useState<Record<number, string>>({});
  const tabs: Array<["all" | "open" | "won" | "lost", string]> = [["all", "全部"], ["open", "open"], ["won", "won"], ["lost", "lost"]];
  return <div className="panel"><div className="panel-head"><h2><WalletCards />二元期权订单管理</h2><div className="tools"><input className="input" style={{ width: 220 }} placeholder="按用户 ID / 邮箱 / 交易对搜索" value={query} onChange={(e) => setQuery(e.target.value)} /></div></div><div className="panel-body"><div className="tabs">{tabs.map(([id, label]) => <button key={id} className={status === id ? "on" : ""} onClick={() => setStatus(id)}>{label} {id === "all" ? allOrders.length : allOrders.filter((o) => o.status === id).length}</button>)}</div></div><div className="table-wrap"><table className="table"><thead><tr><th>ID</th><th>用户 ID</th><th>用户</th><th>交易对</th><th>方向</th><th>金额</th><th>周期</th><th>入场价</th><th>状态</th><th>到期</th><th>盈亏</th><th>手动结算</th></tr></thead><tbody>{orders.length === 0 && <tr><td colSpan={12} className="empty">没有订单</td></tr>}{orders.map((o) => <tr key={o.id}><td className="mono">{o.id}</td><td className="mono">{displayUid(o)}</td><td>{o.email || o.username}</td><td className="mono">{o.symbol}</td><td><span className={`pill ${o.direction === "call" ? "ok" : "sys"}`}>{o.direction.toUpperCase()}</span></td><td className="mono">{money(o.stake)}</td><td>{o.duration_seconds}s / +{Math.round(o.odds * 100)}%</td><td className="mono">{money(o.entry_price)}</td><td><Status status={o.status} /></td><td className="muted">{cnTime(o.expires_at)}</td><td className="mono">{o.profit == null ? "-" : money(o.profit)}</td><td><div className="actions"><input className="input" style={{ width: 110 }} placeholder="结算价" value={settlePrice[o.id] || ""} onChange={(e) => setSettlePrice({ ...settlePrice, [o.id]: e.target.value })} disabled={o.status !== "open"} /><button className={`btn good ${o.status !== "open" ? "disabled" : ""}`} onClick={() => mutate("/api/admin/orders", "PATCH", { orderId: o.id, result: "won", settlePrice: Number(settlePrice[o.id] || o.entry_price), note: "后台手动判赢" })}>判赢</button><button className={`btn danger ${o.status !== "open" ? "disabled" : ""}`} onClick={() => mutate("/api/admin/orders", "PATCH", { orderId: o.id, result: "lost", settlePrice: Number(settlePrice[o.id] || o.entry_price), note: "后台手动判输" })}>判输</button></div></td></tr>)}</tbody></table></div></div>;
}

function MarketsTab({ markets, newMarket, setNewMarket, mutate }: { markets: Market[]; newMarket: { symbol: string; price: number; maxLeverage: number; feeRate: number; mmr: number }; setNewMarket: (value: { symbol: string; price: number; maxLeverage: number; feeRate: number; mmr: number }) => void; mutate: (url: string, method: string, body: unknown) => Promise<void> }) {
  const [marketErrors, setMarketErrors] = useState<Record<number, string>>({});
  const [createError, setCreateError] = useState("");

  function saveMarketPrice(market: Market, rawValue: string) {
    const price = Number(rawValue);
    if (!Number.isFinite(price) || price <= 0) {
      setMarketErrors((items) => ({ ...items, [market.id]: "请输入有效价格" }));
      return;
    }
    setMarketErrors((items) => ({ ...items, [market.id]: "" }));
    if (price !== market.price) mutate("/api/admin/markets", "PATCH", { marketId: market.id, price });
  }

  function createMarket() {
    if (!newMarket.symbol.trim()) return setCreateError("请输入交易对");
    if (!Number.isFinite(newMarket.price) || newMarket.price <= 0) return setCreateError("请输入有效价格");
    if (!Number.isFinite(newMarket.maxLeverage) || newMarket.maxLeverage < 1) return setCreateError("请输入有效杠杆");
    setCreateError("");
    mutate("/api/admin/markets", "POST", newMarket);
  }

  return <div className="grid-2"><div className="panel"><div className="panel-head"><h2><Landmark />创建交易对</h2></div><div className="panel-body form-grid" style={{ gridTemplateColumns: "1fr" }}><label className="field"><span>交易对</span><input className="input" value={newMarket.symbol} onChange={(e) => setNewMarket({ ...newMarket, symbol: e.target.value })} /></label><label className="field"><span>价格</span><input className="input" type="number" min="0" step="any" value={newMarket.price} onChange={(e) => setNewMarket({ ...newMarket, price: Number(e.target.value) })} /></label><label className="field"><span>杠杆上限</span><input className="input" type="number" min="1" value={newMarket.maxLeverage} onChange={(e) => setNewMarket({ ...newMarket, maxLeverage: Number(e.target.value) })} /></label>{createError && <div className="form-error">{createError}</div>}<button className="btn primary" onClick={createMarket}>创建</button></div></div><div className="panel"><div className="panel-head"><h2><Activity />市场参数</h2></div><div className="table-wrap"><table className="table"><thead><tr><th>市场</th><th>价格</th><th>杠杆</th><th>手续费</th><th>MMR</th><th>状态</th><th>操作</th></tr></thead><tbody>{markets.map((m) => <tr key={m.id}><td className="mono">{m.symbol}</td><td><input className="input" style={{ width: 110 }} type="number" min="0" step="any" defaultValue={m.price} onBlur={(e) => saveMarketPrice(m, e.target.value)} />{marketErrors[m.id] && <small className="form-error">{marketErrors[m.id]}</small>}</td><td>{m.max_leverage}x</td><td>{m.fee_rate}</td><td>{m.maintenance_margin_rate}</td><td><Status status={m.is_active ? "approved" : "rejected"} /></td><td><button className="btn" onClick={() => mutate("/api/admin/markets", "PATCH", { marketId: m.id, isActive: !m.is_active })}>{m.is_active ? "暂停" : "开启"}</button></td></tr>)}</tbody></table></div></div></div>;
}

function SettingsTab({ settings, setSettings, markDirty, saveSettings: persistSettings }: { settings: Partial<Settings>; setSettings: (value: Partial<Settings>) => void; markDirty: () => void; saveSettings: (settings: Partial<Settings>) => Promise<void> }) {
  const setSwitch = (key: keyof Settings, enabled: boolean) => setSettings({ ...settings, [key]: String(enabled) });
  const setValue = (key: keyof Settings, value: string) => setSettings({ ...settings, [key]: value });
  const [binaryText, setBinaryText] = useState(formatBinaryOptionsConfig(settings.binary_options_config));
  const [binaryError, setBinaryError] = useState("");

  useEffect(() => {
    setBinaryText(formatBinaryOptionsConfig(settings.binary_options_config));
  }, [settings.binary_options_config]);

  async function submitSettings() {
    try {
      setBinaryError("");
      await persistSettings({
        ...settings,
        binary_options_config: binaryOptionsTextToConfig(binaryText)
      });
    } catch (error) {
      setBinaryError(error instanceof Error ? error.message : "Invalid binary option settings");
    }
  }

  return (
    <div className="grid-2">
      <div className="panel">
        <div className="panel-head"><h2><Settings2 />系统开关</h2></div>
        <div className="panel-body">
          <SettingSwitch label="注册开关" value={settings.registration_enabled} onToggle={(value) => setSwitch("registration_enabled", value)} />
          <SettingSwitch label="提现开关" value={settings.withdrawals_enabled} onToggle={(value) => setSwitch("withdrawals_enabled", value)} />
          <SettingSwitch label="交易开关" value={settings.trading_enabled} onToggle={(value) => setSwitch("trading_enabled", value)} />
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><h2><Save />平台设置</h2></div>
        <div className="panel-body form-grid" style={{ gridTemplateColumns: "1fr" }}>
          <label className="field"><span>WhatsApp 客服链接</span><input className="input" value={settings.whatsapp_support_url || ""} onChange={(e) => setValue("whatsapp_support_url", e.target.value)} /></label>
          <label className="field"><span>Telegram 客服链接</span><input className="input" value={settings.telegram_url || ""} onChange={(e) => setValue("telegram_url", e.target.value)} /></label>
          <label className="field"><span>注册赠金 USDC（已关闭）</span><input className="input" value="0" readOnly disabled /></label>
          <label className="field"><span>最小提现金额</span><input className="input" value={settings.min_withdrawal_amount || ""} onChange={(e) => setValue("min_withdrawal_amount", e.target.value)} /></label>
          <label className="field"><span>提现说明</span><textarea className="textarea" value={settings.withdrawal_notice || ""} onChange={(e) => setValue("withdrawal_notice", e.target.value)} /></label>
        </div>
      </div>
      <div className="panel" style={{ gridColumn: "1 / -1" }}>
        <div className="panel-head"><h2><SlidersHorizontal />二元期权设置</h2></div>
        <div className="panel-body form-grid" style={{ gridTemplateColumns: "1fr" }}>
          <label className="field">
            <span>时间和收益率</span>
            <textarea className="textarea mono" style={{ minHeight: 118 }} value={binaryText} onChange={(e) => { markDirty(); setBinaryText(e.target.value); }} placeholder={"30,30\n60,35"} />
          </label>
          <span className="muted">每行一个档位：秒数,盈利百分比。亏损百分比自动为盈利 + 1%。</span>
          {binaryError && <div className="error">{binaryError}</div>}
        </div>
      </div>
      <div className="panel" style={{ gridColumn: "1 / -1" }}>
        <div className="panel-head"><h2><FileText />前端页面内容</h2></div>
        <div className="panel-body form-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
          <label className="field"><span>About</span><textarea className="textarea" value={settings.about_content || ""} onChange={(e) => setValue("about_content", e.target.value)} /></label>
          <label className="field"><span>Terms of Service</span><textarea className="textarea" value={settings.terms_content || ""} onChange={(e) => setValue("terms_content", e.target.value)} /></label>
          <label className="field"><span>Privacy Policy</span><textarea className="textarea" value={settings.privacy_content || ""} onChange={(e) => setValue("privacy_content", e.target.value)} /></label>
        </div>
      </div>
      <div className="actions" style={{ gridColumn: "1 / -1", justifyContent: "flex-end" }}>
        <button className="btn primary" onClick={submitSettings}><Save />保存设置</button>
      </div>
    </div>
  );
}

function ComingSoon({ title, text }: { title: string; text: string }) {
  return <div className="panel"><div className="panel-head"><h2><ShieldCheck />{title}</h2></div><div className="panel-body"><p className="muted">{text}</p></div></div>;
}

function Stat({ label, value, sub, icon }: { label: string; value: ReactNode; sub: string; icon: ReactNode }) {
  return <div className="card stat"><div><label>{label}</label><strong className="mono">{value}</strong><small>{sub}</small></div>{icon}</div>;
}

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  return <button className={`switch ${enabled ? "on" : ""}`} onClick={() => onChange(!enabled)}><span /></button>;
}

function Status({ status }: { status: string }) {
  const cls = status === "approved" || status === "paid" || status === "won" ? "ok" : status === "pending" || status === "open" ? "wait" : status === "rejected" || status === "lost" ? "sys" : "off";
  const label = status === "approved" ? "已通过" : status === "paid" ? "已支付" : status === "pending" ? "待审核" : status === "rejected" ? "已拒绝" : status === "won" ? "won" : status === "lost" ? "lost" : status;
  return <span className={`pill ${cls}`}>{label}</span>;
}

function SettingSwitch({ label, value, onToggle }: { label: string; value?: string; onToggle: (enabled: boolean) => void }) {
  const enabled = value !== "false";
  return <div className="ledger-row"><div><b>{label}</b><br /><span className="muted">{enabled ? "当前开启" : "当前关闭"}</span></div><Toggle enabled={enabled} onChange={onToggle} /></div>;
}
