"use client";

import { CircleDollarSign, Pencil, Plus, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Asset = { id?: number; code: string; symbol: string; name: string; icon: string; sortOrder: number; depositEnabled: boolean; withdrawEnabled: boolean; tradeEnabled: boolean; isActive: boolean };

const blank: Asset = { code: "", symbol: "", name: "", icon: "coin", sortOrder: 0, depositEnabled: true, withdrawEnabled: true, tradeEnabled: true, isActive: true };

const assetMarks: Record<string, string> = { BTC: "₿", ETH: "Ξ", USDC: "$", USDT: "₮", SOL: "S", BNB: "B", XRP: "X" };

function assetMark(asset: Asset) {
  const custom = (asset.icon || "").trim();
  return custom.length > 0 && custom.length <= 2 ? custom : assetMarks[asset.code.toUpperCase()] ?? asset.code.slice(0, 1).toUpperCase();
}

function StatusBadge({ active }: { active: boolean }) {
  return <span className={`admin-config-status ${active ? "is-active" : "is-muted"}`}><span aria-hidden="true" />{active ? "已启用" : "已禁用"}</span>;
}

function FeatureBadge({ label, active }: { label: string; active: boolean }) {
  return <span className={`admin-config-feature ${active ? "is-on" : "is-off"}`}>{active ? "✓" : "–"} {label}</span>;
}

export default function AssetConfigTab() {
  const [rows, setRows] = useState<Asset[]>([]);
  const [form, setForm] = useState<Asset>(blank);
  const [error, setError] = useState("");
  const load = async () => { const r = await fetch("/api/admin/assets", { cache: "no-store" }); if (r.ok) setRows((await r.json()).assets || []); };
  useEffect(() => { void load(); }, []);
  const save = async () => { setError(""); const r = await fetch("/api/admin/assets", { method: form.id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) }); if (!r.ok) { setError((await r.json()).error || "保存失败"); return; } setForm(blank); await load(); };
  const stats = useMemo(() => ({ total: rows.length, active: rows.filter((row) => row.isActive).length, inactive: rows.filter((row) => !row.isActive).length }), [rows]);

  return <div className="admin-config-page">
    <section className="admin-config-hero">
      <div>
        <span className="admin-config-eyebrow">ASSET DIRECTORY</span>
        <h2>资产配置</h2>
        <p>统一管理所有交易资产以及 Deposit / Withdraw / Trade 开关。</p>
      </div>
      <div className="admin-config-hero-icon" aria-hidden="true"><WalletCards /></div>
    </section>

    <div className="admin-config-stats" aria-label="资产统计">
      <article className="admin-config-stat-card"><span>资产数量</span><strong>{stats.total}</strong><CircleDollarSign aria-hidden="true" /></article>
      <article className="admin-config-stat-card is-positive"><span>启用资产</span><strong>{stats.active}</strong><span className="admin-config-stat-dot" aria-hidden="true" /></article>
      <article className="admin-config-stat-card is-muted"><span>禁用资产</span><strong>{stats.inactive}</strong><span className="admin-config-stat-dot" aria-hidden="true" /></article>
    </div>

    <section className="admin-config-card">
      <div className="admin-config-card-header">
        <div><h3>{form.id ? "编辑资产" : "新增资产"}</h3><p>为资产填写显示信息并配置可用功能。</p></div>
        {form.id && <span className="admin-config-editing">正在编辑</span>}
      </div>
      <div className="admin-config-card-body">
        <div className="admin-config-field-grid admin-config-asset-fields">
          {([['code','Code'],['symbol','Symbol'],['name','名称'],['icon','图标']] as const).map(([key,label]) => <label className="admin-config-field" key={key}><span>{label}</span><input value={String(form[key])} onChange={e => setForm({...form,[key]:e.target.value})}/></label>)}
          <label className="admin-config-field"><span>排序</span><input type="number" value={form.sortOrder} onChange={e => setForm({...form,sortOrder:Number(e.target.value)})}/></label>
        </div>

        <fieldset className="admin-config-switches">
          <legend>功能开关</legend>
          <div>
            {([['depositEnabled','Deposit'],['withdrawEnabled','Withdraw'],['tradeEnabled','Trade'],['isActive','Active']] as const).map(([key,label]) => <label className="admin-config-check" key={key}><input type="checkbox" checked={form[key]} onChange={e => setForm({...form,[key]:e.target.checked})}/><span>{label}</span></label>)}
          </div>
        </fieldset>

        {error && <div className="admin-config-error" role="alert">{error}</div>}
        <div className="admin-config-actions">
          <button className="admin-button admin-button-primary" type="button" onClick={save}><Plus size={16} />{form.id ? "保存修改" : "新增资产"}</button>
          {form.id && <button className="admin-button admin-button-ghost" type="button" onClick={() => setForm(blank)}>取消</button>}
        </div>
      </div>
    </section>

    <section className="admin-config-card admin-config-table-card">
      <div className="admin-config-card-header admin-config-table-header">
        <div><h3>资产列表</h3><p>所有资产及前台可用能力一览。</p></div>
        <span className="admin-config-count">{rows.length} 个资产</span>
      </div>
      <div className="admin-config-table-scroll">
        <table className="admin-config-table">
          <thead><tr><th>资产</th><th>Code</th><th>排序</th><th>功能</th><th>状态</th><th className="is-actions">操作</th></tr></thead>
          <tbody>
            {rows.map(row => <tr key={row.id}>
              <td><div className="admin-config-identity"><span className="admin-config-token" aria-hidden="true">{assetMark(row)}</span><div><strong>{row.symbol || row.code}</strong><small>{row.name || "未命名资产"}</small></div></div></td>
              <td><code>{row.code}</code></td>
              <td>{row.sortOrder}</td>
              <td><div className="admin-config-features"><FeatureBadge label="Deposit" active={row.depositEnabled}/><FeatureBadge label="Withdraw" active={row.withdrawEnabled}/><FeatureBadge label="Trade" active={row.tradeEnabled}/></div></td>
              <td><StatusBadge active={row.isActive}/></td>
              <td className="is-actions"><button className="admin-config-edit-button" type="button" onClick={() => setForm(row)}><Pencil size={14} />编辑</button></td>
            </tr>)}
            {!rows.length && <tr><td className="admin-config-empty-cell" colSpan={6}>暂无资产配置</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}
