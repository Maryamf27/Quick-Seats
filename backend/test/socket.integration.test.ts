import assert from "node:assert/strict";
import { createServer, type Server as HttpServer } from "node:http";
import { after, test } from "node:test";
import "dotenv/config";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import mongoose, { Types } from "mongoose";
import Stripe from "stripe";
import {
  io as createClient,
  type Socket as SocketClient,
} from "socket.io-client";
import type {
  ClientToServerEvents,
  SeatUpdatePayload,
  ServerToClientEvents,
} from "../src/sockets/socket.types.js";
import {
  getIsolatedMongoTestUri,
  getLocalRedisTestUrl,
} from "./helpers/test-infrastructure.js";

const mongoUri = getIsolatedMongoTestUri(process.env.MONGODB_TEST_URI);
const redisTestUrl = getLocalRedisTestUrl(process.env.REDIS_TEST_URL);
const integrationOptIn = process.env.RUN_INTEGRATION_TESTS === "1";
process.env.NODE_ENV = "test";
process.env.MONGODB_URI = mongoUri ?? "mongodb://127.0.0.1:27017/quickseats-test";
process.env.REDIS_URL = redisTestUrl ?? "redis://127.0.0.1:6379/0";
process.env.BULLMQ_REDIS_URL = process.env.BULLMQ_REDIS_TEST_URL ?? process.env.REDIS_URL;
process.env.CLIENT_ORIGIN = "http://localhost:3000";
process.env.SOCKET_CORS_ORIGINS = "http://localhost:3000";
process.env.JWT_ACCESS_SECRET = "test-only-secret-that-is-long-enough-for-jwt-signing";
process.env.JWT_ACCESS_EXPIRES_IN = "1h";
process.env.INITIAL_ADMIN_NAME = "Test Admin";
process.env.INITIAL_ADMIN_EMAIL = "test-admin@example.test";
process.env.INITIAL_ADMIN_PASSWORD = "test-only-password";
process.env.STRIPE_SECRET_KEY ??= "sk_test_unit_test_secret_1234567890";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_unit_test_secret_1234567890";
process.env.STRIPE_CURRENCY ??= "pkr";
process.env.STRIPE_CHECKOUT_SUCCESS_URL ??= "http://localhost:3000/booking/success";
process.env.STRIPE_CHECKOUT_CANCEL_URL ??= "http://localhost:3000/booking/cancel";

const [
  { default: app },
  { env },
  { EventModel },
  { SeatModel },
  { UserModel },
  { BookingModel },
  { PaymentEventModel },
  { stripe },
  { connectRedis, closeRedis },
  { clearExpiredSeatHolds },
  { closeSocketServer, createSocketServer },
] =
  await Promise.all([
    import("../src/app.js"),
    import("../src/config/env.js"),
    import("../src/models/event.model.js"),
    import("../src/models/seat.model.js"),
    import("../src/models/user.model.js"),
    import("../src/models/booking.model.js"),
    import("../src/models/payment-event.model.js"),
    import("../src/config/stripe.js"),
    import("../src/config/redis.js"),
    import("../src/services/seat-expiration.service.js"),
    import("../src/sockets/socket.server.js"),
  ]);

type ClientSocket = SocketClient<ServerToClientEvents, ClientToServerEvents>;
const clients: ClientSocket[] = [];
const userIds: Types.ObjectId[] = [];
const eventIds: Types.ObjectId[] = [];
const seatIds: Types.ObjectId[] = [];
let httpServer: HttpServer | undefined;
let socketServer: ReturnType<typeof createSocketServer> | undefined;
let connectedDatabase = false;
let connectedRedis = false;

function connectClient(
  url: string,
  token?: string,
): Promise<ClientSocket> {
  const client = createClient(url, {
    auth: token ? { token } : {},
    transports: ["websocket"],
    reconnection: false,
  }) as ClientSocket;
  clients.push(client);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.close();
      reject(new Error("Timed out connecting test socket"));
    }, 5000);
    client.once("connect", () => {
      clearTimeout(timeout);
      resolve(client);
    });
    client.once("connect_error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function expectConnectionRejected(url: string, token: string): Promise<void> {
  const client = createClient(url, {
    auth: { token },
    transports: ["websocket"],
    reconnection: false,
  }) as ClientSocket;

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Socket auth check timed out")), 5000);
      client.once("connect", () => {
        clearTimeout(timeout);
        reject(new Error("Invalid token unexpectedly connected"));
      });
      client.once("connect_error", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  } finally {
    client.close();
  }
}

