import type { EventRecord, EventVenueSummary } from "@/lib/api/types";

export function safeImageUrl(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Stable hue per category so posters without an image still look intentional. */
export function categoryHue(category: string): number {
  let hash = 0;
  for (const char of category.toLowerCase()) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }
  return hash;
}

export function fallbackBackground(category: string): string {
  const hue = categoryHue(category);
  return `linear-gradient(145deg, hsl(${hue} 70% 42%) 0%, hsl(${(hue + 50) % 360} 65% 24%) 100%)`;
}

export function getVenue(venue: EventRecord["venueId"]): EventVenueSummary | null {
  return typeof venue === "object" && venue !== null ? venue : null;
}

export function shortDate(value: string): { month: string; day: string } | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    month: new Intl.DateTimeFormat("en", { month: "short" }).format(date).toUpperCase(),
    day: String(date.getDate()),
  };
}

export function longDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date to be announced";
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
