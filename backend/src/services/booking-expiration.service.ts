import mongoose, { Types, type QueryFilter } from "mongoose";
import { BookingModel } from "../models/booking.model.js";
import { SeatModel, type Seat } from "../models/seat.model.js";
import { SeatNotificationOutboxModel } from "../models/seat-notification-outbox.model.js";
import { SOCKET_EVENTS } from "../sockets/socket.events.js";
import type { SeatUpdatePayload } from "../sockets/socket.types.js";
import {
  notifySeatsReleased,
} from "./seat-notification.service.js";

export async function expirePendingBookings(
  now = new Date(),
  notificationMode: "local" | "outbox" = "local",
): Promise<number> {
  const candidates = await BookingModel.find({
    status: "PENDING",
    paymentStatus: "UNPAID",
    checkoutExpiresAt: { $lte: now },
  })
    .select("_id")
    .sort({ checkoutExpiresAt: 1 })
    .limit(100)
    .lean()
    .exec();

  let expiredCount = 0;
  for (const candidate of candidates) {
    const session = await mongoose.startSession();
    let notification:
      | {
          eventId: string;
          holdId: string;
          seatIds: string[];
        }
      | undefined;
    let didExpire = false;

    try {
      await session.withTransaction(async () => {
        notification = undefined;
        didExpire = false;
        const booking = await BookingModel.findOne({
          _id: candidate._id,
          status: "PENDING",
          paymentStatus: "UNPAID",
          checkoutExpiresAt: { $lte: now },
        })
          .session(session)
          .exec();
        if (!booking) {
          return;
        }

        if (booking.holdId) {
          const seatFilter: QueryFilter<Seat> = {
            _id: { $in: booking.seatIds },
            eventId: booking.eventId,
            holdId: booking.holdId,
            lockedBy: booking.userId,
            status: "HELD",
          };
          const seats = await SeatModel.find(seatFilter)
            .session(session)
            .select("_id")
            .lean<{ _id: Types.ObjectId }[]>()
            .exec();
          if (seats.length > 0) {
            const release = await SeatModel.updateMany(
              seatFilter,
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
            if (release.modifiedCount !== seats.length) {
              throw new Error("Seats changed while expiring pending booking");
            }
            notification = {
              eventId: booking.eventId.toString(),
              holdId: booking.holdId,
              seatIds: seats.map((seat) => seat._id.toString()),
            };
            if (notificationMode === "outbox") {
              const payload: SeatUpdatePayload = {
                eventId: notification.eventId,
                holdId: notification.holdId,
                seats: notification.seatIds.map((seatId) => ({
                  seatId,
                  status: "AVAILABLE",
                  lockedUntil: null,
                })),
                occurredAt: now.toISOString(),
              };
              await SeatNotificationOutboxModel.create(
                [{ eventName: SOCKET_EVENTS.SEAT_EXPIRED, payload }],
                { session },
              );
            }
          }
        }

        booking.status = "EXPIRED";
        await booking.save({ session });
        didExpire = true;
      });

      if (notification && notificationMode === "local") {
        notifySeatsReleased({
          ...notification,
          eventName: SOCKET_EVENTS.SEAT_EXPIRED,
        });
      }
      expiredCount += didExpire ? 1 : 0;
    } catch (error: unknown) {
      console.error("Pending booking expiration failed", {
        bookingId: candidate._id.toString(),
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      throw error;
    } finally {
      await session.endSession();
    }
  }

  return expiredCount;
}
