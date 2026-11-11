import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { OrganizerReportModel } from "../models/organizer-report.model.js";
import { expirePendingBookings } from "../services/booking-expiration.service.js";
import {
  buildOrganizerSalesSummary,
  enqueuePendingOrganizerReports,
} from "../services/organizer-report.service.js";
import { retryPendingBookingRefunds } from "../services/refund.service.js";
import { clearExpiredSeatHolds } from "../services/seat-expiration.service.js";
import { dispatchPendingSeatNotifications } from "../services/seat-notification-outbox.service.js";
import {
  getMaintenanceQueue,
  MAINTENANCE_QUEUE,
  ORGANIZER_REPORT_QUEUE,
} from "./queues.js";

interface MaintenanceJobData {
  task:
    | "seat-holds"
    | "pending-bookings"
    | "refund-retries"
    | "seat-notifications"
    | "report-recovery";
}

interface OrganizerReportJobData {
  reportId: string;
  organizerId: string;
}

function createWorkerConnection(): Redis {
  if (!env.BULLMQ_REDIS_URL) {
    throw new Error("BULLMQ_REDIS_URL is required to run the background worker");
  }
  return new Redis(env.BULLMQ_REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

export async function startBackgroundWorkers(): Promise<() => Promise<void>> {
  const maintenanceQueue = getMaintenanceQueue();
  const maintenanceConnection = createWorkerConnection();
  const reportConnection = createWorkerConnection();
  const maintenanceWorker = new Worker<MaintenanceJobData>(
    MAINTENANCE_QUEUE,
    async (job: Job<MaintenanceJobData>) => {
      switch (job.data.task) {
        case "seat-holds":
          return clearExpiredSeatHolds(new Date(), "outbox");
        case "pending-bookings":
          return expirePendingBookings(new Date(), "outbox");
        case "refund-retries":
          await retryPendingBookingRefunds();
          return 0;
        case "seat-notifications":
          return dispatchPendingSeatNotifications();
        case "report-recovery":
          return enqueuePendingOrganizerReports();
      }
    },
    { connection: maintenanceConnection, concurrency: 2 },
  );
  const reportWorker = new Worker<OrganizerReportJobData>(
    ORGANIZER_REPORT_QUEUE,
    async (job: Job<OrganizerReportJobData>) => {
      const report = await OrganizerReportModel.findOne({
        _id: job.data.reportId,
        organizerId: job.data.organizerId,
      }).exec();
      if (!report || report.status === "COMPLETED") {
        return report?.result ?? null;
      }

      report.status = "PROCESSING";
      report.error = undefined;
      await report.save();
      try {
        const result = await buildOrganizerSalesSummary(
          job.data.organizerId,
          report.from,
          report.to,
        );
        report.status = "COMPLETED";
        report.result = result;
        await report.save();
        return result;
      } catch (error: unknown) {
        throw error;
      }
    },
    {
      connection: reportConnection,
      concurrency: env.REPORT_JOB_CONCURRENCY,
    },
  );

  const logWorkerError = (workerName: string) => (error: Error) => {
    console.error(`${workerName} worker error`, {
      errorType: error.name,
    });
  };
  maintenanceWorker.on("error", logWorkerError("Maintenance"));
  reportWorker.on("error", logWorkerError("Organizer report"));
  reportWorker.on("failed", (job, error) => {
    if (!job || job.attemptsMade < (job.opts.attempts ?? env.BACKGROUND_JOB_ATTEMPTS)) {
      return;
    }
    void OrganizerReportModel.updateOne(
      {
        _id: job.data.reportId,
        organizerId: job.data.organizerId,
        status: { $in: ["PENDING", "PROCESSING"] },
      },
      { $set: { status: "FAILED", error: `Report generation failed (${error.name})` } },
    )
      .exec()
      .catch((updateError: unknown) => {
        const errorType = updateError instanceof Error ? updateError.name : "UnknownError";
        console.error(`Could not persist failed report status (${errorType})`);
      });
  });

  const closeWorkers = async () => {
    await Promise.all([maintenanceWorker.close(), reportWorker.close()]);
    await Promise.all([maintenanceConnection.quit(), reportConnection.quit()]);
    console.info("QuickSeats background workers closed");
  };

  try {
    await Promise.all([
      maintenanceWorker.waitUntilReady(),
      reportWorker.waitUntilReady(),
    ]);
    const maintenanceRepeatOptions = {
      attempts: env.BACKGROUND_JOB_ATTEMPTS,
      backoff: { type: "exponential" as const, delay: env.BACKGROUND_JOB_BACKOFF_MS },
    };
    await Promise.all([
    maintenanceQueue.upsertJobScheduler(
      "seat-hold-expiration",
      { every: env.SEAT_CLEANUP_INTERVAL_SECONDS * 1000 },
      {
        name: "scheduled-maintenance",
        data: { task: "seat-holds" },
        opts: maintenanceRepeatOptions,
      },
    ),
    maintenanceQueue.upsertJobScheduler(
      "pending-booking-expiration",
      { every: env.BOOKING_CLEANUP_INTERVAL_SECONDS * 1000 },
      {
        name: "scheduled-maintenance",
        data: { task: "pending-bookings" },
        opts: maintenanceRepeatOptions,
      },
    ),
    maintenanceQueue.upsertJobScheduler(
      "pending-refund-retry",
      { every: env.SEAT_CLEANUP_INTERVAL_SECONDS * 1000 },
      {
        name: "scheduled-maintenance",
        data: { task: "refund-retries" },
        opts: maintenanceRepeatOptions,
      },
    ),
    maintenanceQueue.upsertJobScheduler(
      "seat-notification-outbox",
      { every: env.SEAT_NOTIFICATION_OUTBOX_INTERVAL_SECONDS * 1000 },
      {
        name: "scheduled-maintenance",
        data: { task: "seat-notifications" },
        opts: maintenanceRepeatOptions,
      },
    ),
    maintenanceQueue.upsertJobScheduler(
      "organizer-report-recovery",
      { every: env.REPORT_RECOVERY_INTERVAL_SECONDS * 1000 },
      {
        name: "scheduled-maintenance",
        data: { task: "report-recovery" },
        opts: maintenanceRepeatOptions,
      },
    ),
    ]);
  } catch (error: unknown) {
    try {
      await closeWorkers();
    } catch (closeError: unknown) {
      const errorType = closeError instanceof Error ? closeError.name : "UnknownError";
      console.error(`Worker cleanup after startup failure failed (${errorType})`);
    }
    throw error;
  }

  console.info("QuickSeats background workers ready");
  return closeWorkers;
}
