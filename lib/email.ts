const RESEND_API = "https://api.resend.com/emails";

export type EmailResult = { ok: true } | { ok: false; error: string };

export async function sendEmailCode(to: string, code: string, purpose: "register" | "login" | "reset_password"): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email] Would send ${purpose} code to ${to} (RESEND_API_KEY not configured)`);
    return { ok: false, error: "Email service not configured" };
  }

  const subject =
    purpose === "register" ? "KAIROX Verification Code" :
    purpose === "reset_password" ? "KAIROX Password Reset Code" :
    "KAIROX Login Code";

  const bodyText =
    purpose === "register" ? "complete your registration" :
    purpose === "reset_password" ? "reset your password. If you didn't request this, please ignore this email." :
    "sign in to your account";

  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
<h2 style="color:#1a1a2e;margin:0 0 4px">KAIROX</h2>
<p style="color:#8e8e9a;font-size:13px;margin:0 0 24px">kairoxmarkets.xyz</p>
<p style="color:#3a3d4a;font-size:15px;line-height:1.55;margin:0 0 24px">
Use the verification code below to <strong>${bodyText}</strong>.
</p>
<div style="background:#f3f4f6;border-radius:10px;padding:24px;text-align:center;margin:0 0 24px">
<span style="font-size:36px;font-weight:700;font-family:monospace;letter-spacing:10px;color:#1a1a2e">${code}</span>
</div>
<p style="color:#888a94;font-size:13px;line-height:1.5;margin:0 0 4px">
This code expires in <strong>5 minutes</strong>. Do not share it with anyone.
</p>
<p style="color:#888a94;font-size:13px;line-height:1.5;margin:0">
If you did not request this code, please ignore this email.
</p>
</div>`;

  const text = `KAIROX — kairoxmarkets.xyz\n\nUse the verification code below to ${bodyText}.\n\n${code}\n\nThis code expires in 5 minutes. Do not share it with anyone.\n\nIf you did not request this code, please ignore this email.`;

  const from = process.env.SMTP_FROM || "KAIROX Security <noreply@kairoxmarkets.xyz>";

  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ from, to, subject, html, text })
    });

    if (res.ok) {
      const data = await res.json() as { id?: string };
      console.log(`[email] Sent ${purpose} code to ${to} | messageId=${data.id || "N/A"} | status=${res.status}`);
      return { ok: true };
    }

    const errText = await res.text();
    console.error(`[email] Resend API error ${res.status}: ${errText}`);
    return { ok: false, error: "Email service temporarily unavailable" };
  } catch (err) {
    console.error(`[email] Failed to send to ${to}:`, err instanceof Error ? err.message : err);
    return { ok: false, error: "Email service temporarily unavailable" };
  }
}
