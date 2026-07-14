export type BinaryOrderAmountInput = { amount: unknown; min: number; max: number; dailyRemaining?: number; availableBalance?: number; decimals?: number };
export function validateBinaryOrderAmount(input: BinaryOrderAmountInput): string | null {
  const amount = typeof input.amount === "number" ? input.amount : Number(input.amount);
  if (input.amount === "" || input.amount == null || !Number.isFinite(amount)) return "Enter a valid amount";
  if (amount <= 0) return "Amount must be greater than 0";
  const decimals = input.decimals ?? 2;
  if (Number.isInteger(decimals) && Number(amount.toFixed(decimals)) !== amount) return "Amount supports up to " + decimals + " decimal places";
  if (amount < input.min) return "Minimum stake is " + input.min + " USDC";
  if (amount > input.max) return "Maximum stake is " + input.max + " USDC";
  if (input.dailyRemaining != null && input.dailyRemaining >= 0 && amount > input.dailyRemaining) return "Amount exceeds your remaining daily limit";
  if (input.availableBalance != null && amount > input.availableBalance) return "Insufficient balance";
  return null;
}
