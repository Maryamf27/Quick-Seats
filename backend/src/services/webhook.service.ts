import mongoose, { Types, type HydratedDocument } from "mongoose";
import Stripe from "stripe";
import { BookingModel, type Booking } from "../models/booking.model.js";
import { EventModel } from "../models/event.model.js";
import { PaymentEventModel } from "../models/payment-event.model.js";
import { SeatModel } from "../models/seat.model.js";
import { SOCKET_EVENTS } from "../sockets/socket.events.js";
import { AppError } from "../utils/app-error.js";
import { isDuplicateKeyError } from "../utils/validation.js";
import { notifySeatUpdate } from "./seat-notification.service.js";
import { retryBookingRefund } from "./refund.service.js";
import { toMinorUnits } from "../utils/currency.js";

interface SeatNotification {
  eventName: typeof SOCKET_EVENTS.SEAT_BOOKED | typeof SOCKET_EVENTS.SEAT_EXPIRED;
  payload: {
    eventId: string;
    holdId: string | null;
    seats: Array<{
      seatId: string;
      status: "BOOKED" | "AVAILABLE";
      lockedUntil: null;
    }>;
    occurredAt: string;
  };
}

interface WebhookResult {
  notifications: SeatNotification[];
  refundBookingIds: string[];
}

async function releaseBookingHoldSeats(
  booking: HydratedDocument<Booking>,
  session: mongoose.ClientSession,
  result: WebhookResult,
): Promise<void> {
  const seats = await SeatModel.find({
    _id: { $in: booking.seatIds },
    eventId: booking.eventId,
    holdId: booking.holdId,
    lockedBy: booking.userId,
    status: "HELD",
  })
    .session(session)
    .select("_id")
    .lean()
    .exec();
  if (seats.length === 0) {
    return;
  }

  const released = await SeatModel.updateMany(
    {
      _id: { $in: seats.map((seat) => seat._id) },
      eventId: booking.eventId,
      holdId: booking.holdId,
      lockedBy: booking.userId,
      status: "HELD",
    },
    {
      $set: {
        status: "AVAILABLE",
        lockedBy: null,
        lockedUntil: null,
        holdId: null,
      },
    },
  )
    .session(session)
    .exec();
  if (released.modifiedCount !== seats.length) {
    throw new AppError("Seats changed while reconciling paid checkout", 409);
  }

  result.notifications.push({
    eventName: SOCKET_EVENTS.SEAT_EXPIRED,
    payload: {
      eventId: booking.eventId.toString(),
      holdId: booking.holdId ?? null,
      seats: seats.map((seat) => ({
        seatId: seat._id.toString(),
        status: "AVAILABLE",
        lockedUntil: null,
      })),
      occurredAt: new Date().toISOString(),
    },
  });
}

function getStringId(
  value: string | { id: string } | null,
): string | undefined {
  return typeof value === "string" ? value : value?.id;
}

function getMetadata(
  metadata: Stripe.Metadata | null | undefined,
): { bookingId?: string; holdId?: string; eventId?: string } {
  return {
    bookingId: metadata?.bookingId,
    holdId: metadata?.holdId,
    eventId: metadata?.eventId,
  };
}

function validObjectId(value: string | undefined): value is string {
  return Boolean(value && Types.ObjectId.isValid(value));
}

async function markEventFailure(
  eventRecordId: Types.ObjectId,
  message: string,
  session: mongoose.ClientSession,
): Promise<void> {
  await PaymentEventModel.updateOne(
    { _id: eventRecordId },
    {
      $set: {
        status: "FAILED",
        error: message.slice(0, 1000),
        processedAt: new Date(),
      },
    },
  )
    .session(session)
    .exec();
}

async function setEventBooking(
  eventRecordId: Types.ObjectId,
  bookingId: Types.ObjectId,
  session: mongoose.ClientSession,
): Promise<void> {
  await PaymentEventModel.updateOne(
    { _id: eventRecordId },
    { $set: { bookingId } },
  )
    .session(session)
    .exec();
}

