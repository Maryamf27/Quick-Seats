"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { ApiError } from "@/lib/api/errors";
import { API_UNAUTHORIZED_EVENT } from "@/lib/api/client";
import { authApi } from "@/lib/api/auth";
import type { LoginInput, RegisterInput } from "@/lib/api/auth";
import type { SafeUser } from "@/lib/api/types";
import { useToast } from "@/components/ui/toast";
import {
  clearAccessToken,
  readAccessToken,
  writeAccessToken,
} from "./token-storage";

export type AuthStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "unavailable";

interface AuthContextValue {
  status: AuthStatus;
  user: SafeUser | null;
  accessToken: string | null;
  signIn: (input: LoginInput) => Promise<SafeUser>;
  register: (input: RegisterInput) => Promise<SafeUser>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  updateUser: (user: SafeUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function makeSessionStorageError(): ApiError {
  return new ApiError({
    kind: "configuration",
    message: "This browser cannot securely maintain a sign-in session.",
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { notify } = useToast();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<SafeUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const restoreRequest = useRef<Promise<void> | null>(null);

  const refreshSession = useCallback((): Promise<void> => {
    if (restoreRequest.current) {
      return restoreRequest.current;
    }

    const request = (async () => {
      setStatus("loading");
      try {
        const storedToken = readAccessToken();
        if (!storedToken) {
          setAccessToken(null);
          setUser(null);
          setStatus("unauthenticated");
          return;
        }

        const currentUser = await authApi.currentUser(storedToken);
        setAccessToken(storedToken);
        setUser(currentUser);
        setStatus("authenticated");
      } catch (error: unknown) {
        if (error instanceof ApiError && error.status === 401) {
          notify("Your sign-in expired. Please sign in again.", "warning");
          try { window.sessionStorage.setItem("quickseats-session-expired", "1"); } catch { /* continue to clear the invalid session */ }
          try {
            clearAccessToken();
          } catch {
            setStatus("unavailable");
            return;
          }
          setAccessToken(null);
          setUser(null);
          setStatus("unauthenticated");
          return;
        }

        setUser(null);
        setStatus("unavailable");
      } finally {
        restoreRequest.current = null;
      }
    })();

    restoreRequest.current = request;
    return request;
  }, [notify]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    function handleUnauthorized() {
      if (status === "authenticated") {
        notify("Your sign-in expired. Please sign in again.", "warning");
        try { window.sessionStorage.setItem("quickseats-session-expired", "1"); } catch { /* session cleanup still proceeds */ }
      }
      try {
        clearAccessToken();
        setStatus("unauthenticated");
      } catch {
        setStatus("unavailable");
      }
      setAccessToken(null);
      setUser(null);
    }

    window.addEventListener(API_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => {
      window.removeEventListener(API_UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, [notify, status]);

  const signIn = useCallback(async (input: LoginInput): Promise<SafeUser> => {
    const result = await authApi.login(input);
    try {
      writeAccessToken(result.token);
    } catch {
      setUser(null);
      setAccessToken(null);
      setStatus("unauthenticated");
      throw makeSessionStorageError();
    }
    setAccessToken(result.token);
    setUser(result.user);
    setStatus("authenticated");
    return result.user;
  }, []);

  const register = useCallback(
    (input: RegisterInput): Promise<SafeUser> => authApi.register(input),
    [],
  );

  const signOut = useCallback(async (): Promise<void> => {
    const token = accessToken;
    try {
      clearAccessToken();
    } catch {
      setStatus("unavailable");
      throw makeSessionStorageError();
    }

    setAccessToken(null);
    setUser(null);
    setStatus("unauthenticated");

    if (token) {
      await authApi.logout(token);
    }
  }, [accessToken]);

  const updateUser = useCallback((next: SafeUser) => setUser(next), []);

  const value = useMemo(
    () => ({ status, user, accessToken, signIn, register, signOut, refreshSession, updateUser }),
    [status, user, accessToken, signIn, register, signOut, refreshSession, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
