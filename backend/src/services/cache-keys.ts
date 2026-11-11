import { createHash } from "node:crypto";

function normalize(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalize(entry)]),
    );
  }
  return value;
}

export const eventListVersionKey = "quickseats:events:version";

export function eventListCacheKey(version: number, query: unknown): string {
  const normalizedQuery = JSON.stringify(normalize(query));
  const hash = createHash("sha256").update(normalizedQuery).digest("hex");
  return `quickseats:events:${version}:${hash}`;
}

export function eventCacheKey(eventId: string): string {
  return `quickseats:event:${eventId}`;
}

export function venueCacheKey(venueId: string): string {
  return `quickseats:venue:${venueId}`;
}
