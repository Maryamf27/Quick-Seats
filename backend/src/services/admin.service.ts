import mongoose, { Types } from "mongoose";
import type { z } from "zod";
import { BookingModel } from "../models/booking.model.js";
import { EventModel } from "../models/event.model.js";
import { OrganizerApplicationModel } from "../models/organizer-application.model.js";
import { SeatModel } from "../models/seat.model.js";
import { UserModel } from "../models/user.model.js";
import { AppError } from "../utils/app-error.js";
import { parseInput } from "../utils/validation.js";
import { invalidateEventCache } from "./public-cache-invalidation.service.js";
import { objectIdSchema } from "../validators/common.validator.js";
import {
  adminAnalyticsQuerySchema,
  adminListBookingsQuerySchema,
  adminListEventsQuerySchema,
  adminListOrganizersQuerySchema,
  adminListUsersQuerySchema,
  adminUpdateUserSchema,
} from "../validators/admin.validator.js";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pagination(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

const SAFE_USER_FIELDS = "fullName email role isSuspended createdAt updatedAt";

export async function getAdminOverview() {
  const [
    users,
    organizers,
    suspendedUsers,
    pendingApplications,
    events,
    publishedEvents,
    bookings,
    confirmedBookings,
    revenue,
    ticketsSold,
  ] = await Promise.all([
    UserModel.countDocuments({ role: "USER" }).exec(),
    UserModel.countDocuments({ role: "ORGANIZER" }).exec(),
    UserModel.countDocuments({ isSuspended: true }).exec(),
    OrganizerApplicationModel.countDocuments({ status: "PENDING" }).exec(),
    EventModel.countDocuments().exec(),
    EventModel.countDocuments({ status: "PUBLISHED" }).exec(),
    BookingModel.countDocuments().exec(),
    BookingModel.countDocuments({ status: "CONFIRMED" }).exec(),
    BookingModel.aggregate<{ _id: string | null; total: number }>([
      { $match: { status: "CONFIRMED", paymentStatus: "PAID" } },
      { $group: { _id: "$currency", total: { $sum: "$totalAmount" } } },
    ]).exec(),
    SeatModel.countDocuments({ status: "BOOKED" }).exec(),
  ]);

  return {
    users,
    organizers,
    suspendedUsers,
    pendingApplications,
    events,
    publishedEvents,
    bookings,
    confirmedBookings,
    ticketsSold,
    revenueByCurrency: Object.fromEntries(
      revenue.map((row) => [row._id ?? "unknown", row.total]),
    ),
  };
}

export async function listUsers(input: unknown) {
  const query = parseInput(adminListUsersQuerySchema, input);
  const filter: Record<string, unknown> = {};
  if (query.role) filter.role = query.role;
  if (query.suspended !== undefined) {
    filter.isSuspended = query.suspended ? true : { $ne: true };
  }
  if (query.search) {
    const pattern = { $regex: escapeRegex(query.search), $options: "i" };
    filter.$or = [{ fullName: pattern }, { email: pattern }];
  }

  const [users, total] = await Promise.all([
    UserModel.find(filter)
      .select(SAFE_USER_FIELDS)
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean()
      .exec(),
    UserModel.countDocuments(filter).exec(),
  ]);

  return { users, pagination: pagination(query.page, query.limit, total) };
}

export async function getUserDetail(userIdValue: string) {
  const userId = new Types.ObjectId(parseInput(objectIdSchema, userIdValue));
  const user = await UserModel.findById(userId).select(SAFE_USER_FIELDS).lean().exec();
  if (!user) throw new AppError("User not found", 404);

  const [bookings, events] = await Promise.all([
    BookingModel.countDocuments({ userId }).exec(),
    EventModel.countDocuments({ organizerId: userId }).exec(),
  ]);
  return { ...user, bookingCount: bookings, eventCount: events };
}

export async function updateUser(
  userIdValue: string,
  adminId: string,
  input: unknown,
) {
  const userId = parseInput(objectIdSchema, userIdValue);
  const changes = parseInput(adminUpdateUserSchema, input);

  if (userId === adminId) {
    throw new AppError("Administrators cannot modify their own account here", 409);
  }

  const target = await UserModel.findById(userId).select("role").lean().exec();
  if (!target) throw new AppError("User not found", 404);
  if (target.role === "ADMIN") {
    throw new AppError("Administrator accounts cannot be modified", 409);
  }

  const updated = await UserModel.findOneAndUpdate(
    { _id: userId, role: { $ne: "ADMIN" } },
    { $set: changes },
    { new: true, runValidators: true },
  )
    .select(SAFE_USER_FIELDS)
    .lean()
    .exec();
  if (!updated) throw new AppError("User not found", 404);
  return updated;
}

export async function listOrganizers(input: unknown) {
  const query = parseInput(adminListOrganizersQuerySchema, input);
  const filter: Record<string, unknown> = { role: "ORGANIZER" };
  if (query.search) {
    const pattern = { $regex: escapeRegex(query.search), $options: "i" };
    filter.$or = [{ fullName: pattern }, { email: pattern }];
  }

  const [organizers, total] = await Promise.all([
    UserModel.find(filter)
      .select(SAFE_USER_FIELDS)
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean()
      .exec(),
    UserModel.countDocuments(filter).exec(),
  ]);

  const ids = organizers.map((organizer) => organizer._id);
  const [eventCounts, applications] = ids.length
    ? await Promise.all([
        EventModel.aggregate<{ _id: Types.ObjectId; events: number; published: number }>([
          { $match: { organizerId: { $in: ids } } },
          {
            $group: {
              _id: "$organizerId",
              events: { $sum: 1 },
              published: { $sum: { $cond: [{ $eq: ["$status", "PUBLISHED"] }, 1, 0] } },
            },
          },
        ]).exec(),
        OrganizerApplicationModel.find({ userId: { $in: ids } })
          .select("userId businessName")
          .lean()
          .exec(),
      ])
    : [[], []];

  const countsById = new Map(eventCounts.map((row) => [row._id.toString(), row]));
  const businessById = new Map(
    applications.map((application) => [application.userId.toString(), application.businessName]),
  );

  return {
    organizers: organizers.map((organizer) => {
      const key = organizer._id.toString();
      return {
        ...organizer,
        businessName: businessById.get(key) ?? null,
        eventCount: countsById.get(key)?.events ?? 0,
        publishedEventCount: countsById.get(key)?.published ?? 0,
      };
    }),
    pagination: pagination(query.page, query.limit, total),
  };
}

export async function listAllEvents(input: unknown) {
  const query = parseInput(adminListEventsQuerySchema, input);
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.organizerId) filter.organizerId = new Types.ObjectId(query.organizerId);
  if (query.search) {
    filter.title = { $regex: escapeRegex(query.search), $options: "i" };
  }

  const [events, total] = await Promise.all([
    EventModel.find(filter)
      .populate({ path: "organizerId", select: "fullName email" })
      .populate({ path: "venueId", select: "name address.city" })
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean()
      .exec(),
    EventModel.countDocuments(filter).exec(),
  ]);

  return { events, pagination: pagination(query.page, query.limit, total) };
}

