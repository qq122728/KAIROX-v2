type RealtimeEvent =
  | "admin:update"
  | "user:update"
  | "binary:created"
  | "binary:configured"
  | "binary:expired"
  | "binary:settled"
  | "trade:created"
  | "deposit-addresses:update"
  | "fiat_deposit:requested"
  | "fiat_deposit:submitted"
  | "support_message:created"
  | "settings:update"
  | "market:update";

type EmitOptions = {
  room?: string;
  payload?: Record<string, unknown>;
};

const socketInternalUrl = process.env.SOCKET_INTERNAL_URL || "http://127.0.0.1:3001/internal/emit";
const defaultSocketInternalSecret = "perp-sim-local-realtime-secret";

function resolveSocketInternalSecret() {
  const configuredSecret = (process.env.SOCKET_INTERNAL_SECRET || process.env.REALTIME_INTERNAL_SECRET || "").trim();
  if (process.env.NODE_ENV === "production" && (!configuredSecret || configuredSecret === defaultSocketInternalSecret)) {
    throw new Error("SOCKET_INTERNAL_SECRET or REALTIME_INTERNAL_SECRET must be set to a non-default value in production");
  }
  return configuredSecret || defaultSocketInternalSecret;
}

export function emitRealtime(event: RealtimeEvent, options: EmitOptions = {}) {
  let socketInternalSecret: string;
  try {
    socketInternalSecret = resolveSocketInternalSecret();
  } catch (error) {
    console.error("[realtime] refusing to emit with an unsafe internal secret", error);
    return;
  }

  fetch(socketInternalUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-realtime-secret": socketInternalSecret },
    body: JSON.stringify({ event, room: options.room, payload: options.payload || {} })
  }).catch(() => {
    // Realtime is best-effort; HTTP API mutations must still succeed if the socket service is offline.
  });
}

export function userRoom(userId: number | string) {
  return `user:${userId}`;
}
