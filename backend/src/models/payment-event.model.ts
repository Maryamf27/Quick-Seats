import { Schema, model, type Model, type Types } from "mongoose";

export type PaymentEventStatus = "PROCESSING" | "PROCESSED" | "FAILED";

export interface PaymentEvent {
  _id: Types.ObjectId;
  stripeEventId: string;
  eventType: string;
  status: PaymentEventStatus;
  bookingId?: Types.ObjectId;
  processedAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const paymentEventSchema = new Schema<PaymentEvent>(
  {
    stripeEventId: { type: String, required: true, unique: true, trim: true },
    eventType: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["PROCESSING", "PROCESSED", "FAILED"],
      required: true,
      default: "PROCESSING",
    },
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking" },
    processedAt: { type: Date },
    error: { type: String, maxlength: 1000 },
  },
  { timestamps: true, versionKey: false },
);

export const PaymentEventModel: Model<PaymentEvent> = model<PaymentEvent>(
  "PaymentEvent",
  paymentEventSchema,
);
