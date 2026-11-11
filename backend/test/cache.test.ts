import assert from "node:assert/strict";
import test from "node:test";
import {
  CacheService,
  type CacheBackend,
} from "../src/services/cache.service.js";
import {
  eventCacheKey,
  eventListCacheKey,
  eventListVersionKey,
  venueCacheKey,
} from "../src/services/cache-keys.js";
import { createPublicCacheInvalidator } from "../src/services/public-cache-invalidation.service.js";

class MemoryCacheBackend implements CacheBackend {
  private readonly values = new Map<string, { value: string; expiresAt: number }>();
  private readonly counters = new Map<string, number>();
  now = 0;
  failReads = false;
  failWrites = false;
  readonly deletedKeys: string[] = [];

  async get(key: string): Promise<string | null> {
    if (this.failReads) {
      throw new Error("backend unavailable");
    }
    const entry = this.values.get(key);
    if (!entry || entry.expiresAt <= this.now) {
      this.values.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.failWrites) {
      throw new Error("backend unavailable");
    }
    this.values.set(key, { value, expiresAt: this.now + ttlSeconds * 1000 });
  }

  async delete(keys: string[]): Promise<void> {
    this.deletedKeys.push(...keys);
    for (const key of keys) {
      this.values.delete(key);
    }
  }

  async increment(key: string): Promise<number> {
    const value = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, value);
    return value;
  }

  async consumeRateLimit(key: string, windowMs: number) {
    const value = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, value);
    return { count: value, ttlMs: windowMs };
  }
}

test("cache-aside stores a miss and serves the next request as a hit", async () => {
  const backend = new MemoryCacheBackend();
  const cache = new CacheService(backend);
  let loads = 0;

  const loader = async () => {
    loads += 1;
    return { title: "Live event" };
  };
  assert.deepEqual(await cache.getOrLoad("quickseats:event:one", 10, loader), {
    title: "Live event",
  });
  assert.deepEqual(await cache.getOrLoad("quickseats:event:one", 10, loader), {
    title: "Live event",
  });
  assert.equal(loads, 1);
  assert.deepEqual(cache.getMetrics(), {
    hits: 1,
    misses: 1,
    errors: 0,
    writes: 1,
    invalidations: 0,
  });
});

test("concurrent misses for one key share a single loader", async () => {
  const cache = new CacheService(new MemoryCacheBackend());
  let loads = 0;
  let releaseLoad: ((value: string) => void) | undefined;
  const loader = () => {
    loads += 1;
    return new Promise<string>((resolve) => {
      releaseLoad = resolve;
    });
  };

  const first = cache.getOrLoad("quickseats:event:popular", 10, loader);
  const second = cache.getOrLoad("quickseats:event:popular", 10, loader);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(loads, 1);
  releaseLoad?.("event");
  assert.deepEqual(await Promise.all([first, second]), ["event", "event"]);
});

test("invalidation prevents an in-flight stale load from repopulating the cache", async () => {
  const backend = new MemoryCacheBackend();
  const cache = new CacheService(backend);
  let releaseLoad: ((value: string) => void) | undefined;
  const oldRequest = cache.getOrLoad(
    "quickseats:event:changed",
    10,
    () => new Promise<string>((resolve) => {
      releaseLoad = resolve;
    }),
  );
  await new Promise((resolve) => setImmediate(resolve));
  await cache.invalidate(["quickseats:event:changed"]);
  releaseLoad?.("stale");
  await oldRequest;

  assert.equal(
    await cache.getOrLoad("quickseats:event:changed", 10, async () => "fresh"),
    "fresh",
  );
  assert.equal(cache.getMetrics().writes, 1);
});

test("expired values are loaded again", async () => {
  const backend = new MemoryCacheBackend();
  const cache = new CacheService(backend);
  let loads = 0;
  const loader = async () => ++loads;

  assert.equal(await cache.getOrLoad("quickseats:event:expires", 1, loader), 1);
  backend.now = 1001;
  assert.equal(await cache.getOrLoad("quickseats:event:expires", 1, loader), 2);
  assert.equal(loads, 2);
});

