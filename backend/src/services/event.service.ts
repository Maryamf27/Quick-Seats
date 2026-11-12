import mongoose, { Types } from "mongoose";
import { BookingModel } from "../models/booking.model.js";
import { EventModel } from "../models/event.model.js";
import { SeatModel } from "../models/seat.model.js";
import { UserModel } from "../models/user.model.js";
import { VenueModel } from "../models/venue.model.js";
import { env } from "../config/env.js";
import { cache } from "../config/redis.js";
import {
  eventCacheKey,
  eventListCacheKey,
  eventListVersionKey,
} from "./cache-keys.js";
import {
  invalidateEventCache,
  invalidateEventListings,
} from "./public-cache-invalidation.service.js";
import { AppError } from "../utils/app-error.js";
import type { UserRole } from "../types/domain.js";
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

async function listPublishedCategories(): Promise<string[]> {
  const values = await EventModel.distinct("category", { status: "PUBLISHED" }).exec();
  return [...new Set(values.map((category) => category.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
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

  const event = await createWithUniqueSlug({
    ...data,
    venueId,
    organizerId,
  });
  await invalidateEventListings();
  return event;
}

export async function listEvents(query: EventListQuery) {
  const loadEvents = async () => {
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
          categories: await listPublishedCategories(),
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
    const [events, total, categories] = await Promise.all([
      EventModel.find(filter)
        .sort({ [query.sortBy]: sortDirection })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean()
        .exec(),
      EventModel.countDocuments(filter).exec(),
      listPublishedCategories(),
    ]);
    const venueIds = [...new Set(events.map((event) => event.venueId.toString()))];
    const eventObjectIds = events.map((event) => event._id);
    const [venues, seatPrices] = eventObjectIds.length > 0
      ? await Promise.all([
          VenueModel.find({ _id: { $in: venueIds } }).select("name address sections.price").lean().exec(),
          SeatModel.aggregate<{ _id: Types.ObjectId; startingPrice: number }>([
            { $match: { eventId: { $in: eventObjectIds } } },
            { $group: { _id: "$eventId", startingPrice: { $min: "$price" } } },
          ]).exec(),
        ])
      : [[], []];
    const venueById = new Map(venues.map((venue) => [venue._id.toString(), venue]));
    const seatPriceByEvent = new Map(seatPrices.map((row) => [row._id.toString(), row.startingPrice]));

    return {
      events: events.map((event) => {
        const venue = venueById.get(event.venueId.toString());
        const prices = venue?.sections.map((section) => section.price).filter(Number.isFinite) ?? [];
        return {
          ...event,
          venueId: venue ? { _id: venue._id, name: venue.name, address: venue.address } : event.venueId,
          startingPrice: seatPriceByEvent.get(event._id.toString()) ?? (prices.length > 0 ? Math.min(...prices) : null),
          currency: env.STRIPE_CURRENCY,
        };
      }),
      categories,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  };

  const version = await cache.getCounter(eventListVersionKey);
  if (version === null) {
    return loadEvents();
  }

  return cache.getOrLoad(
    eventListCacheKey(version, query),
    env.CACHE_EVENT_LIST_TTL_SECONDS,
    loadEvents,
    (result) => result.events.length > 0,
  );
}

export async function listOrganizerEvents(organizerId: string, page: number, limit: number) {
  const filter = { organizerId: new Types.ObjectId(organizerId) };
  const [events, total] = await Promise.all([
    EventModel.find(filter).populate({ path: "venueId", select: "name address" })
      .sort({ startDate: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean().exec(),
    EventModel.countDocuments(filter).exec(),
  ]);
  return { events, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getOrganizerEvent(id: string, requesterId: string, role: UserRole) {
  const validId = parseInput(objectIdSchema, id);
  const event = await EventModel.findById(validId).populate({ path: "venueId", select: "name address" }).lean().exec();
  if (!event) throw new AppError("Event not found", 404);
  assertEventOrganizer(event.organizerId, requesterId, role);
  return event;
}

export async function getEventById(id: string) {
  const validId = parseInput(objectIdSchema, id);
  return cache.getOrLoad(
    eventCacheKey(validId),
    env.CACHE_EVENT_TTL_SECONDS,
    async () => {
      const event = await EventModel.findOne({ _id: validId, status: "PUBLISHED" })
        .populate({ path: "venueId", select: "name description address capacity" })
        .lean()
        .exec();

      if (!event) {
        throw new AppError("Event not found", 404);
      }
      return event;
    },
    (event) => event.status === "PUBLISHED",
  );
}

export function assertEventOrganizer(
  organizerId: Types.ObjectId,
  requesterId: string,
  role: UserRole,
): void {
  if (role !== "ADMIN" && !organizerId.equals(requesterId)) {
    throw new AppError("You do not have permission to manage this event", 403);
  }
}

export async function updateEvent(
  id: string,
  input: unknown,
  requesterId: string,
  role: UserRole,
) {
  const validId = parseInput(objectIdSchema, id);
  const changes = parseInput(updateEventSchema, input);
  const event = await EventModel.findById(validId).exec();
  if (!event) {
    throw new AppError("Event not found", 404);
  }
  assertEventOrganizer(event.organizerId, requesterId, role);

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
    let updated: typeof event;
    try {
      updated = await event.save();
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error) || !changes.title) {
        if (isDuplicateKeyError(error)) {
          throw new AppError("Event slug already exists", 409);
        }
        throw error;
      }
      continue;
    }
    await invalidateEventCache(validId);
    return updated;
  }

  throw new AppError("Could not generate a unique event slug", 409);
}

export async function deleteEvent(
  id: string,
  requesterId: string,
  role: UserRole,
): Promise<void> {
  const validId = parseInput(objectIdSchema, id);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const event = await EventModel.findById(validId).session(session).lean().exec();
      if (!event) {
        throw new AppError("Event not found", 404);
      }
      assertEventOrganizer(event.organizerId, requesterId, role);

      const hasBookings = await BookingModel.exists({ eventId: event._id })
        .session(session)
        .exec();
      if (hasBookings) {
        throw new AppError("Event cannot be deleted while it has bookings", 409);
      }
      const hasSeats = await SeatModel.exists({ eventId: event._id })
        .session(session)
        .exec();
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
  await invalidateEventCache(validId);
}
