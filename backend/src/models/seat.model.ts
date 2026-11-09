import { Schema, model, type Model, type Types } from "mongoose";
import {
  SEAT_CATEGORIES,
  SEAT_STATUSES,
  type SeatCategory,
  type SeatStatus,
} from "../types/domain.js";

export interface Seat {
  _id: Types.ObjectId;
  eventId: Types.ObjectId;
  venueId: Types.ObjectId;
  section: string;
  row: string;
  seatNumber: number;
  category: SeatCategory;
  price: number;
  status: SeatStatus;
  lockedBy?: Types.ObjectId | null;
  lockedUntil?: Date | null;
  holdId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const seatSchema = new Schema<Seat>(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    venueId: { type: Schema.Types.ObjectId, ref: "Venue", required: true },
    section: { type: String, required: true, trim: true },
    row: { type: String, required: true, trim: true },
    seatNumber: { type: Number, required: true, min: 1, validate: Number.isInteger },
    category: { type: String, enum: SEAT_CATEGORIES, required: true },
    price: { type: Number, required: true, min: 0 },
    status: { type: String, enum: SEAT_STATUSES, default: "AVAILABLE", required: true },
    lockedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
      nullable: true,
    },
    lockedUntil: { type: Date, default: null, index: true, nullable: true },
    holdId: { type: String, default: null, trim: true, index: true, nullable: true },
  },
  { timestamps: true, versionKey: false },
);

seatSchema.index(
  { eventId: 1, section: 1, row: 1, seatNumber: 1 },
  { unique: true },
);
seatSchema.index({ eventId: 1, status: 1 });
seatSchema.index({ eventId: 1, category: 1 });
seatSchema.index({ status: 1, lockedUntil: 1 });
seatSchema.index({ eventId: 1, holdId: 1, status: 1 });

export const SeatModel: Model<Seat> = model<Seat>("Seat", seatSchema);
