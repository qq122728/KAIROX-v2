import { createHash, randomBytes } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { KYC_UPLOAD_CONFIG } from "./kyc-config";

// --------------- paths ---------------

function ensureDir(p: string, mode = 0o700) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true, mode });
}

export function getKycStorageRoot() {
  const base = process.env.KYC_STORAGE_DIR?.trim() || path.join(process.cwd(), "..", "kyc-storage");
  ensureDir(base);
  return base;
}

export function getKycTmpDir() { const d = path.join(getKycStorageRoot(), "tmp"); ensureDir(d); return d; }
export function getKycSubmissionsDir() { const d = path.join(getKycStorageRoot(), "submissions"); ensureDir(d); return d; }

function randomKey(ext = "jpg") { return `${randomBytes(16).toString("hex")}.${ext}`; }
export function safeKey(name: string) { return /^[a-f0-9]+\.[a-z]+$/.test(name) ? name : null; }

// --------------- magic bytes ---------------

function readMagic(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return "webp";
  const ftyp = buf.toString("ascii", 4, 8);
  if (ftyp === "ftyp" && buf.length > 20) {
    const brand = buf.toString("ascii", 8, 12);
    if (brand === "heic" || brand === "heif" || brand === "mif1" || brand === "msf1") return "heif";
  }
  return null;
}

// --------------- sharp processing ---------------

export interface ProcessResult {
  ok: true; storageKey: string; mimeType: string; byteSize: number; width: number; height: number; sha256: string;
}
export interface ProcessError {
  ok: false; errorCode: string; message: string;
}

export async function processKycImage(inputBuf: Buffer, _originalName: string): Promise<ProcessResult | ProcessError> {
  if (inputBuf.length > KYC_UPLOAD_CONFIG.RAW_MAX_BYTES) return { ok: false, errorCode: "FILE_TOO_LARGE", message: "文件超过 25MB 限制" };
  const magic = readMagic(inputBuf);
  if (!magic || !["jpeg", "png", "webp", "heif"].includes(magic)) return { ok: false, errorCode: "UNSUPPORTED_FORMAT", message: "不支持的图片格式" };

  let meta;
  try {
    const img = sharp(inputBuf, { failOn: "none", limitInputPixels: 50_000_000 }).rotate();
    meta = await img.metadata();
    if (!meta.width || !meta.height || meta.width < 1 || meta.height < 1) return { ok: false, errorCode: "INVALID_IMAGE", message: "无法解析图片尺寸" };
    if (meta.width > 12000 || meta.height > 12000) return { ok: false, errorCode: "IMAGE_TOO_LARGE", message: "图片分辨率过高" };
  } catch { return { ok: false, errorCode: "DECODE_FAILED", message: "图片解码失败" }; }

  let bestBuf: Buffer | null = null, bestMeta: { width: number; height: number } | null = null;
  for (const maxDim of KYC_UPLOAD_CONFIG.DIMENSION_STEPS) {
    const resized = sharp(inputBuf).rotate().resize(maxDim, maxDim, { fit: "inside", withoutEnlargement: true });
    const dm = await resized.metadata(); const w = dm.width ?? 0, h = dm.height ?? 0;
    if (Math.min(w, h) < KYC_UPLOAD_CONFIG.MIN_DIMENSION && maxDim !== KYC_UPLOAD_CONFIG.DIMENSION_STEPS[0]) continue;
    for (const q of KYC_UPLOAD_CONFIG.QUALITY_STEPS) {
      const buf = await resized.jpeg({ quality: q, mozjpeg: true }).toBuffer();
      if (buf.length <= KYC_UPLOAD_CONFIG.HARD_MAX_BYTES) {
        if (!bestBuf || buf.length <= KYC_UPLOAD_CONFIG.TARGET_BYTES) { bestBuf = buf; bestMeta = { width: w, height: h }; }
        if (buf.length <= KYC_UPLOAD_CONFIG.TARGET_BYTES) break;
      }
    }
    if (bestBuf) break;
  }
  if (!bestBuf || !bestMeta) return { ok: false, errorCode: "COMPRESSION_FAILED", message: "无法将图片压缩到 5MB 以内" };

  const storageKey = randomKey("jpg"), dest = path.join(getKycTmpDir(), storageKey);
  const sha256 = createHash("sha256").update(bestBuf).digest("hex");
  try {
    const ws = createWriteStream(dest, { mode: 0o600 });
    await new Promise<void>((resolve, reject) => { ws.on("error", reject); ws.on("finish", () => resolve()); ws.end(bestBuf); });
  } catch { return { ok: false, errorCode: "STORAGE_ERROR", message: "文件保存失败" }; }
  return { ok: true, storageKey, mimeType: "image/jpeg", byteSize: bestBuf.length, width: bestMeta.width, height: bestMeta.height, sha256 };
}

