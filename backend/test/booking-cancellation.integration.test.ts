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
  { BookingModel },
  { EventModel },
  { SeatModel },
  { SeatNotificationOutboxModel },
  { cancelBooking },
  { cancelEventAsAdmin, unpublishEvent },
] = await Promise.all([
  import("../src/models/booking.model.js"),
  import("../src/models/event.model.js"),
  import("../src/models/seat.model.js"),
  import("../src/models/seat-notification-outbox.model.js"),
  import("../src/services/booking-cancellation.service.js"),
  import("../src/services/admin.service.js"),
]);

const skip =
  !integrationOptIn || !mongoUri
    ? "Set RUN_INTEGRATION_TESTS=1 and MONGODB_TEST_URI to an isolated transaction-capable database"
    : false;

const DAY = 24 * 60 * 60_000;

async function seed(startsInMs: number) {
  const ownerId = new Types.ObjectId();
  const eventId = new Types.ObjectId();
  const venueId = new Types.ObjectId();
  const seatIds = [new Types.ObjectId(), new Types.ObjectId()];
  await EventModel.create({
    _id: eventId,
    title: "Cancellation Test Event",
    slug: `cancellation-${eventId.toString()}`,
    description: "Isolated cancellation test",
    category: "test",
    venueId,
    organizerId: new Types.ObjectId(),
    startDate: new Date(Date.now() + startsInMs),
    endDate: new Date(Date.now() + startsInMs + 2 * 60 * 60_000),
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
      status: "BOOKED",
    })),
  );
  const booking = await BookingModel.create({
    userId: ownerId,
    eventId,
    seatIds,
    totalAmount: 20,
    currency: "usd",
    status: "CONFIRMED",
    paymentStatus: "PAID",
    paidAt: new Date(),
    holdId: `hold-${eventId.toString()}`,
  });
  return { ownerId, eventId, seatIds, bookingId: booking._id.toString() };
}

async function cleanup(eventId: Types.ObjectId) {
  await Promise.all([
    BookingModel.deleteMany({ eventId }),
    SeatModel.deleteMany({ eventId }),
    EventModel.deleteOne({ _id: eventId }),
    SeatNotificationOutboxModel.deleteMany({ "payload.eventId": eventId.toString() }),
  ]);
}

const status = (code: number) => (error: unknown) =>
  typeof error === "object" && error !== null && (error as { statusCode?: number }).statusCode === code;

test("customer cancellation releases seats, flags a refund and is not repeatable", { skip }, async () => {
  assert.ok(mongoUri);
  await mongoose.connect(mongoUri);
  const { ownerId, eventId, seatIds, bookingId } = await seed(3 * DAY);
  try {
    // Someone else's booking is indistinguishable from a missing one.
    await assert.rejects(cancelBooking(bookingId, new Types.ObjectId().toString()), status(404));

    const result = await cancelBooking(bookingId, ownerId.toString());
    assert.equal(result.status, "CANCELLED");
    assert.equal(result.requiresRefund, true);

    const booking = await BookingModel.findById(bookingId).lean();
    assert.equal(booking?.status, "CANCELLED");
    assert.equal(booking?.refundStatus === "PENDING" || booking?.refundStatus === "SUCCEEDED", true);

    const seats = await SeatModel.find({ _id: { $in: seatIds } }).lean();
    assert.equal(seats.every((seat) => seat.status === "AVAILABLE" && !seat.holdId), true);

    const outbox = await SeatNotificationOutboxModel.countDocuments({
      eventName: "seat:released",
      "payload.eventId": eventId.toString(),
    });
    assert.equal(outbox, 1);

    await assert.rejects(cancelBooking(bookingId, ownerId.toString()), status(409));
  } finally {
    await cleanup(eventId);
    await mongoose.disconnect();
  }
});

test("cancellation is refused inside the cutoff window", { skip }, async () => {
  assert.ok(mongoUri);
  await mongoose.connect(mongoUri);
  const { ownerId, eventId, seatIds, bookingId } = await seed(60 * 60_000);
  try {
    await assert.rejects(cancelBooking(bookingId, ownerId.toString()), status(409));
    const booking = await BookingModel.findById(bookingId).lean();
    assert.equal(booking?.status, "CONFIRMED");
    const seats = await SeatModel.find({ _id: { $in: seatIds } }).lean();
    assert.equal(seats.every((seat) => seat.status === "BOOKED"), true);
  } finally {
    await cleanup(eventId);
    await mongoose.disconnect();
  }
});

test("admin can unpublish only unbooked events and cancelling flags every booking for refund", { skip }, async () => {
  assert.ok(mongoUri);
  await mongoose.connect(mongoUri);
  const { eventId, bookingId } = await seed(3 * DAY);
  try {
    await assert.rejects(unpublishEvent(eventId.toString()), status(409));

    const result = await cancelEventAsAdmin(eventId.toString());
    assert.equal(result.status, "CANCELLED");
    assert.equal(result.cancelledBookings, 1);

    const [event, booking] = await Promise.all([
      EventModel.findById(eventId).lean(),
      BookingModel.findById(bookingId).lean(),
    ]);
    assert.equal(event?.status, "CANCELLED");
    assert.equal(booking?.status, "CANCELLED");
    assert.equal(booking?.requiresRefund, true);
    assert.equal(booking?.refundStatus, "PENDING");

    await assert.rejects(cancelEventAsAdmin(eventId.toString()), status(409));
  } finally {
    await cleanup(eventId);
    await mongoose.disconnect();
  }
});
