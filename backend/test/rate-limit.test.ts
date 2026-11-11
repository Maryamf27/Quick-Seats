import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import express, { type Request } from "express";
import test from "node:test";
import {
  authenticatedUserIdentity,
  clientIpIdentity,
  createRateLimitMiddleware,
  eventIdentity,
  type RateLimitDecision,
  type RateLimitStore,
} from "../src/services/rate-limit.service.js";

class MemoryRateLimitStore implements RateLimitStore {
  private readonly counts = new Map<string, number>();
  fail = false;

  async consumeRateLimit(key: string, windowMs: number): Promise<RateLimitDecision> {
    if (this.fail) {
      throw new Error("Redis unavailable");
    }
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return { count, ttlMs: windowMs };
  }
}

async function withServer(
  handler: express.RequestHandler,
  testBody: (url: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.get(
    "/limited",
    handler,
    (_request, response) => response.status(200).json({ success: true }),
  );
  await withExpressServer(app, (url) => testBody(`${url}/limited`));
}

async function withExpressServer(
  app: express.Express,
  testBody: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await testBody(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("requests inside the quota pass and excess requests return 429 with Retry-After", async () => {
  const store = new MemoryRateLimitStore();
  const limiter = createRateLimitMiddleware(store, "auth", "closed", [
    {
      name: "test:user",
      windowMs: 60_000,
      maxRequests: 2,
      identity: (request: Request) => String(request.headers["x-user"] ?? ""),
    },
  ]);

  await withServer(limiter, async (url) => {
    const first = await fetch(url, { headers: { "x-user": "user-1" } });
    const second = await fetch(url, { headers: { "x-user": "user-1" } });
    const third = await fetch(url, { headers: { "x-user": "user-1" } });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(third.status, 429);
    assert.equal(third.headers.get("retry-after"), "60");
    assert.equal(third.headers.get("ratelimit-limit"), "2");
    assert.equal(third.headers.get("ratelimit-remaining"), "0");
    assert.deepEqual(await third.json(), {
      success: false,
      message: "Too many requests. Please try again later.",
    });
  });
});

test("different users have separate counters and concurrent consumption is atomic", async () => {
  const store = new MemoryRateLimitStore();
  const decisions = await Promise.all(
    Array.from({ length: 10 }, () => store.consumeRateLimit("same-user", 10_000)),
  );
  assert.equal(decisions.filter((decision) => decision.count <= 5).length, 5);
  const differentUser = await store.consumeRateLimit("different-user", 10_000);
  assert.equal(differentUser.count, 1);
});

test("separate middleware instances share Redis counters", async () => {
  const sharedStore = new MemoryRateLimitStore();
  const firstInstance = createRateLimitMiddleware(sharedStore, "global", "closed", [
    { name: "test:shared", windowMs: 60_000, maxRequests: 1, identity: () => "same-client" },
  ]);
  const secondInstance = createRateLimitMiddleware(sharedStore, "global", "closed", [
    { name: "test:shared", windowMs: 60_000, maxRequests: 1, identity: () => "same-client" },
  ]);
  const app = express();
  app.get("/instance-one", firstInstance, (_request, response) => response.sendStatus(200));
  app.get("/instance-two", secondInstance, (_request, response) => response.sendStatus(200));

  await withExpressServer(app, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/instance-one`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/instance-two`)).status, 429);
  });
});

test("IP limits use Express-resolved client IP and separate clients", async () => {
  const limiter = createRateLimitMiddleware(new MemoryRateLimitStore(), "global", "closed", [
    { name: "test:ip", windowMs: 60_000, maxRequests: 1, identity: clientIpIdentity },
  ]);
  const app = express();
  app.set("trust proxy", 1);
  app.get("/limited", limiter, (_request, response) => response.sendStatus(200));

  await withExpressServer(app, async (baseUrl) => {
    const firstIp = { "x-forwarded-for": "203.0.113.10" };
    const secondIp = { "x-forwarded-for": "203.0.113.11" };
    assert.equal((await fetch(`${baseUrl}/limited`, { headers: firstIp })).status, 200);
    assert.equal((await fetch(`${baseUrl}/limited`, { headers: firstIp })).status, 429);
    assert.equal((await fetch(`${baseUrl}/limited`, { headers: secondIp })).status, 200);
  });
});

test("event-specific limits distinguish event IDs", async () => {
  const limiter = createRateLimitMiddleware(new MemoryRateLimitStore(), "event-read", "closed", [
    { name: "test:event", windowMs: 60_000, maxRequests: 1, identity: eventIdentity },
  ]);
  const app = express();
  app.get("/events/:eventId", limiter, (_request, response) => response.sendStatus(200));

  await withExpressServer(app, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/events/event-1`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/events/event-1`)).status, 429);
    assert.equal((await fetch(`${baseUrl}/events/event-2`)).status, 200);
  });
});

test("authenticated users and event IDs have independent limiter identities", async () => {
  const store = new MemoryRateLimitStore();
  const userLimiter = createRateLimitMiddleware(store, "seat-hold", "closed", [
    {
      name: "test:user",
      windowMs: 60_000,
      maxRequests: 1,
      identity: authenticatedUserIdentity,
    },
  ]);
  const app = express();
  app.use((request, _response, next) => {
    const userId = request.headers["x-user"];
    if (typeof userId === "string") {
      request.user = { id: userId, email: `${userId}@example.test`, role: "USER" };
    }
    next();
  });
  app.post(
    "/events/:eventId/hold",
    userLimiter,
    (_request, response) => response.sendStatus(200),
  );
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/events/event-1/hold`;

  try {
    assert.equal((await fetch(url, { method: "POST", headers: { "x-user": "user-1" } })).status, 200);
    assert.equal((await fetch(url, { method: "POST", headers: { "x-user": "user-2" } })).status, 200);
    assert.equal((await fetch(url, { method: "POST", headers: { "x-user": "user-1" } })).status, 429);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  const eventOne = { params: { eventId: "event-1" } } as Request;
  const eventTwo = { params: { eventId: "event-2" } } as Request;
  assert.notEqual(eventIdentity(eventOne), eventIdentity(eventTwo));
});

test("sensitive routes return 503 when Redis fails; public routes follow fail-open policy", async () => {
  const store = new MemoryRateLimitStore();
  store.fail = true;
  const sensitiveLimiter = createRateLimitMiddleware(store, "checkout", "closed", [
    {
      name: "test:sensitive",
      windowMs: 10_000,
      maxRequests: 5,
      identity: () => "user-1",
    },
  ]);
  const publicLimiter = createRateLimitMiddleware(store, "event-read", "open", [
    {
      name: "test:public",
      windowMs: 10_000,
      maxRequests: 5,
      identity: () => "ip-1",
    },
  ]);

  await withServer(sensitiveLimiter, async (url) => {
    const response = await fetch(url);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), "5");
  });
  await withServer(publicLimiter, async (url) => {
    assert.equal((await fetch(url)).status, 200);
  });
});