function joinEvent(client: ClientSocket, eventId: string): Promise<{
  success: boolean;
  eventId?: string;
  error?: string;
}> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out joining event room")), 5000);
    client.emit("event:join", { eventId }, (response) => {
      clearTimeout(timeout);
      resolve(response);
    });
  });
}

function leaveEvent(client: ClientSocket, eventId: string): Promise<{
  success: boolean;
  eventId?: string;
  error?: string;
}> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out leaving event room")), 5000);
    client.emit("event:leave", { eventId }, (response) => {
      clearTimeout(timeout);
      resolve(response);
    });
  });
}

function waitForSeatEvent(
  client: ClientSocket,
  eventName: "seat:held" | "seat:released" | "seat:expired" | "seat:booked",
): Promise<SeatUpdatePayload> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.off(eventName, onEvent);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, 5000);
    const onEvent = (payload: SeatUpdatePayload) => {
      clearTimeout(timeout);
      resolve(payload);
    };
    client.once(eventName, onEvent);
  });
}

async function expectNoSeatEvent(
  client: ClientSocket,
  eventName: "seat:held" | "seat:released" | "seat:expired" | "seat:booked",
  durationMs = 150,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onEvent = () => {
      clearTimeout(timeout);
      reject(new Error(`Unexpected ${eventName} event`));
    };
    const timeout = setTimeout(() => {
      client.off(eventName, onEvent);
      resolve();
    }, durationMs);
    client.once(eventName, onEvent);
  });
}