async function handleCheckoutCompleted(
  eventRecordId: Types.ObjectId,
  checkout: Stripe.Checkout.Session,
  session: mongoose.ClientSession,
  result: WebhookResult,
): Promise<boolean> {
  const metadata = getMetadata(checkout.metadata);
  if (!validObjectId(metadata.bookingId) || !metadata.holdId || !metadata.eventId) {
    await markEventFailure(eventRecordId, "Checkout session metadata is incomplete", session);
    return false;
  }

  const booking = await BookingModel.findById(metadata.bookingId).session(session).exec();
  if (booking) {
    await setEventBooking(eventRecordId, booking._id, session);
  }
  if (
    !booking ||
    booking.holdId !== metadata.holdId ||
    booking.eventId.toString() !== metadata.eventId ||
    (booking.stripeSessionId && booking.stripeSessionId !== checkout.id)
  ) {
    await markEventFailure(eventRecordId, "Checkout session does not match its booking", session);
    return false;
  }

  if (checkout.payment_status !== "paid") {
    booking.stripeSessionId = checkout.id;
    await booking.save({ session });
    return true;
  }

  const paymentIntentId = getStringId(checkout.payment_intent);
  if (!paymentIntentId) {
    await markEventFailure(eventRecordId, "Paid Checkout Session has no Payment Intent", session);
    return false;
  }

  const currency = booking.currency?.toLowerCase();
  let amountMatches = false;
  try {
    if (currency) {
      amountMatches =
        checkout.amount_total === toMinorUnits(booking.totalAmount, currency) &&
        checkout.currency?.toLowerCase() === currency;
    }
  } catch {
    amountMatches = false;
  }
  if (booking.stripePaymentIntentId && booking.stripePaymentIntentId !== paymentIntentId) {
    await markEventFailure(eventRecordId, "Payment Intent does not match the booking", session);
    return false;
  }

  if (booking.status === "CONFIRMED" && booking.paymentStatus === "PAID") {
    return true;
  }
  booking.stripeSessionId = checkout.id;

  if (!amountMatches) {
    await releaseBookingHoldSeats(booking, session, result);
    booking.paymentStatus = "PAID";
    booking.stripePaymentIntentId = paymentIntentId;
    booking.paidAt = new Date();
    booking.requiresRefund = true;
    booking.refundStatus = "PENDING";
    if (booking.status === "PENDING") {
      booking.status = "EXPIRED";
    }
    await booking.save({ session });
    result.refundBookingIds.push(booking._id.toString());
    return true;
  }

  const expectedSeatIds = booking.seatIds.map((seatId) => seatId.toString()).sort();
  const [bookableEvent, heldSeats] = await Promise.all([
    EventModel.findOne({
      _id: booking.eventId,
      status: "PUBLISHED",
      startDate: { $gt: new Date() },
    })
      .session(session)
      .select("_id")
      .lean()
      .exec(),
    SeatModel.find({
      eventId: booking.eventId,
      holdId: booking.holdId,
    })
      .session(session)
      .select("_id status lockedBy lockedUntil")
      .lean()
      .exec(),
  ]);
  const holdIsValid =
    Boolean(bookableEvent) &&
    booking.status === "PENDING" &&
    heldSeats.length === expectedSeatIds.length &&
    heldSeats.every(
      (seat) =>
        expectedSeatIds.includes(seat._id.toString()) &&
        seat.status === "HELD" &&
        seat.lockedBy?.equals(booking.userId) &&
        seat.lockedUntil !== null &&
        seat.lockedUntil !== undefined &&
        seat.lockedUntil > new Date(),
    );

  if (!holdIsValid) {
    await releaseBookingHoldSeats(booking, session, result);
    booking.paymentStatus = "PAID";
    booking.stripePaymentIntentId = paymentIntentId;
    booking.paidAt = new Date();
    booking.requiresRefund = true;
    booking.refundStatus = "PENDING";
    if (booking.status === "PENDING") {
      booking.status = "EXPIRED";
    }
    await booking.save({ session });
    result.refundBookingIds.push(booking._id.toString());
    return true;
  }

  const seatUpdate = await SeatModel.updateMany(
    {
      _id: { $in: booking.seatIds },
      eventId: booking.eventId,
      holdId: booking.holdId,
      lockedBy: booking.userId,
      status: "HELD",
      lockedUntil: { $gt: new Date() },
    },
    {
      $set: {
        status: "BOOKED",
        lockedBy: null,
        lockedUntil: null,
        holdId: null,
      },
    },
  )
    .session(session)
    .exec();

  if (seatUpdate.modifiedCount !== booking.seatIds.length) {
    throw new AppError("Held seats changed during booking confirmation", 409);
  }

  booking.status = "CONFIRMED";
  booking.paymentStatus = "PAID";
  booking.stripePaymentIntentId = paymentIntentId;
  booking.paidAt = new Date();
  booking.requiresRefund = false;
  booking.refundStatus = "NOT_REQUIRED";
  await booking.save({ session });

  result.notifications.push({
    eventName: SOCKET_EVENTS.SEAT_BOOKED,
    payload: {
      eventId: booking.eventId.toString(),
      holdId: booking.holdId ?? null,
      seats: booking.seatIds.map((seatId) => ({
        seatId: seatId.toString(),
        status: "BOOKED",
        lockedUntil: null,
      })),
      occurredAt: new Date().toISOString(),
    },
  });
  return true;
}

