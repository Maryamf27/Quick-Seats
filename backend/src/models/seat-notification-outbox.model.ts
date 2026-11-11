import { Schema, model, type Model, type Types } from "mongoose";
import type { SeatServerEventName } from "../sockets/socket.events.js";
import type { SeatUpdatePayload } from "../sockets/socket.types.js";

export interface SeatNotificationOutbox {
  _id: Types.ObjectId;
  eventName: SeatServerEventName;
  payload: SeatUpdatePayload;
  deliveredAt?: Date;
  deliveryLockId?: string;
  deliveryLockExpiresAt?: Date;
  createdAt: Date;
}

const seatNotificationOutboxSchema = new Schema<SeatNotificationOutbox>(
  {
    eventName: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    deliveredAt: { type: Date },
    deliveryLockId: { type: String },
    deliveryLockExpiresAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

seatNotificationOutboxSchema.index({ deliveredAt: 1, deliveryLockExpiresAt: 1 });

export const SeatNotificationOutboxModel: Model<SeatNotificationOutbox> =
  model<SeatNotificationOutbox>("SeatNotificationOutbox", seatNotificationOutboxSchema);
