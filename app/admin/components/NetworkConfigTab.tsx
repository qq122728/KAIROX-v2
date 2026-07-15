"use client";

import { CheckCircle2, ChevronLeft, Pencil, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type NetworkRow = { id: number; asset: string; code: string; name: string; icon: string; deposit_enabled: number; withdraw_enabled: number; deposit_fee: number; withdraw_fee: number; min_deposit: number; min_withdraw: number; is_active: number };

const emptyForm = { asset: "USDC", code: "", name: "", icon: "", depositEnabled: true, withdrawEnabled: true, depositFee: "0", withdrawFee: "1", minDeposit: "0", minWithdraw: "0", isActive: true };
const networkMarks: Record<string, string> = { ERC20: "Ξ", BEP20: "B", TRC20: "T", POLYGON: "P", SOLANA: "S", BITCOIN: "₿" };

function networkMark(row: NetworkRow) {
  const custom = (row.icon || "").trim();
  return custom.length > 0 && custom.length <= 2 ? custom : networkMarks[row.code.toUpperCase()] ?? row.code.slice(0, 1).toUpperCase();
}
function StatusBadge({ active }: { active: boolean }) { return <span className={`admin-status ${active ? "is-active" : "is-muted"}`}><span aria-hidden="true" />{active ? "已启用" : "已禁用"}</span>; }
function ToggleBadge({ active, label }: { active: boolean; label: string }) { return <span className={`admin-badge ${active ? "is-on" : "is-off"}`}>{active ? "✓" : "–"} {label}</span>; }

export default function NetworkConfigTab() {
  const [rows, setRows] = useState<NetworkRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [assetFilter, setAssetFilter] = useState("all");
  const [modalKind, setModalKind] = useState<"create" | "edit" | null>(null);
  const [modalStep, setModalStep] = useState<1 | 2>(1);

  async function load() { const res = await fetch("/api/admin/networks", { cache: "no-store" }); if (res.ok) setRows((await res.json()).networks || []); }
  useEffect(() => { void load(); }, []);
  function reset() { setEditing(null); setForm(emptyForm); setError(""); }
  function edit(row: NetworkRow) { setEditing(row.id); setForm({ asset: row.asset, code: row.code, name: row.name, icon: row.icon, depositEnabled: !!row.deposit_enabled, withdrawEnabled: !!row.withdraw_enabled, depositFee: String(row.deposit_fee), withdrawFee: String(row.withdraw_fee), minDeposit: String(row.min_deposit), minWithdraw: String(row.min_withdraw), isActive: !!row.is_active }); setError(""); }
  function closeModal() { reset(); setModalStep(1); setModalKind(null); }
  async function save() {
    setError("");
    if (!form.code.trim()) { setError("网络代码不能为空"); return; }
    setSaving(true);
    try {
      const payload = { ...form, id: editing || undefined, depositFee: Number(form.depositFee), withdrawFee: Number(form.withdrawFee), minDeposit: Number(form.minDeposit), minWithdraw: Number(form.minWithdraw) };
      const res = await fetch("/api/admin/networks", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "保存失败"); return; }
      await load(); closeModal();
    } catch { setError("无法连接服务器，请重试"); } finally { setSaving(false); }
  }
  const assets = useMemo(() => Array.from(new Set(rows.map((row) => row.asset))).sort(), [rows]);
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => (assetFilter === "all" || row.asset === assetFilter) && (!needle || [row.asset, row.code, row.name, row.icon].join(" ").toLowerCase().includes(needle)));
  }, [assetFilter, query, rows]);
  const openCreate = () => { reset(); setModalStep(1); setModalKind("create"); };
  const openEdit = (row: NetworkRow) => { edit(row); setModalStep(1); setModalKind("edit"); };
  const submit = () => { void save(); };

  return <div className="admin-config-page">
    <header className="admin-page-header"><div><p className="admin-page-kicker">NETWORK CONFIGURATION</p><h2>网络配置</h2><p>统一管理资产网络、费用、最低金额与 Deposit / Withdraw 开关。</p></div></header>
    <section className="admin-toolbar" aria-label="网络操作工具栏"><span className="admin-toolbar-count">共 {rows.length} 个网络</span><div className="admin-toolbar-actions"><label className="admin-search"><Search aria-hidden="true" /><input aria-label="搜索网络" onChange={(event) => setQuery(event.target.value)} placeholder="搜索网络、资产或代码" value={query} /></label><select aria-label="按资产筛选" className="admin-select" onChange={(event) => setAssetFilter(event.target.value)} value={assetFilter}><option value="all">全部资产</option>{assets.map((asset) => <option key={asset} value={asset}>{asset}</option>)}</select><button className="admin-primary-button" onClick={openCreate} type="button"><Plus aria-hidden="true" /> 新增网络</button></div></section>
    <section className="admin-table-shell"><div className="admin-table-scroll"><table className="admin-table admin-network-table"><thead><tr><th>#</th><th>网络名称</th><th>网络代码</th><th>所属资产</th><th>图标</th><th>充值手续费</th><th>提现手续费</th><th>最低充值</th><th>最低提现</th><th>充值状态</th><th>提现状态</th><th>网络状态</th><th className="is-actions">操作</th></tr></thead><tbody>
      {filteredRows.map((row, index) => <tr key={row.id}><td className="admin-table-index">{index + 1}</td><td><div className="admin-table-identity"><span className="admin-table-token is-network" aria-hidden="true">{networkMark(row)}</span><div><strong>{row.name || row.code}</strong><small>{row.code}</small></div></div></td><td><code>{row.code}</code></td><td><code>{row.asset}</code></td><td>{row.icon || "–"}</td><td>{row.deposit_fee}</td><td>{row.withdraw_fee}</td><td>{row.min_deposit}</td><td>{row.min_withdraw}</td><td><ToggleBadge active={!!row.deposit_enabled} label="充值" /></td><td><ToggleBadge active={!!row.withdraw_enabled} label="提现" /></td><td><StatusBadge active={!!row.is_active} /></td><td className="is-actions"><button className="admin-secondary-button admin-table-action" onClick={() => openEdit(row)} type="button"><Pencil aria-hidden="true" /> 编辑</button></td></tr>)}
      {!filteredRows.length && <tr><td className="admin-table-empty" colSpan={13}>{query || assetFilter !== "all" ? "没有匹配的网络" : "暂无网络配置"}</td></tr>}
    </tbody></table></div></section>

    {modalKind && <div className="admin-modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }} role="presentation"><section aria-labelledby="network-config-modal-title" aria-modal="true" className="admin-modal" role="dialog"><header className="admin-modal-header"><div><p className="admin-page-kicker">{modalKind === "create" ? "CREATE NETWORK" : "EDIT NETWORK"}</p><h3 id="network-config-modal-title">{modalStep === 1 ? (modalKind === "create" ? "新增网络" : "编辑网络") : (modalKind === "create" ? "确认新增网络" : "确认保存网络")}</h3></div><button aria-label="关闭" className="admin-icon-button" onClick={closeModal} type="button"><X aria-hidden="true" /></button></header><div className="admin-modal-steps"><span className={modalStep === 1 ? "is-active" : "is-complete"}>1. 配置网络</span><span className={modalStep === 2 ? "is-active" : ""}>2. 确认提交</span></div>{error && <div className="admin-config-error" role="alert">{error}</div>}
      {modalStep === 1 ? <div className="admin-modal-body"><div className="admin-form-section"><h4>网络信息</h4><div className="admin-form-grid"><label className="admin-config-field"><span>币种</span><input disabled={editing !== null} onChange={(event) => setForm({ ...form, asset: event.target.value.toUpperCase() })} value={form.asset} /></label><label className="admin-config-field"><span>网络代码</span><input disabled={editing !== null} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="例如 POLYGON" value={form.code} /></label><label className="admin-config-field"><span>网络名称</span><input onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如 Polygon" value={form.name} /></label><label className="admin-config-field"><span>图标</span><input onChange={(event) => setForm({ ...form, icon: event.target.value })} placeholder="例如 polygon" value={form.icon} /></label></div></div><div className="admin-form-section"><h4>费用与最低金额</h4><div className="admin-form-grid">{([['depositFee','充值手续费'],['withdrawFee','提现手续费'],['minDeposit','最低充值'],['minWithdraw','最低提现']] as const).map(([key,label]) => <label className="admin-config-field" key={key}><span>{label}</span><input min="0" onChange={(event) => setForm({ ...form, [key]: event.target.value })} step="any" type="number" value={form[key]} /></label>)}</div></div><fieldset className="admin-config-switches"><legend>网络开关</legend><div>{([['isActive','启用网络'],['depositEnabled','允许充值'],['withdrawEnabled','允许提现']] as const).map(([key,label]) => <label className="admin-config-check" key={key}><input checked={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.checked })} type="checkbox" /><span>{label}</span></label>)}</div></fieldset></div> : <div className="admin-modal-body"><div className="admin-confirm-summary"><CheckCircle2 aria-hidden="true" /><div><strong>{form.name || form.code || "未填写网络"}</strong><span>{form.asset} · {form.code || "未填写网络代码"}</span></div></div><dl className="admin-summary-grid"><div><dt>充值手续费</dt><dd>{form.depositFee}</dd></div><div><dt>提现手续费</dt><dd>{form.withdrawFee}</dd></div><div><dt>最低充值</dt><dd>{form.minDeposit}</dd></div><div><dt>最低提现</dt><dd>{form.minWithdraw}</dd></div><div><dt>允许充值</dt><dd>{form.depositEnabled ? "Enabled" : "Disabled"}</dd></div><div><dt>允许提现</dt><dd>{form.withdrawEnabled ? "Enabled" : "Disabled"}</dd></div></dl></div>}
      <footer className="admin-modal-actions">{modalStep === 2 ? <button className="admin-secondary-button" onClick={() => { setError(""); setModalStep(1); }} type="button"><ChevronLeft aria-hidden="true" /> 返回</button> : <span />}{modalStep === 1 ? <button className="admin-primary-button" onClick={() => { setError(""); if (!form.code.trim()) { setError("网络代码不能为空"); return; } setModalStep(2); }} type="button">下一步</button> : <button className="admin-primary-button" disabled={saving} onClick={() => void submit()} type="button">{saving ? "保存中..." : modalKind === "create" ? "确认新增" : "确认保存"}</button>}</footer>
    </section></div>}
  </div>;
}
