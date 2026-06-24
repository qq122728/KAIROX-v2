export function normalizeNetwork(network: string) {
  return String(network || "").trim().toUpperCase();
}
