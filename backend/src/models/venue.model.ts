import { Schema, model, type Model, type Types } from "mongoose";
import { SEAT_CATEGORIES, type SeatCategory } from "../types/domain.js";

export interface VenueAddress {
  street: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export interface VenueSection {
  name: string;
  rows: number;
  seatsPerRow: number;
  seatCategory: SeatCategory;
  price: number;
}

export interface Venue {
  _id: Types.ObjectId;
  name: string;
  description: string;
  address: VenueAddress;
  capacity: number;
  sections: VenueSection[];
  createdAt: Date;
  updatedAt: Date;
}

const addressSchema = new Schema<VenueAddress>(
  {
    street: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    state: { type: String, required: true, trim: true, maxlength: 100 },
    country: { type: String, required: true, trim: true, maxlength: 100 },
    postalCode: { type: String, required: true, trim: true, maxlength: 20 },
  },
  { _id: false },
);

const sectionSchema = new Schema<VenueSection>(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    rows: { type: Number, required: true, min: 1, validate: Number.isInteger },
    seatsPerRow: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isInteger,
    },
    seatCategory: { type: String, enum: SEAT_CATEGORIES, required: true },
    price: { type: Number, min: 0, default: 0, required: true },
  },
  { _id: false },
);

const venueSchema = new Schema<Venue>(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, trim: true, default: "", maxlength: 5000 },
    address: { type: addressSchema, required: true },
    capacity: { type: Number, required: true, min: 1, validate: Number.isInteger },
    sections: {
      type: [sectionSchema],
      required: true,
      validate: {
        validator: (sections: VenueSection[]) =>
          sections.length > 0 &&
          sections.every((section) => section.rows > 0 && section.seatsPerRow > 0),
        message: "A venue must have at least one valid section",
      },
    },
  },
  { timestamps: true, versionKey: false },
);

venueSchema.pre("validate", function () {
  if (!this.sections) {
    return;
  }

  const names = this.sections.map((section) => section.name.trim().toLocaleLowerCase());
  if (new Set(names).size !== names.length) {
    this.invalidate("sections", "Section names must be unique within a venue");
  }

  const configuredSeats = this.sections.reduce(
    (total, section) => total + section.rows * section.seatsPerRow,
    0,
  );
  if (configuredSeats > this.capacity) {
    this.invalidate("capacity", "Capacity cannot be less than the configured seat count");
  }
});

venueSchema.index({ "address.city": 1 });

export const VenueModel: Model<Venue> = model<Venue>("Venue", venueSchema);
