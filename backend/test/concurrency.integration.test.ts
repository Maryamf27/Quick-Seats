import assert from "node:assert/strict";
import "dotenv/config";
import { test } from "node:test";
import mongoose, { Types } from "mongoose";
import { getIsolatedMongoTestUri } from "./helpers/test-infrastructure.js";

const mongoUri = getIsolatedMongoTestUri(process.env.MONGODB_TEST_URI);
const integrationOptIn = process.env.RUN_INTEGRATION_TESTS === "1";
process.env.NODE_ENV ??= "test";
process.env.MONGODB_URI ??= mongoUri ?? "mongodb://127.0.0.1:27017/quickseats-test";
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

const [
  { EventModel },
  { SeatModel },
  { UserModel },
  { holdSeats },
  { clearExpiredSeatHolds },
] = await Promise.all([
  import("../src/models/event.model.js"),
  import("../src/models/seat.model.js"),
  import("../src/models/user.model.js"),
  import("../src/services/seat-hold.service.js"),
  import("../src/services/seat-expiration.service.js"),
]);

test(
  "concurrent holds and stale cleanup preserve seat ownership atomically",
  {
    skip:
      !integrationOptIn || !mongoUri
        ? "Set RUN_INTEGRATION_TESTS=1 and MONGODB_TEST_URI to an isolated transaction-capable database"
        : false,
  },
  async () => {
    assert.ok(mongoUri);
    await mongoose.connect(mongoUri);

    const organizerId = new Types.ObjectId();
    const firstUserId = new Types.ObjectId();
    const secondUserId = new Types.ObjectId();
    const venueId = new Types.ObjectId();
    const eventId = new Types.ObjectId();
    const seatIds = [
      new Types.ObjectId(),
      new Types.ObjectId(),
      new Types.ObjectId(),
      new Types.ObjectId(),
    ];

    try {
      await UserModel.create([
        {
          _id: organizerId,
          fullName: "Concurrency Organizer",
          email: `organizer-${organizerId.toString()}@example.test`,
          passwordHash: "test-password-hash",
          role: "ORGANIZER",
        },
        {
          _id: firstUserId,
          fullName: "First Concurrency User",
          email: `first-${firstUserId.toString()}@example.test`,
          passwordHash: "test-password-hash",
          role: "USER",
        },
        {
          _id: secondUserId,
          fullName: "Second Concurrency User",
          email: `second-${secondUserId.toString()}@example.test`,
          passwordHash: "test-password-hash",
          role: "USER",
        },
      ]);
      await EventModel.create({
        _id: eventId,
        title: "Concurrency Test Event",
        slug: `concurrency-${eventId.toString()}`,
        description: "Isolated concurrency test",
        category: "test",
        venueId,
        organizerId,
        startDate: new Date(Date.now() + 60 * 60_000),
        endDate: new Date(Date.now() + 2 * 60 * 60_000),
        status: "PUBLISHED",
      });
      await SeatModel.create(
        seatIds.map((seatId, index) => ({
          _id: seatId,
          eventId,
          venueId,
          section: "A",
          row: "A1",
          seatNumber: index + 1,
          category: "STANDARD",
          price: 10,
          status: "AVAILABLE",
        })),
      );

      const simultaneousResults = await Promise.allSettled([
        holdSeats(eventId.toString(), firstUserId.toString(), {
          seatIds: [seatIds[0]!.toString()],
        }),
        holdSeats(eventId.toString(), secondUserId.toString(), {
          seatIds: [seatIds[0]!.toString()],
        }),
      ]);
      assert.equal(
        simultaneousResults.filter((result) => result.status === "fulfilled").length,
        1,
      );
      assert.equal(
        simultaneousResults.filter((result) => result.status === "rejected").length,
        1,
      );

      const otherSeat = await SeatModel.findById(seatIds[0]).lean().exec();
      assert.equal(otherSeat?.status, "HELD");
      const winnerId = otherSeat?.lockedBy?.toString();
      assert.ok(winnerId);
      const losingUserId =
        winnerId === firstUserId.toString() ? secondUserId.toString() : firstUserId.toString();

      await assert.rejects(
        holdSeats(eventId.toString(), losingUserId, {
          seatIds: [seatIds[1]!.toString(), seatIds[0]!.toString()],
        }),
        (error: unknown) =>
          typeof error === "object" &&
          error !== null &&
          "statusCode" in error &&
          error.statusCode === 409,
      );
      const unheldSeat = await SeatModel.findById(seatIds[1]).lean().exec();
      assert.equal(unheldSeat?.status, "AVAILABLE");

      const staleHoldId = "old-expired-hold";
      await SeatModel.updateOne(
        { _id: seatIds[2] },
        {
          $set: {
            status: "HELD",
            lockedBy: firstUserId,
            holdId: staleHoldId,
            lockedUntil: new Date(Date.now() - 60_000),
          },
        },
      ).exec();
      const replacementHold = await holdSeats(eventId.toString(), secondUserId.toString(), {
        seatIds: [seatIds[2]!.toString()],
      });
      await clearExpiredSeatHolds();
      const replacedSeat = await SeatModel.findById(seatIds[2]).lean().exec();
      assert.equal(replacedSeat?.holdId, replacementHold.holdId);
      assert.equal(replacedSeat?.lockedBy?.toString(), secondUserId.toString());

      await SeatModel.updateOne(
        { _id: seatIds[3] },
        { $set: { status: "BOOKED" } },
      ).exec();
      await assert.rejects(
        holdSeats(eventId.toString(), firstUserId.toString(), {
          seatIds: [seatIds[3]!.toString()],
        }),
        (error: unknown) =>
          typeof error === "object" &&
          error !== null &&
          "statusCode" in error &&
          error.statusCode === 409,
      );
    } finally {
      await SeatModel.deleteMany({ _id: { $in: seatIds } }).exec();
      await EventModel.deleteOne({ _id: eventId }).exec();
      await UserModel.deleteMany({
        _id: { $in: [organizerId, firstUserId, secondUserId] },
      }).exec();
      await mongoose.disconnect();
    }
  },
);
