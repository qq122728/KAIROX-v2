"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";

const loginCss = `
.flux-login{min-height:100vh;display:grid;place-items:center;background:#04070e;color:#e0eaf5;font-family:Inter,Arial,"Microsoft YaHei",sans-serif;padding:22px;position:relative;overflow:hidden}
.flux-login:before{content:"";position:absolute;inset:-20%;background:radial-gradient(ellipse at 50% 20%,rgba(255,61,87,.08),transparent 34%),radial-gradient(ellipse at 78% 75%,rgba(0,204,255,.12),transparent 28%);pointer-events:none}
.login-card{position:relative;width:100%;max-width:370px;border:1px solid rgba(0,200,255,.09);border-radius:16px;background:#090f1d;padding:34px 30px;box-shadow:0 32px 64px rgba(0,0,0,.62)}
.admin-notice{display:inline-flex;margin-bottom:8px;border:1px solid rgba(255,61,87,.32);border-radius:4px;padding:3px 10px;background:rgba(255,61,87,.1);color:#ff3d57;font-size:9px;font-weight:850;letter-spacing:.14em;text-transform:uppercase}
.brand{text-align:center;margin-bottom:24px}.logo{display:block;color:#00ccff;font-family:Arial Black,Impact,sans-serif;font-size:21px;letter-spacing:.08em}.logo-sub{display:block;margin-top:2px;color:#6e88a4;font-size:9px;font-weight:850;letter-spacing:.22em;text-transform:uppercase}
.title{margin:0 0 18px;text-align:center;color:#e0eaf5;font-size:18px;font-weight:850}.field{display:grid;gap:5px;margin-bottom:13px}.field span{color:#6e88a4;font-size:10px;font-weight:850;letter-spacing:.1em;text-transform:uppercase}
.field input{width:100%;border:1px solid rgba(0,200,255,.09);border-radius:8px;background:#0d1526;color:#e0eaf5;outline:0;padding:11px 12px;font-size:13px}.field input:focus{border-color:#00ccff;box-shadow:0 0 0 3px rgba(0,204,255,.12)}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:40px;border:0;border-radius:8px;background:linear-gradient(135deg,#ff3d57,#cc0020);color:#fff;font-size:14px;font-weight:850;cursor:pointer}.btn svg{width:16px;height:16px}
.back{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:14px;color:#6e88a4;text-decoration:none;font-size:12px;font-weight:750}.back:hover{color:#00ccff}.back svg{width:14px;height:14px}
.err{margin-bottom:13px;border:1px solid rgba(255,61,87,.35);border-radius:8px;background:rgba(255,61,87,.1);color:#ff6b7e;padding:9px 12px;text-align:center;font-size:12px}
`;

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const res = await fetch("/api/auth/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      setError((await res.json()).error || "Admin login failed");
      return;
    }
    router.push("/admin");
  }

  return (
    <main className="flux-login">
      <style>{loginCss}</style>
      <form className="login-card" onSubmit={submit}>
        <div className="brand">
          <span className="admin-notice">Admin Access</span>
          <span className="logo">FLUXPERP</span>
          <span className="logo-sub">Management Console</span>
        </div>
        <h1 className="title">Admin Login</h1>
        {error && <div className="err">{error}</div>}
        <label className="field">
          <span>Admin Account</span>
          <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="field">
          <span>Admin Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="btn" type="submit"><ShieldCheck />Enter Admin</button>
        <Link className="back" href="/login"><ArrowLeft />Back to User Login</Link>
      </form>
    </main>
  );
}
