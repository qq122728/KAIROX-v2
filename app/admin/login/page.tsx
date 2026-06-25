"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";

const loginCss = `
.flux-login{min-height:100vh;display:grid;place-items:center;background:#050914;color:#edf4ff;font-family:Inter,Arial,"Microsoft YaHei",sans-serif;padding:22px;position:relative;overflow:hidden}
.flux-login:before{content:"";position:absolute;inset:-22%;background:radial-gradient(ellipse at 48% 18%,rgba(59,130,246,.13),transparent 34%),radial-gradient(ellipse at 74% 80%,rgba(34,197,94,.1),transparent 30%),linear-gradient(135deg,rgba(239,68,68,.09),transparent 42%);pointer-events:none}
.flux-login:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,9,20,.2),rgba(5,9,20,.82));pointer-events:none}
.login-card{position:relative;z-index:1;width:100%;max-width:420px;border:1px solid rgba(148,163,184,.16);border-radius:18px;background:rgba(10,17,29,.92);padding:30px;box-shadow:0 32px 86px rgba(0,0,0,.55)}
.brand{display:grid;gap:8px;margin-bottom:24px;text-align:center}.admin-notice{display:inline-flex;align-items:center;justify-content:center;justify-self:center;border:1px solid rgba(34,197,94,.24);border-radius:999px;padding:5px 12px;background:rgba(34,197,94,.1);color:#86efac;font-size:11px;font-weight:800;letter-spacing:.08em}.logo{display:block;color:#fff;font-size:25px;font-weight:900;letter-spacing:.08em}.logo-sub{display:block;color:#93a4ba;font-size:12px;font-weight:760}
.title{margin:0;color:#edf4ff;font-size:22px;font-weight:850}.subtitle{margin:7px 0 22px;color:#93a4ba;text-align:center;font-size:13px;line-height:1.6}.field{display:grid;gap:7px;margin-bottom:14px}.field span{color:#93a4ba;font-size:12px;font-weight:800}
.field input{width:100%;min-height:46px;border:1px solid rgba(148,163,184,.18);border-radius:10px;background:#111b2c;color:#edf4ff;outline:0;padding:0 13px;font-size:14px}.field input::placeholder{color:#5f7189}.field input:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.16)}
.field input:disabled{cursor:not-allowed;opacity:.62}.field small{color:#7f91aa;font-size:12px;line-height:1.5}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:46px;border:0;border-radius:10px;background:linear-gradient(135deg,#ef4444,#be123c);color:#fff;font-size:14px;font-weight:850;cursor:pointer;box-shadow:0 18px 38px rgba(190,18,60,.28)}.btn:disabled{cursor:not-allowed;opacity:.7}.btn svg{width:16px;height:16px}
.security-row{display:flex;align-items:center;justify-content:center;gap:8px;margin:16px 0 0;color:#7f91aa;font-size:12px}.security-row svg{width:14px;height:14px;color:#86efac}
.back{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:14px;color:#93a4ba;text-decoration:none;font-size:12px;font-weight:760}.back:hover{color:#60a5fa}.back svg{width:14px;height:14px}
.err{margin-bottom:14px;border:1px solid rgba(239,68,68,.34);border-radius:10px;background:rgba(239,68,68,.1);color:#fca5a5;padding:10px 12px;text-align:center;font-size:13px}
@media (max-width:480px){.login-card{padding:24px 20px}.title{font-size:20px}}
`;

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const res = await fetch("/api/auth/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      setError("管理员账号或密码错误");
      setSubmitting(false);
      return;
    }
    router.push("/admin");
  }

  return (
    <main className="flux-login">
      <style>{loginCss}</style>
      <form className="login-card" onSubmit={submit}>
        <div className="brand">
          <span className="admin-notice">管理入口</span>
          <span className="logo">VORX 管理后台</span>
          <span className="logo-sub">运营控制中心 · 安全登录</span>
        </div>
        <h1 className="title">管理员登录</h1>
        <p className="subtitle">仅限授权运营人员访问，后台操作将记录审计日志。</p>
        {error && <div className="err">{error}</div>}
        <label className="field">
          <span>管理员账号</span>
          <input autoComplete="username" placeholder="请输入管理员账号" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="field">
          <span>登录密码</span>
          <input type="password" autoComplete="current-password" placeholder="请输入登录密码" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="field">
          <span>二次验证码</span>
          <input disabled inputMode="numeric" placeholder="暂未启用，后续用于二次验证" />
          <small>预留给身份验证器、邮箱验证码或短信验证码。</small>
        </label>
        <button className="btn" type="submit" disabled={submitting}><ShieldCheck />{submitting ? "正在验证..." : "进入管理后台"}</button>
        <div className="security-row"><LockKeyhole />安全连接 · 权限验证 · 审计记录</div>
        <Link className="back" href="/login"><ArrowLeft />返回用户登录</Link>
      </form>
    </main>
  );
}
