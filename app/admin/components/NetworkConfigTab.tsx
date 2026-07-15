"use client";

import { ArrowDownToLine, ArrowUpFromLine, Network, Pencil, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type NetworkRow = {
  id: number;
  asset: string;
  code: string;
  name: string;
  icon: string;
  deposit_enabled: number;
  withdraw_enabled: number;
  deposit_fee: number;
  withdraw_fee: number;
  min_deposit: number;
  min_withdraw: number;
  is_active: number;
};

const emptyForm = {
  asset: "USDC",
  code: "",
  name: "",
  icon: "",
  depositEnabled: true,
  withdrawEnabled: true,
  depositFee: "0",
  withdrawFee: "1",
  minDeposit: "0",
  minWithdraw: "0",
  isActive: true,
};

const networkMarks: Record<string, string> = { ERC20: "Ξ", BEP20: "B", TRC20: "T", POLYGON: "P", SOLANA: "S", BITCOIN: "₿" };

function networkMark(row: NetworkRow) {
  const custom = (row.icon || "").trim();
  return custom.length > 0 && custom.length <= 2 ? custom : networkMarks[row.code.toUpperCase()] ?? row.code.slice(0, 1).toUpperCase();
}

function StatusBadge({ active }: { active: boolean }) {
  return <span className={`admin-config-status ${active ? "is-active" : "is-muted"}`}><span aria-hidden="true" />{active ? "已启用" : "已禁用"}</span>;
}

function ToggleBadge({ active, label }: { active: boolean; label: string }) {
  return <span className={`admin-config-toggle-badge ${active ? "is-enabled" : "is-disabled"}`}>{active ? "✓" : "–"} {active ? "Enabled" : "Disabled"}<small>{label}</small></span>;
}

export default function NetworkConfigTab() {
  const [rows, setRows] = useState<NetworkRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/networks", { cache: "no-store" });
    if (res.ok) setRows((await res.json()).networks || []);
  }

  useEffect(() => { void load(); }, []);

  function reset() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
  }

  function edit(row: NetworkRow) {
    setEditing(row.id);
    setForm({
      asset: row.asset,
      code: row.code,
      name: row.name,
      icon: row.icon,
      depositEnabled: !!row.deposit_enabled,
      withdrawEnabled: !!row.withdraw_enabled,
      depositFee: String(row.deposit_fee),
      withdrawFee: String(row.withdraw_fee),
      minDeposit: String(row.min_deposit),
      minWithdraw: String(row.min_withdraw),
      isActive: !!row.is_active,
    });
    setError("");
  }

  async function save() {
    setError("");
    if (!form.code.trim()) return setError("网络代码不能为空");
    setSaving(true);
    try {
      const payload = {
        ...form,
        id: editing || undefined,
        depositFee: Number(form.depositFee),
        withdrawFee: Number(form.withdrawFee),
        minDeposit: Number(form.minDeposit),
        minWithdraw: Number(form.minWithdraw),
      };
      const res = await fetch("/api/admin/networks", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error || "保存失败");
      await load();
      reset();
    } catch {
      setError("无法连接服务器，请重试");
    } finally {
      setSaving(false);
    }
  }

  const stats = useMemo(() => ({ total: rows.length, active: rows.filter((row) => !!row.is_active).length, enabledFlows: rows.filter((row) => !!row.deposit_enabled && !!row.withdraw_enabled).length }), [rows]);

  return <div className="admin-config-page">
    <section className="admin-config-hero">
      <div>
        <span className="admin-config-eyebrow">NETWORK DIRECTORY</span>
        <h2>网络配置</h2>
        <p>统一配置每个资产网络的费用、最低金额和 Deposit / Withdraw 开关。</p>
      </div>
      <div className="admin-config-hero-icon" aria-hidden="true"><Network /></div>
    </section>

    <div className="admin-config-stats" aria-label="网络统计">
      <article className="admin-config-stat-card"><span>网络数量</span><strong>{stats.total}</strong><Network aria-hidden="true" /></article>
      <article className="admin-config-stat-card is-positive"><span>启用网络</span><strong>{stats.active}</strong><span className="admin-config-stat-dot" aria-hidden="true" /></article>
      <article className="admin-config-stat-card is-info"><span>充提均可用</span><strong>{stats.enabledFlows}</strong><span className="admin-config-stat-dot" aria-hidden="true" /></article>
    </div>

    <section className="admin-config-card">
      <div className="admin-config-card-header">
        <div><h3>{editing !== null ? "编辑网络" : "新增网络"}</h3><p>填写网络展示信息、费用与可用状态。</p></div>
        {editing !== null && <span className="admin-config-editing">正在编辑</span>}
      </div>
      <div className="admin-config-card-body admin-config-network-form">
        <div className="admin-config-form-columns">
          <div className="admin-config-form-group">
            <h4>网络信息</h4>
            <div className="admin-config-field-grid">
              <label className="admin-config-field"><span>币种</span><input value={form.asset} disabled={editing !== null} onChange={(e) => setForm({ ...form, asset: e.target.value.toUpperCase() })} /></label>
              <label className="admin-config-field"><span>网络代码</span><input value={form.code} disabled={editing !== null} placeholder="例如 POLYGON" onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></label>
              <label className="admin-config-field"><span>网络名称</span><input value={form.name} placeholder="例如 Polygon" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label className="admin-config-field"><span>图标</span><input value={form.icon} placeholder="例如 polygon" onChange={(e) => setForm({ ...form, icon: e.target.value })} /></label>
            </div>
          </div>
          <div className="admin-config-form-group">
            <h4>费用与最低金额</h4>
            <div className="admin-config-field-grid">
              <label className="admin-config-field"><span>充值手续费</span><input type="number" min="0" step="any" value={form.depositFee} onChange={(e) => setForm({ ...form, depositFee: e.target.value })} /></label>
              <label className="admin-config-field"><span>提现手续费</span><input type="number" min="0" step="any" value={form.withdrawFee} onChange={(e) => setForm({ ...form, withdrawFee: e.target.value })} /></label>
              <label className="admin-config-field"><span>最低充值</span><input type="number" min="0" step="any" value={form.minDeposit} onChange={(e) => setForm({ ...form, minDeposit: e.target.value })} /></label>
              <label className="admin-config-field"><span>最低提现</span><input type="number" min="0" step="any" value={form.minWithdraw} onChange={(e) => setForm({ ...form, minWithdraw: e.target.value })} /></label>
            </div>
          </div>
        </div>

        <fieldset className="admin-config-switches">
          <legend>网络开关</legend>
          <div>
            <label className="admin-config-check"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /><span>启用网络</span></label>
            <label className="admin-config-check"><input type="checkbox" checked={form.depositEnabled} onChange={(e) => setForm({ ...form, depositEnabled: e.target.checked })} /><span>允许充值</span></label>
            <label className="admin-config-check"><input type="checkbox" checked={form.withdrawEnabled} onChange={(e) => setForm({ ...form, withdrawEnabled: e.target.checked })} /><span>允许提现</span></label>
          </div>
        </fieldset>

        {error && <div className="admin-config-error" role="alert">{error}</div>}
        <div className="admin-config-actions">
          <button className="admin-button admin-button-primary" type="button" disabled={saving} onClick={() => void save()}><Plus size={16} />{saving ? "保存中..." : editing ? "保存修改" : "新增网络"}</button>
          {editing !== null && <button className="admin-button admin-button-ghost" type="button" onClick={reset}>取消</button>}
        </div>
      </div>
    </section>

    <section className="admin-config-card admin-config-table-card">
      <div className="admin-config-card-header admin-config-table-header">
        <div><h3>网络列表</h3><p>各资产的网络可用性、费用与最低金额。</p></div>
        <span className="admin-config-count">{rows.length} 个配置</span>
      </div>
      <div className="admin-config-table-scroll">
        <table className="admin-config-table admin-config-network-table">
          <thead><tr><th>网络</th><th>币种</th><th>充值</th><th>提现</th><th>状态</th><th className="is-actions">操作</th></tr></thead>
          <tbody>
            {rows.map((row) => <tr key={row.id}>
              <td><div className="admin-config-identity"><span className="admin-config-token is-network" aria-hidden="true">{networkMark(row)}</span><div><strong>{row.name || row.code}</strong><small>{row.code}</small></div></div></td>
              <td><code>{row.asset}</code></td>
              <td><div className="admin-config-flow"><ToggleBadge label="充值" active={!!row.deposit_enabled}/><small><ArrowDownToLine size={13} /> 手续费 {row.deposit_fee} · 最低 {row.min_deposit}</small></div></td>
              <td><div className="admin-config-flow"><ToggleBadge label="提现" active={!!row.withdraw_enabled}/><small><ArrowUpFromLine size={13} /> 手续费 {row.withdraw_fee} · 最低 {row.min_withdraw}</small></div></td>
              <td><StatusBadge active={!!row.is_active}/></td>
              <td className="is-actions"><button className="admin-config-edit-button" type="button" onClick={() => edit(row)}><Pencil size={14} />编辑</button></td>
            </tr>)}
            {!rows.length && <tr><td className="admin-config-empty-cell" colSpan={6}>暂无网络配置</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}
