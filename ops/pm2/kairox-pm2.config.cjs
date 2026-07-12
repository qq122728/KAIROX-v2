const fs = require("node:fs");
const path = require("node:path");

// Always run the active release, never the mutable source checkout.
const root = "/home/hermes/current";
const logsDir = path.join(root, "logs");
fs.mkdirSync(logsDir, { recursive: true });

function loadEnvFile(fileName) {
  const filePath = path.join("/home/hermes/shared", fileName);
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const productionEnv = {
  ...loadEnvFile(".env.local"),
  NODE_ENV: "production"
};

module.exports = {
  apps: [
    {
      name: "kairox-next",
      cwd: root,
      script: "node_modules/.bin/next",
      args: "start",
      env: {
        ...productionEnv,
        PORT: "3000"
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      // Zero-downtime reload:
      // - start new instance first
      // - wait listen_timeout for port binding
      // - then stop old instance
      exec_mode: "fork",
      instances: 1,
      listen_timeout: 15000,
      kill_timeout: 8000,
      // Do NOT use wait_ready — Next.js doesn't send process.send("ready")
      wait_ready: false,
      time: true,
      merge_logs: false,
      out_file: path.join(logsDir, "next-out.log"),
      error_file: path.join(logsDir, "next-error.log")
    },
    {
      name: "kairox-socket",
      cwd: root,
      script: "node",
      args: "realtime/socket-server.mjs",
      env: productionEnv,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      exec_mode: "fork",
      instances: 1,
      listen_timeout: 10000,
      kill_timeout: 5000,
      wait_ready: false,
      time: true,
      merge_logs: false,
      out_file: path.join(logsDir, "socket-out.log"),
      error_file: path.join(logsDir, "socket-error.log")
    },
    {
      name: "kairox-settlement",
      cwd: root,
      script: "node",
      args: "realtime/settlement-worker.mjs",
      env: productionEnv,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      exec_mode: "fork",
      instances: 1,
      listen_timeout: 10000,
      kill_timeout: 5000,
      wait_ready: false,
      time: true,
      merge_logs: false,
      out_file: path.join(logsDir, "settlement-out.log"),
      error_file: path.join(logsDir, "settlement-error.log")
    }
  ]
};
