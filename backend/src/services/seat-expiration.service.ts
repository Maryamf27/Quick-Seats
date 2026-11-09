import { env } from "../config/env.js";
import { SeatModel, type Seat } from "../models/seat.model.js";
import type { SeatStatus } from "../types/domain.js";

export function getEffectiveSeatStatus(
  seat: Pick<Seat, "status" | "lockedUntil">,
): SeatStatus {
  if (seat.status === "HELD" && seat.lockedUntil && seat.lockedUntil <= new Date()) {
    return "AVAILABLE";
  }

  return seat.status;
}

export async function clearExpiredSeatHolds(now = new Date()): Promise<number> {
  const expiredSeats = await SeatModel.find({
    status: "HELD",
    holdId: { $ne: null },
    lockedUntil: { $lte: now },
  })
    .select("holdId")
    .lean()
    .exec();

  const uniqueHoldIds = [...new Set(expiredSeats.map((seat) => seat.holdId).filter(Boolean))];

  let processed = 0;

  for (const holdId of uniqueHoldIds) {
    const releaseResult = await SeatModel.updateMany(
      {
        status: "HELD",
        holdId,
        lockedUntil: { $lte: now },
      },
      {
        $set: {
          status: "AVAILABLE",
          lockedBy: null,
          lockedUntil: null,
          holdId: null,
        },
      },
    ).exec();

    processed += releaseResult.modifiedCount;
  }

  return processed;
}

export function startSeatHoldCleanupScheduler(): NodeJS.Timeout | undefined {
  if (process.env.NODE_ENV === "test") {
    return undefined;
  }

  const intervalMs = env.SEAT_CLEANUP_INTERVAL_SECONDS * 1000;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return undefined;
  }

  return setInterval(() => {
    void clearExpiredSeatHolds().catch((error: unknown) => {
      console.error("Seat expiration cleanup failed", error);
    });
  }, intervalMs);
}