export async function listAllBookings(input: unknown) {
  const query = parseInput(adminListBookingsQuerySchema, input);
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
  if (query.eventId) filter.eventId = new Types.ObjectId(query.eventId);
  if (query.userId) filter.userId = new Types.ObjectId(query.userId);

  const [bookings, total] = await Promise.all([
    BookingModel.find(filter)
      .select(
        "userId eventId seatIds totalAmount currency status paymentStatus paidAt requiresRefund refundStatus createdAt",
      )
      .populate({ path: "userId", select: "fullName email" })
      .populate({ path: "eventId", select: "title startDate" })
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean()
      .exec(),
    BookingModel.countDocuments(filter).exec(),
  ]);

  return {
    bookings: bookings.map((booking) => ({
      id: booking._id.toString(),
      user: booking.userId,
      event: booking.eventId,
      ticketCount: booking.seatIds.length,
      totalAmount: booking.totalAmount,
      currency: booking.currency ?? null,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      paidAt: booking.paidAt ?? null,
      requiresRefund: booking.requiresRefund ?? false,
      refundStatus: booking.refundStatus ?? "NOT_REQUIRED",
      createdAt: booking.createdAt,
    })),
    pagination: pagination(query.page, query.limit, total),
  };
}

type AnalyticsQuery = z.output<typeof adminAnalyticsQuerySchema>;

