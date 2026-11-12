import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";
import { assertPublicRegistrationRole } from "../src/services/auth.service.js";
import { assertEventOrganizer } from "../src/services/event.service.js";
import { assessReadiness } from "../src/controllers/health.controller.js";
import { getEffectiveSeatStatus } from "../src/services/seat-expiration.service.js";
import {
  getIsolatedMongoTestUri,
  getLocalRedisTestUrl,
} from "./helpers/test-infrastructure.js";
import {
  createOrganizerApplicationSchema,
  decideOrganizerApplicationSchema,
} from "../src/validators/organizer-application.validator.js";

test("event management is restricted to its organizer or an admin", () => {
  const organizerId = new Types.ObjectId();
  const otherOrganizerId = new Types.ObjectId();

  assert.doesNotThrow(() =>
    assertEventOrganizer(organizerId, organizerId.toString(), "ORGANIZER"),
  );
  assert.throws(
    () => assertEventOrganizer(organizerId, otherOrganizerId.toString(), "ORGANIZER"),
    { statusCode: 403 },
  );
  assert.doesNotThrow(() =>
    assertEventOrganizer(organizerId, otherOrganizerId.toString(), "ADMIN"),
  );
});

test("public registration cannot grant privileged roles", () => {
  assert.doesNotThrow(() => assertPublicRegistrationRole("USER"));
  assert.throws(() => assertPublicRegistrationRole("ORGANIZER"), { statusCode: 400 });
  assert.throws(() => assertPublicRegistrationRole("ADMIN"), { statusCode: 400 });
});

test("organizer applications cannot carry a role assignment", () => {
  const valid = {
    businessName: "Northside Arts",
    description: "We organize live arts events for our local community.",
  };
  assert.equal(createOrganizerApplicationSchema.safeParse(valid).success, true);
  assert.equal(
    createOrganizerApplicationSchema.safeParse({ ...valid, role: "ORGANIZER" }).success,
    false,
  );
  assert.equal(decideOrganizerApplicationSchema.safeParse({ decision: "APPROVED" }).success, true);
  assert.equal(decideOrganizerApplicationSchema.safeParse({ decision: "ORGANIZER" }).success, false);
});

test("expired holds are reported as available without changing stored state", () => {
  assert.equal(
    getEffectiveSeatStatus({ status: "HELD", lockedUntil: new Date(Date.now() - 1_000) }),
    "AVAILABLE",
  );
  assert.equal(
    getEffectiveSeatStatus({ status: "HELD", lockedUntil: new Date(Date.now() + 60_000) }),
    "HELD",
  );
  assert.equal(getEffectiveSeatStatus({ status: "BOOKED", lockedUntil: null }), "BOOKED");
});

test("readiness requires MongoDB and configured Redis dependencies", () => {
  const configuredRedis = {
    cache: "connected" as const,
    notifications: "connected" as const,
  };
  const missingRedis = {
    cache: "not_configured" as const,
    notifications: "not_configured" as const,
  };

  assert.equal(assessReadiness(false, configuredRedis).status, "not_ready");
  assert.equal(assessReadiness(true, missingRedis).status, "not_ready");
  assert.equal(
    assessReadiness(true, configuredRedis).status,
    process.env.REDIS_URL ? "ready" : "not_ready",
  );
});

test("integration test infrastructure rejects remote service URLs", () => {
  assert.equal(
    getIsolatedMongoTestUri("mongodb+srv://example.invalid/quickseats-test"),
    undefined,
  );
  assert.equal(
    getIsolatedMongoTestUri("mongodb://127.0.0.1:27017/quickseats?replicaSet=rs0"),
    undefined,
  );
  assert.equal(
    getIsolatedMongoTestUri("mongodb://127.0.0.1:27017/quickseats-test?replicaSet=rs0"),
    "mongodb://127.0.0.1:27017/quickseats-test?replicaSet=rs0",
  );
  assert.equal(getLocalRedisTestUrl("rediss://cache.example.invalid:6379"), undefined);
  assert.equal(getLocalRedisTestUrl("redis://127.0.0.1:6379/1"), "redis://127.0.0.1:6379/1");
});
