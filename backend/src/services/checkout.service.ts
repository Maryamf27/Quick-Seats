import mongoose, { Types, type QueryFilter } from "mongoose";
import Stripe from "stripe";
import { env } from "../config/env.js";
import { stripe } from "../config/stripe.js";
import { BookingModel, type Booking } from "../models/booking.model.js";
import { EventModel } from "../models/event.model.js";
import { SeatModel, type Seat } from "../models/seat.model.js";
import type { UserRole } from "../types/domain.js";
import { AppError } from "../utils/app-error.js";
import { fromMinorUnits, toMinorUnits } from "../utils/currency.js";
import { parseInput } from "../utils/validation.js";
import { bookingIdParamsSchema, createCheckoutSchema, myBookingsQuerySchema } from "../validators/booking.validator.js";

type MyBookingsQuery = ReturnType<typeof myBookingsQuerySchema.parse>;

interface CheckoutLine {
  seatId: string;
  section: string;
  row: string;
  seatNumber: number;
  minorAmount: number;
}

interface CheckoutPreparation {
  bookingId: string;
  eventId: string;
  holdId: string;
  seatIds: string[];
  totalAmount: number;
  currency: string;
  expiresAt: Date;
  lineItems: CheckoutLine[];
  previousExpiry: Date;
}

function makeCheckoutUrl(baseUrl: string, sessionPlaceholder = false): string {
  const url = new URL(baseUrl);
  if (sessionPlaceholder) {
    url.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
  }
  return url.toString().replace("%7BCHECKOUT_SESSION_ID%7D", "{CHECKOUT_SESSION_ID}");
}

function createCheckoutLineItems(
  lines: CheckoutLine[],
  eventTitle: string,
  currency: string,
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  return lines.map((line) => ({
    quantity: 1,
    price_data: {
      currency,
      unit_amount: line.minorAmount,
      product_data: {
        name: `${eventTitle} - ${line.section} ${line.row}-${line.seatNumber}`,
      },
    },
  }));
}