export async function getAdminAnalytics(input: unknown) {
  const query: AnalyticsQuery = parseInput(adminAnalyticsQuerySchema, input);
  const to = query.to ?? new Date();
  const from = query.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  const range = { $gte: from, $lte: to };
  const paid = { status: "CONFIRMED", paymentStatus: "PAID", paidAt: range };

  const [dailySales, bookingsByStatus, topEvents, categories, userGrowth] = await Promise.all([
    BookingModel.aggregate<{ _id: { day: string; currency: string | null }; bookings: number; tickets: number; revenue: number }>([
      { $match: paid },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: "%Y-%m-%d", date: "$paidAt" } },
            currency: "$currency",
          },
          bookings: { $sum: 1 },
          tickets: { $sum: { $size: "$seatIds" } },
          revenue: { $sum: "$totalAmount" },
        },
      },
      { $sort: { "_id.day": 1 } },
    ]).exec(),
    BookingModel.aggregate<{ _id: string; count: number }>([
      { $match: { createdAt: range } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]).exec(),
    BookingModel.aggregate<{ _id: Types.ObjectId; bookings: number; tickets: number; revenue: number; currency: string | null }>([
      { $match: paid },
      {
        $group: {
          _id: "$eventId",
          bookings: { $sum: 1 },
          tickets: { $sum: { $size: "$seatIds" } },
          revenue: { $sum: "$totalAmount" },
          currency: { $first: "$currency" },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]).exec(),
    EventModel.aggregate<{ _id: string; events: number }>([
      { $group: { _id: "$category", events: { $sum: 1 } } },
      { $sort: { events: -1 } },
      { $limit: 12 },
    ]).exec(),
    UserModel.aggregate<{ _id: string; users: number }>([
      { $match: { createdAt: range } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          users: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]).exec(),
  ]);

  const eventDocs = topEvents.length
    ? await EventModel.find({ _id: { $in: topEvents.map((row) => row._id) } })
        .select("title category")
        .lean()
        .exec()
    : [];
  const eventById = new Map(eventDocs.map((event) => [event._id.toString(), event]));

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    dailySales: dailySales.map((row) => ({
      day: row._id.day,
      currency: row._id.currency,
      bookings: row.bookings,
      tickets: row.tickets,
      revenue: row.revenue,
    })),
    bookingsByStatus: Object.fromEntries(bookingsByStatus.map((row) => [row._id, row.count])),
    topEvents: topEvents.map((row) => ({
      eventId: row._id.toString(),
      title: eventById.get(row._id.toString())?.title ?? "Deleted event",
      category: eventById.get(row._id.toString())?.category ?? null,
      bookings: row.bookings,
      tickets: row.tickets,
      revenue: row.revenue,
      currency: row.currency,
    })),
    categories: categories.map((row) => ({ category: row._id, events: row.events })),
    userGrowth: userGrowth.map((row) => ({ day: row._id, users: row.users })),
  };
}

/**
 * Takes a published event offline without cancelling it. Refused when customers already hold
 * confirmed bookings, because hiding an event those customers paid for would strand them;
 * the admin has to cancel it instead, which refunds them.
 */
export async function unpublishEvent(eventIdValue: string) {
  const eventId = new Types.ObjectId(parseInput(objectIdSchema, eventIdValue));
  const event = await EventModel.findById(eventId).select("status").lean().exec();
  if (!event) throw new AppError("Event not found", 404);
  if (event.status !== "PUBLISHED") {
    throw new AppError("Only published events can be unpublished", 409);
  }
  const hasConfirmed = await BookingModel.exists({ eventId, status: "CONFIRMED" }).exec();
  if (hasConfirmed) {
    throw new AppError(
      "This event has confirmed bookings. Cancel it instead so customers are refunded.",
      409,
    );
  }

  const updated = await EventModel.findOneAndUpdate(
    { _id: eventId, status: "PUBLISHED" },
    { $set: { status: "DRAFT" } },
    { new: true },
  )
    .lean()
    .exec();
  if (!updated) throw new AppError("Event changed while it was being unpublished", 409);
  await invalidateEventCache(eventId.toString());
  return { id: updated._id.toString(), status: updated.status };
}

/**
 * Cancels an event and every confirmed booking on it. Each paid booking is flagged for a
 * refund inside the same transaction; the refund itself is issued afterwards by the existing
 * refund-retry job, so a Stripe outage cannot leave the event half-cancelled.
 */
export async function cancelEventAsAdmin(eventIdValue: string) {
  const eventId = new Types.ObjectId(parseInput(objectIdSchema, eventIdValue));
  const session = await mongoose.startSession();
  let cancelledBookings = 0;

  try {
    await session.withTransaction(async () => {
      const event = await EventModel.findById(eventId).session(session).select("status").lean().exec();
      if (!event) throw new AppError("Event not found", 404);
      if (event.status === "CANCELLED") throw new AppError("Event is already cancelled", 409);
      if (event.status === "COMPLETED") throw new AppError("Completed events cannot be cancelled", 409);

      const flipped = await EventModel.updateOne(
        { _id: eventId, status: { $in: ["DRAFT", "PUBLISHED"] } },
        { $set: { status: "CANCELLED" } },
        { session },
      ).exec();
      if (flipped.modifiedCount !== 1) {
        throw new AppError("Event changed while it was being cancelled", 409);
      }

      const refunded = await BookingModel.updateMany(
        { eventId, status: "CONFIRMED", paymentStatus: "PAID" },
        { $set: { status: "CANCELLED", requiresRefund: true, refundStatus: "PENDING" } },
        { session },
      ).exec();
      cancelledBookings = refunded.modifiedCount;
    });
  } finally {
    await session.endSession();
  }

  await invalidateEventCache(eventId.toString());
  return { id: eventId.toString(), status: "CANCELLED" as const, cancelledBookings };
}
