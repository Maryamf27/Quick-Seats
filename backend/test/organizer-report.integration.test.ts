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

const [{ UserModel }, { EventModel }, { BookingModel }, { buildOrganizerSalesSummary }] =
  await Promise.all([
    import("../src/models/user.model.js"),
    import("../src/models/event.model.js"),
    import("../src/models/booking.model.js"),
    import("../src/services/organizer-report.service.js"),
  ]);

test(
  "organizer sales summaries include only owned, paid bookings in range by currency",
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
    const otherOrganizerId = new Types.ObjectId();
    const eventId = new Types.ObjectId();
    const otherEventId = new Types.ObjectId();
    const bookingIds = Array.from({ length: 4 }, () => new Types.ObjectId());
    const start = new Date("2026-01-01T00:00:00.000Z");
    const end = new Date("2026-02-01T00:00:00.000Z");
    const paidAt = new Date("2026-01-15T12:00:00.000Z");

    try {
      await UserModel.create([
        {
          _id: organizerId,
          fullName: "Report Test Organizer",
          email: `report-${organizerId.toString()}@example.test`,
          passwordHash: "test-password-hash",
          role: "ORGANIZER",
        },
        {
          _id: otherOrganizerId,
          fullName: "Other Report Organizer",
          email: `report-other-${otherOrganizerId.toString()}@example.test`,
          passwordHash: "test-password-hash",
          role: "ORGANIZER",
        },
      ]);
      await EventModel.create([
        {
          _id: eventId,
          title: "Report Test Event",
          slug: `report-${eventId.toString()}`,
          description: "Isolated report test",
          category: "test",
          venueId: new Types.ObjectId(),
          organizerId,
          startDate: new Date("2026-03-01T00:00:00.000Z"),
          endDate: new Date("2026-03-01T02:00:00.000Z"),
          status: "PUBLISHED",
        },
        {
          _id: otherEventId,
          title: "Other Organizer Event",
          slug: `report-other-${otherEventId.toString()}`,
          description: "Isolated ownership test",
          category: "test",
          venueId: new Types.ObjectId(),
          organizerId: otherOrganizerId,
          startDate: new Date("2026-03-02T00:00:00.000Z"),
          endDate: new Date("2026-03-02T02:00:00.000Z"),
          status: "PUBLISHED",
        },
      ]);
      await BookingModel.create([
        {
          _id: bookingIds[0],
          userId: new Types.ObjectId(),
          eventId,
          seatIds: [new Types.ObjectId(), new Types.ObjectId()],
          totalAmount: 25,
          currency: "usd",
          status: "CONFIRMED",
          paymentStatus: "PAID",
          paidAt,
        },
        {
          _id: bookingIds[1],
          userId: new Types.ObjectId(),
          eventId,
          seatIds: [new Types.ObjectId()],
          totalAmount: 30,
          currency: "eur",
          status: "CONFIRMED",
          paymentStatus: "PAID",
          paidAt,
        },
        {
          _id: bookingIds[2],
          userId: new Types.ObjectId(),
          eventId,
          seatIds: [new Types.ObjectId()],
          totalAmount: 99,
          currency: "usd",
          status: "PENDING",
          paymentStatus: "UNPAID",
          paidAt,
        },
        {
          _id: bookingIds[3],
          userId: new Types.ObjectId(),
          eventId: otherEventId,
          seatIds: [new Types.ObjectId()],
          totalAmount: 100,
          currency: "usd",
          status: "CONFIRMED",
          paymentStatus: "PAID",
          paidAt,
        },
      ]);

      const summary = await buildOrganizerSalesSummary(
        organizerId.toString(),
        start,
        end,
      );
      assert.equal(summary.eventCount, 1);
      assert.equal(summary.totalBookings, 2);
      assert.equal(summary.totalTicketsSold, 3);
      assert.deepEqual(summary.revenueByCurrency, { usd: 25, eur: 30 });
      assert.equal(summary.events[0]?.bookings, 2);
      assert.equal(summary.events[0]?.ticketsSold, 3);
      assert.deepEqual(summary.events[0]?.revenueByCurrency, { usd: 25, eur: 30 });
    } finally {
      await BookingModel.deleteMany({ _id: { $in: bookingIds } }).exec();
      await EventModel.deleteMany({ _id: { $in: [eventId, otherEventId] } }).exec();
      await UserModel.deleteMany({ _id: { $in: [organizerId, otherOrganizerId] } }).exec();
      await mongoose.disconnect();
    }
  },
);
