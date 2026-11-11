import { env } from "../config/env.js";
import { rateLimitStore } from "../config/redis.js";
import {
  accountIdentity,
  authenticatedUserIdentity,
  clientIpIdentity,
  createRateLimitMiddleware,
  eventIdentity,
} from "../services/rate-limit.service.js";

function combine(...identities: Array<(request: Parameters<typeof clientIpIdentity>[0]) => string | null>) {
  return (request: Parameters<typeof clientIpIdentity>[0]): string | null => {
    const values = identities.map((identity) => identity(request));
    return values.every((value): value is string => value !== null)
      ? values.join(":")
      : null;
  };
}

export const globalRateLimit = createRateLimitMiddleware(
  rateLimitStore,
  "global",
  "open",
  [
    {
      name: "global:ip",
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
      identity: clientIpIdentity,
    },
  ],
);

export const authRateLimit = createRateLimitMiddleware(
  rateLimitStore,
  "auth",
  "closed",
  [
    {
      name: "auth:ip",
      windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
      maxRequests: env.AUTH_RATE_LIMIT_MAX_REQUESTS,
      identity: clientIpIdentity,
    },
    {
      name: "auth:account",
      windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
      maxRequests: env.AUTH_ACCOUNT_RATE_LIMIT_MAX_REQUESTS,
      identity: accountIdentity,
    },
  ],
);

export const eventListRateLimit = createRateLimitMiddleware(
  rateLimitStore,
  "event-read",
  "open",
  [
    {
      name: "event-read:ip",
      windowMs: env.EVENT_READ_RATE_LIMIT_WINDOW_MS,
      maxRequests: env.EVENT_READ_RATE_LIMIT_MAX_REQUESTS,
      identity: clientIpIdentity,
    },
  ],
);

export const eventDetailRateLimit = createRateLimitMiddleware(
  rateLimitStore,
  "event-read",
  "open",
  [
    {
      name: "event-read:ip",
      windowMs: env.EVENT_READ_RATE_LIMIT_WINDOW_MS,
      maxRequests: env.EVENT_READ_RATE_LIMIT_MAX_REQUESTS,
      identity: clientIpIdentity,
    },
    {
      name: "event-read:event-burst",
      windowMs: env.EVENT_READ_RATE_LIMIT_WINDOW_MS,
      maxRequests: env.EVENT_BURST_RATE_LIMIT_MAX_REQUESTS,
      identity: eventIdentity,
    },
  ],
);

export const seatHoldRateLimit = createRateLimitMiddleware(
  rateLimitStore,
  "seat-hold",
  "closed",
  [
    {
      name: "seat-hold:user",
      windowMs: env.SEAT_HOLD_RATE_LIMIT_WINDOW_MS,
      maxRequests: env.SEAT_HOLD_RATE_LIMIT_MAX_REQUESTS,
      identity: authenticatedUserIdentity,
    },
    {
      name: "seat-hold:event-user",
      windowMs: env.SEAT_HOLD_RATE_LIMIT_WINDOW_MS,
      maxRequests: env.SEAT_HOLD_RATE_LIMIT_MAX_REQUESTS,
      identity: combine(eventIdentity, authenticatedUserIdentity),
    },
    {
      name: "seat-hold:event-ip",
      windowMs: env.SEAT_HOLD_RATE_LIMIT_WINDOW_MS,
      maxRequests: env.SEAT_HOLD_IP_RATE_LIMIT_MAX_REQUESTS,
      identity: combine(eventIdentity, clientIpIdentity),
    },
  ],
);

export const checkoutRateLimit = createRateLimitMiddleware(
  rateLimitStore,
  "checkout",
  "closed",
  [
    {
      name: "checkout:user",
      windowMs: env.CHECKOUT_RATE_LIMIT_WINDOW_MS,
      maxRequests: env.CHECKOUT_RATE_LIMIT_MAX_REQUESTS,
      identity: authenticatedUserIdentity,
    },
    {
      name: "checkout:ip",
      windowMs: env.CHECKOUT_RATE_LIMIT_WINDOW_MS,
      maxRequests: env.CHECKOUT_IP_RATE_LIMIT_MAX_REQUESTS,
      identity: clientIpIdentity,
    },
  ],
);
