import { Schema, model, type Model, type Types } from "mongoose";
import {
  BOOKING_STATUSES,
  PAYMENT_STATUSES,
  type BookingStatus,
  type PaymentStatus,
} from "../types/domain.js";

export interface Booking {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  eventId: Types.ObjectId;
  seatIds: Types.ObjectId[];
  totalAmount: number;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  holdId?: string;
  currency?: string;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  checkoutExpiresAt?: Date;
  paidAt?: Date;
  requiresRefund?: boolean;
  refundStatus?: "NOT_REQUIRED" | "PENDING" | "SUCCEEDED" | "FAILED";
  stripeRefundId?: string;
  refundAttempts?: number;
  refundLastAttemptAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const bookingSchema = new Schema<Booking>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
    seatIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Seat" }],
      required: true,
      validate: {
        validator: (seatIds: Types.ObjectId[]) => seatIds.length > 0,
        message: "A booking must contain at least one seat",
      },
    },
    totalAmount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: BOOKING_STATUSES, default: "PENDING", required: true },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "UNPAID",
      required: true,
    },
    holdId: { type: String, trim: true, maxlength: 255 },
    currency: { type: String, lowercase: true, minlength: 3, maxlength: 3 },
    stripeSessionId: { type: String, trim: true },
    stripePaymentIntentId: { type: String, trim: true },
    checkoutExpiresAt: { type: Date },
    paidAt: { type: Date },
    requiresRefund: { type: Boolean, default: false },
    refundStatus: {
      type: String,
      enum: ["NOT_REQUIRED", "PENDING", "SUCCEEDED", "FAILED"],
      default: "NOT_REQUIRED",
    },
    stripeRefundId: { type: String, trim: true },
    refundAttempts: { type: Number, min: 0, default: 0 },
    refundLastAttemptAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

bookingSchema.index(
  { holdId: 1 },
  { unique: true, partialFilterExpression: { holdId: { $type: "string" } } },
);
bookingSchema.index(
  { stripeSessionId: 1 },
  { unique: true, partialFilterExpression: { stripeSessionId: { $type: "string" } } },
);
bookingSchema.index(
  { stripePaymentIntentId: 1 },
  { unique: true, partialFilterExpression: { stripePaymentIntentId: { $type: "string" } } },
);
bookingSchema.index({ userId: 1, createdAt: -1 });
bookingSchema.index({ refundStatus: 1, refundLastAttemptAt: 1 });

export const BookingModel: Model<Booking> = model<Booking>("Booking", bookingSchema);
