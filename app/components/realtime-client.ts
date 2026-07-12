"use client";

type SocketLike = {
  connected?: boolean;
  emit: (event: string, payload?: unknown) => void;
  on: (event: string, handler: (payload?: unknown) => void) => void;
  off: (event: string, handler: (payload?: unknown) => void) => void;
  disconnect: () => void;
};

declare global {
  interface Window {
    io?: (url: string, options?: Record<string, unknown>) => SocketLike;
    __fluxSocketScript?: Promise<void>;
  }
}

const configuredSocketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;

function getSocketUrl() {
  if (configuredSocketUrl) return configuredSocketUrl;
  if (typeof window === "undefined") return "http://127.0.0.1:3001";
  return `${window.location.protocol}//${window.location.host}`;
}

function loadSocketScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("Browser only"));
  if (window.io) return Promise.resolve();
  if (!window.__fluxSocketScript) {
    window.__fluxSocketScript = new Promise((resolve, reject) => {
      const socketUrl = getSocketUrl();
      const script = document.createElement("script");
      script.src = `${socketUrl}/socket.io/socket.io.js`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Socket.IO client script failed to load"));
      document.head.appendChild(script);
    });
  }
  return window.__fluxSocketScript;
}

export async function connectRealtime() {
  await loadSocketScript();
  if (!window.io) throw new Error("Socket.IO client unavailable");
  const socketUrl = getSocketUrl();
  return window.io(socketUrl, { transports: ["websocket", "polling"], withCredentials: true });
}