async function prepareCheckout(
  userId: string,
  input: ReturnType<typeof createCheckoutSchema.parse>,
): Promise<CheckoutPreparation> {
  const eventObjectId = new Types.ObjectId(input.eventId);
  const userObjectId = new Types.ObjectId(userId);
  const now = new Date();
  const defaultCheckoutExpiry = new Date(
    Math.min(
      Math.ceil((now.getTime() + env.PAYMENT_HOLD_DURATION_MINUTES * 60_000) / 1000) * 1000,
      Math.floor((now.getTime() + 24 * 60 * 60_000) / 1000) * 1000,
    ),
  );
  const session = await mongoose.startSession();
  let preparation: CheckoutPreparation | undefined;

  try {
    await session.withTransaction(async () => {
      const event = await EventModel.findOne({
        _id: eventObjectId,
        status: "PUBLISHED",
        startDate: { $gt: now },
      })
        .session(session)
        .lean()
        .exec();
      if (!event) {
        throw new AppError("Event is not available for booking", 409);
      }

      const holdSeats = await SeatModel.find({
        eventId: eventObjectId,
        holdId: input.holdId,
      })
        .session(session)
        .select("_id status lockedBy lockedUntil section row seatNumber price")
        .lean()
        .exec();

      if (
        holdSeats.length === 0 ||
        holdSeats.some(
          (seat) =>
            seat.status !== "HELD" ||
            !seat.lockedBy?.equals(userObjectId) ||
            !seat.lockedUntil ||
            seat.lockedUntil <= now,
        )
      ) {
        throw new AppError("Seat hold is expired or does not belong to this user", 409);
      }

      const booking = await BookingModel.findOne({ holdId: input.holdId })
        .session(session)
        .exec();
      if (
        booking &&
        (!booking.userId.equals(userObjectId) ||
          !booking.eventId.equals(eventObjectId) ||
          booking.status !== "PENDING" ||
          booking.paymentStatus === "PAID" ||
          booking.paymentStatus === "REFUNDED")
      ) {
        throw new AppError("This seat hold cannot be checked out again", 409);
      }
      if (booking?.stripeSessionId) {
        throw new AppError("Checkout session already exists for this hold", 409);
      }
      const checkoutExpiry =
        booking?.checkoutExpiresAt && booking.checkoutExpiresAt > now
          ? booking.checkoutExpiresAt
          : defaultCheckoutExpiry;
      if (
        holdSeats.some(
          (seat) =>
            !seat.lockedUntil ||
            seat.lockedUntil.getTime() !== holdSeats[0].lockedUntil?.getTime(),
        )
      ) {
        throw new AppError("Seat hold has inconsistent expiration times", 409);
      }

      const lineItems = holdSeats.map((seat) => ({
        seatId: seat._id.toString(),
        section: seat.section,
        row: seat.row,
        seatNumber: seat.seatNumber,
        minorAmount: toMinorUnits(seat.price, env.STRIPE_CURRENCY),
      }));
      const totalMinorUnits = lineItems.reduce((sum, line) => sum + line.minorAmount, 0);
      if (!Number.isSafeInteger(totalMinorUnits) || totalMinorUnits <= 0) {
        throw new AppError("Seat prices do not form a valid payment amount", 400);
      }

      const seatFilter: QueryFilter<Seat> = {
        _id: { $in: holdSeats.map((seat) => seat._id) },
        eventId: eventObjectId,
        holdId: input.holdId,
        lockedBy: userObjectId,
        status: "HELD",
        lockedUntil: { $gt: now },
      };
      const extension = await SeatModel.updateMany(
        seatFilter,
        { $set: { lockedUntil: checkoutExpiry } },
      )
        .session(session)
        .exec();
      if (extension.matchedCount !== holdSeats.length) {
        throw new AppError("Seat hold changed while checkout was starting", 409);
      }

      if (booking) {
        booking.totalAmount = fromMinorUnits(totalMinorUnits, env.STRIPE_CURRENCY);
        booking.currency = env.STRIPE_CURRENCY;
        booking.seatIds = holdSeats.map((seat) => seat._id);
        booking.checkoutExpiresAt = checkoutExpiry;
        await booking.save({ session });
      } else {
        const [createdBooking] = await BookingModel.create(
          [
            {
              userId: userObjectId,
              eventId: eventObjectId,
              seatIds: holdSeats.map((seat) => seat._id),
              holdId: input.holdId,
              totalAmount: fromMinorUnits(totalMinorUnits, env.STRIPE_CURRENCY),
              currency: env.STRIPE_CURRENCY,
              checkoutExpiresAt: checkoutExpiry,
              status: "PENDING",
              paymentStatus: "UNPAID",
              refundStatus: "NOT_REQUIRED",
              requiresRefund: false,
            },
          ],
          { session },
        );
        if (!createdBooking) {
          throw new Error("Booking was not created");
        }
        preparation = {
          bookingId: createdBooking._id.toString(),
          eventId: eventObjectId.toString(),
          holdId: input.holdId,
          seatIds: holdSeats.map((seat) => seat._id.toString()),
          totalAmount: createdBooking.totalAmount,
          currency: env.STRIPE_CURRENCY,
          expiresAt: checkoutExpiry,
          lineItems,
          previousExpiry: holdSeats[0].lockedUntil as Date,
        };
        return;
      }

      preparation = {
        bookingId: booking._id.toString(),
        eventId: eventObjectId.toString(),
        holdId: input.holdId,
        seatIds: holdSeats.map((seat) => seat._id.toString()),
        totalAmount: booking.totalAmount,
        currency: env.STRIPE_CURRENCY,
        expiresAt: checkoutExpiry,
        lineItems,
        previousExpiry: holdSeats[0].lockedUntil as Date,
      };
    });
  } finally {
    await session.endSession();
  }

  if (!preparation) {
    throw new Error("Checkout preparation did not produce a booking");
  }
  return preparation;
}

