import { randomUUID } from "node:crypto";
import { publishSeatUpdate } from "./seat-notification.service.js";
import { SeatNotificationOutboxModel } from "../models/seat-notification-outbox.model.js";

const DELIVERY_LOCK_MS = 30_000;

export async function dispatchPendingSeatNotifications(
  batchSize = 100,
  now = new Date(),
): Promise<number> {
  let delivered = 0;

  for (let index = 0; index < batchSize; index += 1) {
    const lockId = randomUUID();
    const notification = await SeatNotificationOutboxModel.findOneAndUpdate(
      {
        deliveredAt: { $exists: false },
        $or: [
          { deliveryLockExpiresAt: { $exists: false } },
          { deliveryLockExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: {
          deliveryLockId: lockId,
          deliveryLockExpiresAt: new Date(now.getTime() + DELIVERY_LOCK_MS),
        },
      },
      { new: true, sort: { createdAt: 1 } },
    )
      .lean()
      .exec();
    if (!notification) {
      break;
    }

    try {
      const subscriberCount = await publishSeatUpdate(
        notification.eventName,
        notification.payload,
      );
      if (subscriberCount === 0) {
        throw new Error("No API instances are subscribed to seat notifications");
      }
      const result = await SeatNotificationOutboxModel.updateOne(
        { _id: notification._id, deliveryLockId: lockId },
        {
          $set: { deliveredAt: new Date() },
          $unset: { deliveryLockId: 1, deliveryLockExpiresAt: 1 },
        },
      ).exec();
      if (result.modifiedCount === 1) {
        delivered += 1;
      }
    } catch (error: unknown) {
      await SeatNotificationOutboxModel.updateOne(
        { _id: notification._id, deliveryLockId: lockId },
        { $unset: { deliveryLockId: 1, deliveryLockExpiresAt: 1 } },
      ).exec();
      throw error;
    }
  }

  return delivered;
}
