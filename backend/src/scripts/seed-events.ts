import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { env } from "../config/env.js";
import { EventModel } from "../models/event.model.js";
import { SeatModel } from "../models/seat.model.js";
import { UserModel } from "../models/user.model.js";
import { VenueModel } from "../models/venue.model.js";
import { invalidateEventListings } from "../services/public-cache-invalidation.service.js";
import { generateSeatsForEvent } from "../services/seat-generation.service.js";

const image = (photoId: string) =>
  `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=1600&q=82`;

const venues = [
  {
    key: "karachi-bayview",
    name: "Bayview Live Hall",
    description: "A configurable demo event venue in Karachi.",
    address: { street: "Sea View Road", city: "Karachi", state: "Sindh", country: "Pakistan", postalCode: "75600" },
  },
  {
    key: "karachi-creek",
    name: "Creekside Convention Centre",
    description: "A configurable demo conference and exhibition venue in Karachi.",
    address: { street: "Korangi Creek Road", city: "Karachi", state: "Sindh", country: "Pakistan", postalCode: "75190" },
  },
  {
    key: "lahore-garden",
    name: "Garden City Pavilion",
    description: "A configurable demo cultural venue in Lahore.",
    address: { street: "Jail Road", city: "Lahore", state: "Punjab", country: "Pakistan", postalCode: "54000" },
  },
  {
    key: "lahore-liberty",
    name: "Liberty Sports Arena",
    description: "A configurable demo sports venue in Lahore.",
    address: { street: "Main Boulevard Gulberg", city: "Lahore", state: "Punjab", country: "Pakistan", postalCode: "54660" },
  },
  {
    key: "islamabad-margalla",
    name: "Margalla Conference Hall",
    description: "A configurable demo conference venue in Islamabad.",
    address: { street: "Constitution Avenue", city: "Islamabad", state: "Islamabad Capital Territory", country: "Pakistan", postalCode: "44000" },
  },
] as const;

const venueSections = [
  { name: "Standard", rows: 6, seatsPerRow: 10, seatCategory: "STANDARD" as const, price: 2500 },
  { name: "Premium", rows: 3, seatsPerRow: 10, seatCategory: "PREMIUM" as const, price: 4500 },
  { name: "VIP", rows: 1, seatsPerRow: 10, seatCategory: "VIP" as const, price: 8000 },
];