async function restoreHoldExpiry(preparation: CheckoutPreparation): Promise<void> {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const booking = await BookingModel.findOne({
        _id: preparation.bookingId,
        status: "PENDING",
        paymentStatus: { $in: ["UNPAID", "FAILED"] },
        stripeSessionId: { $exists: false },
      })
        .session(session)
        .exec();
      if (!booking) {
        return;
      }

      const result = await SeatModel.updateMany(
        {
          eventId: preparation.eventId,
          _id: { $in: preparation.seatIds },
          holdId: preparation.holdId,
          lockedBy: booking.userId,
          status: "HELD",
          lockedUntil: preparation.expiresAt,
        },
        { $set: { lockedUntil: preparation.previousExpiry } },
      )
        .session(session)
        .exec();

      if (result.modifiedCount === preparation.seatIds.length) {
        await booking.save({ session });
      }
    });
  } finally {
    await session.endSession();
  }
}

export async function createCheckout(userId: string, inputValue: unknown) {
  const input = parseInput(createCheckoutSchema, inputValue);
  const existing = await BookingModel.findOne({ holdId: input.holdId }).exec();

  if (existing?.stripeSessionId) {
    if (!existing.userId.equals(userId) || !existing.eventId.equals(input.eventId)) {
      throw new AppError("Booking not found", 404);
    }
    if (existing.status !== "PENDING" || !existing.checkoutExpiresAt || existing.checkoutExpiresAt <= new Date()) {
      throw new AppError("Checkout session is no longer active", 409);
    }
    const storedSession = await stripe.checkout.sessions.retrieve(existing.stripeSessionId);
    if (storedSession.status !== "open" || !storedSession.url) {
      throw new AppError("Checkout has already completed or expired", 409);
    }
    return {
      bookingId: existing._id.toString(),
      checkoutUrl: storedSession.url,
      status: existing.status,
      expiresAt: existing.checkoutExpiresAt.toISOString(),
    };
  }

  const preparation = await prepareCheckout(userId, input);
  const event = await EventModel.findById(preparation.eventId)
    .select("title")
    .lean()
    .exec();
  if (!event) {
    await restoreHoldExpiry(preparation);
    throw new AppError("Event not found", 404);
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    allowed_payment_method_types: ["card"],
    line_items: createCheckoutLineItems(preparation.lineItems, event.title, preparation.currency),
    success_url: makeCheckoutUrl(env.STRIPE_CHECKOUT_SUCCESS_URL, true),
    cancel_url: makeCheckoutUrl(env.STRIPE_CHECKOUT_CANCEL_URL),
    expires_at: Math.ceil(preparation.expiresAt.getTime() / 1000),
    metadata: {
      bookingId: preparation.bookingId,
      holdId: preparation.holdId,
      eventId: preparation.eventId,
    },
    payment_intent_data: {
      metadata: {
        bookingId: preparation.bookingId,
        holdId: preparation.holdId,
        eventId: preparation.eventId,
      },
    },
  };

  let checkoutSession: Stripe.Checkout.Session;
  try {
    checkoutSession = await stripe.checkout.sessions.create(sessionParams, {
      idempotencyKey: `quickseats-checkout-${preparation.bookingId}-${Math.floor(preparation.expiresAt.getTime() / 1000)}`,
    });
  } catch (error: unknown) {
    await restoreHoldExpiry(preparation);
    throw error;
  }

  if (!checkoutSession.url) {
    await restoreHoldExpiry(preparation);
    throw new AppError("Stripe did not return a checkout URL", 502);
  }

  await BookingModel.updateOne(
    {
      _id: preparation.bookingId,
      status: "PENDING",
      holdId: preparation.holdId,
      stripeSessionId: { $exists: false },
    },
    {
      $set: {
        stripeSessionId: checkoutSession.id,
        checkoutExpiresAt: new Date(checkoutSession.expires_at * 1000),
      },
    },
  ).exec();

  return {
    bookingId: preparation.bookingId,
    checkoutUrl: checkoutSession.url,
    status: "PENDING" as const,
    expiresAt: new Date(checkoutSession.expires_at * 1000).toISOString(),
  };
}

