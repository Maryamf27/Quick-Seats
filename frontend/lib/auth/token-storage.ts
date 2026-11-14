const ACCESS_TOKEN_KEY = "quickseats.access-token";

// Prefer localStorage so the session survives Stripe's cross-origin redirect.
// Migrate any leftover sessionStorage token from older builds.
export function readAccessToken(): string | null {
  try {
    const fromLocal = window.localStorage.getItem(ACCESS_TOKEN_KEY);
    if (fromLocal) {
      return fromLocal;
    }
    const fromSession = window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
    if (fromSession) {
      window.localStorage.setItem(ACCESS_TOKEN_KEY, fromSession);
      window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
      return fromSession;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeAccessToken(token: string): void {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
  try {
    window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function clearAccessToken(): void {
  try {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // ignore
  }
  try {
    window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // ignore
  }
}
