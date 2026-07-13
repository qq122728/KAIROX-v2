"use client";

import { useEffect, useState } from "react";

type Network = {
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

export default function NetworkConfigTab() {
  const [rows, setRows] = useState<Network[]>([]);
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

  function edit(row: Network) {
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

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className="panel">
        <div className="panel-head"><h2>统一网络配置</h2><span className="muted">Deposit 和 Withdraw 共用</span></div>
        <div className="panel-body" style={{ display: "grid", gap: 12 }}>
          <div className="form-grid">
            <label>币种<input value={form.asset} disabled={editing !== null} onChange={(e) => setForm({ ...form, asset: e.target.value.toUpperCase() })} /></label>
            <label>网络代码<input value={form.code} disabled={editing !== null} placeholder="例如 POLYGON" onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></label>
            <label>网络名称<input value={form.name} placeholder="例如 Polygon" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>图标代码<input value={form.icon} placeholder="例如 polygon" onChange={(e) => setForm({ ...form, icon: e.target.value })} /></label>
            <label>充值手续费<input type="number" min="0" step="any" value={form.depositFee} onChange={(e) => setForm({ ...form, depositFee: e.target.value })} /></label>
            <label>提现手续费<input type="number" min="0" step="any" value={form.withdrawFee} onChange={(e) => setForm({ ...form, withdrawFee: e.target.value })} /></label>
            <label>最低充值<input type="number" min="0" step="any" value={form.minDeposit} onChange={(e) => setForm({ ...form, minDeposit: e.target.value })} /></label>
            <label>最低提现<input type="number" min="0" step="any" value={form.minWithdraw} onChange={(e) => setForm({ ...form, minWithdraw: e.target.value })} /></label>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <label><input type="checkbox" checked={form.depositEnabled} onChange={(e) => setForm({ ...form, depositEnabled: e.target.checked })} /> 允许充值</label>
            <label><input type="checkbox" checked={form.withdrawEnabled} onChange={(e) => setForm({ ...form, withdrawEnabled: e.target.checked })} /> 允许提现</label>
            <label><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> 启用网络</label>
          </div>
          {error && <div className="error">{error}</div>}
          <div className="actions">
            <button className="admin-button admin-button-primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? "保存中..." : editing ? "保存修改" : "新增网络"}</button>
            {editing !== null && <button className="admin-button admin-button-ghost" type="button" onClick={reset}>取消</button>}
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-head"><h2>网络列表</h2><span className="muted">{rows.length} 个配置</span></div>
        <div className="table-wrap"><table className="table"><thead><tr><th>币种</th><th>代码</th><th>名称</th><th>图标</th><th>充值</th><th>提现</th><th>状态</th><th>操作</th></tr></thead><tbody>
          {rows.map((row) => <tr key={row.id}><td>{row.asset}</td><td>{row.code}</td><td>{row.name}</td><td>{row.icon}</td><td>{row.deposit_enabled ? "启用" : "停用"} / {row.deposit_fee}</td><td>{row.withdraw_enabled ? "启用" : "停用"} / {row.withdraw_fee}</td><td>{row.is_active ? "启用" : "停用"}</td><td><button className="admin-button admin-button-ghost" type="button" onClick={() => edit(row)}>编辑</button></td></tr>)}
          {!rows.length && <tr><td colSpan={8}>暂无网络配置</td></tr>}
        </tbody></table></div>
      </section>
    </div>
  );
}
