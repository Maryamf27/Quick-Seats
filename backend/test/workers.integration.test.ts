import assert from "node:assert/strict";
import "dotenv/config";
import { test } from "node:test";
import { getLocalRedisTestUrl } from "./helpers/test-infrastructure.js";

const redisTestUrl = getLocalRedisTestUrl(process.env.REDIS_TEST_URL);
const integrationOptIn = process.env.RUN_INTEGRATION_TESTS === "1";
process.env.NODE_ENV ??= "test";
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/quickseats-test";
process.env.REDIS_URL ??= redisTestUrl ?? "redis://127.0.0.1:6379/0";
process.env.BULLMQ_REDIS_URL =
  process.env.BULLMQ_REDIS_TEST_URL ?? "redis://127.0.0.1:6379/1";
process.env.CLIENT_ORIGIN ??= "http://localhost:3000";
process.env.SOCKET_CORS_ORIGINS ??= "http://localhost:3000";
process.env.JWT_ACCESS_SECRET ??= "test-only-secret-that-is-long-enough-for-jwt-signing";
process.env.JWT_ACCESS_EXPIRES_IN ??= "1h";
process.env.INITIAL_ADMIN_NAME ??= "Test Admin";
process.env.INITIAL_ADMIN_EMAIL ??= "test-admin@example.test";
process.env.INITIAL_ADMIN_PASSWORD ??= "test-only-password";
process.env.INTERNAL_CLEANUP_SECRET ??= "test-only-internal-cleanup-secret-at-least-32-characters";
process.env.STRIPE_SECRET_KEY ??= "sk_test_unit_test_secret_1234567890";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_unit_test_secret_1234567890";
process.env.STRIPE_CURRENCY ??= "usd";
process.env.STRIPE_CHECKOUT_SUCCESS_URL ??= "http://localhost:3000/booking/success";
process.env.STRIPE_CHECKOUT_CANCEL_URL ??= "http://localhost:3000/booking/cancel";
process.env.SEAT_CLEANUP_INTERVAL_SECONDS = "3600";
process.env.BOOKING_CLEANUP_INTERVAL_SECONDS = "3600";
process.env.SEAT_NOTIFICATION_OUTBOX_INTERVAL_SECONDS = "3600";
process.env.REPORT_RECOVERY_INTERVAL_SECONDS = "3600";

const [{ startBackgroundWorkers }, { closeJobQueues, getMaintenanceQueue }] =
  await Promise.all([
    import("../src/jobs/workers.js"),
    import("../src/jobs/queues.js"),
  ]);

test(
  "BullMQ workers start, register recurring jobs, and shut down cleanly",
  {
    skip:
      !integrationOptIn || !redisTestUrl
        ? "Set RUN_INTEGRATION_TESTS=1 and REDIS_TEST_URL to an isolated Redis service"
        : false,
  },
  async () => {
    assert.ok(redisTestUrl);
    const stopWorkers = await startBackgroundWorkers();
    const queue = getMaintenanceQueue();
    try {
      const schedulers = await queue.getJobSchedulers();
      assert.deepEqual(
        schedulers.map((scheduler) => scheduler.id).sort(),
        [
          "organizer-report-recovery",
          "pending-booking-expiration",
          "pending-refund-retry",
          "seat-hold-expiration",
          "seat-notification-outbox",
          "weekly-organizer-sales-summary",
        ].sort(),
      );
    } finally {
      await stopWorkers();
      for (const schedulerId of [
        "organizer-report-recovery",
        "pending-booking-expiration",
        "pending-refund-retry",
        "seat-hold-expiration",
        "seat-notification-outbox",
        "weekly-organizer-sales-summary",
      ]) {
        await queue.removeJobScheduler(schedulerId);
      }
      await closeJobQueues();
    }
  },
);
