import { EventModel } from "../models/event.model.js";
import { cache } from "../config/redis.js";
import type { CacheService } from "./cache.service.js";
import {
  eventCacheKey,
  eventListVersionKey,
  venueCacheKey,
} from "./cache-keys.js";

type CacheInvalidationStore = Pick<CacheService, "invalidate" | "increment">;
type FindEventIdsForVenue = (venueId: string) => Promise<string[]>;

export function createPublicCacheInvalidator(
  cacheStore: CacheInvalidationStore,
  findEventIdsForVenue: FindEventIdsForVenue,
) {
  const invalidateEventListings = async (): Promise<void> => {
    await cacheStore.increment(eventListVersionKey);
  };

  const invalidateEventCache = async (eventId: string): Promise<void> => {
    await Promise.all([
      cacheStore.invalidate([eventCacheKey(eventId)]),
      invalidateEventListings(),
    ]);
  };

  const invalidateVenueAndRelatedEvents = async (
    venueId: string,
  ): Promise<void> => {
    await cacheStore.invalidate([venueCacheKey(venueId)]);
    await invalidateEventListings();

    try {
      const eventIds = await findEventIdsForVenue(venueId);
      await cacheStore.invalidate(eventIds.map(eventCacheKey));
    } catch (error: unknown) {
      const errorType = error instanceof Error ? error.name : "UnknownError";
      console.error(
        `Could not resolve event cache keys for venue ${venueId} (${errorType}); event entries will expire by TTL`,
      );
    }
  };

  return {
    invalidateEventListings,
    invalidateEventCache,
    invalidateVenueAndRelatedEvents,
  };
}

const publicCacheInvalidator = createPublicCacheInvalidator(cache, async (venueId) => {
  const events = await EventModel.find({ venueId })
    .select("_id")
    .lean()
    .exec();
  return events.map((event) => event._id.toString());
});

export const {
  invalidateEventListings,
  invalidateEventCache,
  invalidateVenueAndRelatedEvents,
} = publicCacheInvalidator;
