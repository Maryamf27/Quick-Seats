import { Schema, model, type Model, type Types } from "mongoose";
import { EVENT_STATUSES, type EventStatus } from "../types/domain.js";

export interface Event {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  description: string;
  category: string;
  venueId: Types.ObjectId;
  organizerId: Types.ObjectId;
  startDate: Date;
  endDate: Date;
  status: EventStatus;
  posterUrl?: string;
  seatsGeneratedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const eventSchema = new Schema<Event>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, required: true, trim: true, maxlength: 10000 },
    category: { type: String, required: true, trim: true, lowercase: true, maxlength: 100 },
    venueId: {
      type: Schema.Types.ObjectId,
      ref: "Venue",
      required: true,
      index: true,
    },
    organizerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: EVENT_STATUSES, default: "DRAFT", required: true },
    posterUrl: { type: String, trim: true, maxlength: 2048 },
    seatsGeneratedAt: { type: Date, select: false },
  },
  { timestamps: true, versionKey: false },
);

eventSchema.pre("validate", function () {
  if (
    this.startDate instanceof Date &&
    this.endDate instanceof Date &&
    this.endDate <= this.startDate
  ) {
    this.invalidate("endDate", "End date must be after start date");
  }
});

eventSchema.index({ status: 1, startDate: 1 });
eventSchema.index({ category: 1, status: 1, startDate: 1 });

export const EventModel: Model<Event> = model<Event>("Event", eventSchema);
