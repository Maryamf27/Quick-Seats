import { Schema, model, type Model, type Types } from "mongoose";
import { USER_ROLES, type UserRole } from "../types/domain.js";

export interface User {
  _id: Types.ObjectId;
  fullName: string;
  email: string;
  passwordHash: string;
  password?: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<User>(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: false },
    password: { type: String, required: false, select: false },
    role: { type: String, enum: USER_ROLES, default: "USER", required: true },
  },
  { timestamps: true, versionKey: false },
);

userSchema.index({ email: 1 }, { unique: true });

export const UserModel: Model<User> = model<User>("User", userSchema);
