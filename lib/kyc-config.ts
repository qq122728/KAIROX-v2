/** KYC upload limits — single source of truth. Keep in sync with Nginx. */

export const KYC_UPLOAD_CONFIG = {
  /** Raw file accepted by the API before processing */
  RAW_MAX_BYTES: 25 * 1024 * 1024, // 25 MiB

  /** Soft target after server-side processing */
  TARGET_BYTES: 2.5 * 1024 * 1024, // 2.5 MiB

  /** Hard ceiling — processed file MUST be ≤ this */
  HARD_MAX_BYTES: 5 * 1024 * 1024, // 5 MiB

  /** Minimum shortest edge in px */
  MIN_DIMENSION: 1000,

  /** Adaptive dimension steps (largest first) */
  DIMENSION_STEPS: [2200, 1920, 1600, 1400] as const,

  /** JPEG quality steps (highest first) */
  QUALITY_STEPS: [82, 74, 66, 58, 50] as const,

  /** Supported MIME types (magic-byte verified on server) */
  SUPPORTED_MIMES: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ] as const,

  /** Upload token TTL */
  TOKEN_TTL_MS: 30 * 60_000, // 30 min — token expires, cannot be submitted

  /** Orphan cleanup grace period after expiry */
  CLEANUP_GRACE_MS: 60 * 60_000, // 60 min after creation before tmp file is deleted

  /** Max uploads per IP per window */
  UPLOAD_RATE_LIMIT: 10,
  UPLOAD_RATE_WINDOW_MS: 60_000,
} as const;

export type KycFileType = "front" | "back" | "selfie";
