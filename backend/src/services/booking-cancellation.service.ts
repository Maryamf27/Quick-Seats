import mongoose, { Types } from "mongoose";
import { env } from "../config/env.js";
import { BookingModel } from "../models/booking.model.js";
import { EventModel } from "../models/event.model.js";
import { SeatModel } from "../models/seat.model.js";
import { SeatNotificationOutboxModel } from "../models/seat-notification-outbox.model.js";
import { SOCKET_EVENTS } from "../sockets/socket.events.js";
import type { SeatUpdatePayload } from "../sockets/socket.types.js";
import { AppError } from "../utils/app-error.js";
import { parseInput } from "../utils/validation.js";
import { bookingIdParamsSchema } from "../validators/booking.validator.js";
import { retryBookingRefund } from "./refund.service.js";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Cancels a confirmed, paid booking owned by `userId`.
 *
 * Everything that must be all-or-nothing happens in one transaction: the booking flips to
 * CANCELLED with a pending refund, and its seats go back to AVAILABLE. The conditional
 * filters make a double click or two concurrent requests safe: only one of them can match
 * the CONFIRMED booking. The Stripe refund runs after commit; if it fails, the booking stays
 * flagged `requiresRefund` and the existing refund-retry job finishes it.
 */
export async function cancelBooking(bookingIdValue: string, userId: string) {
  const bookingId = new Types.ObjectId(
    parseInput(bookingIdParamsSchema.shape.bookingId, bookingIdValue),
  );
  const userObjectId = new Types.ObjectId(userId);
  const now = new Date();
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const booking = await BookingModel.findOne({ _id: bookingId, userId: userObjectId })
        .session(session)
        .lean()
        .exec();
      // Someone else's booking looks exactly like a missing one.
      if (!booking) {
        throw new AppError("Booking not found", 404);
      }
      if (booking.status === "CANCELLED") {
        throw new AppError("Booking is already cancelled", 409);
      }
      if (booking.status !== "CONFIRMED" || booking.paymentStatus !== "PAID") {
        throw new AppError("Only confirmed, paid bookings can be cancelled", 409);
      }

      const event = await EventModel.findById(booking.eventId)
        .session(session)
        .select("startDate status")
        .lean()
        .exec();
      if (!event) {
        throw new AppError("Event not found", 404);
      }
      const cutoff = new Date(event.startDate.getTime() - env.BOOKING_CANCELLATION_CUTOFF_HOURS * HOUR_MS);
      if (now >= cutoff) {
        throw new AppError(
          env.BOOKING_CANCELLATION_CUTOFF_HOURS > 0
            ? `Bookings can only be cancelled up to ${env.BOOKING_CANCELLATION_CUTOFF_HOURS} hours before the event starts`
            : "This event has already started",
          409,
        );
      }

      const flipped = await BookingModel.findOneAndUpdate(
        { _id: bookingId, userId: userObjectId, status: "CONFIRMED", paymentStatus: "PAID" },
        { $set: { status: "CANCELLED", requiresRefund: true, refundStatus: "PENDING" } },
        { session },
      ).exec();
      if (!flipped) {
        throw new AppError("Booking changed while it was being cancelled", 409);
      }

      const released = await SeatModel.updateMany(
        { _id: { $in: booking.seatIds }, eventId: booking.eventId, status: "BOOKED" },
        { $set: { status: "AVAILABLE", lockedBy: null, lockedUntil: null, holdId: null } },
        { session },
      ).exec();
      if (released.modifiedCount !== booking.seatIds.length) {
        throw new AppError("Booked seats are in an unexpected state", 409);
      }

      const payload: SeatUpdatePayload = {
        eventId: booking.eventId.toString(),
        holdId: null,
        seats: booking.seatIds.map((seatId) => ({
          seatId: seatId.toString(),
          status: "AVAILABLE",
          lockedUntil: null,
        })),
        occurredAt: now.toISOString(),
      };
      await SeatNotificationOutboxModel.create(
        [{ eventName: SOCKET_EVENTS.SEAT_RELEASED, payload }],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  // Best effort: a failure here is fine because the retry job picks the booking up.
  try {
    await retryBookingRefund(bookingId.toString());
  } catch (error: unknown) {
    console.error("Immediate refund after cancellation failed; it will be retried", {
      bookingId: bookingId.toString(),
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
  }

  const updated = await BookingModel.findById(bookingId).lean().exec();
  return {
    id: bookingId.toString(),
    status: updated?.status ?? "CANCELLED",
    paymentStatus: updated?.paymentStatus ?? "PAID",
    refundStatus: updated?.refundStatus ?? "PENDING",
    requiresRefund: updated?.requiresRefund ?? true,
  };
}
