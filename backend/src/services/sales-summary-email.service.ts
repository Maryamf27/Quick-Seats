import { Types } from "mongoose";
import { env } from "../config/env.js";
import { BookingModel } from "../models/booking.model.js";
import { EventModel } from "../models/event.model.js";
import { SeatModel } from "../models/seat.model.js";
import { UserModel } from "../models/user.model.js";
import { escapeHtml, sendEmail, type OutgoingEmail } from "./email.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface UpcomingEventSales {
  eventId: string;
  title: string;
  startDate: Date;
  bookings: number;
  ticketsSold: number;
  seatsTotal: number;
  seatsBooked: number;
  revenueByCurrency: Record<string, number>;
}

function formatRevenue(revenue: Record<string, number>): string {
  const entries = Object.entries(revenue);
  if (entries.length === 0) {
    return "0.00";
  }
  return entries
    .map(([currency, amount]) => `${amount.toFixed(2)} ${currency.toUpperCase()}`)
    .join(", ");
}

export function renderSalesSummaryEmail(
  organizerName: string,
  windowDays: number,
  events: UpcomingEventSales[],
): Pick<OutgoingEmail, "subject" | "text" | "html"> {
  const subject = `Your QuickSeats sales summary: ${events.length} event${events.length === 1 ? "" : "s"} in the next ${windowDays} days`;
  const lines = events.map((event) => {
    const fill = event.seatsTotal > 0 ? Math.round((event.seatsBooked / event.seatsTotal) * 100) : 0;
    return {
      title: event.title,
      when: event.startDate.toUTCString(),
      sold: `${event.ticketsSold} ticket${event.ticketsSold === 1 ? "" : "s"} in ${event.bookings} booking${event.bookings === 1 ? "" : "s"}`,
      revenue: formatRevenue(event.revenueByCurrency),
      fill: `${event.seatsBooked}/${event.seatsTotal} seats booked (${fill}%)`,
    };
  });

  const text = [
    `Hi ${organizerName},`,
    "",
    `Here is where ticket sales stand for your events starting in the next ${windowDays} days.`,
    "",
    ...lines.flatMap((line) => [
      line.title,
      `  Starts:  ${line.when}`,
      `  Sold:    ${line.sold}`,
      `  Revenue: ${line.revenue}`,
      `  Seats:   ${line.fill}`,
      "",
    ]),
    "— QuickSeats",
  ].join("\n");

  const rows = lines
    .map(
      (line) => `<tr>
  <td style="padding:8px;border-bottom:1px solid #eee"><strong>${escapeHtml(line.title)}</strong><br><small>${escapeHtml(line.when)}</small></td>
  <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(line.sold)}</td>
  <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(line.revenue)}</td>
  <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(line.fill)}</td>
</tr>`,
    )
    .join("\n");
  const html = `<div style="font-family:Arial,sans-serif;color:#111">
<p>Hi ${escapeHtml(organizerName)},</p>
<p>Here is where ticket sales stand for your events starting in the next ${windowDays} days.</p>
<table style="border-collapse:collapse;width:100%;font-size:14px">
<thead><tr><th align="left" style="padding:8px">Event</th><th align="left" style="padding:8px">Sold</th><th align="left" style="padding:8px">Revenue</th><th align="left" style="padding:8px">Seats</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<p style="color:#666">— QuickSeats</p>
</div>`;

  return { subject, text, html };
}

