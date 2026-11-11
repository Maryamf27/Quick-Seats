import mongoose, { Types, type QueryFilter } from "mongoose";
import { SeatModel, type Seat } from "../models/seat.model.js";
import { SeatNotificationOutboxModel } from "../models/seat-notification-outbox.model.js";
import type { SeatUpdatePayload } from "../sockets/socket.types.js";
import type { SeatStatus } from "../types/domain.js";
import { notifySeatsReleased } from "./seat-notification.service.js";
import { SOCKET_EVENTS } from "../sockets/socket.events.js";

export function getEffectiveSeatStatus(
  seat: Pick<Seat, "status" | "lockedUntil">,
): SeatStatus {
  if (seat.status === "HELD" && seat.lockedUntil && seat.lockedUntil <= new Date()) {
    return "AVAILABLE";
  }

  return seat.status;
}

export async function clearExpiredSeatHolds(
  now = new Date(),
  notificationMode: "local" | "outbox" = "local",
): Promise<number> {
  const expiredSeats = await SeatModel.find({
    status: "HELD",
    holdId: { $ne: null },
    lockedUntil: { $lte: now },
  })
    .select("eventId holdId")
    .lean()
    .exec();

  const holdGroups = new Map<string, { eventId: string; holdId: string }>();
  for (const seat of expiredSeats) {
    if (seat.holdId) {
      const eventId = seat.eventId.toString();
      holdGroups.set(`${eventId}:${seat.holdId}`, { eventId, holdId: seat.holdId });
    }
  }

  let processed = 0;

  for (const { eventId, holdId } of holdGroups.values()) {
    const session = await mongoose.startSession();
    let releasedSeatIds: string[] = [];

    try {
      await session.withTransaction(async () => {
        const filter: QueryFilter<Seat> = {
          eventId: new Types.ObjectId(eventId),
          status: "HELD",
          holdId,
          lockedUntil: { $lte: now },
        };
        const seats = await SeatModel.find(filter)
          .session(session)
          .select("_id")
          .lean<{ _id: Types.ObjectId }[]>()
          .exec();
        const result = await SeatModel.updateMany(
          filter,
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

        if (result.modifiedCount !== seats.length) {
          throw new Error("Expired seat hold changed during cleanup");
        }

        releasedSeatIds = seats.map((seat) => seat._id.toString());
        if (releasedSeatIds.length > 0 && notificationMode === "outbox") {
          const payload: SeatUpdatePayload = {
            eventId,
            holdId,
            seats: releasedSeatIds.map((seatId) => ({
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
      });

      processed += releasedSeatIds.length;
      if (notificationMode === "local") {
        notifySeatsReleased({
          eventId,
          holdId,
          seatIds: releasedSeatIds,
          eventName: SOCKET_EVENTS.SEAT_EXPIRED,
        });
      }
    } finally {
      await session.endSession();
    }
  }

  return processed;
}