function makeStripeEventRequest(
  url: string,
  event: Record<string, unknown>,
): Promise<Response> {
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac("sha256", env.STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  return fetch(`${url}/api/payments/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": `t=${timestamp},v1=${signature}`,
    },
    body,
  });
}

test("Socket.io and Express use the same HTTP server", async () => {
  const server = createServer(app);
  const io = createSocketServer(server);

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}`;
    const client = await connectClient(url);
    const healthResponse = await fetch(`${url}/api/health`);
    const readinessResponse = await fetch(`${url}/api/health/ready`);
    const venueMutationResponse = await fetch(`${url}/api/venues`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    assert.equal(healthResponse.status, 200);
    assert.equal(readinessResponse.status, 503);
    assert.equal(venueMutationResponse.status, 401);
    assert.equal(client.connected, true);
    const webhookResponse = await fetch(`${url}/api/payments/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "invalid",
      },
      body: JSON.stringify({ id: "evt_invalid", type: "checkout.session.completed" }),
    });
    assert.equal(webhookResponse.status, 400);
  } finally {
    await closeSocketServer(io);
  }
});

test(
  "Socket.io auth, rooms, and Phase 4 seat notifications",
  {
    skip:
      !integrationOptIn || !mongoUri || !redisTestUrl
        ? "Set RUN_INTEGRATION_TESTS=1 with isolated MONGODB_TEST_URI and REDIS_TEST_URL services"
        : false,
  },
  async (context) => {
    assert.ok(mongoUri);
    await connectRedis();
    connectedRedis = true;
    await mongoose.connect(mongoUri);
    connectedDatabase = true;

    const user = await UserModel.create({
      fullName: "Socket Test User",
      email: `socket-test-${new Types.ObjectId().toString()}@example.test`,
      passwordHash: "not-used-by-this-test",
      role: "USER",
    });
    userIds.push(user._id);
    const deletedUser = await UserModel.create({
      fullName: "Deleted Socket Test User",
      email: `socket-deleted-${new Types.ObjectId().toString()}@example.test`,
      passwordHash: "not-used-by-this-test",
      role: "USER",
    });
    userIds.push(deletedUser._id);
    const secondUser = await UserModel.create({
      fullName: "Second Socket Test User",
      email: `socket-second-${new Types.ObjectId().toString()}@example.test`,
      passwordHash: "not-used-by-this-test",
      role: "USER",
    });
    userIds.push(secondUser._id);

    const venueId = new Types.ObjectId();
    const eventOne = await EventModel.create({
      title: "Socket Test Event One",
      slug: `socket-test-${new Types.ObjectId().toString()}`,
      description: "Test event",
      category: "test",
      venueId,
      organizerId: user._id,
      startDate: new Date(Date.now() + 2 * 60 * 60_000),
      endDate: new Date(Date.now() + 4 * 60 * 60_000),
      status: "PUBLISHED",
    });
    const eventTwo = await EventModel.create({
      title: "Socket Test Event Two",
      slug: `socket-test-${new Types.ObjectId().toString()}`,
      description: "Test event",
      category: "test",
      venueId,
      organizerId: user._id,
      startDate: new Date(Date.now() + 2 * 60 * 60_000),
      endDate: new Date(Date.now() + 4 * 60 * 60_000),
      status: "PUBLISHED",
    });
    const draftEvent = await EventModel.create({
      title: "Socket Test Draft Event",
      slug: `socket-draft-${new Types.ObjectId().toString()}`,
      description: "Draft event",
      category: "test",
      venueId,
      organizerId: user._id,
      startDate: new Date(Date.now() + 2 * 60 * 60_000),
      endDate: new Date(Date.now() + 4 * 60 * 60_000),
      status: "DRAFT",
    });
    eventIds.push(eventOne._id, eventTwo._id, draftEvent._id);

    const seats = await SeatModel.insertMany(
      [1, 2, 3, 4].map((seatNumber) => ({
        eventId: eventOne._id,
        venueId,
        section: "A",
        row: "1",
        seatNumber,
        category: "STANDARD",
        price: 25,
        status: "AVAILABLE",
      })),
    );
    seatIds.push(...seats.map((seat) => seat._id));

    const token = jwt.sign(
      { sub: user._id.toString(), role: "USER" },
      env.JWT_ACCESS_SECRET,
      { expiresIn: "1h" },
    );
    const secondUserToken = jwt.sign(
      { sub: secondUser._id.toString(), role: "USER" },
      env.JWT_ACCESS_SECRET,
      { expiresIn: "1h" },
    );
    const expiredToken = jwt.sign(
      { sub: user._id.toString(), role: "USER" },
      env.JWT_ACCESS_SECRET,
      { expiresIn: -1 },
    );
    const deletedUserToken = jwt.sign(
      { sub: deletedUser._id.toString(), role: "USER" },
      env.JWT_ACCESS_SECRET,
      { expiresIn: "1h" },
    );
    await UserModel.deleteOne({ _id: deletedUser._id }).exec();

    httpServer = createServer(app);
    socketServer = createSocketServer(httpServer);
    await new Promise<void>((resolve, reject) => {
      httpServer?.once("error", reject);
      httpServer?.listen(0, resolve);
    });
    const address = httpServer.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}`;

    const viewer = await connectClient(url, token);
    const secondViewer = await connectClient(url);
    const otherEventViewer = await connectClient(url);
    await expectConnectionRejected(url, "invalid-token");
    await expectConnectionRejected(url, expiredToken);
    await expectConnectionRejected(url, deletedUserToken);

    assert.deepEqual(await joinEvent(viewer, eventOne._id.toString()), {
      success: true,
      eventId: eventOne._id.toString(),
    });
    assert.equal((await joinEvent(secondViewer, eventOne._id.toString())).success, true);
    assert.equal((await joinEvent(otherEventViewer, eventTwo._id.toString())).success, true);
    assert.equal((await joinEvent(viewer, draftEvent._id.toString())).success, false);
    assert.equal((await joinEvent(viewer, "not-an-object-id")).success, false);
    assert.equal((await joinEvent(viewer, new Types.ObjectId().toString())).success, false);
    assert.equal(
      (await fetch(`${url}/api/events/${draftEvent._id.toString()}`)).status,
      404,
    );
    assert.equal(
      (
        await fetch(`${url}/api/events/${draftEvent._id.toString()}/seats`)
      ).status,
      404,
    );

    const heldEventPromise = waitForSeatEvent(viewer, "seat:held");
    const heldEventForSecondPromise = waitForSeatEvent(secondViewer, "seat:held");
    const noHeldEventForOtherPromise = expectNoSeatEvent(otherEventViewer, "seat:held");
    const holdResponse = await fetch(
      `${url}/api/events/${eventOne._id.toString()}/seats/hold`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ seatIds: seats.slice(0, 2).map((seat) => seat._id.toString()) }),
      },
    );
    assert.equal(holdResponse.status, 200);
    const holdResult = (await holdResponse.json()) as {
      data: { holdId: string; expiresAt: string };
    };
    const [heldEvent, heldEventForSecond] = await Promise.all([
      heldEventPromise,
      heldEventForSecondPromise,
    ]);
    await noHeldEventForOtherPromise;
    assert.deepEqual(heldEvent.seats.map((seat) => seat.seatId), [
      seats[0]._id.toString(),
      seats[1]._id.toString(),
    ]);
    assert.equal(heldEvent.holdId, holdResult.data.holdId);
    assert.equal(heldEvent.seats[0].status, "HELD");
    assert.equal(heldEvent.seats[0].lockedUntil, holdResult.data.expiresAt);
    assert.deepEqual(heldEventForSecond, heldEvent);
    assert.equal("lockedBy" in heldEvent.seats[0], false);

    const failedHoldNoEvent = expectNoSeatEvent(viewer, "seat:held");
    const failedHoldResponse = await fetch(
      `${url}/api/events/${eventOne._id.toString()}/seats/hold`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ seatIds: [seats[0]._id.toString()] }),
      },
    );
    assert.equal(failedHoldResponse.status, 409);
    await failedHoldNoEvent;

    assert.equal((await leaveEvent(secondViewer, eventOne._id.toString())).success, true);
    const releaseNoEventForSecond = expectNoSeatEvent(secondViewer, "seat:released");
    const releasedEventPromise = waitForSeatEvent(viewer, "seat:released");
    const noReleasedEventForOtherPromise = expectNoSeatEvent(otherEventViewer, "seat:released");
    const releaseResponse = await fetch(
      `${url}/api/events/${eventOne._id.toString()}/seats/release`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ holdId: holdResult.data.holdId }),
      },
    );
    assert.equal(releaseResponse.status, 200);
    const releasedEvent = await releasedEventPromise;
    assert.deepEqual(releasedEvent.seats.map((seat) => seat.status), ["AVAILABLE", "AVAILABLE"]);
    await Promise.all([releaseNoEventForSecond, noReleasedEventForOtherPromise]);

    const expiryEventPromise = waitForSeatEvent(viewer, "seat:expired");
    const expiryHeldEventPromise = waitForSeatEvent(viewer, "seat:held");
    const expiryHoldResponse = await fetch(
      `${url}/api/events/${eventOne._id.toString()}/seats/hold`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ seatIds: [seats[2]._id.toString()] }),
      },
    );
    assert.equal(expiryHoldResponse.status, 200);
    const expiryHold = (await expiryHoldResponse.json()) as {
      data: { holdId: string };
    };
    await expiryHeldEventPromise;
    await SeatModel.updateOne(
      { _id: seats[2]._id },
      { $set: { lockedUntil: new Date(Date.now() - 1000) } },
    ).exec();
    assert.equal(await clearExpiredSeatHolds(), 1);
    const expiredEvent = await expiryEventPromise;
    assert.deepEqual(expiredEvent.seats, [
      { seatId: seats[2]._id.toString(), status: "AVAILABLE", lockedUntil: null },
    ]);
    const expiredCheckoutResponse = await fetch(`${url}/api/bookings/checkout`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        eventId: eventOne._id.toString(),
        holdId: expiryHold.data.holdId,
      }),
    });
    assert.equal(expiredCheckoutResponse.status, 409);

    const disconnectPromise = new Promise<void>((resolve) => {
      viewer.once("disconnect", () => resolve());
    });
    viewer.disconnect();
    await disconnectPromise;
    viewer.connect();
    await new Promise<void>((resolve, reject) => {
      viewer.once("connect", resolve);
      viewer.once("connect_error", reject);
    });
    assert.equal((await joinEvent(viewer, eventOne._id.toString())).success, true);
    const seatMapResponse = await fetch(`${url}/api/events/${eventOne._id.toString()}/seats`);
    assert.equal(seatMapResponse.status, 200);
    const seatMap = (await seatMapResponse.json()) as {
      data: { seats: Array<{ id: string; status: string }> };
    };
    assert.equal(
      seatMap.data.seats.find((seat) => seat.id === seats[2]._id.toString())?.status,
      "AVAILABLE",
    );

    const stripeSessions = new Map<string, Stripe.Checkout.Session>();
    const paymentIntentMetadata = new Map<string, Stripe.Metadata>();
    let checkoutCreateCalls = 0;
    let refundCalls = 0;
    context.mock.method(
      stripe.checkout.sessions,
      "create",
      async (params: Stripe.Checkout.SessionCreateParams) => {
        checkoutCreateCalls += 1;
        const bookingId = params.metadata?.bookingId;
        assert.ok(bookingId);
        const id = `cs_test_${bookingId}`;
        const paymentIntentId = `pi_test_${bookingId}`;
        const metadata = params.payment_intent_data?.metadata;
        paymentIntentMetadata.set(paymentIntentId, {
          bookingId: String(metadata?.bookingId ?? ""),
          holdId: String(metadata?.holdId ?? ""),
          eventId: String(metadata?.eventId ?? ""),
        });
        const checkoutSession = {
          id,
          object: "checkout.session",
          amount_total: 2500,
          currency: "pkr",
          expires_at: params.expires_at,
          metadata: params.metadata,
          payment_intent: paymentIntentId,
          payment_status: "unpaid",
          status: "open",
          url: `https://checkout.stripe.test/${id}`,
        } as Stripe.Checkout.Session;
        stripeSessions.set(id, checkoutSession);
        return checkoutSession;
      },
    );
    context.mock.method(
      stripe.checkout.sessions,
      "retrieve",
      async (sessionId: string) => {
        const checkoutSession = stripeSessions.get(sessionId);
        assert.ok(checkoutSession);
        return checkoutSession;
      },
    );
    context.mock.method(
      stripe.paymentIntents,
      "retrieve",
      async (paymentIntentId: string) => ({
        id: paymentIntentId,
        object: "payment_intent",
        status: "succeeded",
        metadata: paymentIntentMetadata.get(paymentIntentId) ?? {},
      }) as Stripe.PaymentIntent,
    );
    context.mock.method(
      stripe.refunds,
      "create",
      async () => {
        refundCalls += 1;
        return {
          id: `re_test_${refundCalls}`,
          object: "refund",
          status: "succeeded",
        } as Stripe.Refund;
      },
    );

    const paymentHoldResponse = await fetch(
      `${url}/api/events/${eventOne._id.toString()}/seats/hold`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ seatIds: [seats[0]._id.toString()] }),
      },
    );
    assert.equal(paymentHoldResponse.status, 200);
    const paymentHold = (await paymentHoldResponse.json()) as {
      data: { holdId: string };
    };
    const bookedEventPromise = waitForSeatEvent(viewer, "seat:booked");
    const checkoutResponse = await fetch(`${url}/api/bookings/checkout`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        eventId: eventOne._id.toString(),
        holdId: paymentHold.data.holdId,
      }),
    });
    assert.equal(checkoutResponse.status, 201);
    const checkoutResult = (await checkoutResponse.json()) as {
      data: { bookingId: string; checkoutUrl: string; expiresAt: string };
    };
    assert.equal(checkoutCreateCalls, 1);
    assert.match(checkoutResult.data.checkoutUrl, /^https:\/\/checkout\.stripe\.test\//);

    const duplicateCheckoutResponse = await fetch(`${url}/api/bookings/checkout`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        eventId: eventOne._id.toString(),
        holdId: paymentHold.data.holdId,
      }),
    });
    assert.equal(duplicateCheckoutResponse.status, 201);
    assert.equal(checkoutCreateCalls, 1);

    const checkoutSessionId = `cs_test_${checkoutResult.data.bookingId}`;
    const paidEvent = {
      id: `evt_paid_${new Types.ObjectId().toString()}`,
      object: "event",
      api_version: "2026-03-25.dahlia",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      pending_webhooks: 1,
      type: "checkout.session.completed",
      data: {
        object: {
          id: checkoutSessionId,
          object: "checkout.session",
          amount_total: 2500,
          currency: "pkr",
          metadata: {
            bookingId: checkoutResult.data.bookingId,
            holdId: paymentHold.data.holdId,
            eventId: eventOne._id.toString(),
          },
          payment_intent: `pi_test_${checkoutResult.data.bookingId}`,
          payment_status: "paid",
          status: "complete",
        },
      },
    };
    const [paidWebhookResponse, duplicatePaidWebhookResponse] = await Promise.all([
      makeStripeEventRequest(url, paidEvent),
      makeStripeEventRequest(url, paidEvent),
    ]);
    assert.equal(paidWebhookResponse.status, 200);
    assert.equal(duplicatePaidWebhookResponse.status, 200);
    const bookedEvent = await bookedEventPromise;
    assert.deepEqual(bookedEvent.seats, [
      { seatId: seats[0]._id.toString(), status: "BOOKED", lockedUntil: null },
    ]);
    const confirmedBooking = await BookingModel.findById(checkoutResult.data.bookingId).lean().exec();
    assert.equal(confirmedBooking?.status, "CONFIRMED");
    assert.equal(confirmedBooking?.paymentStatus, "PAID");
    assert.equal(
      await PaymentEventModel.countDocuments({ stripeEventId: paidEvent.id }).exec(),
      1,
    );
    await expectNoSeatEvent(viewer, "seat:booked");

    const unauthorizedBookingResponse = await fetch(
      `${url}/api/bookings/${checkoutResult.data.bookingId}`,
      { headers: { authorization: `Bearer ${secondUserToken}` } },
    );
    assert.equal(unauthorizedBookingResponse.status, 403);

    const invalidHoldResponse = await fetch(
      `${url}/api/events/${eventOne._id.toString()}/seats/hold`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ seatIds: [seats[1]._id.toString()] }),
      },
    );
    assert.equal(invalidHoldResponse.status, 200);
    const invalidHold = (await invalidHoldResponse.json()) as {
      data: { holdId: string };
    };
    const unauthorizedCheckoutResponse = await fetch(`${url}/api/bookings/checkout`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secondUserToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        eventId: eventOne._id.toString(),
        holdId: invalidHold.data.holdId,
      }),
    });
    assert.equal(unauthorizedCheckoutResponse.status, 409);
    const invalidCheckoutResponse = await fetch(`${url}/api/bookings/checkout`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        eventId: eventOne._id.toString(),
        holdId: invalidHold.data.holdId,
      }),
    });
    assert.equal(invalidCheckoutResponse.status, 201);
    const invalidCheckout = (await invalidCheckoutResponse.json()) as {
      data: { bookingId: string };
    };
    await SeatModel.updateOne(
      { _id: seats[1]._id, holdId: invalidHold.data.holdId },
      {
        $set: { status: "AVAILABLE", lockedBy: null, lockedUntil: null, holdId: null },
      },
    ).exec();
    const replacementHoldResponse = await fetch(
      `${url}/api/events/${eventOne._id.toString()}/seats/hold`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${secondUserToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ seatIds: [seats[1]._id.toString()] }),
      },
    );
    assert.equal(replacementHoldResponse.status, 200);
    const replacementHold = (await replacementHoldResponse.json()) as {
      data: { holdId: string };
    };
    const invalidSessionId = `cs_test_${invalidCheckout.data.bookingId}`;
    const invalidPaidEvent = {
      ...paidEvent,
      id: `evt_late_paid_${new Types.ObjectId().toString()}`,
      data: {
        object: {
          ...paidEvent.data.object,
          id: invalidSessionId,
          metadata: {
            bookingId: invalidCheckout.data.bookingId,
            holdId: invalidHold.data.holdId,
            eventId: eventOne._id.toString(),
          },
          payment_intent: `pi_test_${invalidCheckout.data.bookingId}`,
        },
      },
    };
    const noBookedEventForOtherRoom = expectNoSeatEvent(otherEventViewer, "seat:booked");
    const latePaidResponse = await makeStripeEventRequest(url, invalidPaidEvent);
    assert.equal(latePaidResponse.status, 200);
    const duplicateLatePaidResponse = await makeStripeEventRequest(url, invalidPaidEvent);
    assert.equal(duplicateLatePaidResponse.status, 200);
    await noBookedEventForOtherRoom;
    const refundedBooking = await BookingModel.findById(invalidCheckout.data.bookingId).lean().exec();
    assert.equal(refundedBooking?.status, "EXPIRED");
    assert.equal(refundedBooking?.paymentStatus, "REFUNDED");
    assert.equal(refundedBooking?.refundStatus, "SUCCEEDED");
    assert.equal(refundCalls, 1);
    const replacementSeat = await SeatModel.findById(seats[1]._id).lean().exec();
    assert.equal(replacementSeat?.holdId, replacementHold.data.holdId);
    assert.equal(replacementSeat?.lockedBy?.toString(), secondUser._id.toString());

    const expiryCheckoutHoldResponse = await fetch(
      `${url}/api/events/${eventOne._id.toString()}/seats/hold`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ seatIds: [seats[3]._id.toString()] }),
      },
    );
    assert.equal(expiryCheckoutHoldResponse.status, 200);
    const expiryCheckoutHold = (await expiryCheckoutHoldResponse.json()) as {
      data: { holdId: string };
    };
    const expiryCheckoutResponse = await fetch(`${url}/api/bookings/checkout`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        eventId: eventOne._id.toString(),
        holdId: expiryCheckoutHold.data.holdId,
      }),
    });
    assert.equal(expiryCheckoutResponse.status, 201);
    const expiryCheckout = (await expiryCheckoutResponse.json()) as {
      data: { bookingId: string };
    };
    const checkoutExpiredEventPromise = waitForSeatEvent(viewer, "seat:expired");
    const checkoutExpiredEvent = {
      ...paidEvent,
      id: `evt_checkout_expired_${new Types.ObjectId().toString()}`,
      type: "checkout.session.expired",
      data: {
        object: {
          ...paidEvent.data.object,
          id: `cs_test_${expiryCheckout.data.bookingId}`,
          metadata: {
            bookingId: expiryCheckout.data.bookingId,
            holdId: expiryCheckoutHold.data.holdId,
            eventId: eventOne._id.toString(),
          },
          payment_intent: null,
          payment_status: "unpaid",
          status: "expired",
        },
      },
    };
    const checkoutExpiredResponse = await makeStripeEventRequest(url, checkoutExpiredEvent);
    assert.equal(checkoutExpiredResponse.status, 200);
    const checkoutExpiredNotice = await checkoutExpiredEventPromise;
    assert.deepEqual(checkoutExpiredNotice.seats, [
      { seatId: seats[3]._id.toString(), status: "AVAILABLE", lockedUntil: null },
    ]);
    const expiredCheckoutBooking = await BookingModel.findById(expiryCheckout.data.bookingId)
      .lean()
      .exec();
    assert.equal(expiredCheckoutBooking?.status, "EXPIRED");
  },
);

after(async () => {
  for (const client of clients) {
    client.close();
  }
  if (socketServer) {
    await closeSocketServer(socketServer);
  } else if (httpServer?.listening) {
    await new Promise<void>((resolve, reject) => {
      httpServer?.close((error) => (error ? reject(error) : resolve()));
    });
  }
  if (connectedDatabase) {
    const bookings = await BookingModel.find({ userId: { $in: userIds } })
      .select("_id")
      .lean()
      .exec();
    await PaymentEventModel.deleteMany({
      bookingId: { $in: bookings.map((booking) => booking._id) },
    }).exec();
    await BookingModel.deleteMany({ userId: { $in: userIds } }).exec();
    await SeatModel.deleteMany({ _id: { $in: seatIds } }).exec();
    await EventModel.deleteMany({ _id: { $in: eventIds } }).exec();
    await UserModel.deleteMany({ _id: { $in: userIds } }).exec();
    await mongoose.disconnect();
  }
  if (connectedRedis) {
    await closeRedis();
  }
});
