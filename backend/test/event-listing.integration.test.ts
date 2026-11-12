import assert from "node:assert/strict";
import "dotenv/config";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import jwt from "jsonwebtoken";
import mongoose, { Types } from "mongoose";
import type { EventStatus } from "../src/types/domain.js";
import { getIsolatedMongoTestUri } from "./helpers/test-infrastructure.js";

const mongoUri = getIsolatedMongoTestUri(process.env.MONGODB_TEST_URI);
const integrationOptIn = process.env.RUN_INTEGRATION_TESTS === "1";
process.env.NODE_ENV ??= "test";
process.env.MONGODB_URI ??= mongoUri ?? "mongodb://127.0.0.1:27017/quickseats-test";
process.env.CLIENT_ORIGIN ??= "http://localhost:3000";
process.env.SOCKET_CORS_ORIGINS ??= "http://localhost:3000";
process.env.JWT_ACCESS_SECRET ??= "test-only-secret-that-is-long-enough-for-jwt-signing";
process.env.JWT_ACCESS_EXPIRES_IN ??= "1h";
process.env.INITIAL_ADMIN_NAME ??= "Test Admin";
process.env.INITIAL_ADMIN_EMAIL ??= "test-admin@example.test";
process.env.INITIAL_ADMIN_PASSWORD ??= "test-only-password";
process.env.STRIPE_SECRET_KEY ??= "sk_test_unit_test_secret_1234567890";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_unit_test_secret_1234567890";
process.env.STRIPE_CURRENCY ??= "usd";
process.env.STRIPE_CHECKOUT_SUCCESS_URL ??= "http://localhost:3000/booking/success";
process.env.STRIPE_CHECKOUT_CANCEL_URL ??= "http://localhost:3000/booking/cancel";

const [{ default: app }, { UserModel }, { EventModel }, { VenueModel }] = await Promise.all([
  import("../src/app.js"),
  import("../src/models/user.model.js"),
  import("../src/models/event.model.js"),
  import("../src/models/venue.model.js"),
]);

