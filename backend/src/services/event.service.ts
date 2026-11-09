import mongoose, { Types } from "mongoose";
import { BookingModel } from "../models/booking.model.js";
import { EventModel } from "../models/event.model.js";
import { SeatModel } from "../models/seat.model.js";
import { UserModel } from "../models/user.model.js";
import { VenueModel } from "../models/venue.model.js";
import { AppError } from "../utils/app-error.js";
import { isDuplicateKeyError, parseInput } from "../utils/validation.js";
import { objectIdSchema } from "../validators/common.validator.js";
import {
  createEventSchema,
  listEventsQuerySchema,
  updateEventSchema,
} from "../validators/event.validator.js";
import type { z } from "zod";

type EventListQuery = z.output<typeof listEventsQuerySchema>;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "event";
}

async function createWithUniqueSlug(
  input: {
    title: string;
    description: string;
    category: string;
    venueId: Types.ObjectId;
    organizerId: Types.ObjectId;
    startDate: Date;
    endDate: Date;
    posterUrl?: string;
  },
) {
  const baseSlug = slugify(input.title);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    try {
      return await EventModel.create({ ...input, slug, status: "DRAFT" });
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  }

  throw new AppError("Could not generate a unique event slug", 409);
}

export async function createEvent(input: unknown) {
  const data = parseInput(createEventSchema, input);
  const venueId = new Types.ObjectId(data.venueId);
  const organizerId = new Types.ObjectId(data.organizerId);
  const [venue, organizer] = await Promise.all([
    VenueModel.exists({ _id: venueId }),
    UserModel.exists({ _id: organizerId }),
  ]);

  if (!venue) {
    throw new AppError("Venue not found", 404);
  }
  if (!organizer) {
    throw new AppError("Organizer not found", 404);
  }

  return createWithUniqueSlug({
    ...data,
    venueId,
    organizerId,
  });
}

export async function listEvents(query: EventListQuery) {
  const filter: Record<string, unknown> = { status: "PUBLISHED" };

  if (query.search) {
    filter.title = { $regex: escapeRegex(query.search), $options: "i" };
  }
  if (query.category) {
    filter.category = query.category.toLowerCase();
  }
  if (query.from || query.to) {
    const startDate: Record<string, Date> = {};
    if (query.from) {
      startDate.$gte = query.from;
    }
    if (query.to) {
      startDate.$lte = query.to;
    }
    filter.startDate = startDate;
  }
  if (query.city) {
    const venues = await VenueModel.find({
      "address.city": { $regex: `^${escapeRegex(query.city)}$`, $options: "i" },
    })
      .select("_id")
      .lean()
      .exec();
    if (venues.length === 0) {
      return {
        events: [],
        pagination: {
          page: query.page,
          limit: query.limit,
          total: 0,
          totalPages: 0,
        },
      };
    }
    filter.venueId = { $in: venues.map((venue) => venue._id) };
  }

  const sortDirection = query.order === "asc" ? 1 : -1;
  const [events, total] = await Promise.all([
    EventModel.find(filter)
      .sort({ [query.sortBy]: sortDirection })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean()
      .exec(),
    EventModel.countDocuments(filter).exec(),
  ]);

  return {
    events,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function getEventById(id: string) {
  const validId = parseInput(objectIdSchema, id);
  const event = await EventModel.findById(validId)
    .populate({ path: "venueId", select: "name description address capacity" })
    .lean()
    .exec();

  if (!event) {
    throw new AppError("Event not found", 404);
  }
  return event;
}

export async function updateEvent(id: string, input: unknown) {
  const validId = parseInput(objectIdSchema, id);
  const changes = parseInput(updateEventSchema, input);
  const event = await EventModel.findById(validId).exec();
  if (!event) {
    throw new AppError("Event not found", 404);
  }

  const nextStartDate = changes.startDate ?? event.startDate;
  const nextEndDate = changes.endDate ?? event.endDate;
  if (nextEndDate <= nextStartDate) {
    throw new AppError("End date must be after start date", 400);
  }

  Object.assign(event, changes);
  if (changes.title) {
    event.slug = slugify(changes.title);
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (changes.title && attempt > 0) {
      event.slug = `${slugify(changes.title)}-${attempt + 1}`;
    }
    try {
      return await event.save();
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error) || !changes.title) {
        if (isDuplicateKeyError(error)) {
          throw new AppError("Event slug already exists", 409);
        }
        throw error;
      }
    }
  }

  throw new AppError("Could not generate a unique event slug", 409);
}

export async function deleteEvent(id: string): Promise<void> {
  const validId = parseInput(objectIdSchema, id);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const event = await EventModel.findById(validId).session(session).lean().exec();
      if (!event) {
        throw new AppError("Event not found", 404);
      }

      const [hasBookings, hasSeats] = await Promise.all([
        BookingModel.exists({ eventId: event._id }).session(session),
        SeatModel.exists({ eventId: event._id }).session(session),
      ]);

      if (hasBookings) {
        throw new AppError("Event cannot be deleted while it has bookings", 409);
      }
      if (hasSeats) {
        throw new AppError("Event cannot be deleted while it has generated seats", 409);
      }

      const deletion = await EventModel.deleteOne({ _id: event._id })
        .session(session)
        .exec();
      if (deletion.deletedCount !== 1) {
        throw new AppError("Event not found", 404);
      }
    });
  } finally {
    await session.endSession();
  }
}