test("cache errors fall back to the database loader", async () => {
  const backend = new MemoryCacheBackend();
  backend.failReads = true;
  const cache = new CacheService(backend);
  let loads = 0;

  assert.equal(
    await cache.getOrLoad("quickseats:event:fallback", 1, async () => ++loads),
    1,
  );
  assert.equal(loads, 1);
  assert.equal(cache.getMetrics().errors, 1);
});

test("Redis write failures do not fail a successful database read", async () => {
  const backend = new MemoryCacheBackend();
  backend.failWrites = true;
  const cache = new CacheService(backend);

  assert.equal(
    await cache.getOrLoad("quickseats:event:write-error", 1, async () => "database"),
    "database",
  );
  assert.equal(cache.getMetrics().errors, 1);
});

test("failed loaders are not cached", async () => {
  const cache = new CacheService(new MemoryCacheBackend());
  let loads = 0;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(
      cache.getOrLoad("quickseats:event:error", 10, async () => {
        loads += 1;
        throw new Error("database failure");
      }),
      /database failure/,
    );
  }
  assert.equal(loads, 2);
});

test("cache keys separate query values and normalize object property order", () => {
  assert.equal(
    eventListCacheKey(4, { page: 1, filters: { city: "London", category: "music" } }),
    eventListCacheKey(4, { filters: { category: "music", city: "London" }, page: 1 }),
  );
  assert.notEqual(
    eventListCacheKey(4, { page: 1, category: "music" }),
    eventListCacheKey(4, { page: 2, category: "music" }),
  );
  assert.notEqual(eventListCacheKey(4, { page: 1 }), eventListCacheKey(5, { page: 1 }));
  assert.equal(eventCacheKey("event-1"), "quickseats:event:event-1");
  assert.equal(venueCacheKey("venue-1"), "quickseats:venue:venue-1");
});

test("invalidation removes cache keys and counts successful invalidation", async () => {
  const backend = new MemoryCacheBackend();
  const cache = new CacheService(backend);
  await cache.invalidate(["quickseats:event:deleted"]);
  assert.deepEqual(backend.deletedKeys, ["quickseats:event:deleted"]);
  assert.equal(cache.getMetrics().invalidations, 1);
});

test("event updates and deletions invalidate detail and listing generations", async () => {
  const deletedKeys: string[][] = [];
  const incrementedKeys: string[] = [];
  const invalidator = createPublicCacheInvalidator(
    {
      async invalidate(keys) {
        deletedKeys.push(keys);
      },
      async increment(key) {
        incrementedKeys.push(key);
        return incrementedKeys.length;
      },
    },
    async () => [],
  );

  await invalidator.invalidateEventCache("event-42");
  await invalidator.invalidateEventCache("event-42");
  assert.deepEqual(deletedKeys, [
    ["quickseats:event:event-42"],
    ["quickseats:event:event-42"],
  ]);
  assert.deepEqual(incrementedKeys, [eventListVersionKey, eventListVersionKey]);
});

test("venue updates invalidate venue, related event details, and listings", async () => {
  const deletedKeys: string[][] = [];
  const incrementedKeys: string[] = [];
  let queriedVenue = "";
  const invalidator = createPublicCacheInvalidator(
    {
      async invalidate(keys) {
        deletedKeys.push(keys);
      },
      async increment(key) {
        incrementedKeys.push(key);
        return incrementedKeys.length;
      },
    },
    async (venueId) => {
      queriedVenue = venueId;
      return ["event-1", "event-2"];
    },
  );

  await invalidator.invalidateVenueAndRelatedEvents("venue-9");
  assert.equal(queriedVenue, "venue-9");
  assert.deepEqual(deletedKeys, [
    ["quickseats:venue:venue-9"],
    ["quickseats:event:event-1", "quickseats:event:event-2"],
  ]);
  assert.deepEqual(incrementedKeys, [eventListVersionKey]);
});
