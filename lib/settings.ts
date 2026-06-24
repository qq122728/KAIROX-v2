import { getDb } from "./db";

export type AppSettings = {
  platform_name: string;
  whatsapp_url: string;
  whatsapp_support_url: string;
  whatsapp_link: string;
  telegram_url: string;
  withdrawal_enabled: string;
  default_gift_usdc: string;
  min_withdrawal_usdc: string;
  min_withdrawal: string;
  registration_enabled: string;
  withdrawals_enabled: string;
  demo_deposit_enabled: string;
  default_signup_balance: string;
  signup_bonus: string;
  min_withdrawal_amount: string;
  withdrawal_notice: string;
  about_content: string;
  terms_content: string;
  privacy_content: string;
  trading_enabled: string;
  binary_options_config: string;
};

export function getSettings(): AppSettings {
  const rows = getDb().prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value])) as AppSettings;
  settings.whatsapp_url ||= settings.whatsapp_support_url;
  settings.telegram_url ||= "";
  settings.withdrawal_enabled ||= settings.withdrawals_enabled;
  settings.default_gift_usdc ||= settings.default_signup_balance;
  settings.default_gift_usdc = "0";
  settings.default_signup_balance = "0";
  settings.signup_bonus = "0";
  settings.min_withdrawal_usdc ||= settings.min_withdrawal_amount;
  settings.about_content ||= "FluxPerp is a simulated perpetual exchange experience for account, funding, and trading workflows.";
  settings.terms_content ||= "Use this platform responsibly. Trading and balances in this environment are simulated unless explicitly stated otherwise.";
  settings.privacy_content ||= "We use account information to provide authentication, funding records, KYC status, and support workflows.";
  settings.binary_options_config ||= JSON.stringify([
    { seconds: 30, odds: 0.3 },
    { seconds: 60, odds: 0.35 },
    { seconds: 180, odds: 0.45 },
    { seconds: 300, odds: 0.55 }
  ]);
  return settings;
}

export function setSettings(values: Partial<AppSettings>) {
  const stmt = getDb().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) stmt.run(key, String(value));
  }
}

export function settingBool(value: string | undefined, fallback = false) {
  if (value === undefined) return fallback;
  return value === "true";
}
