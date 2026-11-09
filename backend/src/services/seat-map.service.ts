import { Types } from "mongoose";
import { EventModel } from "../models/event.model.js";
import { SeatModel } from "../models/seat.model.js";
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
  const grouped = await SeatModel.aggregate<{ _id: SeatStatus; count: number }>([
    { $match: filter },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]).exec();
  const summary = emptySummary();

  for (const group of grouped) {
    summary.total += group.count;
    if (group._id === "AVAILABLE") {
      summary.available = group.count;
    } else if (group._id === "HELD") {
      summary.held = group.count;
    } else if (group._id === "BOOKED") {
      summary.booked = group.count;
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
      .select("section row seatNumber category price status")
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
      status: seat.status,
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total: summary.total,
      totalPages,
    },
  };
}
