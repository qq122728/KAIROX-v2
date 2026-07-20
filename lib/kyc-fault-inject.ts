/** Fault injection for KYC tests — ONLY active when KYC_FAULT_INJECT=1 */
let failCounter = 0;

export function resetFaults() { failCounter = 0; }

export function shouldFail(label: string): boolean {
  if (process.env.KYC_FAULT_INJECT !== "1") return false;
  failCounter++;
  const target = process.env[`KYC_FAIL_${label}`];
  if (!target) return false;
  const n = Number(target);
  if (!Number.isInteger(n) || n <= 0) return false;
  return failCounter % n === 0; // Fail every Nth call
}

export const FAULT_POINTS = {
  AFTER_FIRST_MOVE: "AFTER_FIRST_MOVE",
  AFTER_SECOND_MOVE: "AFTER_SECOND_MOVE",
  AFTER_SUBMISSION_INSERT: "AFTER_SUBMISSION_INSERT",
  AFTER_FIRST_FILE_INSERT: "AFTER_FIRST_FILE_INSERT",
  BEFORE_COMMIT: "BEFORE_COMMIT",
  MOVE_BACK_FAILS: "MOVE_BACK_FAILS",
} as const;
