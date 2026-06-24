import { requireAdmin } from "@/lib/auth";
import { badRequest, handleError, json, readJson } from "@/lib/api";
import { getSettings, setSettings } from "@/lib/settings";
import { emitRealtime } from "@/lib/realtime";
import { sanitizeBinaryOptionsConfig } from "@/lib/binary-options";

type SettingsPayload = {
  whatsappLink?: string;
  registrationEnabled?: boolean;
  withdrawalsEnabled?: boolean;
  signupBonus?: number;
  minWithdrawal?: number;
  whatsapp_support_url?: string;
  telegram_url?: string;
  registration_enabled?: string;
  withdrawals_enabled?: string;
  default_signup_balance?: string;
  min_withdrawal_amount?: string;
  withdrawal_notice?: string;
  about_content?: string;
  terms_content?: string;
  privacy_content?: string;
  trading_enabled?: string;
  binary_options_config?: string;
};

export async function GET() {
  try {
    await requireAdmin();
    return json({ settings: getSettings() });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = await readJson<SettingsPayload>(request);
    const next: Record<string, string> = {};

    if (typeof body.whatsappLink === "string") {
      next.whatsapp_support_url = body.whatsappLink.trim();
      next.whatsapp_link = body.whatsappLink.trim();
      next.whatsapp_url = body.whatsappLink.trim();
    }
    if (typeof body.whatsapp_support_url === "string") {
      next.whatsapp_support_url = body.whatsapp_support_url.trim();
      next.whatsapp_link = body.whatsapp_support_url.trim();
      next.whatsapp_url = body.whatsapp_support_url.trim();
    }
    if (typeof body.telegram_url === "string") next.telegram_url = body.telegram_url.trim();
    if (typeof body.registrationEnabled === "boolean") next.registration_enabled = String(body.registrationEnabled);
    if (typeof body.registration_enabled === "string") next.registration_enabled = body.registration_enabled;
    if (typeof body.withdrawalsEnabled === "boolean") {
      next.withdrawals_enabled = String(body.withdrawalsEnabled);
      next.withdrawal_enabled = String(body.withdrawalsEnabled);
    }
    if (typeof body.withdrawals_enabled === "string") {
      next.withdrawals_enabled = body.withdrawals_enabled;
      next.withdrawal_enabled = body.withdrawals_enabled;
    }
    if (typeof body.signupBonus === "number") {
      if (!Number.isFinite(body.signupBonus) || body.signupBonus < 0) return badRequest("注册送币数量无效");
      next.default_signup_balance = String(body.signupBonus);
      next.signup_bonus = String(body.signupBonus);
      next.default_gift_usdc = String(body.signupBonus);
    }
    if (typeof body.minWithdrawal === "number") {
      if (!Number.isFinite(body.minWithdrawal) || body.minWithdrawal < 0) return badRequest("最小提现金额无效");
      next.min_withdrawal_amount = String(body.minWithdrawal);
      next.min_withdrawal = String(body.minWithdrawal);
      next.min_withdrawal_usdc = String(body.minWithdrawal);
    }
    if (typeof body.default_signup_balance === "string") {
      next.default_signup_balance = body.default_signup_balance;
      next.signup_bonus = body.default_signup_balance;
      next.default_gift_usdc = body.default_signup_balance;
    }
    if (typeof body.min_withdrawal_amount === "string") {
      next.min_withdrawal_amount = body.min_withdrawal_amount;
      next.min_withdrawal = body.min_withdrawal_amount;
      next.min_withdrawal_usdc = body.min_withdrawal_amount;
    }
    if (typeof body.withdrawal_notice === "string") next.withdrawal_notice = body.withdrawal_notice;
    if (typeof body.about_content === "string") next.about_content = body.about_content;
    if (typeof body.terms_content === "string") next.terms_content = body.terms_content;
    if (typeof body.privacy_content === "string") next.privacy_content = body.privacy_content;
    if (typeof body.trading_enabled === "string") next.trading_enabled = body.trading_enabled;
    if (typeof body.binary_options_config === "string") {
      try {
        next.binary_options_config = sanitizeBinaryOptionsConfig(body.binary_options_config);
      } catch (error) {
        return badRequest(error instanceof Error ? error.message : "Invalid binary option config");
      }
    }

    if (Object.keys(next).length === 0) return badRequest("没有可更新的设置");
    setSettings(next);
    emitRealtime("admin:update", { room: "admin", payload: { type: "settings:update" } });
    emitRealtime("settings:update", { payload: { keys: Object.keys(next) } });
    return json({ ok: true, settings: getSettings() });
  } catch (error) {
    return handleError(error);
  }
}
