"use client";

import { CheckCircle2, ChevronLeft, Pencil, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Asset = { id?: number; code: string; symbol: string; name: string; icon: string; sortOrder: number; depositEnabled: boolean; withdrawEnabled: boolean; tradeEnabled: boolean; isActive: boolean };

const blank: Asset = { code: "", symbol: "", name: "", icon: "coin", sortOrder: 0, depositEnabled: true, withdrawEnabled: true, tradeEnabled: true, isActive: true };
const assetMarks: Record<string, string> = { BTC: "₿", ETH: "Ξ", USDC: "$", USDT: "₮", SOL: "S", BNB: "B", XRP: "X" };

function assetMark(asset: Asset) {
  const custom = (asset.icon || "").trim();
  return custom.length > 0 && custom.length <= 2 ? custom : assetMarks[asset.code.toUpperCase()] ?? asset.code.slice(0, 1).toUpperCase();
}

function StatusBadge({ active }: { active: boolean }) {
  return <span className={`admin-status ${active ? "is-active" : "is-muted"}`}><span aria-hidden="true" />{active ? "已启用" : "已禁用"}</span>;
}

function FeatureBadge({ label, active }: { label: string; active: boolean }) {
  return <span className={`admin-badge ${active ? "is-on" : "is-off"}`}>{active ? "✓" : "–"} {label}</span>;
}

export default function AssetConfigTab() {
  const [rows, setRows] = useState<Asset[]>([]);
  const [form, setForm] = useState<Asset>(blank);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [modalKind, setModalKind] = useState<"create" | "edit" | null>(null);
  const [modalStep, setModalStep] = useState<1 | 2>(1);
  const load = async () => { const r = await fetch("/api/admin/assets", { cache: "no-store" }); if (r.ok) setRows((await r.json()).assets || []); };
  useEffect(() => { void load(); }, []);
  const closeModal = () => { setModalKind(null); setModalStep(1); setError(""); };
  const save = async () => {
    setError("");
    const r = await fetch("/api/admin/assets", { method: form.id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    if (!r.ok) { setError((await r.json()).error || "保存失败"); return; }
    setForm(blank);
    await load();
    closeModal();
  };
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => [row.code, row.symbol, row.name, row.icon].join(" ").toLowerCase().includes(needle));
  }, [query, rows]);
  const openCreate = () => { setForm(blank); setError(""); setModalStep(1); setModalKind("create"); };
  const openEdit = (row: Asset) => { setForm(row); setError(""); setModalStep(1); setModalKind("edit"); };
  const submit = () => { void save(); };

  return <div className="admin-config-page">
    <header className="admin-page-header">
      <div><p className="admin-page-kicker">ASSET CONFIGURATION</p><h2>资产配置</h2><p>统一管理交易资产与 Deposit / Withdraw / Trade 开关。</p></div>
    </header>

    <section className="admin-toolbar" aria-label="资产操作工具栏">
      <span className="admin-toolbar-count">共 {rows.length} 个资产</span>
      <div className="admin-toolbar-actions">
        <label className="admin-search"><Search aria-hidden="true" /><input aria-label="搜索资产" onChange={(event) => setQuery(event.target.value)} placeholder="搜索 Code、Symbol 或名称" value={query} /></label>
        <button className="admin-primary-button" onClick={openCreate} type="button"><Plus aria-hidden="true" /> 新增资产</button>
      </div>
    </section>

    <section className="admin-table-shell">
      <div className="admin-table-scroll">
        <table className="admin-table">
          <thead><tr><th>#</th><th>资产</th><th>Code</th><th>Symbol</th><th>图标</th><th>功能开关</th><th>排序</th><th>状态</th><th className="is-actions">操作</th></tr></thead>
          <tbody>
            {filteredRows.map((row, index) => <tr key={row.id}>
              <td className="admin-table-index">{index + 1}</td>
              <td><div className="admin-table-identity"><span className="admin-table-token" aria-hidden="true">{assetMark(row)}</span><div><strong>{row.code || row.symbol}</strong><small>{row.name || "未命名资产"}</small></div></div></td>
              <td><code>{row.code}</code></td><td>{row.symbol || "–"}</td><td>{row.icon || "–"}</td>
              <td><div className="admin-badge-row"><FeatureBadge label="Deposit" active={row.depositEnabled} /><FeatureBadge label="Withdraw" active={row.withdrawEnabled} /><FeatureBadge label="Trade" active={row.tradeEnabled} /></div></td>
              <td>{row.sortOrder}</td><td><StatusBadge active={row.isActive} /></td>
              <td className="is-actions"><button className="admin-secondary-button admin-table-action" onClick={() => openEdit(row)} type="button"><Pencil aria-hidden="true" /> 编辑</button></td>
            </tr>)}
            {!filteredRows.length && <tr><td className="admin-table-empty" colSpan={9}>{query ? "没有匹配的资产" : "暂无资产配置"}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>

    {modalKind && <div className="admin-modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }} role="presentation">
      <section aria-labelledby="asset-config-modal-title" aria-modal="true" className="admin-modal" role="dialog">
        <header className="admin-modal-header"><div><p className="admin-page-kicker">{modalKind === "create" ? "CREATE ASSET" : "EDIT ASSET"}</p><h3 id="asset-config-modal-title">{modalStep === 1 ? (modalKind === "create" ? "新增资产" : "编辑资产") : (modalKind === "create" ? "确认新增资产" : "确认保存资产")}</h3></div><button aria-label="关闭" className="admin-icon-button" onClick={closeModal} type="button"><X aria-hidden="true" /></button></header>
        <div className="admin-modal-steps"><span className={modalStep === 1 ? "is-active" : "is-complete"}>1. 配置资产</span><span className={modalStep === 2 ? "is-active" : ""}>2. 确认提交</span></div>
        {error && <div className="admin-config-error" role="alert">{error}</div>}
        {modalStep === 1 ? <div className="admin-modal-body">
          <div className="admin-form-grid admin-form-grid-five">
            {([['code','Code'],['symbol','Symbol'],['name','名称'],['icon','图标']] as const).map(([key,label]) => <label className="admin-config-field" key={key}><span>{label}</span><input onChange={(event) => setForm({ ...form, [key]: event.target.value })} value={String(form[key])} /></label>)}
            <label className="admin-config-field"><span>排序</span><input onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} type="number" value={form.sortOrder} /></label>
          </div>
          <fieldset className="admin-config-switches"><legend>功能开关</legend><div>{([['depositEnabled','Deposit'],['withdrawEnabled','Withdraw'],['tradeEnabled','Trade'],['isActive','Active']] as const).map(([key,label]) => <label className="admin-config-check" key={key}><input checked={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.checked })} type="checkbox" /><span>{label}</span></label>)}</div></fieldset>
        </div> : <div className="admin-modal-body">
          <div className="admin-confirm-summary"><CheckCircle2 aria-hidden="true" /><div><strong>{form.code || "未填写 Code"}</strong><span>{form.name || "未填写名称"} · {form.symbol || "未填写 Symbol"}</span></div></div>
          <dl className="admin-summary-grid"><div><dt>图标</dt><dd>{form.icon || "–"}</dd></div><div><dt>排序</dt><dd>{form.sortOrder}</dd></div><div><dt>Deposit</dt><dd>{form.depositEnabled ? "Enabled" : "Disabled"}</dd></div><div><dt>Withdraw</dt><dd>{form.withdrawEnabled ? "Enabled" : "Disabled"}</dd></div><div><dt>Trade</dt><dd>{form.tradeEnabled ? "Enabled" : "Disabled"}</dd></div><div><dt>状态</dt><dd>{form.isActive ? "已启用" : "已禁用"}</dd></div></dl>
        </div>}
        <footer className="admin-modal-actions">{modalStep === 2 ? <button className="admin-secondary-button" onClick={() => { setError(""); setModalStep(1); }} type="button"><ChevronLeft aria-hidden="true" /> 返回</button> : <span />}{modalStep === 1 ? <button className="admin-primary-button" onClick={() => { setError(""); setModalStep(2); }} type="button">下一步</button> : <button className="admin-primary-button" onClick={() => void submit()} type="button">{modalKind === "create" ? "确认新增" : "确认保存"}</button>}</footer>
      </section>
    </div>}
  </div>;
}
