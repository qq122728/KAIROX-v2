import { requireAdmin, requireUser } from "@/lib/auth";
import { badRequest, handleError, json, readJson } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { setSettings, type AppSettings } from "@/lib/settings";
import { sanitizeBinaryOptionsConfig } from "@/lib/binary-options";
import { getBinaryTradeSettings, updateBinaryTradeSettings } from "@/lib/binary-trade-settings";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    await requireUser();
    const settings = getSettings();
    return json({ settings: {
      withdrawals_enabled: settings.withdrawals_enabled,
      withdrawal_notice: settings.withdrawal_notice,
      whatsapp_support_url: settings.whatsapp_support_url,
      whatsapp_url: settings.whatsapp_url,
      telegram_url: settings.telegram_url,
      min_withdrawal_amount: settings.min_withdrawal_amount,
      min_withdrawal_usdc: settings.min_withdrawal_usdc,
      about_content: settings.about_content,
      terms_content: settings.terms_content,
      privacy_content: settings.privacy_content,
      trading_enabled: settings.trading_enabled,
      binary_options_config: settings.binary_options_config,
      binary_trade_config: JSON.stringify(getBinaryTradeSettings())
    } });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = await readJson<Partial<AppSettings>>(request);
    const allowed: (keyof AppSettings)[] = [
      "whatsapp_url",
      "whatsapp_support_url",
      "telegram_url",
      "registration_enabled",
      "withdrawal_enabled",
      "withdrawals_enabled",
      "default_gift_usdc",
      "default_signup_balance",
      "min_withdrawal_usdc",
      "min_withdrawal_amount",
      "withdrawal_notice",
      "about_content",
      "terms_content",
      "privacy_content",
      "trading_enabled",
      "binary_options_config"
      ,"binary_trade_config"
    ];
    const next: Partial<AppSettings> = {};
    for (const key of allowed) {
      const value = body[key];
      if (value !== undefined) next[key] = String(value);
    }
    if (Object.keys(next).length === 0) return badRequest("No supported settings supplied");
    if (next.whatsapp_url && !next.whatsapp_support_url) next.whatsapp_support_url = next.whatsapp_url;
    if (next.binary_options_config) {
      try {
        next.binary_options_config = sanitizeBinaryOptionsConfig(next.binary_options_config);
      } catch (error) {
        return badRequest(error instanceof Error ? error.message : "Invalid binary option config");
      }
    }
    if (next.binary_trade_config) {
      const admin = await requireAdmin();
      try {
        updateBinaryTradeSettings(JSON.parse(next.binary_trade_config), admin.id);
        next.binary_trade_config = JSON.stringify(getBinaryTradeSettings());
      } catch (error) {
        return badRequest(error instanceof Error ? error.message : "Invalid binary trade config");
      }
    }
    if (next.withdrawal_enabled && !next.withdrawals_enabled) next.withdrawals_enabled = next.withdrawal_enabled;
    if (next.default_gift_usdc && !next.default_signup_balance) next.default_signup_balance = next.default_gift_usdc;
    if (next.min_withdrawal_usdc && !next.min_withdrawal_amount) next.min_withdrawal_amount = next.min_withdrawal_usdc;
    setSettings(next);
    return json({ ok: true, settings: getSettings() });
  } catch (error) {
    return handleError(error);
  }
}
