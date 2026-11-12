import mongoose, { Types } from "mongoose";
import { OrganizerApplicationModel, type OrganizerApplication } from "../models/organizer-application.model.js";
import { UserModel } from "../models/user.model.js";
import { AppError } from "../utils/app-error.js";
import { parseInput } from "../utils/validation.js";
import {
  createOrganizerApplicationSchema,
  organizerApplicationsQuerySchema,
  decideOrganizerApplicationSchema,
} from "../validators/organizer-application.validator.js";

export async function createOrganizerApplication(userId: string, input: unknown) {
  const data = parseInput(createOrganizerApplicationSchema, input);
  const user = await UserModel.findById(userId).select("role").lean().exec();
  if (!user) throw new AppError("User not found", 404);
  if (user.role !== "USER") throw new AppError("This account already has a privileged role", 409);
  try {
    const application = await OrganizerApplicationModel.create({ userId: new Types.ObjectId(userId), ...data });
    return application.toObject();
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === 11000) {
      throw new AppError("An organizer application has already been submitted for this account", 409);
    }
    throw error;
  }
}

export async function getMyOrganizerApplication(userId: string) {
  return OrganizerApplicationModel.findOne({ userId: new Types.ObjectId(userId) }).lean().exec();
}

export async function listOrganizerApplications(input: unknown) {
  const query = parseInput(organizerApplicationsQuerySchema, input);
  const filter = { status: query.status };
  const [applications, total] = await Promise.all([
    OrganizerApplicationModel.find(filter).populate({ path: "userId", select: "fullName email createdAt" })
      .sort({ createdAt: 1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean().exec(),
    OrganizerApplicationModel.countDocuments(filter).exec(),
  ]);
  return { applications, pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
}

export async function decideOrganizerApplication(applicationId: string, adminId: string, input: unknown) {
  const { decision } = parseInput(decideOrganizerApplicationSchema, input);
  const id = new Types.ObjectId(applicationId);
  const session = await mongoose.startSession();
  let application: OrganizerApplication | null = null;
  try {
    await session.withTransaction(async () => {
      application = await OrganizerApplicationModel.findOneAndUpdate(
        { _id: id, status: "PENDING" },
        { $set: { status: decision, reviewedBy: new Types.ObjectId(adminId), reviewedAt: new Date() } },
        { new: true, runValidators: true, session },
      ).exec();
      if (!application) throw new AppError("Pending organizer application not found", 404);
      if (decision === "APPROVED") {
        const userUpdate = await UserModel.updateOne(
          { _id: application.userId, role: "USER" },
          { $set: { role: "ORGANIZER" } },
          { session },
        ).exec();
        if (userUpdate.modifiedCount !== 1) throw new AppError("Applicant account could not be approved", 409);
      }
    });
  } finally {
    await session.endSession();
  }
  if (!application) throw new AppError("Organizer application review did not complete", 500);
  return application;
}
