import { Schema, model, type Model, type Types } from "mongoose";
import type { OrganizerSalesSummary } from "../services/organizer-report.service.js";

export type OrganizerReportStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface OrganizerReport {
  _id: Types.ObjectId;
  organizerId: Types.ObjectId;
  from: Date;
  to: Date;
  status: OrganizerReportStatus;
  result?: OrganizerSalesSummary;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const organizerReportSchema = new Schema<OrganizerReport>(
  {
    organizerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    from: { type: Date, required: true },
    to: { type: Date, required: true },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"],
      default: "PENDING",
      required: true,
    },
    result: { type: Schema.Types.Mixed },
    error: { type: String, maxlength: 500 },
  },
  { timestamps: true, versionKey: false },
);

organizerReportSchema.index({ organizerId: 1, createdAt: -1 });

export const OrganizerReportModel: Model<OrganizerReport> =
  model<OrganizerReport>("OrganizerReport", organizerReportSchema);
