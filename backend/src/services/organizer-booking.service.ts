import { Types } from "mongoose";
import { BookingModel } from "../models/booking.model.js";
import { EventModel } from "../models/event.model.js";
import { SeatModel } from "../models/seat.model.js";
import { parseInput } from "../utils/validation.js";
import { organizerBookingsQuerySchema } from "../validators/organizer-booking.validator.js";

/**
 * Bookings for the organizer's own events. Customers are exposed by display name only:
 * no email, payment identifiers or refund internals leave this endpoint.
 */
export async function listOrganizerBookings(organizerId: string, input: unknown) {
  const query = parseInput(organizerBookingsQuerySchema, input);
  const ownedEvents = await EventModel.find({ organizerId: new Types.ObjectId(organizerId) })
    .select("_id title startDate")
    .lean()
    .exec();
  const eventById = new Map(ownedEvents.map((event) => [event._id.toString(), event]));

  // Filtering by an event the organizer does not own simply yields no rows.
  const eventIds = query.eventId
    ? ownedEvents.filter((event) => event._id.toString() === query.eventId).map((event) => event._id)
    : ownedEvents.map((event) => event._id);

  const pagination = (total: number) => ({
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.ceil(total / query.limit),
  });

  if (eventIds.length === 0) {
    return { bookings: [], pagination: pagination(0) };
  }

  const filter: Record<string, unknown> = { eventId: { $in: eventIds } };
  if (query.status) filter.status = query.status;

  const [bookings, total] = await Promise.all([
    BookingModel.find(filter)
      .select("userId eventId seatIds totalAmount currency status paymentStatus paidAt createdAt")
      .populate({ path: "userId", select: "fullName" })
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean()
      .exec(),
    BookingModel.countDocuments(filter).exec(),
  ]);

  const seatIds = bookings.flatMap((booking) => booking.seatIds);
  const seats = seatIds.length
    ? await SeatModel.find({ _id: { $in: seatIds } })
        .select("section row seatNumber category")
        .lean()
        .exec()
    : [];
  const seatById = new Map(seats.map((seat) => [seat._id.toString(), seat]));

  return {
    bookings: bookings.map((booking) => {
      const event = eventById.get(booking.eventId.toString());
      const customer = booking.userId as unknown as { fullName?: string } | null;
      return {
        id: booking._id.toString(),
        eventId: booking.eventId.toString(),
        eventTitle: event?.title ?? "Event",
        eventStartDate: event?.startDate ?? null,
        customerName: customer?.fullName ?? "Customer",
        ticketCount: booking.seatIds.length,
        seats: booking.seatIds.flatMap((seatId) => {
          const seat = seatById.get(seatId.toString());
          return seat
            ? [{ section: seat.section, row: seat.row, seatNumber: seat.seatNumber, category: seat.category }]
            : [];
        }),
        totalAmount: booking.totalAmount,
        currency: booking.currency ?? null,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        paidAt: booking.paidAt ?? null,
        createdAt: booking.createdAt,
      };
    }),
    pagination: pagination(total),
  };
}
