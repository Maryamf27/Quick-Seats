import { Schema, model, type Model, type Types } from "mongoose";

export const ORGANIZER_APPLICATION_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type OrganizerApplicationStatus = (typeof ORGANIZER_APPLICATION_STATUSES)[number];

export interface OrganizerApplication {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  businessName: string;
  description: string;
  status: OrganizerApplicationStatus;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const organizerApplicationSchema = new Schema<OrganizerApplication>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    businessName: { type: String, trim: true, required: true, maxlength: 120 },
    description: { type: String, trim: true, required: true, maxlength: 2000 },
    status: { type: String, enum: ORGANIZER_APPLICATION_STATUSES, default: "PENDING", required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

organizerApplicationSchema.index({ status: 1, createdAt: 1 });

export const OrganizerApplicationModel: Model<OrganizerApplication> =
  model<OrganizerApplication>("OrganizerApplication", organizerApplicationSchema);
