import { Types } from "mongoose";
import { BookingModel } from "../models/booking.model.js";
import { EventModel } from "../models/event.model.js";
import { OrganizerReportModel } from "../models/organizer-report.model.js";
import type { OrganizerReport } from "../models/organizer-report.model.js";
import { AppError } from "../utils/app-error.js";
import { getOrganizerReportQueue } from "../jobs/queues.js";

export interface OrganizerEventSales {
  eventId: string;
  title: string;
  category: string;
  startDate: Date;
  bookings: number;
  ticketsSold: number;
  revenueByCurrency: Record<string, number>;
}

export interface OrganizerSalesSummary {
  from: Date;
  to: Date;
  eventCount: number;
  totalBookings: number;
  totalTicketsSold: number;
  revenueByCurrency: Record<string, number>;
  events: OrganizerEventSales[];
}

interface SalesGroup {
  _id: { eventId: Types.ObjectId; currency: string };
  bookings: number;
  ticketsSold: number;
  revenue: number;
}

export function normalizeReportRange(from?: Date, to?: Date, now = new Date()) {
  const end = to ?? now;
  const start = from ?? new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (start > end) {
    throw new AppError("Report start date must be before its end date", 400);
  }
  if (end.getTime() - start.getTime() > 366 * 24 * 60 * 60 * 1000) {
    throw new AppError("Report range cannot exceed 366 days", 400);
  }
  return { from: start, to: end };
}

export async function buildOrganizerSalesSummary(
  organizerId: string,
  from: Date,
  to: Date,
): Promise<OrganizerSalesSummary> {
  const events = await EventModel.find({ organizerId: new Types.ObjectId(organizerId) })
    .select("_id title category startDate")
    .sort({ startDate: 1, _id: 1 })
    .lean()
    .exec();
  const eventIds = events.map((event) => event._id);
  const groups = eventIds.length > 0
    ? await BookingModel.aggregate<SalesGroup>([
        {
          $match: {
            eventId: { $in: eventIds },
            status: "CONFIRMED",
            paymentStatus: "PAID",
            paidAt: { $gte: from, $lte: to },
          },
        },
        {
          $group: {
            _id: {
              eventId: "$eventId",
              currency: { $ifNull: ["$currency", "unknown"] },
            },
            bookings: { $sum: 1 },
            ticketsSold: { $sum: { $size: "$seatIds" } },
            revenue: { $sum: "$totalAmount" },
          },
        },
      ]).exec()
    : [];

  const salesByEvent = new Map<string, OrganizerEventSales>();
  const totals: OrganizerSalesSummary = {
    from,
    to,
    eventCount: events.length,
    totalBookings: 0,
    totalTicketsSold: 0,
    revenueByCurrency: {},
    events: [],
  };
  for (const event of events) {
    const row: OrganizerEventSales = {
      eventId: event._id.toString(),
      title: event.title,
      category: event.category,
      startDate: event.startDate,
      bookings: 0,
      ticketsSold: 0,
      revenueByCurrency: {},
    };
    salesByEvent.set(row.eventId, row);
    totals.events.push(row);
  }

  for (const group of groups) {
    const eventId = group._id.eventId.toString();
    const row = salesByEvent.get(eventId);
    if (!row) {
      continue;
    }
    const currency = group._id.currency.toLowerCase();
    row.bookings += group.bookings;
    row.ticketsSold += group.ticketsSold;
    row.revenueByCurrency[currency] =
      (row.revenueByCurrency[currency] ?? 0) + group.revenue;
    totals.totalBookings += group.bookings;
    totals.totalTicketsSold += group.ticketsSold;
    totals.revenueByCurrency[currency] =
      (totals.revenueByCurrency[currency] ?? 0) + group.revenue;
  }

  return totals;
}

export async function queueOrganizerReport(
  organizerId: string,
  from?: Date,
  to?: Date,
): Promise<OrganizerReport> {
  const range = normalizeReportRange(from, to);
  const report = await OrganizerReportModel.create({
    organizerId: new Types.ObjectId(organizerId),
    ...range,
    status: "PENDING",
  });

  try {
    await getOrganizerReportQueue().add(
      "generate-organizer-report",
      { reportId: report._id.toString(), organizerId },
      { jobId: `organizer-report-${report._id.toString()}` },
    );
  } catch (error: unknown) {
    const errorType = error instanceof Error ? error.name : "UnknownError";
    console.error(`Organizer report enqueue failed (${errorType})`);
    await OrganizerReportModel.updateOne(
      { _id: report._id, status: "PENDING" },
      { $set: { status: "FAILED", error: "Could not enqueue report job" } },
    ).exec();
    throw new AppError("Background report service is unavailable", 503);
  }
  return report;
}

export async function enqueuePendingOrganizerReports(limit = 100): Promise<number> {
  const reports = await OrganizerReportModel.find({ status: "PENDING" })
    .sort({ createdAt: 1 })
    .limit(limit)
    .select("_id organizerId")
    .lean()
    .exec();
  const queue = getOrganizerReportQueue();
  for (const report of reports) {
    const reportId = report._id.toString();
    await queue.add(
      "generate-organizer-report",
      { reportId, organizerId: report.organizerId.toString() },
      { jobId: `organizer-report-${reportId}` },
    );
  }
  return reports.length;
}

export async function getOrganizerReport(
  reportId: string,
  organizerId: string,
): Promise<OrganizerReport> {
  if (!Types.ObjectId.isValid(reportId)) {
    throw new AppError("Invalid report ID", 400);
  }
  const report = await OrganizerReportModel.findOne({
    _id: new Types.ObjectId(reportId),
    organizerId: new Types.ObjectId(organizerId),
  })
    .lean()
    .exec();
  if (!report) {
    throw new AppError("Report not found", 404);
  }
  return report;
}
