import mongoose, { Types, type ClientSession } from "mongoose";
import { EventModel } from "../models/event.model.js";
import { SeatModel, type Seat } from "../models/seat.model.js";
import { VenueModel } from "../models/venue.model.js";
import { AppError } from "../utils/app-error.js";
import { isDuplicateKeyError, parseInput } from "../utils/validation.js";
import { objectIdSchema } from "../validators/common.validator.js";
import { venueSectionSchema } from "../validators/venue.validator.js";
import type { z } from "zod";

type SeatSection = z.output<typeof venueSectionSchema>;

function validateLayout(
  sections: SeatSection[],
  venueCapacity: number,
): number {
  const sectionNames = sections.map((section) => section.name.toLocaleLowerCase());
  if (new Set(sectionNames).size !== sectionNames.length) {
    throw new AppError("Venue layout contains duplicate section names", 400);
  }

  const totalSeats = sections.reduce(
    (total, section) => total + section.rows * section.seatsPerRow,
    0,
  );
  if (totalSeats > venueCapacity || !Number.isSafeInteger(totalSeats)) {
    throw new AppError("Venue layout exceeds its capacity or is invalid", 400);
  }

  return totalSeats;
}

async function insertSeatDocuments(
  eventId: Types.ObjectId,
  venueId: Types.ObjectId,
  sections: SeatSection[],
  session: ClientSession,
): Promise<number> {
  const batchSize = 1000;
  let batch: Omit<Seat, "_id" | "createdAt" | "updatedAt">[] = [];
  let insertedCount = 0;

  for (const section of sections) {
    for (let rowIndex = 0; rowIndex < section.rows; rowIndex += 1) {
      for (let seatIndex = 0; seatIndex < section.seatsPerRow; seatIndex += 1) {
        batch.push({
          eventId,
          venueId,
          section: section.name,
          row: `${section.name}${rowIndex + 1}`,
          seatNumber: seatIndex + 1,
          category: section.seatCategory,
          price: section.price ?? 0,
          status: "AVAILABLE" as const,
        });

        if (batch.length === batchSize) {
          await SeatModel.insertMany(batch, { session, ordered: true });
          insertedCount += batch.length;
          batch = [];
        }
      }
    }
  }

  if (batch.length > 0) {
    await SeatModel.insertMany(batch, { session, ordered: true });
    insertedCount += batch.length;
  }

  return insertedCount;
}

export interface SeatGenerationSummary {
  eventId: string;
  totalSeats: number;
  sections: number;
}

export async function generateSeatsForEvent(
  eventIdValue: string,
): Promise<SeatGenerationSummary> {
  const eventId = new Types.ObjectId(parseInput(objectIdSchema, eventIdValue));
  const session = await mongoose.startSession();
  let summary: SeatGenerationSummary | undefined;

  try {
    await session.withTransaction(async () => {
      const event = await EventModel.findById(eventId).session(session).lean().exec();
      if (!event) {
        throw new AppError("Event not found", 404);
      }

      const venue = await VenueModel.findById(event.venueId).session(session).lean().exec();
      if (!venue) {
        throw new AppError("Venue not found", 404);
      }

      const existingSeats = await SeatModel.exists({ eventId }).session(session);
      if (existingSeats) {
        throw new AppError("Seats have already been generated for this event", 409);
      }

      const parsedSections = parseInput(
        venueSectionSchema.array().min(1),
        venue.sections,
      );
      const totalSeats = validateLayout(parsedSections, venue.capacity);

      const generationClaim = await EventModel.updateOne(
        { _id: event._id, seatsGeneratedAt: { $exists: false } },
        { $set: { seatsGeneratedAt: new Date() } },
        { session },
      ).exec();
      if (generationClaim.modifiedCount !== 1) {
        throw new AppError("Seats have already been generated for this event", 409);
      }

      const insertedCount = await insertSeatDocuments(
        event._id,
        venue._id,
        parsedSections,
        session,
      );
      if (insertedCount !== totalSeats) {
        throw new AppError("Seat generation did not create the expected number of seats", 500);
      }

      summary = {
        eventId: event._id.toString(),
        totalSeats,
        sections: parsedSections.length,
      };
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      throw error;
    }
    if (isDuplicateKeyError(error)) {
      throw new AppError("Seats have already been generated for this event", 409);
    }
    throw error;
  } finally {
    await session.endSession();
  }

  if (!summary) {
    throw new AppError("Seat generation did not complete", 500);
  }
  return summary;
}
