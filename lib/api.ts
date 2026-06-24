import { NextResponse } from "next/server";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function firstHeaderValue(value: string | null) {
  return (value || "").split(",")[0]?.trim() || "";
}

function forwardedOrigin(request: Request) {
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host")) || firstHeaderValue(request.headers.get("host"));
  if (!forwardedHost) return "";

  const requestProtocol = normalizeOrigin(request.url).split(":")[0];
  const protocol = forwardedProto || requestProtocol || "https";
  return normalizeOrigin(`${protocol}://${forwardedHost}`);
}

function allowedOrigins(request: Request) {
  const values = [
    normalizeOrigin(request.url),
    forwardedOrigin(request),
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL || ""),
    normalizeOrigin(process.env.NEXT_PUBLIC_SOCKET_URL || ""),
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    ...(process.env.PERP_SIM_ALLOWED_ORIGINS || "").split(",").map((item) => item.trim())
  ];
  return new Set(values.map(normalizeOrigin).filter(Boolean));
}

export function requireSameOrigin(request: Request) {
  const method = request.method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return;

  const origins = allowedOrigins(request);
  const origin = request.headers.get("origin");
  if (origin) {
    if (origins.has(normalizeOrigin(origin))) return;
    throw new Response("CSRF origin check failed", { status: 403, statusText: "Forbidden" });
  }

  const referer = request.headers.get("referer");
  if (referer && origins.has(normalizeOrigin(referer))) return;

  throw new Response("CSRF origin check failed", { status: 403, statusText: "Forbidden" });
}

export async function readJson<T>(request: Request): Promise<T> {
  requireSameOrigin(request);
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Invalid JSON");
  }
}

export function badRequest(message: string) {
  return json({ error: message }, 400);
}

export function tooManyRequests(message: string, retryAfterMs?: number) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (retryAfterMs && retryAfterMs > 0) {
    headers.set("Retry-After", String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
  }
  return new NextResponse(JSON.stringify({ error: message }), { status: 429, headers });
}

export function handleError(error: unknown) {
  if (error instanceof Response) {
    return json({ error: error.statusText || "Request failed" }, error.status);
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  return json({ error: message }, 500);
}