// --------------- file operations ---------------

export function moveToSubmissions(storageKey: string): string {
  const src = path.join(getKycTmpDir(), storageKey);
  const dest = path.join(getKycSubmissionsDir(), storageKey);
  if (!existsSync(src)) throw new Error(`Source file missing: ${storageKey}`);
  renameSync(src, dest);
  return storageKey;
}

export function moveBackToTmp(storageKey: string): string {
  const src = path.join(getKycSubmissionsDir(), storageKey);
  const dest = path.join(getKycTmpDir(), storageKey);
  if (existsSync(src)) { try { renameSync(src, dest); } catch { /* best effort */ } }
  return storageKey;
}

export function verifyTmpFile(storageKey: string, expectedSha256: string, expectedSize: number): boolean {
  if (!safeKey(storageKey)) return false;
  const fp = path.join(getKycTmpDir(), storageKey);
  if (!existsSync(fp)) return false;
  try {
    const s = statSync(fp); if (s.size !== expectedSize) return false;
    const buf = require("node:fs").readFileSync(fp);
    return createHash("sha256").update(buf).digest("hex") === expectedSha256;
  } catch { return false; }
}

export function tmpFileExists(storageKey: string): boolean {
  if (!safeKey(storageKey)) return false;
  return existsSync(path.join(getKycTmpDir(), storageKey));
}

export function submissionFileExists(storageKey: string): boolean {
  if (!safeKey(storageKey)) return false;
  return existsSync(path.join(getKycSubmissionsDir(), storageKey));
}

export function getSubmissionFilePath(storageKey: string): string | null {
  if (!safeKey(storageKey)) return null;
  const fp = path.join(getKycSubmissionsDir(), storageKey);
  return existsSync(fp) ? fp : null;
}

// --------------- cleanup (idempotent, safe) ---------------

export async function cleanupOrphanFiles() {
  const tmpDir = getKycTmpDir();
  const { getDb } = await import("./db");

  // Cleanup: tokens created >60min ago, unconsumed, AND not referenced by kyc_files
  const cutoff = new Date(Date.now() - KYC_UPLOAD_CONFIG.CLEANUP_GRACE_MS).toISOString();
  const rows = getDb()
    .prepare(
      `SELECT t.storage_key FROM kyc_upload_tokens t
       WHERE t.consumed_at IS NULL AND t.created_at < ?
       AND NOT EXISTS (SELECT 1 FROM kyc_files f WHERE f.storage_key = t.storage_key)
       ORDER BY t.id LIMIT 200`
    )
    .all(cutoff) as { storage_key: string }[];

  for (const r of rows) {
    try { await rm(path.join(tmpDir, r.storage_key)); } catch { /* already gone */ }
  }
  getDb()
    .prepare(
      `DELETE FROM kyc_upload_tokens
       WHERE consumed_at IS NULL AND created_at < ?
       AND NOT EXISTS (SELECT 1 FROM kyc_files f WHERE f.storage_key = kyc_upload_tokens.storage_key)`
    )
    .run(cutoff);
}