async function handleCheckoutExpired(
  eventRecordId: Types.ObjectId,
  checkout: Stripe.Checkout.Session,
  session: mongoose.ClientSession,
  result: WebhookResult,
): Promise<boolean> {
  const metadata = getMetadata(checkout.metadata);
  if (!validObjectId(metadata.bookingId) || !metadata.holdId || !metadata.eventId) {
    await markEventFailure(eventRecordId, "Expired Checkout Session metadata is incomplete", session);
    return false;
  }

  const booking = await BookingModel.findById(metadata.bookingId).session(session).exec();
  if (booking) {
    await setEventBooking(eventRecordId, booking._id, session);
  }
  if (
    !booking ||
    booking.holdId !== metadata.holdId ||
    booking.eventId.toString() !== metadata.eventId ||
    (booking.stripeSessionId && booking.stripeSessionId !== checkout.id)
  ) {
    await markEventFailure(eventRecordId, "Expired Checkout Session does not match its booking", session);
    return false;
  }
  booking.stripeSessionId = checkout.id;
  if (booking.status !== "PENDING" || booking.paymentStatus === "PAID") {
    return true;
  }

  const seats = await SeatModel.find({
    eventId: booking.eventId,
    _id: { $in: booking.seatIds },
    holdId: booking.holdId,
    lockedBy: booking.userId,
    status: "HELD",
  })
    .session(session)
    .select("_id")
    .lean()
    .exec();

  if (seats.length > 0) {
    const released = await SeatModel.updateMany(
      {
        _id: { $in: seats.map((seat) => seat._id) },
        eventId: booking.eventId,
        holdId: booking.holdId,
        lockedBy: booking.userId,
        status: "HELD",
      },
      {
        $set: {
          status: "AVAILABLE",
          lockedBy: null,
          lockedUntil: null,
          holdId: null,
        },
      },
    )
      .session(session)
      .exec();
    if (released.modifiedCount !== seats.length) {
      throw new AppError("Seats changed while expiring checkout", 409);
    }
    result.notifications.push({
      eventName: SOCKET_EVENTS.SEAT_EXPIRED,
      payload: {
        eventId: booking.eventId.toString(),
        holdId: booking.holdId ?? null,
        seats: seats.map((seat) => ({
          seatId: seat._id.toString(),
          status: "AVAILABLE",
          lockedUntil: null,
        })),
        occurredAt: new Date().toISOString(),
      },
    });
  }

  booking.status = "EXPIRED";
  if (booking.paymentStatus === "UNPAID") {
    booking.paymentStatus = "FAILED";
  }
  await booking.save({ session });
  return true;
}

