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
  },
  { timestamps: true, versionKey: false },
);

export const BookingModel: Model<Booking> = model<Booking>("Booking", bookingSchema);
