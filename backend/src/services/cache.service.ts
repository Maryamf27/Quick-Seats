export interface CacheBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete(keys: string[]): Promise<void>;
  increment(key: string): Promise<number>;
  consumeRateLimit(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }>;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  errors: number;
  writes: number;
  invalidations: number;
}

export class CacheService {
  private readonly inFlight = new Map<
    string,
    { generation: number; promise: Promise<unknown> }
  >();
  private readonly generations = new Map<string, number>();
  private readonly metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    errors: 0,
    writes: 0,
    invalidations: 0,
  };

  constructor(private readonly backend?: CacheBackend) {}

  async get<T>(key: string): Promise<T | null> {
    if (!this.backend) {
      this.metrics.misses += 1;
      return null;
    }

    try {
      const value = await this.backend.get(key);
      if (value === null) {
        this.metrics.misses += 1;
        return null;
      }

      const result: T = JSON.parse(value) as T;
      this.metrics.hits += 1;
      return result;
    } catch (error: unknown) {
      this.recordError("read", error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!this.backend) {
      return;
    }

    try {
      const serialized = JSON.stringify(value);
      if (serialized === undefined) {
        throw new TypeError("Cache values must be JSON serializable");
      }
      await this.backend.set(key, serialized, ttlSeconds);
      this.metrics.writes += 1;
    } catch (error: unknown) {
      this.recordError("write", error);
    }
  }

  async getOrLoad<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
    shouldCache: (value: T) => boolean = () => true,
  ): Promise<T> {
    const generation = this.generations.get(key) ?? 0;
    const cached = await this.get<T>(key);
    if (generation !== (this.generations.get(key) ?? 0)) {
      return this.getOrLoad(key, ttlSeconds, loader, shouldCache);
    }
    if (cached !== null) {
      return cached;
    }

    const pending = this.inFlight.get(key);
    if (pending?.generation === generation) {
      return pending.promise as Promise<T>;
    }

    const load = (async () => {
      const value = await loader();
      if (shouldCache(value) && generation === (this.generations.get(key) ?? 0)) {
        await this.set(key, value, ttlSeconds);
        if (generation !== (this.generations.get(key) ?? 0)) {
          await this.invalidate([key]);
        }
      }
      return value;
    })();
    const pendingLoad = { generation, promise: load };
    this.inFlight.set(key, pendingLoad);

    try {
      return await load;
    } finally {
      if (this.inFlight.get(key) === pendingLoad) {
        this.inFlight.delete(key);
      }
    }
  }

  async invalidate(keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }

    for (const key of keys) {
      this.generations.set(key, (this.generations.get(key) ?? 0) + 1);
    }
    if (!this.backend) {
      return;
    }

    try {
      await this.backend.delete(keys);
      this.metrics.invalidations += 1;
    } catch (error: unknown) {
      this.recordError("invalidation", error);
    }
  }

  async increment(key: string): Promise<number | null> {
    if (!this.backend) {
      return null;
    }

    try {
      const value = await this.backend.increment(key);
      this.metrics.invalidations += 1;
      return value;
    } catch (error: unknown) {
      this.recordError("invalidation", error);
      return null;
    }
  }

  async getCounter(key: string): Promise<number | null> {
    if (!this.backend) {
      this.metrics.misses += 1;
      return null;
    }

    try {
      const value = await this.backend.get(key);
      if (value === null) {
        return 0;
      }
      const counter = Number(value);
      if (!Number.isSafeInteger(counter) || counter < 0) {
        throw new TypeError("Invalid cache counter");
      }
      return counter;
    } catch (error: unknown) {
      this.recordError("read", error);
      return null;
    }
  }

  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  logMetrics(): void {
    console.info("QuickSeats cache metrics", this.getMetrics());
  }

  private recordError(operation: string, error: unknown): void {
    this.metrics.errors += 1;
    const errorType = error instanceof Error ? error.name : "UnknownError";
    console.error(`Cache ${operation} failed (${errorType})`);
  }
}
