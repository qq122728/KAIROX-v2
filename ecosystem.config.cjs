const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const logsDir = path.join(root, "logs");
fs.mkdirSync(logsDir, { recursive: true });

function loadEnvFile(fileName) {
  const filePath = path.join(root, fileName);
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
  ...loadEnvFile(".env.production.local"),
  NODE_ENV: "production"
};

module.exports = {
  apps: [
    {
      name: "vorx-next",
      cwd: root,
      script: "npm",
      args: "run start -- -H 127.0.0.1",
      interpreter: "/root/.nvm/versions/node/v24.18.0/bin/node",
      env: {
        ...productionEnv,
        PORT: "3020"
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      time: true,
      merge_logs: false,
      out_file: path.join(logsDir, "next-out.log"),
      error_file: path.join(logsDir, "next-error.log")
    },
    {
      name: "vorx-socket",
      cwd: root,
      script: "npm",
      args: "run socket",
      interpreter: "/root/.nvm/versions/node/v24.18.0/bin/node",
      env: productionEnv,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      time: true,
      merge_logs: false,
      out_file: path.join(logsDir, "socket-out.log"),
      error_file: path.join(logsDir, "socket-error.log")
    },
    {
      name: "vorx-settlement",
      cwd: root,
      script: "npm",
      args: "run settlement",
      interpreter: "/root/.nvm/versions/node/v24.18.0/bin/node",
      env: productionEnv,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      time: true,
      merge_logs: false,
      out_file: path.join(logsDir, "settlement-out.log"),
      error_file: path.join(logsDir, "settlement-error.log")
    }
  ]
};
