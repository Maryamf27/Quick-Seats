import type { UserRole } from "./domain.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface JwtPayload {
  sub: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface SafeUser {
  _id: string;
  fullName: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
