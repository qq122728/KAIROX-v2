const RESEND_API = "https://api.resend.com/email";

export function sendEmailCode(to: string, code: string, purpose: "register" | "login"): void {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email] Would send ${purpose} code ${code} to ${to} (RESEND_API_KEY not configured)`);
    return;
  }

  const subject = purpose === "register" ? "Your VORX Registration Code" : "Your VORX Login Code";
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1a1a2e;margin:0 0 8px">VORX</h2>
      <p style="color:#666;font-size:14px;margin:0 0 24px">
        ${purpose === "register" ? "Use the code below to complete your registration." : "Use the code below to sign in to your account."}
      </p>
      <div style="background:#f5f5fa;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px">
        <span style="font-size:32px;font-weight:700;letter-spacing:6px;color:#1a1a2e">${code}</span>
      </div>
      <p style="color:#999;font-size:12px;margin:0">This code expires in 5 minutes. If you didn't request this, please ignore this email.</p>
    </div>`;

  const from = process.env.SMTP_FROM || "VORX <noreply@vorxai.xyz>";

  // Fire and forget
  fetch(RESEND_API, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from, to, subject, html })
  })
    .then(async (res) => {
      if (res.ok) console.log(`[email] Sent ${purpose} code to ${to}`);
      else console.error(`[email] Resend API error: ${res.status} ${await res.text()}`);
    })
    .catch((err) => console.error(`[email] Failed to send to ${to}:`, err.message));
}
