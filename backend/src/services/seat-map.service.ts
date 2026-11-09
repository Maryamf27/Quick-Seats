import { Types } from "mongoose";
import { EventModel } from "../models/event.model.js";
import { SeatModel } from "../models/seat.model.js";
import { getEffectiveSeatStatus } from "./seat-expiration.service.js";
import { AppError } from "../utils/app-error.js";
import { parseInput } from "../utils/validation.js";
import { objectIdSchema } from "../validators/common.validator.js";
import { seatMapQuerySchema } from "../validators/event.validator.js";
import type { SeatStatus } from "../types/domain.js";
import type { z } from "zod";

type SeatMapQuery = z.output<typeof seatMapQuerySchema>;

export interface SeatSummary {
  total: number;
  available: number;
  held: number;
  booked: number;
}

function emptySummary(): SeatSummary {
  return { total: 0, available: 0, held: 0, booked: 0 };
}

async function summarize(filter: Record<string, unknown>): Promise<SeatSummary> {
  const seats = await SeatModel.find(filter)
    .select("status lockedUntil")
    .lean()
    .exec();
  const summary = emptySummary();

  for (const seat of seats) {
    const status = getEffectiveSeatStatus(seat as { status: SeatStatus; lockedUntil: Date | null });
    summary.total += 1;

    if (status === "AVAILABLE") {
      summary.available += 1;
    } else if (status === "HELD") {
      summary.held += 1;
    } else if (status === "BOOKED") {
      summary.booked += 1;
    }
  }

  return summary;
}

export async function getSeatMap(eventIdValue: string, input: unknown) {
  const eventId = new Types.ObjectId(parseInput(objectIdSchema, eventIdValue));
  const query = parseInput(seatMapQuerySchema, input);
  const eventExists = await EventModel.exists({ _id: eventId });
  if (!eventExists) {
    throw new AppError("Event not found", 404);
  }

  const baseFilter: Record<string, unknown> = { eventId };
  const scopedFilter: Record<string, unknown> = { ...baseFilter };

  if (query.section) {
    scopedFilter.section = query.section;
  }
  if (query.category) {
    scopedFilter.category = query.category;
  }

  const overallSummaryPromise = summarize(baseFilter);
  const summaryPromise = query.section || query.category
    ? summarize(scopedFilter)
    : overallSummaryPromise;
  const [overallSummary, summary, seats] = await Promise.all([
    overallSummaryPromise,
    summaryPromise,
    SeatModel.find(scopedFilter)
      .select("section row seatNumber category price status lockedUntil")
      .sort({ section: 1, row: 1, seatNumber: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean()
      .exec(),
  ]);

  const totalPages = Math.ceil(summary.total / query.limit);
  return {
    eventId: eventId.toString(),
    summary,
    overallSummary,
    seats: seats.map((seat) => ({
      id: seat._id.toString(),
      section: seat.section,
      row: seat.row,
      seatNumber: seat.seatNumber,
      category: seat.category,
      price: seat.price,
      status: getEffectiveSeatStatus(seat as { status: SeatStatus; lockedUntil: Date | null }),
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total: summary.total,
      totalPages,
    },
  };
}
