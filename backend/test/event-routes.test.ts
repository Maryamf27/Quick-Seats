import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

process.env.NODE_ENV ??= "test";
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/quickseats-test";
process.env.CLIENT_ORIGIN ??= "http://localhost:3000";
process.env.SOCKET_CORS_ORIGINS ??= "http://localhost:3000";
process.env.JWT_ACCESS_SECRET ??= "test-only-secret-that-is-long-enough-for-jwt-signing";
process.env.JWT_ACCESS_EXPIRES_IN ??= "1h";
process.env.INITIAL_ADMIN_NAME ??= "Test Admin";
process.env.INITIAL_ADMIN_EMAIL ??= "test-admin@example.test";
process.env.INITIAL_ADMIN_PASSWORD ??= "test-only-password";
process.env.STRIPE_SECRET_KEY ??= "sk_test_unit_test_secret_1234567890";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_unit_test_secret_1234567890";
process.env.STRIPE_CURRENCY ??= "usd";
process.env.STRIPE_CHECKOUT_SUCCESS_URL ??= "http://localhost:3000/booking/success";
process.env.STRIPE_CHECKOUT_CANCEL_URL ??= "http://localhost:3000/booking/cancel";

mongoose.set("bufferCommands", false);

const [{ default: app }, { UserModel }] = await Promise.all([
  import("../src/app.js"),
  import("../src/models/user.model.js"),
]);

type Role = "USER" | "ORGANIZER" | "ADMIN";

const EVENT_ID = "64b000000000000000000001";
const AUTH_REQUIRED = "Authentication token is required";
const originalFindById = UserModel.findById;
const knownUsers = new Map<string, { email: string; role: Role }>();

function tokenFor(role: Role): string {
  const id = `64a00000000000000000000${role === "USER" ? 1 : role === "ORGANIZER" ? 2 : 3}`;
  knownUsers.set(id, { email: `${role.toLowerCase()}@example.test`, role });
  return jwt.sign({ sub: id, role }, process.env.JWT_ACCESS_SECRET as string, {
    expiresIn: "5m",
  });
}

let server: Server;
let baseUrl: string;

before(async () => {
  // Stub only the user lookup used by `authenticate`; no database needed.
  (UserModel as unknown as { findById: unknown }).findById = (id: string) => ({
    exec: async () => {
      const user = knownUsers.get(id);
      return user ? { _id: { toString: () => id }, ...user } : null;
    },
  });

  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  (UserModel as unknown as { findById: unknown }).findById = originalFindById;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function call(
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body && method !== "GET" && method !== "HEAD"
      ? JSON.stringify(options.body)
      : undefined,
  });
  const payload = (await response.json()) as { success: boolean; message: string };
  return { status: response.status, payload };
}

test("public event routes never ask for an authentication token", async () => {
  const publicRoutes = [
    "/api/events?page=1&limit=12&category=Festival&sortBy=startDate&order=asc",
    "/api/events",
    `/api/events/${EVENT_ID}`,
    `/api/events/${EVENT_ID}/seats`,
    "/api/venues",
  ];

  for (const route of publicRoutes) {
    const { status, payload } = await call("GET", route);
    // The database is intentionally unavailable here, so the handler may fail
    // with a 5xx; what matters is that the auth layer did not intercept it.
    assert.notEqual(status, 401, `${route} must not return 401`);
    assert.notEqual(status, 403, `${route} must not return 403`);
    assert.notEqual(payload.message, AUTH_REQUIRED, `${route} must be public`);
  }
});

test("protected event routes still require authentication", async () => {
  const protectedRoutes: Array<[string, string]> = [
    ["POST", "/api/events"],
    ["PUT", `/api/events/${EVENT_ID}`],
    ["DELETE", `/api/events/${EVENT_ID}`],
    ["POST", `/api/events/${EVENT_ID}/generate-seats`],
    ["POST", `/api/events/${EVENT_ID}/seats/hold`],
    ["POST", `/api/events/${EVENT_ID}/seats/release`],
    ["POST", "/api/venues"],
    ["GET", "/api/organizer/reports/summary"],
    ["POST", "/api/organizer/reports"],
    ["GET", "/api/bookings"],
  ];

  for (const [method, route] of protectedRoutes) {
    const { status, payload } = await call(method, route, { body: {} });
    assert.equal(status, 401, `${method} ${route} must require authentication`);
    assert.equal(payload.message, AUTH_REQUIRED);
  }
});

test("invalid tokens are rejected on protected event routes", async () => {
  const { status } = await call("POST", "/api/events", {
    token: "not-a-real-token",
    body: {},
  });
  assert.equal(status, 401);
});

test("event creation and management keep their role restrictions", async () => {
  const userToken = tokenFor("USER");
  const organizerToken = tokenFor("ORGANIZER");
  const adminToken = tokenFor("ADMIN");

  // Plain users are authenticated but not authorized.
  assert.equal((await call("POST", "/api/events", { token: userToken, body: {} })).status, 403);
  assert.equal(
    (await call("PUT", `/api/events/${EVENT_ID}`, { token: userToken, body: { status: "PUBLISHED" } }))
      .status,
    403,
  );
  assert.equal((await call("DELETE", `/api/events/${EVENT_ID}`, { token: userToken })).status, 403);
  assert.equal(
    (await call("POST", `/api/events/${EVENT_ID}/generate-seats`, { token: userToken })).status,
    403,
  );

  // Organizers and admins pass authorization and reach request validation (400).
  assert.equal((await call("POST", "/api/events", { token: organizerToken, body: {} })).status, 400);
  assert.equal((await call("POST", "/api/events", { token: adminToken, body: {} })).status, 400);
});

test("organizer report routes remain organizer-only", async () => {
  assert.equal(
    (await call("GET", "/api/organizer/reports/summary", { token: tokenFor("USER") })).status,
    403,
  );
  assert.equal(
    (await call("GET", "/api/organizer/reports/summary", { token: tokenFor("ADMIN") })).status,
    403,
  );
});
