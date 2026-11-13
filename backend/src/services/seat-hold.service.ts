import crypto from "node:crypto";
import mongoose, { Types, type QueryFilter } from "mongoose";
import { z } from "zod";
import { env } from "../config/env.js";
import { EventModel } from "../models/event.model.js";
import { SeatModel, type Seat } from "../models/seat.model.js";
import { AppError } from "../utils/app-error.js";
import { parseInput } from "../utils/validation.js";
import { objectIdSchema } from "../validators/common.validator.js";
import { holdSeatsSchema, releaseHoldSchema } from "../validators/seat-hold.validator.js";
import { notifySeatsHeld, notifySeatsReleased } from "./seat-notification.service.js";

const HOLD_DURATION_MS = env.SEAT_HOLD_DURATION_MINUTES * 60 * 1000;

type HoldSeatsInput = z.output<typeof holdSeatsSchema>;
type ReleaseHoldInput = z.output<typeof releaseHoldSchema>;

export interface HoldResult {
  holdId: string;
  eventId: string;
  userId: string;
  seatIds: string[];
  createdAt: string;
  expiresAt: string;
}

export async function holdSeats(
  eventIdValue: string,
  userIdValue: string,
  input: unknown,
): Promise<HoldResult> {
  const eventId = new Types.ObjectId(parseInput(objectIdSchema, eventIdValue));
  const userId = new Types.ObjectId(parseInput(objectIdSchema, userIdValue));
  const payload = parseInput(holdSeatsSchema, input) as HoldSeatsInput;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + HOLD_DURATION_MS);
  const holdId = crypto.randomUUID();
  const seatObjectIds = payload.seatIds.map((seatId) => new Types.ObjectId(seatId));

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const event = await EventModel.findById(eventId)
        .session(session)
        .select("status")
        .lean()
        .exec();

      if (!event) {
        throw new AppError("Event not found", 404);
      }

      if (event.status !== "PUBLISHED") {
        throw new AppError("Event is not published", 409);
      }

      // One conditional write claims every requested seat. A seat is claimable only if it
      // is AVAILABLE or its previous hold has expired, so two concurrent requests can never
      // both win the same seat. If any seat is not claimed the transaction aborts and no
      // seat is left partially held.
      const claim = await SeatModel.updateMany(
        {
          _id: { $in: seatObjectIds },
          eventId,
          $or: [{ status: "AVAILABLE" }, { status: "HELD", lockedUntil: { $lte: now } }],
        },
        {
          $set: {
            status: "HELD",
            lockedBy: userId,
            lockedUntil: expiresAt,
            holdId,
          },
        },
        { session },
      ).exec();

      if (claim.modifiedCount !== seatObjectIds.length) {
        const belonging = await SeatModel.countDocuments({
          _id: { $in: seatObjectIds },
          eventId,
        })
          .session(session)
          .exec();

        if (belonging !== seatObjectIds.length) {
          throw new AppError("One or more seats do not belong to this event", 404);
        }
        throw new AppError("Seat is unavailable for holding", 409);
      }
    });

    const result = {
      holdId,
      eventId: eventId.toString(),
      userId: userId.toString(),
      seatIds: payload.seatIds,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    notifySeatsHeld(result);
    return result;
  } finally {
    await session.endSession();
  }
}

export async function releaseHold(
  eventIdValue: string,
  userIdValue: string,
  input: unknown,
): Promise<{ holdId: string; eventId: string; releasedCount: number }> {
  const eventId = new Types.ObjectId(parseInput(objectIdSchema, eventIdValue));
  const userId = new Types.ObjectId(parseInput(objectIdSchema, userIdValue));
  const payload = parseInput(releaseHoldSchema, input) as ReleaseHoldInput;

  const session = await mongoose.startSession();
  let releasedSeatIds: string[] = [];

  try {
    await session.withTransaction(async () => {
      const filter: QueryFilter<Seat> = {
        eventId,
        holdId: payload.holdId,
        status: "HELD",
        lockedBy: userId,
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
        throw new AppError("Seat hold changed while it was being released", 409);
      }

      releasedSeatIds = seats.map((seat) => seat._id.toString());
    });

    notifySeatsReleased({
      eventId: eventId.toString(),
      holdId: payload.holdId,
      seatIds: releasedSeatIds,
      eventName: "seat:released",
    });

    return {
      holdId: payload.holdId,
      eventId: eventId.toString(),
      releasedCount: releasedSeatIds.length,
    };
  } finally {
    await session.endSession();
  }
}