async function findBookingForViewer(
  bookingIdValue: string,
  userId: string,
  role: UserRole,
): Promise<Booking> {
  const bookingId = parseInput(bookingIdParamsSchema.shape.bookingId, bookingIdValue);
  const booking = await BookingModel.findById(bookingId).exec();
  if (!booking) {
    throw new AppError("Booking not found", 404);
  }
  if (role !== "ADMIN" && !booking.userId.equals(userId)) {
    throw new AppError("You do not have permission to access this booking", 403);
  }
  return booking;
}

function safeBookingSummary(booking: Booking) {
  return {
    id: booking._id.toString(),
    eventId: booking.eventId.toString(),
    seatIds: booking.seatIds.map((seatId) => seatId.toString()),
    totalAmount: booking.totalAmount,
    currency: booking.currency ?? null,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    paidAt: booking.paidAt?.toISOString() ?? null,
    requiresRefund: booking.requiresRefund ?? false,
    refundStatus: booking.refundStatus ?? "NOT_REQUIRED",
    createdAt: booking.createdAt.toISOString(),
  };
}

export async function getBookingById(bookingId: string, userId: string, role: UserRole) {
  const booking = await findBookingForViewer(bookingId, userId, role);
  const [event, seats] = await Promise.all([
    EventModel.findById(booking.eventId).select("title startDate endDate").lean().exec(),
    SeatModel.find({ _id: { $in: booking.seatIds } })
      .select("section row seatNumber category price")
      .lean()
      .exec(),
  ]);
  return {
    ...safeBookingSummary(booking),
    event: event
      ? {
          title: event.title,
          startDate: event.startDate.toISOString(),
          endDate: event.endDate.toISOString(),
        }
      : null,
    seats: seats.map((seat) => ({
      id: seat._id.toString(),
      section: seat.section,
      row: seat.row,
      seatNumber: seat.seatNumber,
      category: seat.category,
      price: seat.price,
    })),
  };
}

export async function getBookingStatus(bookingId: string, userId: string, role: UserRole) {
  const booking = await findBookingForViewer(bookingId, userId, role);
  return {
    bookingId: booking._id.toString(),
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    requiresRefund: booking.requiresRefund ?? false,
    refundStatus: booking.refundStatus ?? "NOT_REQUIRED",
    paidAt: booking.paidAt?.toISOString() ?? null,
  };
}

export async function getMyBookings(userId: string, query: MyBookingsQuery) {
  const filter = { userId: new Types.ObjectId(userId) };
  const [bookings, total] = await Promise.all([
    BookingModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean()
      .exec(),
    BookingModel.countDocuments(filter).exec(),
  ]);
  const eventIds = [...new Set(bookings.map((booking) => booking.eventId.toString()))];
  const allSeatIds = bookings.flatMap((booking) => booking.seatIds);
  const [events, seats] = await Promise.all([
    EventModel.find({ _id: { $in: eventIds } }).select("title startDate endDate").lean().exec(),
    SeatModel.find({ _id: { $in: allSeatIds } })
      .select("section row seatNumber category price")
      .lean()
      .exec(),
  ]);
  const eventById = new Map(events.map((event) => [event._id.toString(), event]));
  const seatById = new Map(seats.map((seat) => [seat._id.toString(), seat]));

  return {
    bookings: bookings.map((booking) => {
      const event = eventById.get(booking.eventId.toString());
      return {
        id: booking._id.toString(),
        eventId: booking.eventId.toString(),
        event: event
          ? {
              title: event.title,
              startDate: event.startDate.toISOString(),
              endDate: event.endDate.toISOString(),
            }
          : null,
        seats: booking.seatIds.flatMap((seatId) => {
          const seat = seatById.get(seatId.toString());
          return seat
            ? [{
                id: seat._id.toString(),
                section: seat.section,
                row: seat.row,
                seatNumber: seat.seatNumber,
                category: seat.category,
                price: seat.price,
              }]
            : [];
        }),
        totalAmount: booking.totalAmount,
        currency: booking.currency ?? null,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        createdAt: booking.createdAt.toISOString(),
      };
    }),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}
