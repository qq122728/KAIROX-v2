import { parsePhoneNumberFromString } from "libphonenumber-js";

export type IdentifierType = "email" | "phone";

export function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizePhone(value: unknown, countryCode?: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("Phone number is required");
  const cc = String(countryCode ?? "").trim();
  const combined = raw.startsWith("+") ? raw : `${cc.startsWith("+") ? cc : `+${cc}`}${raw}`;
  if (!cc && !raw.startsWith("+")) throw new Error("Country code is required");
  const parsed = parsePhoneNumberFromString(combined);
  if (!parsed || !parsed.isValid()) throw new Error("Enter a valid phone number with country code");
  return parsed.number;
}

export function detectIdentifierType(value: unknown): IdentifierType {
  const input = String(value ?? "").trim();
  return input.includes("@") ? "email" : "phone";
}
