import { api } from "./client";
import type { ApiRequestOptions } from "./client";
import type { LoginResult, SafeUser } from "./types";

export interface RegisterInput {
  fullName: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export const authApi = {
  register(input: RegisterInput, options?: ApiRequestOptions): Promise<SafeUser> {
    return api.post("/auth/register", input, options);
  },
  login(input: LoginInput, options?: ApiRequestOptions): Promise<LoginResult> {
    return api.post("/auth/login", input, options);
  },
  currentUser(accessToken: string, options?: ApiRequestOptions): Promise<SafeUser> {
    return api.get("/auth/me", { ...options, accessToken });
  },
  logout(accessToken: string, options?: ApiRequestOptions): Promise<null> {
    return api.post("/auth/logout", undefined, { ...options, accessToken });
  },
};