const events = [
  { slug: "demo-strings-after-sunset", title: "Strings After Sunset", category: "music", venue: "karachi-bayview", days: 21, hour: 19, photo: "photo-1514525253161-7a46d19cd819", description: "An open-air evening of acoustic sets, contemporary folk, and new local performers." },
  { slug: "demo-karachi-indie-live", title: "Karachi Indie Live", category: "music", venue: "karachi-bayview", days: 35, hour: 20, photo: "photo-1470229722913-7c0e2dbbafd3", description: "A full-night live music programme featuring independent bands and electronic artists." },
  { slug: "demo-coastal-summer-festival", title: "Coastal Summer Festival", category: "festival", venue: "karachi-bayview", days: 49, hour: 16, photo: "photo-1492684223066-81342ee5ff30", description: "A day-long gathering with live performances, local makers, food stalls, and family activities." },
  { slug: "demo-city-football-final", title: "City Football Championship Final", category: "sports", venue: "lahore-liberty", days: 28, hour: 18, photo: "photo-1522778119026-d647f0596c20", description: "A competitive city final with pre-match commentary and supporters’ activities." },
  { slug: "demo-basketball-night", title: "Basketball Under the Lights", category: "sports", venue: "lahore-liberty", days: 56, hour: 19, photo: "photo-1546519638-68e109498ffc", description: "An evening tournament showcasing regional basketball clubs and emerging players." },
  { slug: "demo-cricket-t20", title: "Cricket Legends T20", category: "sports", venue: "lahore-liberty", days: 77, hour: 18, photo: "photo-1522778119026-d647f0596c20", description: "A fast-paced exhibition match with local teams, family seating, and an evening presentation." },
  { slug: "demo-pakistan-developer-summit", title: "Pakistan Developer Summit", category: "technology", venue: "karachi-creek", days: 42, hour: 9, photo: "photo-1540575467063-178a50c2df87", description: "A one-day programme of software engineering talks, practical sessions, and community discussion." },
  { slug: "demo-applied-ai-forum", title: "Applied AI Forum", category: "technology", venue: "islamabad-margalla", days: 63, hour: 10, photo: "photo-1504384308090-c894fdcc538d", description: "Researchers and practitioners share applied machine learning case studies and responsible deployment lessons." },
  { slug: "demo-startup-founders-meetup", title: "Startup Founders Meetup", category: "networking", venue: "karachi-creek", days: 30, hour: 17, photo: "photo-1517245386807-bb43f82c33c4", description: "A facilitated evening for early-stage founders to meet peers, compare notes, and share practical lessons." },
  { slug: "demo-leadership-forum", title: "Women in Leadership Forum", category: "business", venue: "islamabad-margalla", days: 70, hour: 9, photo: "photo-1556761175-5973dc0f32e7", description: "A day of panels and small-group conversations on leadership, teams, and building sustainable organisations." },
  { slug: "demo-lahore-food-carnival", title: "Lahore Food Carnival", category: "food", venue: "lahore-garden", days: 25, hour: 15, photo: "photo-1576124568433-c2bdf03c6bbc", description: "A relaxed afternoon featuring local food vendors, regional favourites, and live cooking demonstrations." },
  { slug: "demo-street-food-evening", title: "Street Food Evening", category: "food", venue: "karachi-bayview", days: 52, hour: 17, photo: "photo-1555939594-58d7cb561ad1", description: "A curated selection of street-food stalls and neighbourhood kitchens, with seating and live music." },
  { slug: "demo-contemporary-art-weekend", title: "Contemporary Art Weekend", category: "arts", venue: "lahore-garden", days: 84, hour: 11, photo: "photo-1524014482380-0988169f598d", description: "A weekend exhibition of contemporary work, artist conversations, and guided gallery visits." },
  { slug: "demo-old-city-photowalk", title: "Old City Photowalk", category: "photography", venue: "lahore-garden", days: 38, hour: 8, photo: "photo-1576530835964-0eb6fd964528", description: "A small-group street photography walk focused on composition, light, and respectful documentary practice." },
  { slug: "demo-portrait-photography-lab", title: "Portrait Photography Lab", category: "workshop", venue: "karachi-creek", days: 91, hour: 10, photo: "photo-1516321318423-f06f85e504b3", description: "A hands-on portrait session covering natural light, simple setups, and giving clear direction to subjects." },
  { slug: "demo-creative-coding-workshop", title: "Creative Coding Workshop", category: "workshop", venue: "islamabad-margalla", days: 105, hour: 10, photo: "photo-1504384308090-c894fdcc538d", description: "A practical introduction to generative visuals and interactive sketches for curious beginners." },
  { slug: "demo-theatre-last-monsoon", title: "The Last Monsoon", category: "theatre", venue: "lahore-garden", days: 45, hour: 19, photo: "photo-1747155827987-5e78499b3830", description: "An original theatre production about family, memory, and the changing seasons of city life." },
  { slug: "demo-urdu-theatre-revival", title: "Urdu Theatre Revival", category: "theatre", venue: "karachi-bayview", days: 112, hour: 19, photo: "photo-1747155827987-5e78499b3830", description: "A staged reading and performance programme celebrating contemporary Urdu drama and new writing." },
  { slug: "demo-makers-weekend", title: "Makers and Makerspaces Weekend", category: "festival", venue: "islamabad-margalla", days: 126, hour: 11, photo: "photo-1517245386807-bb43f82c33c4", description: "Local makers demonstrate craft, design, and small-scale fabrication through talks and hands-on exhibits." },
  { slug: "demo-food-and-culture-fair", title: "Food and Culture Fair", category: "festival", venue: "lahore-garden", days: 140, hour: 12, photo: "photo-1576124568433-c2bdf03c6bbc", description: "A community fair bringing together regional food, music, crafts, and cultural demonstrations." },
] as const;

function eventDate(daysFromNow: number, hourUtc: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  date.setUTCHours(hourUtc, 0, 0, 0);
  return date;
}

