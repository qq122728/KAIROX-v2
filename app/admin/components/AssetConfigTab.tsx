"use client";

import { useEffect, useState } from "react";

type Asset = { id?: number; code: string; symbol: string; name: string; icon: string; sortOrder: number; depositEnabled: boolean; withdrawEnabled: boolean; tradeEnabled: boolean; isActive: boolean };

const blank: Asset = { code: "", symbol: "", name: "", icon: "coin", sortOrder: 0, depositEnabled: true, withdrawEnabled: true, tradeEnabled: true, isActive: true };

export default function AssetConfigTab() {
  const [rows, setRows] = useState<Asset[]>([]);
  const [form, setForm] = useState<Asset>(blank);
  const [error, setError] = useState("");
  const load = async () => { const r = await fetch("/api/admin/assets", { cache: "no-store" }); if (r.ok) setRows((await r.json()).assets || []); };
  useEffect(() => { void load(); }, []);
  const save = async () => { setError(""); const r = await fetch("/api/admin/assets", { method: form.id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) }); if (!r.ok) { setError((await r.json()).error || "保存失败"); return; } setForm(blank); await load(); };
  return <section className="admin-section-card">
    <h2>资产配置</h2><p>统一管理用户端资产及其 Deposit、Withdraw、Trade 开关。</p>
    {error && <div role="alert">{error}</div>}
    <div className="admin-form-grid">
      {([['code','Code'],['symbol','Symbol'],['name','Name'],['icon','Icon']] as const).map(([key,label]) => <label key={key}>{label}<input value={String(form[key])} onChange={e => setForm({...form,[key]:e.target.value})}/></label>)}
      <label>Sort order<input type="number" value={form.sortOrder} onChange={e => setForm({...form,sortOrder:Number(e.target.value)})}/></label>
      {([['depositEnabled','Deposit Enabled'],['withdrawEnabled','Withdraw Enabled'],['tradeEnabled','Trade Enabled'],['isActive','Active']] as const).map(([key,label]) => <label key={key}><input type="checkbox" checked={form[key]} onChange={e => setForm({...form,[key]:e.target.checked})}/>{label}</label>)}
    </div>
    <button type="button" onClick={save}>{form.id ? "Save Changes" : "Add Asset"}</button>{form.id && <button type="button" onClick={() => setForm(blank)}>Cancel</button>}
    <table><thead><tr><th>Code</th><th>Name</th><th>Order</th><th>Status</th><th>Actions</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td>{row.sortOrder}</td><td>{row.isActive ? "Active" : "Inactive"}</td><td><button type="button" onClick={() => setForm(row)}>Edit</button></td></tr>)}</tbody></table>
  </section>;
}
