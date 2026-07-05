import http from "node:http";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { Server } from "socket.io";

const port = Number(process.env.SOCKET_PORT || 3001);
const host = process.env.SOCKET_HOST || process.env.HOST || "127.0.0.1";
const nextOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000");
const allowedOrigins = [...new Set([nextOrigin, "http://localhost:3000", "http://127.0.0.1:3000"])];
const internalSecretHeader = "x-realtime-secret";
const defaultInternalSecret = "perp-sim-local-realtime-secret";
const configuredInternalSecret = (process.env.SOCKET_INTERNAL_SECRET || process.env.REALTIME_INTERNAL_SECRET || "").trim();
if (process.env.NODE_ENV === "production" && (!configuredInternalSecret || configuredInternalSecret === defaultInternalSecret)) {
  console.error("[socket] SOCKET_INTERNAL_SECRET or REALTIME_INTERNAL_SECRET must be set to a non-default value in production");
  process.exit(1);
}
const internalSecret = configuredInternalSecret || defaultInternalSecret;
const legacySessionCookie = "__Host-perp_lab_session";
const userSessionCookie = "__Host-perp_lab_user_session";
const adminSessionCookie = "__Host-perp_lab_admin_session";
const dbPath = path.resolve(process.env.PERP_SIM_DB_PATH?.trim() || path.join(process.cwd(), "data", "perp-lab.sqlite"));
const sqliteBusyTimeoutMs = positiveInteger(process.env.SOCKET_SQLITE_BUSY_TIMEOUT_MS || process.env.PERP_SIM_SQLITE_BUSY_TIMEOUT_MS, 1000);
if (!existsSync(path.dirname(dbPath))) mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA busy_timeout = ${sqliteBusyTimeoutMs}; PRAGMA journal_mode = WAL;`);

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function normalizeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isAuthorizedInternalRequest(req) {
  const header = req.headers[internalSecretHeader];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === "string" && timingSafeEqual(value, internalSecret);
}

function parseCookies(header) {
  const cookies = new Map();
  for (const part of String(header || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    if (!key) continue;
    try {
      cookies.set(key, decodeURIComponent(rawValue));
    } catch {
      cookies.set(key, rawValue);
    }
  }
  return cookies;
}

function readSessionUser(token) {
  if (!token) return null;
  try {
    return (
      db
        .prepare(
          `SELECT users.id, users.username, users.email, users.role
           FROM sessions
           JOIN users ON users.id = sessions.user_id
           WHERE sessions.token = ?
             AND datetime(sessions.expires_at) > CURRENT_TIMESTAMP
             AND COALESCE(users.login_enabled, 1) <> 0`
        )
        .get(token) || null
    );
  } catch (error) {
    console.error("[socket] session lookup failed", error);
    return null;
  }
}

function authenticateSocket(headers) {
  const rawCookie = Array.isArray(headers.cookie) ? headers.cookie.join(";") : headers.cookie;
  const cookies = parseCookies(rawCookie);
  const legacyUser = readSessionUser(cookies.get(legacySessionCookie));
  const adminUser = readSessionUser(cookies.get(adminSessionCookie)) || (legacyUser?.role === "admin" ? legacyUser : null);
  const user = readSessionUser(cookies.get(userSessionCookie)) || (legacyUser?.role !== "admin" ? legacyUser : null);
  if (!user && !adminUser) return null;
  return { user: user || adminUser, adminUser };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && req.url === "/internal/emit") {
    if (!isAuthorizedInternalRequest(req)) {
      sendJson(res, 401, { ok: false, error: "Unauthorized" });
      return;
    }

    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        const body = JSON.parse(raw || "{}");
        const event = String(body.event || "");
        if (!event) throw new Error("Missing event");

        if (body.room) io.to(String(body.room)).emit(event, body.payload || {});
        else io.emit(event, body.payload || {});

        sendJson(res, 200, { ok: true });
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : "Bad request" });
      }
    });
    return;
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
});

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

io.use((socket, next) => {
  const user = authenticateSocket(socket.handshake.headers);
  if (!user) return next(new Error("Unauthorized"));
  socket.data.user = user;
  return next();
});

io.on("connection", (socket) => {
  const auth = socket.data.user;
  const user = auth.user;
  const adminUser = auth.adminUser;
  if (user) socket.join(`user:${user.id}`);

  socket.on("admin:join", () => {
    if (adminUser?.role === "admin") {
      socket.join("admin");
      return;
    }
    socket.emit("realtime:error", { error: "Forbidden" });
  });

  socket.on("user:join", () => {
    if (user) socket.join(`user:${user.id}`);
  });
});

server.listen(port, host, () => {
  console.log(`[socket] listening on http://${host}:${port}`);
});
