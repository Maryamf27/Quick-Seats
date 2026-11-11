import { EventModel } from "../models/event.model.js";
import { VenueModel, type Venue } from "../models/venue.model.js";
import { env } from "../config/env.js";
import { cache } from "../config/redis.js";
import { venueCacheKey } from "./cache-keys.js";
import { invalidateVenueAndRelatedEvents } from "./public-cache-invalidation.service.js";
import { AppError } from "../utils/app-error.js";
import { isDuplicateKeyError, parseInput } from "../utils/validation.js";
import { objectIdSchema } from "../validators/common.validator.js";
import {
  createVenueSchema,
  updateVenueSchema,
  type listVenuesQuerySchema,
} from "../validators/venue.validator.js";
import type { z } from "zod";

type VenueListQuery = z.output<typeof listVenuesQuerySchema>;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function venueInputFromDocument(venue: Venue) {
  return {
    name: venue.name,
    description: venue.description,
    address: {
      street: venue.address.street,
      city: venue.address.city,
      state: venue.address.state,
      country: venue.address.country,
      postalCode: venue.address.postalCode,
    },
    capacity: venue.capacity,
    sections: venue.sections.map((section) => ({
      name: section.name,
      rows: section.rows,
      seatsPerRow: section.seatsPerRow,
      seatCategory: section.seatCategory,
      price: section.price,
    })),
  };
}

export async function createVenue(input: unknown) {
  const data = parseInput(createVenueSchema, input);
  try {
    return await VenueModel.create(data);
  } catch (error: unknown) {
    if (isDuplicateKeyError(error)) {
      throw new AppError("A venue with these details already exists", 409);
    }
    throw error;
  }
}

export async function listVenues(query: VenueListQuery) {
  const filter: Record<string, unknown> = {};
  if (query.search) {
    filter.name = { $regex: escapeRegex(query.search), $options: "i" };
  }
  if (query.city) {
    filter["address.city"] = {
      $regex: `^${escapeRegex(query.city)}$`,
      $options: "i",
    };
  }

  const sortDirection = query.order === "asc" ? 1 : -1;
  const [venues, total] = await Promise.all([
    VenueModel.find(filter)
      .sort({ [query.sortBy === "city" ? "address.city" : query.sortBy]: sortDirection })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean()
      .exec(),
    VenueModel.countDocuments(filter).exec(),
  ]);

  return {
    venues,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function getVenueById(id: string) {
  const validId = parseInput(objectIdSchema, id);
  return cache.getOrLoad(
    venueCacheKey(validId),
    env.CACHE_VENUE_TTL_SECONDS,
    async () => {
      const venue = await VenueModel.findById(validId).lean().exec();
      if (!venue) {
        throw new AppError("Venue not found", 404);
      }
      return venue;
    },
  );
}

export async function updateVenue(id: string, input: unknown) {
  const validId = parseInput(objectIdSchema, id);
  const changes = parseInput(updateVenueSchema, input);
  const venue = await VenueModel.findById(validId).exec();
  if (!venue) {
    throw new AppError("Venue not found", 404);
  }

  const merged = parseInput(createVenueSchema, {
    ...venueInputFromDocument(venue),
    ...changes,
  });
  Object.assign(venue, merged);

  let updated: Venue;
  try {
    updated = await venue.save();
  } catch (error: unknown) {
    if (isDuplicateKeyError(error)) {
      throw new AppError("A venue with these details already exists", 409);
    }
    throw error;
  }
  await invalidateVenueAndRelatedEvents(validId);
  return updated;
}

export async function deleteVenue(id: string): Promise<void> {
  const validId = parseInput(objectIdSchema, id);
  const venue = await VenueModel.findById(validId).select("_id").lean().exec();
  if (!venue) {
    throw new AppError("Venue not found", 404);
  }

  const hasEvents = await EventModel.exists({ venueId: venue._id });
  if (hasEvents) {
    throw new AppError("Venue cannot be deleted while it has associated events", 409);
  }

  const deletion = await VenueModel.deleteOne({ _id: venue._id }).exec();
  if (deletion.deletedCount !== 1) {
    throw new AppError("Venue not found", 404);
  }
  await invalidateVenueAndRelatedEvents(validId);
}