/** Upcoming published events grouped by organizer, with sales totals per event. */
export async function collectUpcomingSales(
  now = new Date(),
  windowDays = env.SALES_SUMMARY_WINDOW_DAYS,
): Promise<Map<string, UpcomingEventSales[]>> {
  const until = new Date(now.getTime() + windowDays * DAY_MS);
  const events = await EventModel.find({
    status: "PUBLISHED",
    startDate: { $gte: now, $lte: until },
  })
    .select("_id title startDate organizerId")
    .sort({ startDate: 1, _id: 1 })
    .lean()
    .exec();
  if (events.length === 0) {
    return new Map();
  }

  const eventIds = events.map((event) => event._id);
  const [sales, seatCounts] = await Promise.all([
    BookingModel.aggregate<{
      _id: { eventId: Types.ObjectId; currency: string };
      bookings: number;
      ticketsSold: number;
      revenue: number;
    }>([
      { $match: { eventId: { $in: eventIds }, status: "CONFIRMED", paymentStatus: "PAID" } },
      {
        $group: {
          _id: { eventId: "$eventId", currency: { $ifNull: ["$currency", "unknown"] } },
          bookings: { $sum: 1 },
          ticketsSold: { $sum: { $size: "$seatIds" } },
          revenue: { $sum: "$totalAmount" },
        },
      },
    ]).exec(),
    SeatModel.aggregate<{ _id: { eventId: Types.ObjectId; status: string }; count: number }>([
      { $match: { eventId: { $in: eventIds } } },
      { $group: { _id: { eventId: "$eventId", status: "$status" }, count: { $sum: 1 } } },
    ]).exec(),
  ]);

  const rows = new Map<string, UpcomingEventSales>();
  const byOrganizer = new Map<string, UpcomingEventSales[]>();
  for (const event of events) {
    const row: UpcomingEventSales = {
      eventId: event._id.toString(),
      title: event.title,
      startDate: event.startDate,
      bookings: 0,
      ticketsSold: 0,
      seatsTotal: 0,
      seatsBooked: 0,
      revenueByCurrency: {},
    };
    rows.set(row.eventId, row);
    const organizerKey = event.organizerId.toString();
    byOrganizer.set(organizerKey, [...(byOrganizer.get(organizerKey) ?? []), row]);
  }
  for (const group of sales) {
    const row = rows.get(group._id.eventId.toString());
    if (!row) continue;
    const currency = group._id.currency.toLowerCase();
    row.bookings += group.bookings;
    row.ticketsSold += group.ticketsSold;
    row.revenueByCurrency[currency] = (row.revenueByCurrency[currency] ?? 0) + group.revenue;
  }
  for (const group of seatCounts) {
    const row = rows.get(group._id.eventId.toString());
    if (!row) continue;
    row.seatsTotal += group.count;
    if (group._id.status === "BOOKED") row.seatsBooked += group.count;
  }
  return byOrganizer;
}

/**
 * Emails every organizer with an event starting inside the window. One organizer's delivery
 * failure never blocks the others; failures are counted and the job throws at the end so
 * BullMQ retries (organizers already mailed on a retry would get a duplicate, which is
 * acceptable for a weekly digest).
 */
export async function sendUpcomingSalesSummaries(
  now = new Date(),
  windowDays = env.SALES_SUMMARY_WINDOW_DAYS,
): Promise<{ organizers: number; sent: number; failed: number }> {
  const byOrganizer = await collectUpcomingSales(now, windowDays);
  if (byOrganizer.size === 0) {
    return { organizers: 0, sent: 0, failed: 0 };
  }

  const organizers = await UserModel.find({
    _id: { $in: [...byOrganizer.keys()].map((id) => new Types.ObjectId(id)) },
    isSuspended: { $ne: true },
  })
    .select("fullName email")
    .lean()
    .exec();

  let sent = 0;
  let failed = 0;
  for (const organizer of organizers) {
    const events = byOrganizer.get(organizer._id.toString());
    if (!events || events.length === 0) continue;
    try {
      await sendEmail({
        to: organizer.email,
        ...renderSalesSummaryEmail(organizer.fullName, windowDays, events),
      });
      sent += 1;
    } catch (error: unknown) {
      failed += 1;
      console.error("Sales summary email failed", {
        organizerId: organizer._id.toString(),
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
  if (failed > 0) {
    throw new Error(`Sales summary email failed for ${failed} organizer(s)`);
  }
  return { organizers: organizers.length, sent, failed };
}