async function handlePaymentIntentFailed(
  eventRecordId: Types.ObjectId,
  paymentIntent: Stripe.PaymentIntent,
  session: mongoose.ClientSession,
): Promise<boolean> {
  const metadata = getMetadata(paymentIntent.metadata);
  if (!validObjectId(metadata.bookingId) || !metadata.holdId) {
    await markEventFailure(eventRecordId, "Failed Payment Intent metadata is incomplete", session);
    return false;
  }

  const booking = await BookingModel.findById(metadata.bookingId).session(session).exec();
  if (booking) {
    await setEventBooking(eventRecordId, booking._id, session);
  }
  if (
    !booking ||
    booking.holdId !== metadata.holdId ||
    (metadata.eventId && booking.eventId.toString() !== metadata.eventId)
  ) {
    await markEventFailure(eventRecordId, "Failed Payment Intent does not match its booking", session);
    return false;
  }
  if (booking.status === "PENDING" && booking.paymentStatus !== "PAID") {
    booking.paymentStatus = "FAILED";
    booking.stripePaymentIntentId = paymentIntent.id;
    await booking.save({ session });
  }
  return true;
}

async function handleChargeRefunded(
  eventRecordId: Types.ObjectId,
  charge: Stripe.Charge,
  session: mongoose.ClientSession,
): Promise<boolean> {
  const paymentIntentId = getStringId(charge.payment_intent);
  if (!paymentIntentId) {
    await markEventFailure(eventRecordId, "Refunded charge has no Payment Intent", session);
    return false;
  }

  const booking = await BookingModel.findOne({ stripePaymentIntentId: paymentIntentId })
    .session(session)
    .exec();
  if (booking) {
    booking.paymentStatus = "REFUNDED";
    booking.refundStatus = "SUCCEEDED";
    booking.requiresRefund = true;
    const refundId = charge.refunds?.data.at(-1)?.id;
    if (refundId) {
      booking.stripeRefundId = refundId;
    }
    await booking.save({ session });
    await PaymentEventModel.updateOne(
      { _id: eventRecordId },
      { $set: { bookingId: booking._id } },
    )
      .session(session)
      .exec();
  }
  return true;
}

export async function processStripeEvent(event: Stripe.Event): Promise<void> {
  const session = await mongoose.startSession();
  const result: WebhookResult = { notifications: [], refundBookingIds: [] };

  try {
    await session.withTransaction(async () => {
      const [eventRecord] = await PaymentEventModel.create(
        [
          {
            stripeEventId: event.id,
            eventType: event.type,
            status: "PROCESSING",
          },
        ],
        { session },
      );
      if (!eventRecord) {
        throw new Error("Payment event record was not created");
      }

      let success = true;
      switch (event.type) {
        case "checkout.session.completed":
          success = await handleCheckoutCompleted(
            eventRecord._id,
            event.data.object,
            session,
            result,
          );
          break;
        case "checkout.session.expired":
          success = await handleCheckoutExpired(
            eventRecord._id,
            event.data.object,
            session,
            result,
          );
          break;
        case "payment_intent.payment_failed":
          success = await handlePaymentIntentFailed(
            eventRecord._id,
            event.data.object,
            session,
          );
          break;
        case "charge.refunded":
          success = await handleChargeRefunded(
            eventRecord._id,
            event.data.object,
            session,
          );
          break;
      }

      await PaymentEventModel.updateOne(
        { _id: eventRecord._id },
        {
          $set: {
            status: success ? "PROCESSED" : "FAILED",
            processedAt: new Date(),
          },
        },
      )
        .session(session)
        .exec();
    });
  } catch (error: unknown) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    const previouslyProcessed = await PaymentEventModel.findOne({
      stripeEventId: event.id,
    })
      .select("status bookingId")
      .lean()
      .exec();
    if (!previouslyProcessed) {
      throw error;
    }
    if (previouslyProcessed.bookingId) {
      await retryBookingRefund(previouslyProcessed.bookingId.toString()).catch(
        (refundError: unknown) => {
          console.error("Duplicate webhook refund retry failed", {
            bookingId: previouslyProcessed.bookingId?.toString(),
            errorType: refundError instanceof Error ? refundError.name : "UnknownError",
          });
        },
      );
    }
    return;
  } finally {
    await session.endSession();
  }

  for (const notification of result.notifications) {
    notifySeatUpdate(notification.eventName, notification.payload);
  }
  for (const bookingId of result.refundBookingIds) {
    await retryBookingRefund(bookingId).catch((error: unknown) => {
      console.error("Invalid-hold payment refund attempt failed", {
        bookingId,
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
    });
  }
}
