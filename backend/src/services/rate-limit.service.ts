import { createHash } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { sendError } from "../utils/api-response.js";

export interface RateLimitDecision {
  count: number;
  ttlMs: number;
}

export interface RateLimitStore {
  consumeRateLimit(key: string, windowMs: number): Promise<RateLimitDecision>;
}

export interface RateLimitRule {
  name: string;
  windowMs: number;
  maxRequests: number;
  identity: (request: Request) => string | null;
}

export type RateLimitFailurePolicy = "open" | "closed";
export type RateLimitCategory = "global" | "auth" | "seat-hold" | "checkout" | "event-read";

const metrics: Record<RateLimitCategory, number> = {
  global: 0,
  auth: 0,
  "seat-hold": 0,
  checkout: 0,
  "event-read": 0,
};
let redisErrors = 0;
let lastRedisErrorLogAt = 0;
const eventLimitCounts = new Map<string, number>();

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeClientIp(request: Request): string {
  const ip = request.ip ?? request.socket.remoteAddress ?? "unknown";
  const normalized = ip.trim().toLowerCase().split("%")[0];
  if (normalized.startsWith("::ffff:")) {
    return normalized.slice(7);
  }
  if (!normalized.includes(":")) {
    return normalized;
  }

  const halves = normalized.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = Math.max(0, 8 - left.length - right.length);
  const expanded = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  return `${expanded.slice(0, 4).map((part) => part.replace(/^0+(?=[0-9a-f])/, "") || "0").join(":")}/64`;
}

export function clientIpIdentity(request: Request): string {
  return normalizeClientIp(request);
}

export function accountIdentity(request: Request): string | null {
  const body = request.body as { email?: unknown } | undefined;
  if (typeof body?.email !== "string") {
    return null;
  }
  const email = body.email.trim().toLowerCase();
  return email ? `account:${hash(email)}` : null;
}

export function authenticatedUserIdentity(request: Request): string | null {
  return request.user?.id ? `user:${request.user.id}` : null;
}

export function eventIdentity(request: Request): string | null {
  const eventId = request.params.eventId;
  return typeof eventId === "string" && eventId.length > 0
    ? `event:${eventId.toLowerCase()}`
    : null;
}

export function createRateLimitMiddleware(
  store: RateLimitStore | undefined,
  category: RateLimitCategory,
  failurePolicy: RateLimitFailurePolicy,
  rules: RateLimitRule[],
): RequestHandler {
  return async (request, response, next) => {
    if (!store) {
      redisErrors += 1;
      logRedisFailure(category);
      if (failurePolicy === "closed") {
        response.setHeader("Retry-After", "5");
        return sendError(response, "Rate limiting is temporarily unavailable", 503);
      }
      return next();
    }

    let mostRestrictive:
      | { limit: number; remaining: number; resetSeconds: number; windowMs: number }
      | undefined;

    for (const rule of rules) {
      const identity = rule.identity(request);
      if (!identity) {
        continue;
      }

      const key = `quickseats:ratelimit:${rule.name}:${hash(identity)}`;
      let decision: RateLimitDecision;
      try {
        decision = await store.consumeRateLimit(key, rule.windowMs);
      } catch (error: unknown) {
        redisErrors += 1;
        const errorType = error instanceof Error ? error.name : "UnknownError";
        logRedisFailure(category, errorType);
        if (failurePolicy === "closed") {
          response.setHeader("Retry-After", "5");
          return sendError(response, "Rate limiting is temporarily unavailable", 503);
        }
        return next();
      }

      const remaining = Math.max(0, rule.maxRequests - decision.count);
      const resetSeconds = Math.max(1, Math.ceil(decision.ttlMs / 1000));

      if (decision.count > rule.maxRequests) {
        setRateLimitHeaders(response, rule.maxRequests, 0, resetSeconds, rule.windowMs);
        metrics[category] += 1;
        const eventId = request.params.eventId;
        if (typeof eventId === "string") {
          if (eventLimitCounts.has(eventId) || eventLimitCounts.size < 100) {
            eventLimitCounts.set(eventId, (eventLimitCounts.get(eventId) ?? 0) + 1);
          }
        }
        response.setHeader("Retry-After", String(resetSeconds));
        return sendError(response, "Too many requests. Please try again later.", 429);
      }

      if (
        !mostRestrictive ||
        remaining / rule.maxRequests < mostRestrictive.remaining / mostRestrictive.limit
      ) {
        mostRestrictive = {
          limit: rule.maxRequests,
          remaining,
          resetSeconds,
          windowMs: rule.windowMs,
        };
      }
    }

    if (mostRestrictive) {
      setRateLimitHeaders(
        response,
        mostRestrictive.limit,
        mostRestrictive.remaining,
        mostRestrictive.resetSeconds,
        mostRestrictive.windowMs,
      );
    }
    return next();
  };
}

function setRateLimitHeaders(
  response: Parameters<RequestHandler>[1],
  limit: number,
  remaining: number,
  resetSeconds: number,
  windowMs: number,
): void {
  response.setHeader("RateLimit-Limit", String(limit));
  response.setHeader("RateLimit-Remaining", String(remaining));
  response.setHeader("RateLimit-Reset", String(resetSeconds));
  response.setHeader("RateLimit-Policy", `${limit};w=${Math.ceil(windowMs / 1000)}`);
}

function logRedisFailure(category: RateLimitCategory, errorType = "Unavailable"): void {
  const now = Date.now();
  if (now - lastRedisErrorLogAt < 30_000) {
    return;
  }
  lastRedisErrorLogAt = now;
  console.error(`Rate-limit Redis unavailable for ${category} (${errorType})`);
}

export function getRateLimitMetrics() {
  return {
    limitedRequests: { ...metrics },
    eventLimitedRequests: Object.fromEntries(eventLimitCounts),
    redisErrors,
  };
}

export function logRateLimitMetrics(): void {
  console.info("QuickSeats rate-limit metrics", getRateLimitMetrics());
}
