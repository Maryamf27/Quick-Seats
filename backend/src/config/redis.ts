import { createClient } from "redis";
import { env } from "./env.js";
import { CacheService, type CacheBackend } from "../services/cache.service.js";

const client = env.REDIS_URL
  ? createClient({
      url: env.REDIS_URL,
      disableOfflineQueue: true,
      socket: {
        reconnectStrategy: (retries) => Math.min(250 * 2 ** Math.min(retries, 4), 5000),
      },
    })
  : undefined;
const notificationClient = env.BULLMQ_REDIS_URL || env.REDIS_URL
  ? createClient({
      url: env.BULLMQ_REDIS_URL ?? env.REDIS_URL,
      disableOfflineQueue: true,
      socket: {
        reconnectStrategy: (retries) => Math.min(250 * 2 ** Math.min(retries, 4), 5000),
      },
    })
  : undefined;

for (const [redisClient, clientName] of [
  [client, "Redis"],
  [notificationClient, "Redis notification"],
] as const) {
  if (redisClient) {
    redisClient.on("error", (error: Error) => {
      const errorType = error instanceof Error ? error.name : "UnknownError";
      console.error(`${clientName} client error (${errorType})`);
    });
    redisClient.on("ready", () => {
      console.info(`${clientName} connected`);
    });
    redisClient.on("reconnecting", () => {
      console.warn(`${clientName} reconnecting`);
    });
  }
}

const backend: CacheBackend | undefined = client
  ? {
      async get(key) {
        if (!client.isReady) {
          throw new Error("Redis is not ready");
        }
        return client.get(key);
      },
      async set(key, value, ttlSeconds) {
        if (!client.isReady) {
          throw new Error("Redis is not ready");
        }
        await client.set(key, value, { EX: ttlSeconds });
      },
      async delete(keys) {
        if (!client.isReady) {
          throw new Error("Redis is not ready");
        }
        await client.del(keys);
      },
      async increment(key) {
        if (!client.isReady) {
          throw new Error("Redis is not ready");
        }
        return client.incr(key);
      },
      async consumeRateLimit(key, windowMs) {
        if (!client.isReady) {
          throw new Error("Redis is not ready");
        }
        const result: unknown = await client.sendCommand([
          "EVAL",
          "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; return {count, redis.call('PTTL', KEYS[1])}",
          "1",
          key,
          String(windowMs),
        ]);
        if (
          !Array.isArray(result) ||
          typeof result[0] !== "number" ||
          typeof result[1] !== "number"
        ) {
          throw new TypeError("Redis returned an invalid rate-limit result");
        }
        return { count: result[0], ttlMs: Math.max(0, result[1]) };
      },
    }
  : undefined;

export const cache = new CacheService(backend);
export const rateLimitStore = backend;

export function getRedisReadiness(): {
  cache: "connected" | "disconnected" | "not_configured";
  notifications: "connected" | "disconnected" | "not_configured";
} {
  return {
    cache: !env.REDIS_URL
      ? "not_configured"
      : client?.isReady
        ? "connected"
        : "disconnected",
    notifications: !env.BULLMQ_REDIS_URL
      ? "not_configured"
      : notificationClient?.isReady
        ? "connected"
        : "disconnected",
  };
}
const SEAT_NOTIFICATION_CHANNEL = "quickseats:socket:seat-updates";

export async function publishSeatNotification(message: unknown): Promise<number> {
  if (!notificationClient?.isReady) {
    throw new Error("Redis notification connection is unavailable");
  }
  const serialized = JSON.stringify(message);
  if (serialized === undefined) {
    throw new TypeError("Socket notification is not serializable");
  }
  return notificationClient.publish(SEAT_NOTIFICATION_CHANNEL, serialized);
}

export async function subscribeSeatNotifications(
  handler: (message: string) => void,
): Promise<(() => Promise<void>) | undefined> {
  if (!notificationClient) {
    console.warn("Socket notification subscriber unavailable; configure REDIS_URL or BULLMQ_REDIS_URL");
    return undefined;
  }

  const subscriber = notificationClient.duplicate();
  let subscribed = false;
  let closed = false;
  subscriber.on("error", (error: Error) => {
    const errorType = error instanceof Error ? error.name : "UnknownError";
    console.error(`Socket notification Redis error (${errorType})`);
  });

  const subscribe = () => {
    if (closed || subscribed) {
      return;
    }
    void subscriber.subscribe(SEAT_NOTIFICATION_CHANNEL, handler).then(() => {
      subscribed = true;
    }).catch((error: unknown) => {
      const errorType = error instanceof Error ? error.name : "UnknownError";
      console.error(`Socket notification subscription failed (${errorType})`);
    });
  };
  subscriber.on("ready", subscribe);
  if (!subscriber.isOpen) {
    void subscriber.connect().catch((error: unknown) => {
      const errorType = error instanceof Error ? error.name : "UnknownError";
      console.error(`Socket notification initial connection failed (${errorType})`);
    });
  }
  if (subscriber.isReady) {
    subscribe();
  }

  return async () => {
    closed = true;
    subscriber.off("ready", subscribe);
    if (subscriber.isOpen) {
      if (subscribed && subscriber.isReady) {
        await subscriber.unsubscribe(SEAT_NOTIFICATION_CHANNEL);
      }
      if (subscriber.isReady) {
        await subscriber.quit();
      } else {
        await subscriber.disconnect();
      }
    }
  };
}

export async function connectRedis(): Promise<void> {
  const clients = [client, notificationClient].filter(
    (redisClient): redisClient is NonNullable<typeof redisClient> => redisClient !== undefined,
  );
  if (clients.length === 0) {
    console.warn("REDIS_URL is not configured; cache is disabled");
    return;
  }
  await Promise.all(
    clients.map(async (redisClient) => {
      if (redisClient.isReady) {
        return;
      }

      const ready = new Promise<boolean>((resolve) => {
        const onReady = () => {
          clearTimeout(timeout);
          redisClient.off("ready", onReady);
          resolve(true);
        };
        const timeout = setTimeout(() => {
          redisClient.off("ready", onReady);
          resolve(false);
        }, 2000);
        timeout.unref();
        redisClient.once("ready", onReady);
      });

      if (!redisClient.isOpen) {
        void redisClient.connect().catch((error: unknown) => {
          const errorType = error instanceof Error ? error.name : "UnknownError";
          console.error(`Redis initial connection failed (${errorType})`);
        });
      }

      if (!(await ready)) {
        console.warn("Redis is unavailable; continuing without cache");
      }
    }),
  );
}

export async function closeRedis(): Promise<void> {
  for (const redisClient of new Set([client, notificationClient])) {
    if (!redisClient?.isOpen) {
      continue;
    }
    try {
      if (redisClient.isReady) {
        await redisClient.quit();
      } else {
        await redisClient.disconnect();
      }
    } catch (error: unknown) {
      const errorType = error instanceof Error ? error.name : "UnknownError";
      console.error(`Redis shutdown failed (${errorType})`);
    }
  }
}
