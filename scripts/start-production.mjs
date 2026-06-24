import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const defaultInternalSecret = "perp-sim-local-realtime-secret";

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

for (const envFile of [".env.production.local", ".env.local", ".env.production", ".env"]) {
  loadEnvFile(path.join(projectRoot, envFile));
}

const internalSecret = process.env.SOCKET_INTERNAL_SECRET || process.env.REALTIME_INTERNAL_SECRET || "";
const dbPathValue = process.env.PERP_SIM_DB_PATH?.trim();
const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
const errors = [];

if (!dbPathValue) errors.push("PERP_SIM_DB_PATH must point to the production SQLite database.");
if (!publicAppUrl) errors.push("NEXT_PUBLIC_APP_URL must be set to the public app origin.");
if (!internalSecret) errors.push("SOCKET_INTERNAL_SECRET must be set for realtime internal emits.");
if (internalSecret === defaultInternalSecret) errors.push("SOCKET_INTERNAL_SECRET must not use the local default secret.");
if (internalSecret.startsWith("replace-")) errors.push("SOCKET_INTERNAL_SECRET must be changed from the example placeholder.");

if (errors.length) {
  console.error("Production startup refused:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const dbPath = path.resolve(dbPathValue);
mkdirSync(path.dirname(dbPath), { recursive: true });

const env = {
  ...process.env,
  NODE_ENV: "production",
  PERP_SIM_DB_PATH: dbPath,
  NEXT_PUBLIC_APP_URL: publicAppUrl,
  SOCKET_INTERNAL_SECRET: internalSecret,
  REALTIME_INTERNAL_SECRET: process.env.REALTIME_INTERNAL_SECRET || internalSecret
};

const nextCli = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
if (!existsSync(nextCli)) {
  console.error("Production startup refused: Next.js CLI not found. Run npm install before starting production processes.");
  process.exit(1);
}

const processes = [
  {
    name: "next",
    command: process.execPath,
    args: [nextCli, "start", "-H", process.env.NEXT_HOSTNAME || "0.0.0.0", "-p", String(process.env.PORT || 3000)]
  },
  {
    name: "socket",
    command: process.execPath,
    args: [path.join(projectRoot, "realtime", "socket-server.mjs")]
  },
  {
    name: "settlement",
    command: process.execPath,
    args: [path.join(projectRoot, "realtime", "settlement-worker.mjs")]
  }
];

let stopping = false;
const children = [];

function stopAll(exitCode) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  setTimeout(() => process.exit(exitCode), 1500).unref();
}

for (const proc of processes) {
  console.log(`[process] starting ${proc.name}`);
  const child = spawn(proc.command, proc.args, { cwd: projectRoot, env, stdio: "inherit" });
  children.push(child);
  child.on("exit", (code, signal) => {
    if (stopping) return;
    console.error(`[process] ${proc.name} exited with ${signal || code}`);
    stopAll(code || 1);
  });
  child.on("error", (error) => {
    if (stopping) return;
    console.error(`[process] failed to start ${proc.name}: ${error.message}`);
    stopAll(1);
  });
}

process.on("SIGINT", () => stopAll(130));
process.on("SIGTERM", () => stopAll(143));