async function getOrCreateVenues() {
  const result = new Map<string, { id: mongoose.Types.ObjectId; expectedSeatCount: number }>();
  for (const venue of venues) {
    let record = await VenueModel.findOne({ name: venue.name, "address.city": venue.address.city }).exec();
    if (!record) {
      record = await VenueModel.create({
        name: venue.name,
        description: venue.description,
        address: venue.address,
        capacity: 100,
        sections: venueSections,
      });
    }
    result.set(venue.key, {
      id: record._id,
      expectedSeatCount: record.sections.reduce((count, section) => count + section.rows * section.seatsPerRow, 0),
    });
  }
  return result;
}

async function seedEvents(): Promise<void> {
  if (env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo events in production");
  }
  const configuredDatabase = new URL(env.MONGODB_URI).pathname.split("/").filter(Boolean)[0];
  if (!configuredDatabase || configuredDatabase.toLowerCase() === "admin") {
    throw new Error("Set MONGODB_URI to an explicitly named non-production database before seeding demo events");
  }
  const posterUrls = [...new Set(events.map((seed) => image(seed.photo)))];
  await Promise.all(posterUrls.map(async (url) => {
    const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(15_000) });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.toLowerCase().startsWith("image/")) {
      throw new Error(`Poster URL failed image check (${response.status}): ${url}`);
    }
  }));
  await connectDatabase();
  try {
    const organizer = await UserModel.findOne({ role: "ORGANIZER" }).sort({ createdAt: 1 }).select("_id").lean().exec();
    if (!organizer) {
      throw new Error("Create or approve an organizer account before running the event seed");
    }

    const venueIds = await getOrCreateVenues();
    let created = 0;
    let seatsGenerated = 0;
    for (const seed of events) {
      const venue = venueIds.get(seed.venue);
      if (!venue) throw new Error(`Venue configuration missing for ${seed.slug}`);
      const existing = await EventModel.findOne({ slug: seed.slug }).exec();
      if (existing && !existing.organizerId.equals(organizer._id)) {
        throw new Error(`Seed slug ${seed.slug} already belongs to another organizer`);
      }
      const startDate = eventDate(seed.days, seed.hour);
      const event = existing ?? await EventModel.create({
        title: seed.title,
        slug: seed.slug,
        description: seed.description,
        category: seed.category,
        venueId: venue.id,
        organizerId: organizer._id,
        startDate,
        endDate: new Date(startDate.getTime() + 3 * 60 * 60 * 1000),
        status: "PUBLISHED",
        posterUrl: image(seed.photo),
      });
      if (!existing) created += 1;

      const seatCount = await SeatModel.countDocuments({ eventId: event._id }).exec();
      const expectedSeatCount = venue.expectedSeatCount;
      if (seatCount === 0) {
        await generateSeatsForEvent(event._id.toString(), organizer._id.toString(), "ORGANIZER");
        seatsGenerated += 1;
      } else if (seatCount !== expectedSeatCount) {
        throw new Error(`Seed event ${seed.slug} has ${seatCount} seats; expected ${expectedSeatCount}. Existing seat data was left untouched.`);
      }
    }
    await invalidateEventListings();
    const slugs = events.map((seed) => seed.slug);
    const seeded = await EventModel.find({ slug: { $in: slugs } }).select("slug category status startDate posterUrl").lean().exec();
    const seededSlugs = new Set(seeded.map((event) => event.slug));
    if (seeded.length !== events.length || events.some((seed) => !seededSlugs.has(seed.slug))) {
      throw new Error(`Expected ${events.length} unique seeded events, found ${seeded.length}`);
    }
    if (seeded.some((event) => event.status !== "PUBLISHED" || event.startDate <= new Date() || !event.category || !event.posterUrl)) {
      throw new Error("Seed verification failed: every event must be published, future-dated, categorized, and have a poster URL");
    }
    const categories = [...new Set(seeded.map((event) => event.category))].sort();
    console.info(`Verified ${seeded.length} published future events across ${categories.length} categories: ${categories.join(", ")}.`);
    console.info(`Created ${created} events and generated seats for ${seatsGenerated} events in this run.`);
  } finally {
    await mongoose.disconnect();
  }
}

void seedEvents().catch((error: unknown) => {
  const errorType = error instanceof Error ? error.message : "Unknown error";
  console.error(`Event seeding failed: ${errorType}`);
  process.exitCode = 1;
});