interface ListBody {
  success: boolean;
  message: string;
  data: {
    events: Array<{ _id: string; title: string; status: string; category: string }>;
    categories: string[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  };
}

test(
  "public event listing returns only published events; protected routes stay protected",
  {
    skip:
      !integrationOptIn || !mongoUri
        ? "Set RUN_INTEGRATION_TESTS=1 and MONGODB_TEST_URI to an isolated transaction-capable database"
        : false,
  },
  async () => {
    assert.ok(mongoUri);
    await mongoose.connect(mongoUri);

    const suffix = new Types.ObjectId().toString();
    // A unique category isolates this test from any other data in the database.
    const category = `Festival-${suffix}`;
    const otherCategory = `Concert-${suffix}`;
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const createdUserIds: Types.ObjectId[] = [];
    const createdVenueIds: Types.ObjectId[] = [];

    const request = async (
      method: string,
      path: string,
      options: { token?: string; body?: unknown } = {},
    ) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      return { status: response.status, body: (await response.json()) as never };
    };
    const list = async (query: string) => {
      const { status, body } = await request("GET", `/api/events?${query}`);
      assert.equal(status, 200, `GET /api/events?${query} should be public`);
      return body as ListBody;
    };

    try {
      const makeUser = async (role: "USER" | "ORGANIZER" | "ADMIN") => {
        const user = await UserModel.create({
          fullName: `Event Test ${role}`,
          email: `events-${role.toLowerCase()}-${suffix}@example.test`,
          passwordHash: "test-password-hash",
          role,
        });
        createdUserIds.push(user._id);
        const token = jwt.sign(
          { sub: user._id.toString(), role },
          process.env.JWT_ACCESS_SECRET as string,
          { expiresIn: "5m" },
        );
        return { user, token };
      };
      const organizer = await makeUser("ORGANIZER");
      const plainUser = await makeUser("USER");
      const venue = await VenueModel.create({
        name: `Events Test Venue ${suffix}`,
        address: {
          street: "1 Test Street",
          city: "Testville",
          state: "TS",
          country: "Testland",
          postalCode: "00000",
        },
        capacity: 100,
        sections: [{ name: "A", rows: 2, seatsPerRow: 5, seatCategory: "STANDARD", price: 10 }],
      });
      createdVenueIds.push(venue._id);

      const base = {
        description: "Integration test event",
        venueId: venue._id,
        organizerId: organizer.user._id,
      };
      const day = 24 * 60 * 60 * 1000;
      const start = Date.now() + 30 * day;
      const mk = (title: string, status: EventStatus, cat: string, offsetDays: number) => ({
        ...base,
        title,
        slug: `${title.toLowerCase().replace(/\s+/g, "-")}-${suffix}`,
        category: cat,
        status,
        startDate: new Date(start + offsetDays * day),
        endDate: new Date(start + offsetDays * day + 2 * 60 * 60 * 1000),
      });
      await EventModel.create([
        mk("Published A", "PUBLISHED", category, 1),
        mk("Published B", "PUBLISHED", category, 2),
        mk("Published C", "PUBLISHED", category, 3),
        mk("Draft D", "DRAFT", category, 4),
        mk("Published Other", "PUBLISHED", otherCategory, 5),
      ]);

      // 1 + 2: public access with the expected response structure.
      const all = await list(`category=${encodeURIComponent(category)}&page=1&limit=12`);
      assert.equal(all.success, true);
      assert.equal(all.message, "Events retrieved successfully");
      assert.deepEqual(all.data.pagination, { page: 1, limit: 12, total: 3, totalPages: 1 });
      assert.ok(all.data.categories.includes(category.toLowerCase()));
      assert.ok(all.data.categories.includes(otherCategory.toLowerCase()));

      // 3 + 4: published events are returned, drafts are not.
      assert.deepEqual(
        all.data.events.map((event) => event.title),
        ["Published A", "Published B", "Published C"],
      );
      assert.ok(all.data.events.every((event) => event.status === "PUBLISHED"));

      // 5: category filtering (case-insensitive, other categories excluded).
      const upper = await list(`category=${encodeURIComponent(category.toUpperCase())}`);
      assert.equal(upper.data.pagination.total, 3);
      const other = await list(`category=${encodeURIComponent(otherCategory)}`);
      assert.deepEqual(other.data.events.map((event) => event.title), ["Published Other"]);

      // 6: pagination.
      const page1 = await list(`category=${encodeURIComponent(category)}&page=1&limit=2`);
      const page2 = await list(`category=${encodeURIComponent(category)}&page=2&limit=2`);
      assert.deepEqual(page1.data.events.map((event) => event.title), ["Published A", "Published B"]);
      assert.deepEqual(page2.data.events.map((event) => event.title), ["Published C"]);
      assert.equal(page1.data.pagination.totalPages, 2);

      // 7: sorting.
      const desc = await list(
        `category=${encodeURIComponent(category)}&sortBy=startDate&order=desc`,
      );
      assert.deepEqual(
        desc.data.events.map((event) => event.title),
        ["Published C", "Published B", "Published A"],
      );

      // Draft events are not publicly retrievable by id either.
      const draft = await EventModel.findOne({ title: "Draft D", category: category.toLowerCase() });
      assert.ok(draft);
      assert.equal((await request("GET", `/api/events/${draft._id.toString()}`)).status, 404);

      // 8 + 9: creation requires authentication and a privileged role.
      const createBody = {
        title: `Created ${suffix}`,
        description: "Created through the API",
        category,
        venueId: venue._id.toString(),
        startDate: new Date(start + 10 * day).toISOString(),
        endDate: new Date(start + 10 * day + 3_600_000).toISOString(),
      };
      assert.equal((await request("POST", "/api/events", { body: createBody })).status, 401);
      assert.equal(
        (await request("POST", "/api/events", { token: plainUser.token, body: createBody })).status,
        403,
      );

      // 10 + publication workflow: organizer creates a DRAFT, it stays hidden until published.
      const created = await request("POST", "/api/events", {
        token: organizer.token,
        body: createBody,
      });
      assert.equal(created.status, 201);
      const createdEvent = (created.body as { data: { _id: string; status: string } }).data;
      assert.equal(createdEvent.status, "DRAFT");
      assert.equal((await list(`category=${encodeURIComponent(category)}`)).data.pagination.total, 3);

      assert.equal(
        (
          await request("PUT", `/api/events/${createdEvent._id}`, {
            token: plainUser.token,
            body: { status: "PUBLISHED" },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await request("PUT", `/api/events/${createdEvent._id}`, {
            body: { status: "PUBLISHED" },
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await request("PUT", `/api/events/${createdEvent._id}`, {
            token: organizer.token,
            body: { status: "PUBLISHED" },
          })
        ).status,
        200,
      );
      assert.equal((await list(`category=${encodeURIComponent(category)}`)).data.pagination.total, 4);
    } finally {
      await EventModel.deleteMany({ slug: new RegExp(`${suffix}$`) });
      await EventModel.deleteMany({ category: { $in: [category.toLowerCase(), otherCategory.toLowerCase()] } });
      await UserModel.deleteMany({ _id: { $in: createdUserIds } });
      await VenueModel.deleteMany({ _id: { $in: createdVenueIds } });
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await mongoose.disconnect();
    }
  },
);
